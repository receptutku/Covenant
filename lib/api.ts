import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { ZodError, type ZodType } from 'zod'
import { ApiError, type ErrorCode } from './errors'

/**
 * Shared layer for route handlers.
 *
 * The goal: every endpoint emits the same error envelope, and no code path ever leaks a
 * raw SDK object, a stack trace, or a proof/secret. `docs/API.md §0` specifies this behaviour.
 */

export type ApiErrorBody = { error: string; code: ErrorCode } & Record<string, unknown>

export function errorResponse(
  code: ErrorCode,
  message: string,
  extra: Record<string, unknown> = {},
  status?: number,
): NextResponse<ApiErrorBody> {
  const body = { error: message, code, ...extra } as ApiErrorBody
  return NextResponse.json(body, { status: status ?? new ApiError(code, message).status })
}

export function jsonResponse<T>(body: T, status = 200): NextResponse<T> {
  return NextResponse.json(body, { status })
}

/**
 * Validates the request body with Zod.
 *
 * Returns Zod's field paths (`files.0.type`) but never the field VALUES — otherwise an
 * invalid request could leak a document's base64 payload or a proof into the error message.
 */
export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  // A JSON content type is required, and that is a security control rather than pedantry.
  // `text/plain` makes a POST a CORS *simple* request: no preflight, so the allow-list in
  // proxy.ts never runs and any page on the internet can drive an unauthenticated endpoint
  // on whoever has our tunnel open. Requiring JSON forces the preflight, which is where that
  // decision actually gets made.
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new ApiError('INVALID_INPUT', 'Request body must be sent as application/json.')
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new ApiError('INVALID_INPUT', 'Request body is not valid JSON.')
  }

  try {
    return schema.parse(raw)
  } catch (error) {
    if (error instanceof ZodError) {
      const fields = error.issues
        .map((issue) => issue.path.join('.') || '(body)')
        .filter((path, index, all) => all.indexOf(path) === index)
        .slice(0, 8)
      throw new ApiError('INVALID_INPUT', `Invalid field: ${fields.join(', ')}`)
    }
    throw error
  }
}

/**
 * Wraps a handler: turns ApiErrors into the stable envelope, and logs unexpected errors
 * on the server while exposing only `INTERNAL_ERROR` to the client.
 */
export function handler(
  fn: (request: Request) => Promise<NextResponse>,
): (request: Request) => Promise<NextResponse> {
  return async (request: Request) => {
    try {
      return await fn(request)
    } catch (error) {
      // Duck-typed rather than `instanceof ApiError`: under hot reload a route module can
      // hold a DIFFERENT copy of the ApiError class than this file, and instanceof across
      // module copies is false — turning a well-formed 422 into a bare 500. Shape is the
      // contract here, not class identity.
      if (isApiErrorLike(error)) {
        return errorResponse(error.code, error.message, error.extra, error.status)
      }
      // The raw error goes to the server console only; no details reach the client.
      console.error(`[${request.method} ${new URL(request.url).pathname}]`, error)
      return errorResponse('INTERNAL_ERROR', 'An unexpected server error occurred.')
    }
  }
}

function isApiErrorLike(error: unknown): error is ApiError {
  return (
    error instanceof Error &&
    typeof (error as ApiError).code === 'string' &&
    typeof (error as ApiError).status === 'number' &&
    typeof (error as ApiError).extra === 'object'
  )
}

/** Shared secret guarding the verifier panel. Recep enters it by hand during the demo. */
export function requireAdminSecret(request: Request): void {
  const expected = process.env.DEMO_ADMIN_SECRET
  if (!expected) {
    throw new ApiError('INTERNAL_ERROR', 'DEMO_ADMIN_SECRET is not configured on the server.')
  }
  const provided = request.headers.get('x-demo-admin-secret')
  if (!provided || !timingSafeEqualStrings(provided, expected)) {
    throw new ApiError('UNAUTHORIZED', 'Missing or invalid admin secret.')
  }
}

/**
 * Constant-time comparison, including across differing lengths.
 *
 * The previous version returned early on a length mismatch and hand-rolled the XOR loop,
 * which leaked the secret's length and gave no real constant-time guarantee — a JS engine
 * is free to optimise that loop. Hashing both sides first makes the compared buffers a
 * fixed 32 bytes whatever the inputs were, so length tells an observer nothing.
 */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const left = createHash('sha256').update(a, 'utf8').digest()
  const right = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(left, right)
}

/** `/api/seed` and `/api/reset` are only available in development. */
export function assertDevelopmentOnly(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new ApiError('PROPERTY_NOT_FOUND', 'This endpoint is disabled in production.')
  }
}

/**
 * Guards an endpoint that can destroy or rebuild demo state.
 *
 * `/api/seed` and `/api/reset` had only the NODE_ENV check, which is not a guard at all
 * once the server is reachable from another machine — and ours is, deliberately, so the
 * frontend can call it across the network. A `POST` with no custom header is a CORS
 * "simple request", so any web page open on any machine that can route to this server
 * could wipe the store mid-demo, or replay seed until the treasury is drained. At a
 * hackathon that is a room full of people on one network.
 *
 * The admin secret is the same one the verifier panel already uses, so this costs the
 * operator nothing they were not already carrying.
 */
export function assertDemoControl(request: Request): void {
  assertDevelopmentOnly()
  requireAdminSecret(request)
}
