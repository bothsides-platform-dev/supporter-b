/** Approved, immutable documents shared by signup UI and the server validator. */
export type SignupConsentDocuments = {
  terms: { version: string; url: string };
  privacy: { version: string; url: string };
  marketing: { version: string; url: string };
};

/** Current editions. Privacy and marketing moved to v3 on 2026-10-08 (contact address correction). */
export function getSignupConsentDocuments(): SignupConsentDocuments | null {
  return {
    terms: { version: 'v2', url: 'https://support-b.com/legal/terms' },
    privacy: { version: 'v3', url: 'https://support-b.com/legal/privacy' },
    marketing: { version: 'v3', url: 'https://support-b.com/legal/marketing' },
  };
}
