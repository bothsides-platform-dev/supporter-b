import { z } from 'zod';
import { getSignupConsentDocuments, type SignupConsentDocuments } from './signup-documents';

export type SignupConsentInput = {
  terms: boolean;
  privacy: boolean;
  marketing?: boolean;
  termsVersion: string;
  privacyVersion: string;
  marketingVersion: string;
};

export type ValidatedSignupConsent = {
  terms: true;
  privacy: true;
  marketing: boolean;
  documents: SignupConsentDocuments;
};

type ConsentResult =
  | { ok: true; consent: ValidatedSignupConsent }
  | { ok: false; error: 'SIGNUP_CONSENT_REQUIRED' | 'SIGNUP_CONSENT_VERSION_MISMATCH' | 'SIGNUP_DOCUMENTS_UNAVAILABLE' };

const inputSchema = z.object({
  terms: z.literal(true),
  privacy: z.literal(true),
  marketing: z.boolean().default(false),
  termsVersion: z.string().min(1).max(200),
  privacyVersion: z.string().min(1).max(200),
  marketingVersion: z.string().min(1).max(200),
}).strict();

/** Browser state is untrusted; document URLs and recorded time are never inputs. */
export function validateSignupConsent(value: unknown): ConsentResult {
  const parsed = inputSchema.safeParse(value);
  if (!parsed.success) {
    const onlyVersionIssues = parsed.error.issues.every((issue) =>
      ['termsVersion', 'privacyVersion', 'marketingVersion'].includes(String(issue.path[0])),
    );
    return { ok: false, error: onlyVersionIssues ? 'SIGNUP_CONSENT_VERSION_MISMATCH' : 'SIGNUP_CONSENT_REQUIRED' };
  }
  const documents = getSignupConsentDocuments();
  if (!documents) return { ok: false, error: 'SIGNUP_DOCUMENTS_UNAVAILABLE' };
  const { terms, privacy, marketing, termsVersion, privacyVersion, marketingVersion } = parsed.data;
  if (termsVersion !== documents.terms.version || privacyVersion !== documents.privacy.version || marketingVersion !== documents.marketing.version) {
    return { ok: false, error: 'SIGNUP_CONSENT_VERSION_MISMATCH' };
  }
  return { ok: true, consent: { terms, privacy, marketing, documents } };
}
