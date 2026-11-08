/** Keep this function self-contained: Clarity also runs it before its SDK loads. */
export function isSensitiveAnalyticsUrl(value: string): boolean {
  let candidate = value;
  for (let pass = 0; pass < 4; pass++) {
    if (
      /\/agent\/authorize(?:[/?#]|$)|\/api\/agent\/oauth(?:[/?#]|$)/i.test(
        candidate,
      ) ||
      /[?&#](?:code|state|code_verifier|code_challenge|access_token|refresh_token|id_token|client_secret|token)=/i.test(
        candidate,
      )
    )
      return true;
    try {
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) return false;
      candidate = decoded;
    } catch {
      // Do not record a malformed encoded URL that cannot be inspected safely.
      return true;
    }
  }
  // More deeply nested redirects are not useful attribution and stay private.
  return candidate.includes("%");
}
