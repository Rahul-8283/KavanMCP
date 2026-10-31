import release from "./release.json";

export type DownloadState = "soon" | "preview" | "ready";

export interface Installer {
  fileName: string;
  sizeBytes: number;
  sha256: string;
  releasedOn: string;
}

export interface Release {
  state: DownloadState;
  version: string;
  repository: string;
  releaseNotes: string;
  licence: string;
  contactEmail: string | null;
  /** Shown in the footer. A profile left as null is not shown. */
  profiles: { github: string | null; linkedin: string | null };
  installer: Installer | null;
}

/**
 * release.json is read once, here. The "ready" state needs a complete installer record; if any field is
 * missing the page falls back to "preview" rather than showing a half-empty card or a link that can fail.
 */
function readRelease(): Release {
  const raw = release as {
    state: string;
    version: string;
    repository: string;
    releaseNotes: string;
    licence: string;
    contactEmail: string | null;
    profiles: { github: string | null; linkedin: string | null };
    installer: {
      fileName: string | null;
      sizeBytes: number | null;
      sha256: string | null;
      releasedOn: string | null;
    };
  };
  const { fileName, sizeBytes, sha256, releasedOn } = raw.installer;
  const installer =
    fileName && sizeBytes && sha256 && releasedOn ? { fileName, sizeBytes, sha256, releasedOn } : null;

  let state: DownloadState = raw.state === "ready" || raw.state === "preview" ? raw.state : "soon";
  if (state === "ready" && !installer) state = "preview";

  return {
    state,
    version: raw.version,
    repository: raw.repository,
    releaseNotes: raw.releaseNotes,
    licence: raw.licence,
    contactEmail: raw.contactEmail,
    profiles: raw.profiles,
    installer: state === "ready" ? installer : null,
  };
}

export const site = readRelease();

/** Where the built site lives. Set NEXT_PUBLIC_SITE_URL when deploying so canonical and sharing links are right. */
export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const pitch = "Find what's slowing your PC, and end it safely.";
export const subline =
  "KavanMCP watches your Windows system, explains what is using it up, and lets you or Claude close the right program, with a safety engine that can never touch the parts of Windows that keep it running.";

/** Anything that points at the repository is hidden until the repository is public. */
export const repoIsPublic = site.state !== "soon";
export const releasesLatest = `${site.repository}/releases/latest`;
