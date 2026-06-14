import { describe, it, expect } from 'vitest';
import {
  hostServes,
  resolveHostRedirect,
  workspaceSwitchTarget,
  signupTargetForHost,
  type AppOrigins,
} from '../site-routing';

const PROD: AppOrigins = {
  buyer: 'https://supporter-b.com',
  pg: 'https://partner.supporter-b.com',
};
const LOCAL: AppOrigins = { buyer: 'http://localhost:3000', pg: 'http://localhost:3000' };

describe('hostServes', () => {
  it('maps the buyer host and partner host to their workspace types', () => {
    expect(hostServes('supporter-b.com', PROD)).toBe('buyer');
    expect(hostServes('partner.supporter-b.com', PROD)).toBe('pg');
  });
  it('ignores the port and is case-insensitive', () => {
    expect(hostServes('Partner.Supporter-B.com:443', PROD)).toBe('pg');
  });
  it('returns null for an unknown host (IP, preview domain)', () => {
    expect(hostServes('52.78.126.178', PROD)).toBeNull();
    expect(hostServes(null, PROD)).toBeNull();
  });
  it('disables routing when both origins share a host (local/dev)', () => {
    expect(hostServes('localhost', LOCAL)).toBeNull();
  });
  it('returns null (fails safe) when an origin is malformed instead of throwing', () => {
    const BAD = { buyer: 'supporter-b.com', pg: 'partner.supporter-b.com' } as AppOrigins; // no scheme
    expect(() => hostServes('partner.supporter-b.com', BAD)).not.toThrow();
    expect(hostServes('partner.supporter-b.com', BAD)).toBeNull();
  });
});

describe('resolveHostRedirect', () => {
  it('returns null when the host already serves the active type', () => {
    expect(resolveHostRedirect('buyer', 'supporter-b.com', PROD)).toBeNull();
    expect(resolveHostRedirect('pg', 'partner.supporter-b.com', PROD)).toBeNull();
  });
  it('redirects a pg session on the buyer host to the partner origin', () => {
    expect(resolveHostRedirect('pg', 'supporter-b.com', PROD)).toBe(
      'https://partner.supporter-b.com/home',
    );
  });
  it('redirects a buyer session on the partner host to the buyer origin', () => {
    expect(resolveHostRedirect('buyer', 'partner.supporter-b.com', PROD)).toBe(
      'https://supporter-b.com/home',
    );
  });
  it('never redirects on an unknown host or in local/dev (no loop risk)', () => {
    expect(resolveHostRedirect('pg', '52.78.126.178', PROD)).toBeNull();
    expect(resolveHostRedirect('pg', 'localhost', LOCAL)).toBeNull();
  });
});

describe('workspaceSwitchTarget', () => {
  it('stays relative when switching to a type the current host serves', () => {
    expect(workspaceSwitchTarget('buyer', 'supporter-b.com', PROD)).toBe('/home');
  });
  it('returns the absolute other-origin url on a cross-host switch', () => {
    expect(workspaceSwitchTarget('pg', 'supporter-b.com', PROD)).toBe(
      'https://partner.supporter-b.com/home',
    );
  });
  it('stays relative in local/dev (single host)', () => {
    expect(workspaceSwitchTarget('pg', 'localhost', LOCAL)).toBe('/home');
  });
  it('appends a given path on a cross-host switch', () => {
    expect(workspaceSwitchTarget('pg', 'supporter-b.com', PROD, '/inbox/abc')).toBe(
      'https://partner.supporter-b.com/inbox/abc',
    );
  });
  it('returns the given relative path on a same-host switch', () => {
    expect(workspaceSwitchTarget('buyer', 'supporter-b.com', PROD, '/rfp')).toBe('/rfp');
  });
  it('defaults the path to /home when omitted', () => {
    expect(workspaceSwitchTarget('pg', 'supporter-b.com', PROD)).toBe(
      'https://partner.supporter-b.com/home',
    );
  });
});

describe('signupTargetForHost', () => {
  it('routes the partner host to the pg signup flow', () => {
    expect(signupTargetForHost('partner.supporter-b.com', PROD)).toBe('/signup/pg');
  });
  it('routes the buyer host to the buyer signup flow', () => {
    expect(signupTargetForHost('supporter-b.com', PROD)).toBe('/signup/buyer');
  });
  it('falls back to the buyer flow for an unknown host or null (mirrors the landing)', () => {
    expect(signupTargetForHost('52.78.126.178', PROD)).toBe('/signup/buyer');
    expect(signupTargetForHost(null, PROD)).toBe('/signup/buyer');
  });
  it('falls back to the buyer flow in single-host local/dev', () => {
    expect(signupTargetForHost('localhost', LOCAL)).toBe('/signup/buyer');
  });
});
