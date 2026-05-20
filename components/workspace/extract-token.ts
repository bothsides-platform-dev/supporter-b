// Parse what a user pastes into the "join workspace" field — either a raw
// invite token or a full invite URL (…/invite/workspace/<token>). Returns the
// bare token, or null when nothing usable is present.
export function extractWorkspaceInviteToken(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const marker = '/invite/workspace/';
  const idx = trimmed.indexOf(marker);
  let raw = idx >= 0 ? trimmed.slice(idx + marker.length) : trimmed;

  // Drop query/hash and any trailing slash(es).
  raw = raw.split(/[?#]/)[0].replace(/\/+$/, '').trim();

  return raw || null;
}
