import { AppearanceSection } from '../components/settings/AppearanceSection';
import { HistorySection } from '../components/settings/HistorySection';
import { ProtectedAppsSection } from '../components/settings/ProtectedAppsSection';
import { SoundSection } from '../components/settings/SoundSection';
import { StartupSection } from '../components/settings/StartupSection';
import { ThresholdsSection } from '../components/settings/ThresholdsSection';

export function Settings() {
  return (
    <div className="@container w-full max-w-6xl">
      {/* Two columns when the page is wide enough, stacking left column first when it is not */}
      <div className="grid items-start gap-5 @4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* What Kavan watches and keeps */}
        <div className="flex flex-col gap-5">
          <ThresholdsSection />
          {/* Protected apps: the backend enforces these, the page only edits them */}
          <ProtectedAppsSection />
          <HistorySection />
        </div>

        {/* How Kavan behaves on this machine */}
        <div className="flex flex-col gap-5">
          <AppearanceSection />
          <SoundSection />
          <StartupSection />
        </div>
      </div>
    </div>
  );
}
