// Escape a user string for safe use inside an ilike `%...%` pattern so that the
// SQL wildcards `%` and `_` (and the escape char `\`) match literally instead
// of acting as wildcards. Shared by every command-palette search query.
export function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&');
}
