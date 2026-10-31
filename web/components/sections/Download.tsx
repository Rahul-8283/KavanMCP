import { ArrowUpRight, Clock, Download as DownloadIcon, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Accordion } from "@/components/ui/Accordion";
import { Button } from "@/components/ui/Button";
import { CopyField } from "@/components/ui/CopyField";
import { Section } from "@/components/ui/Section";
import { releasesLatest, site, type Installer } from "@/content/site";

const CLAUDE_CONFIG = `{
  "mcpServers": {
    "KavanMCP": {
      "command": "C:\\\\path\\\\to\\\\KavanMCP\\\\mcp-server\\\\venv\\\\Scripts\\\\python.exe",
      "args": [
        "C:\\\\path\\\\to\\\\KavanMCP\\\\mcp-server\\\\main.py"
      ]
    }
  }
}`;

const BACKEND_SETUP = `python -m venv venv
.\\venv\\Scripts\\Activate.ps1
pip install -r requirements.txt`;

const SOURCE_CLONE = `git clone ${site.repository}.git
cd KavanMCP/mcp-server
${BACKEND_SETUP}`;

const SOURCE_APP = `cd ../desktop
npm install
npm run tauri dev`;

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso));
}

function Step({ n, title, children }: { n: number; title: string; children?: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span
        aria-hidden="true"
        className="tnum mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sunken text-xs font-semibold text-ink-soft"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <p>{title}</p>
        {children}
      </div>
    </li>
  );
}

function InstallSteps() {
  if (site.state === "ready") {
    return (
      <ol className="space-y-5">
        <Step n={1} title="Run the installer. If Windows warns about an unknown publisher, see the note above the button." />
        <Step n={2} title="Install Python 3.11 or newer, if you do not have it." />
        <Step n={3} title="Get the mcp-server folder from the repository. In a terminal inside it, set up its Python environment:">
          <CopyField value={BACKEND_SETUP} label="the Python environment commands" block />
        </Step>
        <Step n={4} title="Open Kavan, go to Settings, and under Startup choose that folder as the Backend location." />
      </ol>
    );
  }
  return (
    <ol className="space-y-5">
      <Step n={1} title="Install Python 3.11 or newer, Node.js 20 or newer, and Rust (stable)." />
      <Step n={2} title="Get the code and set up the backend:">
        <CopyField value={SOURCE_CLONE} label="the clone and backend commands" block />
      </Step>
      <Step n={3} title="Start the backend in an elevated PowerShell (so it can inspect system-level programs):">
        <CopyField value="python main.py" label="the backend start command" />
      </Step>
      <Step n={4} title="In a second terminal, start the app:">
        <CopyField value={SOURCE_APP} label="the app start commands" block />
      </Step>
    </ol>
  );
}

function Steps() {
  return (
    <div className="mt-10">
      <Accordion question="Install" open={false}>
        <InstallSteps />
      </Accordion>
      <Accordion question="Connect Claude Desktop (optional)">
        <ol className="space-y-5">
          <Step n={1} title="Open %APPDATA%\Claude\claude_desktop_config.json and add this, with the paths changed to where mcp-server is on your PC:">
            <CopyField value={CLAUDE_CONFIG} label="the Claude Desktop configuration" block />
          </Step>
          <Step n={2} title="Restart Claude Desktop. The Kavan tools appear automatically." />
        </ol>
      </Accordion>
      <Accordion question="Uninstall">
        {site.state === "ready" ? (
          <p>
            Remove Kavan from Windows Settings, under Apps. Its history and settings are stored in the{" "}
            <code className="rounded bg-sunken px-1.5 py-0.5 text-[0.875em]">mcp-server/data</code> folder, so delete
            that folder too if you want them gone.
          </p>
        ) : (
          <p>
            Delete the folder you cloned. Kavan keeps its history and settings in{" "}
            <code className="rounded bg-sunken px-1.5 py-0.5 text-[0.875em]">mcp-server/data</code>, inside it, and
            writes nowhere else.
          </p>
        )}
      </Accordion>
    </div>
  );
}

function ReadyCard({ installer }: { installer: Installer }) {
  return (
    <div className="panel reveal p-6 md:p-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-2xl font-semibold">Kavan {site.version} for Windows</h3>
          <dl className="tnum mt-3 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 text-[0.9375rem] text-ink-soft">
            <dt>File</dt>
            <dd className="break-all font-mono text-ink">{installer.fileName}</dd>
            <dt>Size</dt>
            <dd className="text-ink">{formatSize(installer.sizeBytes)}</dd>
            <dt>Released</dt>
            <dd className="text-ink">{formatDate(installer.releasedOn)}</dd>
          </dl>
        </div>
        <Button href={releasesLatest} variant="primary" className="w-full md:w-auto">
          <DownloadIcon aria-hidden="true" size={18} />
          Download
        </Button>
      </div>

      <div className="mt-6 flex gap-3 rounded-md bg-warn-wash p-4 text-[0.9375rem] text-ink">
        <ShieldAlert aria-hidden="true" size={20} className="mt-0.5 shrink-0 text-warn" />
        <p>
          Windows may warn that the app is from an unknown publisher, because it is not code-signed yet. Choose
          &ldquo;More info&rdquo; then &ldquo;Run anyway&rdquo; if you trust the source.
        </p>
      </div>

      <div className="mt-6">
        <p className="caps mb-2">SHA-256 checksum</p>
        <CopyField value={installer.sha256} label="the SHA-256 checksum" />
      </div>

      <p className="mt-6 text-sm">
        <a href={site.repository} className="inline-flex items-center gap-1 font-medium text-crimson-ink hover:underline">
          View the source on GitHub <ArrowUpRight aria-hidden="true" size={15} />
        </a>
      </p>
    </div>
  );
}

function PreviewCard() {
  return (
    <div className="panel reveal p-6 md:p-8">
      <h3 className="text-2xl font-semibold">Kavan {site.version} is available as a source build.</h3>
      <p className="mt-3 max-w-2xl text-ink-soft">
        Setup takes about ten minutes. The Windows installer is not published yet; the steps below build and run the
        same app from the repository.
      </p>
      <p className="mt-6">
        <Button href={site.repository}>
          View the repository <ArrowUpRight aria-hidden="true" size={16} />
        </Button>
      </p>
    </div>
  );
}

function SoonCard() {
  return (
    <div className="panel reveal p-6 md:p-8">
      <div className="flex items-start gap-4">
        <Clock aria-hidden="true" size={26} strokeWidth={1.75} className="mt-1 shrink-0 text-crimson-ink" />
        <div>
          <h3 className="text-2xl font-semibold">Kavan is almost ready.</h3>
          <p className="mt-3 max-w-2xl text-ink-soft">
            The Windows download is coming. Kavan {site.version} is for Windows 10 and 11, and it is free.
          </p>
          {site.contactEmail ? (
            <p className="mt-5">
              <Button href={`mailto:${site.contactEmail}`}>Ask to be told when it is out</Button>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function Download() {
  return (
    <Section
      id="download"
      eyebrow="Download"
      title={site.state === "soon" ? "Coming soon." : `Kavan ${site.version} for Windows.`}
      lead={
        site.state === "soon"
          ? undefined
          : "One download for the desktop app. The background service is set up once, as described below."
      }
      band
    >
      <div className="mx-auto max-w-3xl">
        {site.state === "ready" && site.installer ? <ReadyCard installer={site.installer} /> : null}
        {site.state === "preview" ? <PreviewCard /> : null}
        {site.state === "soon" ? <SoonCard /> : null}
        {site.state === "soon" ? null : <Steps />}
      </div>
    </Section>
  );
}
