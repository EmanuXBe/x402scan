const HORIZON_URL = 'https://horizon.stellar.org';
const TOML_TIMEOUT_MS = 12_000;

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
  try {
    const res = await fetch(`https://${domain}/.well-known/stellar.toml`, {
      signal: AbortSignal.timeout(TOML_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = await res.text();
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
