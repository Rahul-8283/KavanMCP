export type SoundChoice = 'chime' | 'pulse' | 'bell' | 'soft';

export const SOUND_CHOICES: readonly SoundChoice[] = ['chime', 'pulse', 'bell', 'soft'];

/** One oscillator note. Times are seconds from the moment the sound starts. */
export interface Note {
  frequency: number;
  type: OscillatorType;
  start: number;
  duration: number;
  /** Seconds to rise to full level. Without it the note starts at full level. */
  attack?: number;
  /** Share of the volume, so notes sounding together do not add up to too much */
  level?: number;
}

// Sounds are short note lists played with oscillators: nothing is bundled, downloaded or decoded
export const SOUNDS: Record<SoundChoice, readonly Note[]> = {
  // The V2 beep, unchanged
  chime: [{ frequency: 880, type: 'sine', start: 0, duration: 0.5 }],
  pulse: [
    { frequency: 660, type: 'triangle', start: 0, duration: 0.12 },
    { frequency: 660, type: 'triangle', start: 0.2, duration: 0.12 },
  ],
  bell: [
    { frequency: 1319, type: 'sine', start: 0, duration: 0.9, level: 0.7 },
    { frequency: 1976, type: 'sine', start: 0, duration: 0.9, level: 0.7 },
  ],
  soft: [{ frequency: 440, type: 'sine', start: 0, duration: 0.6, attack: 0.15 }],
};

const MAX_GAIN = 0.4;

/**
 * Loudness is not linear to the ear, so the slider value is squared. 50 gives 0.1, the V2 level,
 * 0 gives silence and 100 gives 0.4, loud without clipping.
 */
export function gainFor(volume: number): number {
  const clamped = Math.min(Math.max(volume, 0), 100);
  return (clamped / 100) ** 2 * MAX_GAIN;
}

// One context for the life of the app. Browsers allow only a few at once, and a new one per
// sound eventually leaves the app silent until it is restarted.
let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (context) return context;
  const Context = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  context = new Context();
  return context;
}

function playNote(ctx: AudioContext, note: Note, gain: number, at: number): void {
  const peak = gain * (note.level ?? 1);
  // An exponential fade cannot reach zero, so it ends just below the peak, however quiet that is
  const floor = Math.min(0.001, peak / 100);
  const start = at + note.start;
  const end = start + note.duration;

  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();
  oscillator.type = note.type;
  oscillator.frequency.setValueAtTime(note.frequency, start);

  if (note.attack) {
    envelope.gain.setValueAtTime(floor, start);
    envelope.gain.linearRampToValueAtTime(peak, start + note.attack);
  } else {
    envelope.gain.setValueAtTime(peak, start);
  }
  envelope.gain.exponentialRampToValueAtTime(floor, end);

  oscillator.connect(envelope);
  envelope.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(end);
}

/** Plays one alert sound. Volume 0 plays nothing. Never throws: a sound must not break an alert. */
export function playAlertSound(choice: SoundChoice, volume: number): void {
  const gain = gainFor(volume);
  if (gain <= 0) return;
  try {
    const ctx = audioContext();
    if (!ctx) return;
    const play = () => {
      const at = ctx.currentTime;
      for (const note of SOUNDS[choice] ?? SOUNDS.chime) playNote(ctx, note, gain, at);
    };
    // A context can be suspended by the browser, for example before the user has interacted
    if (ctx.state === 'suspended') void ctx.resume().then(play).catch(() => {});
    else play();
  } catch (err) {
    console.error('Failed to play the alert sound', err);
  }
}

/**
 * Remembers which alert episodes have already made a sound, so a breach that lasts minutes
 * sounds once, when it starts. An alert without an episode id always sounds.
 */
export class EpisodeSoundGate {
  private readonly played = new Set<string>();

  constructor(private readonly capacity = 500) {}

  shouldSound(episodeId: string | null | undefined): boolean {
    if (!episodeId) return true;
    if (this.played.has(episodeId)) return false;
    this.played.add(episodeId);
    // The oldest ids are dropped first: a Set keeps insertion order
    if (this.played.size > this.capacity) {
      const oldest = this.played.values().next().value;
      if (oldest !== undefined) this.played.delete(oldest);
    }
    return true;
  }
}
