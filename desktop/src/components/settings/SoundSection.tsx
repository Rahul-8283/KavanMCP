import { useConfig } from '../../context/ConfigContext';
import { useToast } from '../../context/ToastContext';
import { Switch } from '../common/Switch';
import { SettingsSection } from './SettingsSection';

export function SoundSection() {
  const { config, updateSetting } = useConfig();
  const { addToast } = useToast();
  const soundAlerts = config?.sound_alerts ?? true;

  const toggleSound = async () => {
    const ok = await updateSetting('sound_alerts', !soundAlerts);
    if (!ok) addToast('Could not save the sound setting. It was reverted.', 'warning');
  };

  return (
    <SettingsSection title="System Integrations">
      <div className="flex items-center justify-between gap-6 px-5 py-4">
        <div>
          <p className="text-[0.8125rem] font-medium text-ink">Enable Sound Notifications</p>
          <p className="mt-0.5 text-xs text-ink-soft">Play an alert chime when a threshold is breached.</p>
        </div>
        <Switch checked={soundAlerts} onChange={toggleSound} disabled={!config} label="Enable Sound Notifications" />
      </div>
    </SettingsSection>
  );
}
