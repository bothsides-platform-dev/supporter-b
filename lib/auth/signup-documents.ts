/** Approved, immutable documents shared by signup UI and the server validator. */
export type SignupConsentDocuments = {
  terms: { version: string; url: string };
  privacy: { version: string; url: string };
  marketing: { version: string; url: string };
};

/** v1 approved by the service owner on 2026-10-03; preserve each published URL. */
export function getSignupConsentDocuments(): SignupConsentDocuments | null {
  return {
    terms: { version: 'v1', url: 'https://support-b.com/legal/terms/v1' },
    privacy: { version: 'v1', url: 'https://support-b.com/legal/privacy/v1' },
    marketing: { version: 'v1', url: 'https://support-b.com/legal/marketing/v1' },
  };
}
