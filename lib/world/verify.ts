import { createHash } from 'node:crypto'
import { ApiError } from '../errors'

/**
 * Server-side verification of World proofs.
 *
 * The frontend's `success` flag is never trusted. A client can set any boolean it likes,
 * so the proof is always re-verified here before it grants a session or a KYC grant.
 *
 * The raw proof is never logged, echoed back, or persisted. Only the nullifier hash
 * leaves this module, and only so the caller can fold it into a keyed replay digest
 * (see `lib/world/session.ts`) — it is not stored in its raw form either.
 */

export type WorldAction = 'onboard-seller' | 'verify-buyer' | 'verify-tenant'

export type VerifiedProof = {
  /** Used solely to derive a private replay digest; never stored or returned as-is. */
  nullifierHash: string
  /** True when a real World backend verified this, false in the offline dev path. */
  verifiedByWorld: boolean
}

export function isWorldConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_WORLD_APP_ID?.trim() && process.env.WORLD_RP_SECRET?.trim())
}

export function allowedActions(): Record<WorldAction, string> {
  return {
    'onboard-seller': process.env.WORLD_ACTION_SELLER ?? 'onboard-seller',
    'verify-buyer': process.env.WORLD_ACTION_BUYER ?? 'verify-buyer',
    'verify-tenant': process.env.WORLD_ACTION_TENANT ?? 'verify-tenant',
  }
}

/**
 * Extracts the nullifier from an IDKit payload.
 *
 * IDKit has shipped this field under a couple of names across versions, so we accept the
 * known spellings rather than pinning one and breaking on an SDK bump.
 */
function readNullifier(proof: Record<string, unknown>): string | null {
  for (const key of ['nullifier_hash', 'nullifierHash', 'nullifier']) {
    const value = proof[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

/**
 * Verifies a proof against World's backend.
 *
 * DEV FALLBACK: when the World app is not configured yet, we do not silently pretend the
 * proof is valid. We derive a stable pseudo-nullifier from the payload so that replay
 * protection still behaves correctly end-to-end, mark the result as unverified, and warn
 * loudly on the server console. This keeps the rest of the pipeline testable before the
 * World credentials exist, without ever letting an unverified proof masquerade as a
 * verified one in the returned data.
 */
export async function verifyWorldProof(
  action: WorldAction,
  proof: Record<string, unknown>,
): Promise<VerifiedProof> {
  const nullifierHash = readNullifier(proof)

  if (!isWorldConfigured()) {
    console.warn(
      `[world] App not configured — "${action}" proof accepted WITHOUT verification (development only).`,
    )
    return {
      nullifierHash:
        nullifierHash ??
        createHash('sha256').update(JSON.stringify(proof)).digest('hex'),
      verifiedByWorld: false,
    }
  }

  if (!nullifierHash) {
    throw new ApiError('WORLD_PROOF_INVALID', 'The World proof is missing a nullifier hash.')
  }

  const appId = process.env.NEXT_PUBLIC_WORLD_APP_ID!.trim()
  const response = await fetch(`https://developer.worldcoin.org/api/v2/verify/${appId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.WORLD_RP_SECRET!.trim()}`,
    },
    body: JSON.stringify({ ...proof, action: allowedActions()[action] }),
  })

  if (!response.ok) {
    // The body may describe why verification failed; it is useful on the server but must
    // not reach the client, since it can echo proof internals back to the caller.
    const detail = await response.text().catch(() => '')
    console.error(`[world] Verification failed for "${action}" (${response.status}):`, detail)
    throw new ApiError('WORLD_PROOF_INVALID', 'World could not verify this proof.')
  }

  return { nullifierHash, verifiedByWorld: true }
}
