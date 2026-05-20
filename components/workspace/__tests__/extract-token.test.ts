import { describe, it, expect } from 'vitest';
import { extractWorkspaceInviteToken } from '../extract-token';

describe('extractWorkspaceInviteToken', () => {
  it('returns a raw token unchanged', () => {
    expect(extractWorkspaceInviteToken('abc123XYZ')).toBe('abc123XYZ');
  });

  it('extracts the token from a full invite URL', () => {
    expect(
      extractWorkspaceInviteToken('https://app.example.com/invite/workspace/abc123'),
    ).toBe('abc123');
  });

  it('strips a trailing slash and query string', () => {
    expect(
      extractWorkspaceInviteToken('https://app.example.com/invite/workspace/abc123/?x=1'),
    ).toBe('abc123');
  });

  it('trims surrounding whitespace', () => {
    expect(extractWorkspaceInviteToken('  abc123  ')).toBe('abc123');
  });

  it('returns null for empty / whitespace-only input', () => {
    expect(extractWorkspaceInviteToken('')).toBeNull();
    expect(extractWorkspaceInviteToken('   ')).toBeNull();
  });

  it('returns null for an invite URL with no token', () => {
    expect(
      extractWorkspaceInviteToken('https://app.example.com/invite/workspace/'),
    ).toBeNull();
  });
});
