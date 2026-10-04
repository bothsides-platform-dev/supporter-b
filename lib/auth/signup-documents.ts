/** Approved, immutable documents shared by signup UI and the server validator. */
export type SignupConsentDocuments = {
  terms: { version: string; url: string };
  privacy: { version: string; url: string };
  marketing: { version: string; url: string };
};

/** Current editions after owner-requested v1 removal on 2026-10-03. */
export function getSignupConsentDocuments(): SignupConsentDocuments | null {
  return {
    terms: { version: 'v2', url: 'https://support-b.com/legal/terms' },
    privacy: { version: 'v2', url: 'https://support-b.com/legal/privacy' },
    marketing: { version: 'v2', url: 'https://support-b.com/legal/marketing' },
  };
}
