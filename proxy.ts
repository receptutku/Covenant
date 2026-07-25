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

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-demo-admin-secret',
  'Access-Control-Max-Age': '86400',
} as const

export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin') ?? '*'

  // Preflight: answer here so it never reaches the route handlers, which only know
  // GET/POST and would 405 the OPTIONS.
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': origin, ...CORS_HEADERS },
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
