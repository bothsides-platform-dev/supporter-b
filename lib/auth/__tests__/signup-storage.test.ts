// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isSignupStorageAvailable } from '@/lib/auth/signup-storage';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isSignupStorageAvailable', () => {
  it('sessionStorage 정상 작동 시 true 반환', () => {
    expect(isSignupStorageAvailable()).toBe(true);
  });

  it('sessionStorage.setItem이 throw하면 false 반환', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(isSignupStorageAvailable()).toBe(false);
  });
});
