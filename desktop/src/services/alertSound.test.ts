import { beforeEach, describe, expect, it, vi } from 'vitest';

// A Web Audio double that records what is played, so the sounds can be checked without a speaker
interface Played { frequency: number; type: string; start: number; stop: number; peak: number }
let contextsCreated = 0;
let played: Played[] = [];

class FakeParam {
  events: [string, number, number][] = [];
  setValueAtTime(v: number, t: number) { this.events.push(['set', v, t]); }
  linearRampToValueAtTime(v: number, t: number) { this.events.push(['linear', v, t]); }
  exponentialRampToValueAtTime(v: number, t: number) {
    if (v <= 0) throw new RangeError('an exponential ramp must end above zero');
    this.events.push(['exp', v, t]);
  }
}
class FakeGain { gain = new FakeParam(); connect() {} }
class FakeOscillator {
  type = 'sine';
  frequency = new FakeParam();
  target: FakeGain | null = null;
  startAt = 0;
  connect(node: FakeGain) { this.target = node; }
  start(t: number) { this.startAt = t; }
  stop(t: number) {
    const peak = Math.max(...this.target!.gain.events.map((e) => e[1]));
    played.push({ frequency: this.frequency.events[0][1], type: this.type, start: this.startAt, stop: t, peak });
  }
}
class FakeContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  constructor() { contextsCreated++; }
  createOscillator() { return new FakeOscillator(); }
  createGain() { return new FakeGain(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
}

async function load() {
  vi.resetModules();
  vi.stubGlobal('window', { AudioContext: FakeContext });
  return import('./alertSound');
}

beforeEach(() => {
  contextsCreated = 0;
  played = [];
});

describe('the volume curve', () => {
  it('maps 0, 50 and 100 to 0, 0.1 and 0.4', async () => {
    const { gainFor } = await load();

    expect(gainFor(0)).toBe(0);
    expect(gainFor(50)).toBeCloseTo(0.1, 12);
    expect(gainFor(100)).toBeCloseTo(0.4, 12);
  });

  it('is squared, so half the slider is a quarter of the loudness', async () => {
    const { gainFor } = await load();

    expect(gainFor(50) / gainFor(100)).toBeCloseTo(0.25, 12);
  });

  it('stays inside 0 to 0.4 whatever it is given', async () => {
    const { gainFor } = await load();

    expect(gainFor(-20)).toBe(0);
    expect(gainFor(500)).toBeCloseTo(0.4, 12);
  });
});

describe('the sounds', () => {
  it('has the notes and durations the spec states', async () => {
    const { SOUNDS } = await load();
    const shape = (notes: readonly { frequency: number; type: string; start: number; duration: number }[]) =>
      notes.map((n) => [n.frequency, n.type, n.start, n.duration]);

    expect(shape(SOUNDS.chime)).toEqual([[880, 'sine', 0, 0.5]]);
    expect(shape(SOUNDS.pulse)).toEqual([[660, 'triangle', 0, 0.12], [660, 'triangle', 0.2, 0.12]]);
    expect(SOUNDS.pulse[1].start - (SOUNDS.pulse[0].start + SOUNDS.pulse[0].duration)).toBeCloseTo(0.08, 9);
    expect(SOUNDS.bell.map((n) => [n.frequency, n.duration])).toEqual([[1319, 0.9], [1976, 0.9]]);
    expect(SOUNDS.soft.map((n) => [n.frequency, n.duration])).toEqual([[440, 0.6]]);
    expect(SOUNDS.soft[0].attack).toBeGreaterThan(0);
  });

  it('plays the V2 beep by default: one 880 Hz sine at gain 0.1 for half a second', async () => {
    const { playAlertSound } = await load();

    playAlertSound('chime', 50);

    expect(played).toHaveLength(1);
    expect(played[0]).toMatchObject({ frequency: 880, type: 'sine' });
    expect(played[0].peak).toBeCloseTo(0.1, 12);
    expect(played[0].stop - played[0].start).toBeCloseTo(0.5, 12);
  });

  it('plays nothing at volume 0', async () => {
    const { playAlertSound } = await load();

    playAlertSound('bell', 0);

    expect(played).toHaveLength(0);
  });

  it('does not throw at a very low volume, where the fade would otherwise end at zero', async () => {
    const { playAlertSound } = await load();

    expect(() => playAlertSound('soft', 1)).not.toThrow();
    expect(played).toHaveLength(1);
  });

  it('plays every note of the chosen sound, and no other', async () => {
    const { playAlertSound, SOUNDS, SOUND_CHOICES } = await load();

    for (const choice of SOUND_CHOICES) {
      played = [];
      playAlertSound(choice, 80);
      expect(played).toHaveLength(SOUNDS[choice].length);
    }
  });

  it('keeps notes that sound together from adding up past the volume', async () => {
    const { playAlertSound, gainFor } = await load();

    playAlertSound('bell', 100);

    expect(played.reduce((sum, note) => sum + note.peak, 0)).toBeLessThanOrEqual(gainFor(100) * 1.5);
  });

  it('uses one audio context for the life of the app, however many sounds', async () => {
    const { playAlertSound } = await load();

    for (let i = 0; i < 100; i++) playAlertSound('pulse', 70);

    expect(contextsCreated).toBe(1);
  });

  it('never throws when the browser has no audio at all', async () => {
    vi.resetModules();
    vi.stubGlobal('window', {});
    const { playAlertSound } = await import('./alertSound');

    expect(() => playAlertSound('chime', 50)).not.toThrow();
  });
});

describe('EpisodeSoundGate', () => {
  it('sounds once for an episode, however often its alert repeats', async () => {
    const { EpisodeSoundGate } = await load();
    const gate = new EpisodeSoundGate();

    expect(gate.shouldSound('a')).toBe(true);
    expect(gate.shouldSound('a')).toBe(false);
    expect(gate.shouldSound('a')).toBe(false);
  });

  it('sounds again for a new episode', async () => {
    const { EpisodeSoundGate } = await load();
    const gate = new EpisodeSoundGate();

    expect([gate.shouldSound('a'), gate.shouldSound('b')]).toEqual([true, true]);
  });

  it('always sounds for an alert with no episode id', async () => {
    const { EpisodeSoundGate } = await load();
    const gate = new EpisodeSoundGate();

    expect([gate.shouldSound(null), gate.shouldSound(undefined), gate.shouldSound(null)]).toEqual([true, true, true]);
  });

  it('forgets the oldest ids past its capacity, so it cannot grow without end', async () => {
    const { EpisodeSoundGate } = await load();
    const gate = new EpisodeSoundGate(2);

    gate.shouldSound('x');
    gate.shouldSound('y');
    gate.shouldSound('z');

    expect(gate.shouldSound('z')).toBe(false);
    expect(gate.shouldSound('x')).toBe(true);
  });
});
