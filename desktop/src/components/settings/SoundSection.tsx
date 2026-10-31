import type { CSSProperties } from 'react';
import { Play } from 'lucide-react';
import { useConfig } from '../../context/ConfigContext';
import { useToast } from '../../context/ToastContext';
import { playAlertSound, SOUND_CHOICES, type SoundChoice } from '../../services/alertSound';
import { SegmentedControl, type SegmentOption } from '../common/SegmentedControl';
import { Switch } from '../common/Switch';
import { ConfigGate } from './ConfigGate';
import { SettingsSection } from './SettingsSection';
import { useDebouncedSetting } from './useDebouncedSetting';

const DEFAULT_VOLUME = 50;
const DEFAULT_SOUND: SoundChoice = 'chime';

const SOUND_LABELS: Record<SoundChoice, string> = { chime: 'Chime', pulse: 'Pulse', bell: 'Bell', soft: 'Soft' };
const SOUND_OPTIONS: SegmentOption<SoundChoice>[] = SOUND_CHOICES.map((choice) => ({ value: choice, label: SOUND_LABELS[choice] }));

export function SoundSection() {
  const { config, updateSetting } = useConfig();
  const { addToast } = useToast();
  const soundAlerts = config?.sound_alerts ?? true;
  const choice = config?.sound_choice ?? DEFAULT_SOUND;
  const [volume, setVolume] = useDebouncedSetting('sound_volume', 'the volume', config?.sound_volume, DEFAULT_VOLUME);

  const toggleSound = async () => {
    const ok = await updateSetting('sound_alerts', !soundAlerts);
    if (!ok) addToast('Could not save the sound setting. It was reverted.', 'warning');
  };

  const chooseSound = async (next: SoundChoice) => {
    const ok = await updateSetting('sound_choice', next);
    if (!ok) addToast('Could not save the alert sound. It was reverted.', 'warning');
  };

  // Rows that only matter while sound is on are dimmed when it is off. Test stays usable,
  // so a sound can be auditioned before it is switched on.
  const controlsOff = !config || !soundAlerts;

  return (
    <SettingsSection title="System Integrations" description="Alert sounds on this computer.">
      <ConfigGate>
        <div className="divide-y divide-line-faint">
          <div className="flex items-center justify-between gap-6 px-5 py-4">
            <div>
              <p className="text-[0.8125rem] font-medium text-ink">Enable Sound Notifications</p>
              <p className="mt-0.5 text-xs text-ink-soft">Play an alert sound once when a threshold is breached.</p>
            </div>
            <Switch checked={soundAlerts} onChange={toggleSound} disabled={!config} label="Enable Sound Notifications" />
          </div>

          <div className={`grid grid-cols-[6.5rem_1fr_3rem] items-center gap-5 px-5 py-4 transition-opacity ${controlsOff ? 'opacity-45' : ''}`}>
            <label htmlFor="sound_volume" className="text-[0.8125rem] font-medium text-ink">Volume</label>
            <input
              id="sound_volume"
              type="range"
              min={0}
              max={100}
              value={volume}
              disabled={controlsOff}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="range disabled:cursor-not-allowed"
              style={{ '--fill': `${volume}%` } as CSSProperties}
            />
            <span className="tnum text-right font-display text-[0.9375rem] text-ink">{volume}%</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
            <span className={`w-[6.5rem] text-[0.8125rem] font-medium text-ink transition-opacity ${controlsOff ? 'opacity-45' : ''}`}>
              Alert sound
            </span>
            <SegmentedControl options={SOUND_OPTIONS} value={choice} onChange={chooseSound} ariaLabel="Alert sound" disabled={controlsOff} />
            {/* Plays the selection at the slider's current position, even before it is saved */}
            <button
              type="button"
              onClick={() => playAlertSound(choice, volume)}
              className="btn ml-auto"
              title="Play the selected sound at this volume"
            >
              <Play size={13} />
              Test
            </button>
          </div>
        </div>
      </ConfigGate>
    </SettingsSection>
  );
}
