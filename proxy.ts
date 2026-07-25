import { NextResponse, type NextRequest } from 'next/server'

/**
 * CORS for the API surface.
 *
 * During integration the frontend runs on Akif's machine and calls this server across the
 * network — a cross-origin request the browser will block unless we answer the preflight
 * and stamp the response headers. Secrets never leave this server (that is the whole
 * arrangement), so the API being callable from another origin exposes nothing that the
 * endpoints don't already enforce themselves (admin secret, seller sessions, World proofs).
 *
 * The origin is echoed back rather than `*` so the setup keeps working if we ever need
 * credentialed requests; `*` and credentials are mutually exclusive in the CORS spec.
 *
 * Next 16 note: this file is `proxy.ts` — the convention formerly known as middleware.
 */

/**
 * Every custom request header any route reads. Keep this list complete.
 *
 * A header the server requires but the preflight does not allow is invisible on localhost
 * (same-origin requests skip the preflight entirely) and fatal through the tunnel: the
 * browser refuses to send it, so the route answers with whatever it does when the header is
 * absent. `x-seller-session` shipped missing from this list, which made `GET /api/property`
 * — and therefore the seller's whole "Refresh status" step — fail only in the demo
 * configuration.
 *
 * `scripts/preflight.ts` cross-checks this against the headers the code actually reads.
 */
export const ALLOWED_REQUEST_HEADERS = [
  'Content-Type',
  'x-demo-admin-secret',
  'x-seller-session',
] as const

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': ALLOWED_REQUEST_HEADERS.join(', '),
  // Ten minutes, not a day.
  //
  // The browser caches a preflight RESPONSE, not a failure — so an allow-list that was
  // missing a header is served from cache and keeps blocking the real request long after
  // the server is fixed. At 86400 that is a full day of "I pulled your fix and it still
  // doesn't work", and a normal hard reload does not clear the CORS preflight cache.
  // While the contract is still moving, a stale allow-list should expire inside one
  // rehearsal.
  'Access-Control-Max-Age': '600',
} as const

export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin') ?? '*'

  // Preflight: answer here so it never reaches the route handlers, which only know
  // GET/POST and would 405 the OPTIONS.
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      // `Vary: Origin` belongs on BOTH branches. The allowed origin varies per request, so a
      // shared cache that does not key on it can serve one origin's preflight — and its
      // Access-Control-Allow-Origin — to another. Harmless while every origin is allowed;
      // a bypass the moment the list is narrowed, which is exactly when nobody re-reads this.
      headers: { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', ...CORS_HEADERS },
    })
  }

  const response = NextResponse.next()
  response.headers.set('Access-Control-Allow-Origin', origin)
  // Because the allowed origin varies per request, any shared cache must key on it.
  // Without this a proxy could serve one origin's response — and its
  // Access-Control-Allow-Origin — to a different origin.
  response.headers.set('Vary', 'Origin')
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value)
  }
  return response
}

export const config = {
  matcher: '/api/:path*',
}
