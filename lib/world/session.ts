import { createHmac, randomBytes } from 'node:crypto'
import { ApiError } from '../errors'
import { claimReplayDigest, putSellerSession, readSellerSession } from '../store'
import type { SellerSession } from '../types'

/**
 * Seller/landlord sessions issued after a World Selfie Check.
 *
 * The privacy claim this file enforces: a World verification is a *decision signal*,
 * not an identity we get to keep. Concretely:
 *
 *   - The raw nullifier never leaves this module. It is folded into an HMAC digest and
 *     discarded; nothing downstream can recover it.
 *   - The session token is unrelated random bytes, so even a leaked session cannot be
 *     correlated back to a World identity.
 *   - Sessions are short-lived, so a leaked token stops being useful quickly.
 *
 * Replay protection is per-action. `onboard-seller`, `verify-buyer` and `verify-tenant`
 * each get their own digest namespace, which is why the action name is mixed into the
 * HMAC input rather than the nullifier alone. Sharing a namespace would mean one person
 * could not be both a buyer and a tenant during the demo — their first proof would burn
 * the nullifier for every other flow.
 */

const DEFAULT_SESSION_TTL_MINUTES = 30

/**
 * Session lifetime, overridable with `SELLER_SESSION_TTL_MINUTES`.
 *
 * 30 minutes is the designed default and stays that way — it is short enough that a leaked
 * token stops being useful quickly. It is configurable because the rental flow can outlive
 * it in a way the sale flow cannot: `list → apply → engage → wait out the lock window →
 * settle` holds one session across the whole window, so a 20-minute window plus setup time
 * can expire the session before the landlord is allowed to settle, stranding a deposit
 * that is already locked on-chain.
 *
 * Raise it for a long rehearsal day rather than editing this file mid-demo.
 */
function sessionTtlMs(): number {
  const configured = Number(process.env.SELLER_SESSION_TTL_MINUTES)
  const minutes =
    Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_SESSION_TTL_MINUTES
  return minutes * 60 * 1000
}

function hmacSecret(): string {
  const secret = process.env.NULLIFIER_HMAC_SECRET
  if (!secret?.trim()) {
    throw new Error('NULLIFIER_HMAC_SECRET is not configured')
  }
  return secret.trim()
}

/**
 * Derives the private replay digest for a World proof.
 *
 * This is deliberately a keyed HMAC and not a plain hash: a plain hash of a nullifier is
 * reversible by anyone who can enumerate the nullifier space, which would turn our
 * "we never store identifiers" claim into a technicality. Without the server secret the
 * digest is meaningless.
 */
export function replayDigest(action: string, rawNullifier: string): string {
  return createHmac('sha256', hmacSecret()).update(`${action}:${rawNullifier}`).digest('hex')
}

/**
 * Records that a proof has been consumed. Throws if the same proof is presented twice.
 *
 * Call this exactly once per verified proof, and only after the proof itself has been
 * validated — otherwise an attacker could burn a victim's nullifier with a forged proof.
 */
export function consumeProofOnce(action: string, rawNullifier: string): void {
  if (!claimReplayDigest(replayDigest(action, rawNullifier))) {
    throw new ApiError(
      'WORLD_PROOF_REPLAY',
      'This World proof has already been used for this action.',
    )
  }
}

export function issueSellerSession(): SellerSession {
  const now = new Date()
  const session: SellerSession = {
    // 32 random bytes, unrelated to any World value. This is the only token the client
    // ever sees, and it is a lookup key — not a credential derived from identity.
    token: randomBytes(32).toString('hex'),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + sessionTtlMs()).toISOString(),
  }
  putSellerSession(session)
  return session
}

/**
 * Resolves a session token or throws the appropriate stable error.
 *
 * We distinguish "missing" from "expired" because the UI reacts differently: a missing
 * session means the user never completed Selfie Check, while an expired one means they
 * did and simply need to repeat it.
 */
export function requireSellerSession(token: string | undefined): SellerSession {
  const result = readSellerSession(token)
  if (result.status === 'ok') return result.session
  if (result.status === 'expired') {
    throw new ApiError(
      'SELLER_SESSION_EXPIRED',
      'Your verification session has expired. Please complete Selfie Check again.',
    )
  }
  throw new ApiError(
    'SELLER_SESSION_REQUIRED',
    'A valid seller session is required. Complete Selfie Check first.',
  )
}
