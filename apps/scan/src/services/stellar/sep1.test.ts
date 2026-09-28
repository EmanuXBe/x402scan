import { describe, expect, it } from 'vitest';

import { isPublicDomain } from './sep1';

/**
 * `home_domain` is set by whoever controls the Stellar account, so this guard
 * is the only thing standing between an on-chain string and a server-side
 * fetch. These cases are the SSRF payloads it exists to reject.
 */
describe('isPublicDomain', () => {
  it('accepts the domains real Stellar services publish', () => {
    for (const host of [
      'lobstr.co',
      'lumenbro.com',
      'scopuly.com',
      'stellarterm.com',
      'sub.domain.example.co.uk',
    ]) {
      expect(isPublicDomain(host), host).toBe(true);
    }
  });

  it('rejects loopback and link-local targets', () => {
    for (const host of [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      // AWS/GCP/Azure instance metadata — the classic SSRF target.
      '169.254.169.254',
    ]) {
      expect(isPublicDomain(host), host).toBe(false);
    }
  });

  it('rejects private network ranges given as IP literals', () => {
    for (const host of ['10.0.0.1', '192.168.1.1', '172.16.0.1']) {
      expect(isPublicDomain(host), host).toBe(false);
    }
  });

  it('rejects reserved internal suffixes', () => {
    for (const host of [
      'db.internal',
      'printer.local',
      'api.localhost',
      'router.home.arpa',
    ]) {
      expect(isPublicDomain(host), host).toBe(false);
    }
  });

  it('rejects anything smuggling a port, path, credentials or scheme', () => {
    for (const host of [
      'evil.com:8080',
      'evil.com/path',
      'user:pass@evil.com',
      'http://evil.com',
      'evil.com?x=1',
      'evil.com#frag',
      '[::1]',
      '::1',
    ]) {
      expect(isPublicDomain(host), host).toBe(false);
    }
  });

  it('rejects malformed or dotless hosts', () => {
    for (const host of [
      '',
      '   ',
      'nodot',
      '.leading',
      'trailing.',
      'double..dot',
      'numeric.123',
      'a'.repeat(256) + '.com',
    ]) {
      expect(isPublicDomain(host), host).toBe(false);
    }
  });

  it('is case-insensitive, since home_domain is free text', () => {
    expect(isPublicDomain('LOBSTR.CO')).toBe(true);
    expect(isPublicDomain('LOCALHOST')).toBe(false);
  });
});
