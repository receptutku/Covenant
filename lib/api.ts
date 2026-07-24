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
      if (error instanceof ApiError) {
        return errorResponse(error.code, error.message, error.extra, error.status)
      }
      // The raw error goes to the server console only; no details reach the client.
      console.error(`[${request.method} ${new URL(request.url).pathname}]`, error)
      return errorResponse('INTERNAL_ERROR', 'An unexpected server error occurred.')
    }
  }
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

/** A length difference still leaks, but the content comparison runs in constant time. */
function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** `/api/seed` and `/api/reset` are only available in development. */
export function assertDevelopmentOnly(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new ApiError('PROPERTY_NOT_FOUND', 'This endpoint is disabled in production.')
  }
}
