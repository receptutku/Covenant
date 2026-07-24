import { createHash } from 'node:crypto'
import { signRequest } from '@worldcoin/idkit-server'
import { ApiError } from '../errors'

/**
 * Server-side World ID 4.0 integration.
 *
 * Two responsibilities:
 *   1. Mint the RP signature IDKit needs before it will produce a proof. This proves the
 *      request originated from us and bounds it in time, so a proof cannot be farmed from
 *      one context and replayed into another.
 *   2. Re-verify the returned proof against World's backend.
 *
 * The frontend's `success` flag is never trusted — a client can set any boolean it likes.
 * The proof is always re-verified here before it grants a session or a KYC grant.
 *
 * The raw proof is never logged, echoed back, or persisted. Only the nullifier leaves this
 * module, and only so the caller can fold it into a keyed replay digest (see `session.ts`).
 * It is not stored in raw form either.
 */

export type WorldAction = 'onboard-seller' | 'verify-buyer' | 'verify-tenant'

/**
 * Whitelist of actions we are willing to sign for.
 *
 * `verify-tenant` is deliberately separate from `verify-buyer`. A nullifier is derived
 * from (identity, app, action), so sharing an action between the two flows would mean one
 * person cannot be both a buyer and a tenant — their first proof would burn the nullifier
 * for the other. Separate actions give each flow its own namespace.
 */
export const WORLD_ACTIONS: readonly WorldAction[] = [
  'onboard-seller',
  'verify-buyer',
  'verify-tenant',
] as const

export function isWorldAction(value: string): value is WorldAction {
  return (WORLD_ACTIONS as readonly string[]).includes(value)
}

export type VerifiedProof = {
  /** Used solely to derive a private replay digest; never stored or returned as-is. */
  nullifier: string
  /** True when World's backend verified this; false only on the offline dev path. */
  verifiedByWorld: boolean
}

export function isWorldConfigured(): boolean {
  return Boolean(process.env.WORLD_RP_ID?.trim() && process.env.WORLD_SIGNING_KEY?.trim())
}

function verifyUrl(): string {
  const rpId = process.env.WORLD_RP_ID!.trim()
  return `https://developer.world.org/api/v4/verify/${rpId}`
}

/**
 * Produces the RP context IDKit needs to start a verification.
 *
 * The signature covers a nonce and a validity window (default 300 s), so a captured
 * context cannot be reused indefinitely. The signing key never leaves the server.
 */
export function createRpContext(action: WorldAction) {
  if (!isWorldConfigured()) {
    throw new ApiError(
      'INTERNAL_ERROR',
      'World is not configured on the server (WORLD_RP_ID / WORLD_SIGNING_KEY).',
    )
  }

  const signature = signRequest({
    signingKeyHex: process.env.WORLD_SIGNING_KEY!.trim(),
    action,
    ttl: 300,
  })

  return {
    appId: process.env.NEXT_PUBLIC_WORLD_APP_ID?.trim() ?? '',
    rpId: process.env.WORLD_RP_ID!.trim(),
    action,
    environment: worldEnvironment(),
    rpContext: {
      sig: signature.sig,
      nonce: signature.nonce,
      created_at: signature.createdAt,
      expires_at: signature.expiresAt,
    },
  }
}

/**
 * Staging routes to the World simulator, which is what we test against until beta access
 * for the real credential checks lands.
 */
function worldEnvironment(): 'staging' | 'production' {
  return process.env.WORLD_ENVIRONMENT === 'production' ? 'production' : 'staging'
}

type VerifyResponse = {
  success?: boolean
  nullifier?: string
  action?: string
  code?: string
  detail?: string
}

/**
 * Verifies an IDKit payload against World.
 *
 * DEV FALLBACK: when World is not configured we do not pretend the proof is valid. A
 * stable pseudo-nullifier is derived from the payload so replay protection still behaves
 * correctly end to end, the result is marked `verifiedByWorld: false`, and the server logs
 * a loud warning. This keeps the pipeline testable without ever letting an unverified
 * proof masquerade as a verified one.
 */
export async function verifyWorldProof(
  action: WorldAction,
  proof: Record<string, unknown>,
): Promise<VerifiedProof> {
  if (!isWorldConfigured()) {
    console.warn(
      `[world] Not configured — "${action}" proof accepted WITHOUT verification (development only).`,
    )
    return {
      nullifier: createHash('sha256').update(JSON.stringify(proof)).digest('hex'),
      verifiedByWorld: false,
    }
  }

  let response: Response
  try {
    response = await fetch(verifyUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The IDKit payload is forwarded as-is: it already carries protocol_version, nonce,
      // action and the responses array in the shape the verifier expects.
      body: JSON.stringify({ ...proof, environment: worldEnvironment() }),
    })
  } catch (error) {
    console.error(`[world] Could not reach the verifier for "${action}":`, error)
    throw new ApiError('WORLD_PROOF_INVALID', 'Could not reach World to verify this proof.')
  }

  const body = (await response.json().catch(() => ({}))) as VerifyResponse

  if (!response.ok || body.success !== true) {
    // The body explains why verification failed. It is useful on the server but must not
    // reach the client, since it can echo proof internals back to the caller.
    console.error(
      `[world] Verification failed for "${action}" (${response.status}):`,
      body.code ?? '',
      body.detail ?? '',
    )
    throw new ApiError('WORLD_PROOF_INVALID', 'World could not verify this proof.')
  }

  if (!body.nullifier) {
    throw new ApiError('WORLD_PROOF_INVALID', 'World returned no nullifier for this proof.')
  }

  // The action is bound into the nullifier, but check it explicitly: accepting a proof
  // minted for a different action would let a seller-onboarding proof unlock buyer KYC.
  if (body.action && body.action !== action) {
    console.error(`[world] Action mismatch: expected "${action}", proof carries "${body.action}".`)
    throw new ApiError('WORLD_PROOF_INVALID', 'This proof was issued for a different action.')
  }

  return { nullifier: body.nullifier, verifiedByWorld: true }
}
