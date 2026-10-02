/** Approved, immutable documents shared by signup UI and the server validator. */
export type SignupConsentDocuments = {
  terms: { version: string; url: string };
  privacy: { version: string; url: string };
  marketing: { version: string; url: string };
};

/**
 * No approved immutable editions exist yet. Do not turn a Notion page ID or
 * deployment date into a legal edition. Publication prerequisites are tracked
 * in docs/SIGNUP_CONSENT_ROLLOUT.md. Null deliberately closes new signup.
 */
export function getSignupConsentDocuments(): SignupConsentDocuments | null {
  return null;
}
