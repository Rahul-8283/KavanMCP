/** A process name as the backend stores it: trimmed and lower-cased. */
export function normalizeProcessName(name: string): string {
  return name.trim().toLowerCase();
}

export function isListed(name: string, list: readonly string[]): boolean {
  return list.includes(normalizeProcessName(name));
}

/** Why a typed name cannot be stored, or null when it can. Mirrors the backend's rules. */
export function nameProblem(raw: string): string | null {
  const name = normalizeProcessName(raw);
  if (name.length === 0) return 'Type the name of a program.';
  if (name.length > 260) return 'A name can be at most 260 characters.';
  if (/[\\/:]/.test(name)) return 'Type the program name only, without its folder.';
  return null;
}
