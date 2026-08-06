const HORIZON_URL = 'https://horizon.stellar.org';
const TOML_TIMEOUT_MS = 12_000;
/** SEP-1 tomls are a few KB. Anything past this is not one. */
const TOML_MAX_BYTES = 512 * 1024;

/**
 * `home_domain` is attacker-controlled: it is a field on a Stellar account, and
 * anyone can set it to anything that fits in 32 characters. Fetching it from a
 * server without checking turns this resolver into an SSRF primitive — an
 * account pointing at `169.254.169.254` or `localhost` makes the server request
 * its own cloud metadata or an internal service.
 *
 * A SEP-1 home domain is always a public DNS name, so anything that is not one
 * is rejected: IP literals in either family, hostnames with no dot, and the
 * reserved suffixes used for private networks.
 */
const BLOCKED_SUFFIXES = ['.local', '.internal', '.localhost', '.home.arpa'];

export function isPublicDomain(host: string): boolean {
  const h = host.toLowerCase().trim();
  if (!h || h.length > 255) return false;
  if (h === 'localhost' || BLOCKED_SUFFIXES.some(s => h.endsWith(s))) {
    return false;
  }
  // No credentials, ports, paths or wildcards smuggled through the field.
  if (/[^a-z0-9.-]/.test(h)) return false;
  if (h.startsWith('.') || h.endsWith('.') || h.includes('..')) return false;
  // IPv4 literal (IPv6 is already excluded by the character test above).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return false;
  // A public domain has at least one dot and a non-numeric TLD.
  const lastDot = h.lastIndexOf('.');
  if (lastDot <= 0) return false;
  return /^[a-z]{2,}$/.test(h.slice(lastDot + 1));
}

/**
 * How strongly a Stellar address is tied to the organization it claims.
 *
 * `bidirectional` — the account sets `home_domain` to a domain whose SEP-1
 * `stellar.toml` lists that same account under `ACCOUNTS`. Both sides attest to
 * each other, so the link is as good as SEP-1 gets.
 *
 * `account_claim` — the account points at a domain, but the domain does not
 * list it back. Common for sub-accounts and for orgs that do not keep
 * `ACCOUNTS` exhaustive, but anyone can set `home_domain` to any domain, so on
 * its own this is a claim rather than evidence.
 */
export type StellarIdentityVerification = 'bidirectional' | 'account_claim';

export interface StellarServiceIdentity {
  address: string;
  homeDomain: string;
  verification: StellarIdentityVerification;
  name?: string;
  url?: string;
  description?: string;
  logo?: string;
}

/**
 * Resolve the organization behind a Stellar address.
 *
 * x402scan learns who a seller is from an x402 discovery document at
 * `/.well-known/x402` or `/openapi.json`. No Stellar service publishes one —
 * checked across every seller receiving x402 payments on mainnet, and the
 * endpoints that answered 200 were single-page-app fallbacks returning HTML.
 *
 * Stellar solved this before x402 existed. An account declares `home_domain`,
 * and that domain serves SEP-1 `stellar.toml` with the organization's name,
 * URL, description and logo. The identity layer is there; it just is not the
 * one the rest of this codebase knows how to read.
 */
export async function resolveStellarIdentity(
  address: string
): Promise<StellarServiceIdentity | null> {
  const homeDomain = await fetchHomeDomain(address);
  if (!homeDomain) return null;

  const toml = await fetchStellarToml(homeDomain);
  if (!toml) return null;

  // SEP-1 mutual attestation: does the domain claim this account back?
  const accountsBlock = /ACCOUNTS\s*=\s*\[([\s\S]*?)\]/i.exec(toml)?.[1] ?? '';
  const verification: StellarIdentityVerification = accountsBlock.includes(
    address
  )
    ? 'bidirectional'
    : 'account_claim';

  return {
    address,
    homeDomain,
    verification,
    name: tomlValue(toml, 'ORG_NAME') ?? tomlValue(toml, 'ORG_DBA'),
    url: tomlValue(toml, 'ORG_URL'),
    description: tomlValue(toml, 'ORG_DESCRIPTION'),
    logo: tomlValue(toml, 'ORG_LOGO'),
  };
}

async function fetchHomeDomain(address: string): Promise<string | null> {
  try {
    const res = await fetch(`${HORIZON_URL}/accounts/${address}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TOML_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const account = (await res.json()) as { home_domain?: string };
    return account.home_domain ?? null;
  } catch {
    return null;
  }
}

async function fetchStellarToml(domain: string): Promise<string | null> {
  if (!isPublicDomain(domain)) return null;

  try {
    const res = await fetch(`https://${domain}/.well-known/stellar.toml`, {
      signal: AbortSignal.timeout(TOML_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    // Re-check after redirects: the pre-flight check only validates the domain
    // we were given, and a public domain is free to 302 somewhere internal.
    try {
      if (!isPublicDomain(new URL(res.url).hostname)) return null;
    } catch {
      return null;
    }

    // A declared length past the cap is refused without reading the body; an
    // absent or lying header still cannot get past the slice below.
    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > TOML_MAX_BYTES) return null;

    const body = (await res.text()).slice(0, TOML_MAX_BYTES);
    // Guard against SPA catch-all routes that answer 200 with an HTML shell.
    if (/^\s*<!doctype html|^\s*<html/i.test(body)) return null;
    return body;
  } catch {
    return null;
  }
}

/** Minimal SEP-1 reader: only top-level `KEY = "value"` pairs are needed. */
function tomlValue(toml: string, key: string): string | undefined {
  const match = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, 'im').exec(toml);
  const value = match?.[1]?.trim();
  // A key that is present but blank (`NAME = ""` or all whitespace) is not an
  // identity, so it has to read as absent. The test is spelled out because `??`
  // would keep the empty string and surface a nameless service as if it had
  // been resolved.
  return value === undefined || value === '' ? undefined : value;
}
