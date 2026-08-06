/**
 * Reverse proxy from Cloudflare Pages to the Railway deployment.
 *
 * Why a proxy rather than running the app here: this Next.js app needs a full
 * Node runtime. Prisma opens TCP sockets through the pg driver, and next-auth,
 * ioredis and the Coinbase SDK all assume Node built-ins. Porting it to the
 * Workers runtime via OpenNext is a runtime migration, not a deployment. This
 * Function is the small piece that genuinely belongs on the edge — it forwards
 * bytes — so the app keeps Node and the deployment gets a *.pages.dev name.
 *
 * Set ORIGIN in the Pages project's environment variables to the Railway URL,
 * with no trailing slash.
 */

interface Env {
  ORIGIN: string;
}

/**
 * Headers that describe a specific hop and must not be replayed onto the next
 * one. Forwarding these is how a proxy ends up serving truncated or
 * double-encoded bodies.
 */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'host',
]);

function strip(headers: Headers): Headers {
  const out = new Headers();
  headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) out.append(key, value);
  });
  return out;
}

export const onRequest: PagesFunction<Env> = async context => {
  const { request, env } = context;

  if (!env.ORIGIN) {
    return new Response(
      'ORIGIN is not configured. Set it to the Railway deployment URL.',
      { status: 502 }
    );
  }

  const incoming = new URL(request.url);
  const target = new URL(env.ORIGIN);
  target.pathname = incoming.pathname;
  target.search = incoming.search;

  const headers = strip(request.headers);
  // The origin needs to know which name the client actually used, or every
  // absolute URL it generates — canonical tags, OG images, and the resource URL
  // inside the x402 `payment-required` header — points at Railway instead.
  headers.set('X-Forwarded-Host', incoming.host);
  headers.set('X-Forwarded-Proto', incoming.protocol.replace(':', ''));

  const response = await fetch(target.toString(), {
    method: request.method,
    headers,
    body:
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : request.body,
    redirect: 'manual',
  });

  // The body is passed through as a stream, not buffered. React Server
  // Components arrive incrementally, and awaiting the whole response here would
  // turn a progressive render into a blank page followed by everything at once.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: strip(response.headers),
  });
};
