// Test-only documents. These identifiers are never approved legal editions.
export const TEST_SIGNUP_DOCUMENTS = {
  terms: { version: 'test-terms-1', url: 'https://example.com/legal/test-terms-1.html' },
  privacy: { version: 'test-privacy-1', url: 'https://example.com/legal/test-privacy-1.html' },
  marketing: { version: 'test-marketing-1', url: 'https://example.com/legal/test-marketing-1.html' },
};

export const TEST_SIGNUP_CONSENT = {
  terms: true,
  privacy: true,
  marketing: false,
  termsVersion: 'test-terms-1',
  privacyVersion: 'test-privacy-1',
  marketingVersion: 'test-marketing-1',
};
