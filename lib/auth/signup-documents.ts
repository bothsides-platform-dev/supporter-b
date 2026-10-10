/** Approved, immutable documents shared by signup UI and the server validator. */
export type SignupConsentDocuments = {
  terms: { version: string; url: string };
  privacy: { version: string; url: string };
  marketing: { version: string; url: string };
};

/** Current editions. Privacy moved to v4 on 2026-10-10 (officer address correction); marketing is v3 (2026-10-08 contact address correction). */
export function getSignupConsentDocuments(): SignupConsentDocuments | null {
  return {
    terms: { version: 'v2', url: 'https://support-b.com/legal/terms' },
    privacy: { version: 'v4', url: 'https://support-b.com/legal/privacy' },
    marketing: { version: 'v3', url: 'https://support-b.com/legal/marketing' },
  };
}
