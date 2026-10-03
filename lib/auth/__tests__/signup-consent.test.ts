import { afterEach, describe, expect, it, vi } from 'vitest';
import * as documents from '../signup-documents';
import { validateSignupConsent } from '../signup-consent';
import { TEST_SIGNUP_CONSENT, TEST_SIGNUP_DOCUMENTS } from './signup-consent-fixture';

afterEach(() => vi.restoreAllMocks());

describe('signup consent validation', () => {
  it('accepts the current approved editions and records immutable document URLs', () => {
    const result = validateSignupConsent({ terms: true, privacy: true,
      termsVersion: 'v2', privacyVersion: 'v2', marketingVersion: 'v1' });
    expect(result).toEqual({ ok: true, consent: { terms: true, privacy: true, marketing: false,
      documents: {
        terms: { version: 'v2', url: 'https://support-b.com/legal/terms/v2' },
        privacy: { version: 'v2', url: 'https://support-b.com/legal/privacy/v2' },
        marketing: { version: 'v1', url: 'https://support-b.com/legal/marketing/v1' },
      },
    } });
  });
  function publishTestDocuments() {
    vi.spyOn(documents, 'getSignupConsentDocuments').mockReturnValue(TEST_SIGNUP_DOCUMENTS);
  }

  it('fails closed when a document catalog is unavailable', () => {
    vi.spyOn(documents, 'getSignupConsentDocuments').mockReturnValue(null);
    expect(validateSignupConsent(TEST_SIGNUP_CONSENT)).toEqual({
      ok: false, error: 'SIGNUP_DOCUMENTS_UNAVAILABLE',
    });
  });

  it.each([undefined, null, {}, { ...TEST_SIGNUP_CONSENT, terms: false },
    { ...TEST_SIGNUP_CONSENT, privacy: false },
    { ...TEST_SIGNUP_CONSENT, terms: 'true' },
  ])('requires explicit required agreements: %j', (input) => {
    publishTestDocuments();
    expect(validateSignupConsent(input)).toEqual({ ok: false, error: 'SIGNUP_CONSENT_REQUIRED' });
  });

  it.each(['termsVersion', 'privacyVersion', 'marketingVersion'])('rejects stale, missing or malformed %s', (key) => {
    publishTestDocuments();
    for (const value of ['old-document', '', undefined, 12]) {
      expect(validateSignupConsent({ ...TEST_SIGNUP_CONSENT, [key]: value })).toEqual({
        ok: false, error: 'SIGNUP_CONSENT_VERSION_MISMATCH',
      });
    }
  });

  it('defaults omitted optional marketing to false and derives document evidence from the server registry', () => {
    publishTestDocuments();
    const { marketing: _marketing, ...input } = TEST_SIGNUP_CONSENT;
    expect(validateSignupConsent(input)).toEqual({
      ok: true, consent: { terms: true, privacy: true, marketing: false, documents: TEST_SIGNUP_DOCUMENTS },
    });
  });

  it('records a separate explicit marketing choice', () => {
    publishTestDocuments();
    expect(validateSignupConsent({ ...TEST_SIGNUP_CONSENT, marketing: true })).toEqual({
      ok: true, consent: { terms: true, privacy: true, marketing: true, documents: TEST_SIGNUP_DOCUMENTS },
    });
  });

  it.each([{ recordedAt: '1900-01-01T00:00:00Z' }, { marketing: 'true' }, { termsUrl: 'https://attacker.test' }])(
    'rejects client evidence fields or malformed choices: %j', (extra) => {
      publishTestDocuments();
      expect(validateSignupConsent({ ...TEST_SIGNUP_CONSENT, ...extra })).toEqual({
        ok: false, error: 'SIGNUP_CONSENT_REQUIRED',
      });
    },
  );
});
