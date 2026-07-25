import { assertDemoControl, handler, jsonResponse } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import { getDemoAccount, getOperator } from '@/lib/hedera/client'
import { associateToken, grantKyc, tokenBalance, transferShares } from '@/lib/hedera/token'
import { prepareTokenForDemo } from '@/lib/hedera/demo-setup'
import { listProperties, putProperty } from '@/lib/store'
import type { Property } from '@/lib/types'

/**
 * Rebuilds the demo state after a server restart.
 *
 * Why a seeded property exists at all: two of the strongest compliance scenes — the 2%
 * secondary-market fee and the network-level KYC rejection — need a token that already has
 * a second verified holder and a third, deliberately unverified account. Producing that
 * live during a four-minute demo would eat the whole slot, so PROP-001 is prepared ahead of
 * time and the live flow uses a separate property (PROP-002).
 *
 * PROP-001 is written straight into `TOKENIZED` with a real `tokenId`, because `/api/buy`
 * reads the token from the property record. A half-seeded PROP-001 would surface later as
 * `PROPERTY_NOT_FOUND` or a null token id, mid-demo.
 *
 * No attestation is seeded, and none is needed: the signature gate lives in `/api/tokenize`,
 * and PROP-001 is never tokenized through the UI. The one rule is not to try.
 *
 * The critical detail is the nokyc account: it is associated with the token but NEVER
 * granted KYC. Skipping the association would change the rejection from
 * `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN` to `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT` — a different,
 * far weaker story.
 */
/** Shares buyer1 must hold for the secondary-transfer scene to run. */
const SECONDARY_SCENE_SHARES = 100

export const POST = handler(async (request) => {
  assertDemoControl(request)
  const startedAt = Date.now()

  const tokenId = process.env.SEED_TOKEN_ID?.trim()
  if (!tokenId) {
    throw new ApiError(
      'INTERNAL_ERROR',
      'SEED_TOKEN_ID is not configured. Run `npm run golden` once to mint the seed token.',
    )
  }

  const buyer1 = getDemoAccount('BUYER1')
  const buyer2 = getDemoAccount('BUYER2')
  const nokyc = getDemoAccount('NOKYC')

  const now = new Date().toISOString()

  // Register the properties BEFORE touching the chain. The share top-up below can fail
  // (it did, once the treasury ran low), and if registration came afterwards a failed
  // top-up left PROP-001 absent entirely — turning a recoverable "not enough shares" into
  // PROPERTY_NOT_FOUND for both pre-seeded scenes, with the runbook's remedy being the
  // very call that failed.
  putProperty({
    propertyId: 'PROP-001',
    displayName: 'Alfama Seed',
    city: 'Lisbon',
    sellerAccountId: process.env.OPERATOR_ID!.trim(),
    tokenSymbol: 'PPRV1',
    state: 'TOKENIZED',
    createdAt: now,
    submittedAt: now,
    decidedAt: now,
    documentRoot: undefined,
    documentCount: 0,
    files: [],
    commitments: [],
    tokenId,
  })

  // PROP-003 is the rental property: APPROVED but deliberately never tokenized, because
  // renting an asset whose shares are already sold would create two claims on it. Seeding
  // it removes an undocumented ordering dependency — previously the rental scene only
  // worked if someone had manually run attest + verifier-approve first, so after any
  // restart it died with PROPERTY_NOT_FOUND.
  putProperty({
    propertyId: 'PROP-003',
    displayName: 'Graca Rental',
    city: 'Lisbon',
    sellerAccountId: process.env.OPERATOR_ID!.trim(),
    tokenSymbol: 'GRCA',
    state: 'APPROVED',
    createdAt: now,
    submittedAt: now,
    decidedAt: now,
    documentRoot: undefined,
    documentCount: 0,
    files: [],
    commitments: [],
  })

  // All three calls are idempotent, so re-seeding between rehearsals is safe.
  await associateToken(tokenId, buyer1)
  await associateToken(tokenId, buyer2)
  await associateToken(tokenId, nokyc)

  await grantKycIfNeeded(tokenId, buyer1.accountId.toString())
  await grantKycIfNeeded(tokenId, buyer2.accountId.toString())
  // nokyc is intentionally left without a KYC grant.

  const replenished = await replenishSecondaryScene(tokenId, buyer1, buyer2)

  // Prepare every OTHER tokenized property too, not just the seed one.
  //
  // A property tokenized during a live run gets a brand new token, and tokens minted
  // before this preparation existed have no relationships at all — which is how the
  // no-KYC scene ended up returning TOKEN_NOT_ASSOCIATED_TO_ACCOUNT on the live property
  // while working fine on the seeded one. Seed is the "make the demo ready" button, so it
  // should mean every property, not one.
  const repaired: string[] = []
  for (const property of listProperties()) {
    if (!property.tokenId || property.tokenId === tokenId) continue
    try {
      await prepareTokenForDemo(property.tokenId)
      repaired.push(property.propertyId)
    } catch (error) {
      console.warn(
        `[seed] Could not prepare ${property.propertyId} (${property.tokenId}):`,
        error instanceof Error ? error.message : error,
      )
    }
  }

  return jsonResponse({
    seeded: true,
    properties: ['PROP-001', 'PROP-003'],
    tokenId,
    replenished,
    preparedTokens: repaired,
    elapsedMs: Date.now() - startedAt,
  })
})

/**
 * Restores buyer1's shares for the secondary-market fee scene, recycling rather than
 * draining.
 *
 * The arithmetic that makes this necessary: each rehearsal moves 100 shares from buyer1 to
 * buyer2 permanently, and the 2% inclusive fee returns only 2 to the treasury. Topping up
 * exclusively from the treasury therefore costs it 98 per run — measured at 508 remaining,
 * that is five rehearsals before `/api/seed` itself starts failing.
 *
 * Meanwhile every one of those transfers has been piling up in buyer2, which holds 392
 * idle shares. Sweeping them back first makes the loop closed: shares circulate between
 * the two buyers instead of leaking out of the treasury one rehearsal at a time.
 *
 * Both legs are attempted in order and failures are surfaced rather than swallowed, but
 * the property registration above has already happened, so a shortfall degrades to "the
 * fee scene needs a top-up" instead of "the property does not exist".
 */
async function replenishSecondaryScene(
  tokenId: string,
  buyer1: ReturnType<typeof getDemoAccount>,
  buyer2: ReturnType<typeof getDemoAccount>,
): Promise<{ needed: number; fromBuyer2: number; fromTreasury: number }> {
  const held = await tokenBalance(tokenId, buyer1.accountId)
  const needed = Math.max(0, SECONDARY_SCENE_SHARES - held)
  if (needed === 0) return { needed: 0, fromBuyer2: 0, fromTreasury: 0 }

  let remaining = needed
  let fromBuyer2 = 0

  // Recycle first. This transfer is itself fee-bearing (neither side is the treasury), so
  // ask for slightly more than we need and let the fee come out of the surplus.
  const buyer2Held = await tokenBalance(tokenId, buyer2.accountId)
  const recyclable = Math.min(buyer2Held, remaining + 5)
  if (recyclable > 0) {
    try {
      await transferShares({ tokenId, from: buyer2, to: buyer1.accountId, amount: recyclable })
      fromBuyer2 = recyclable
      remaining = Math.max(0, SECONDARY_SCENE_SHARES - (await tokenBalance(tokenId, buyer1.accountId)))
    } catch (error) {
      console.warn(
        '[seed] Could not recycle shares from buyer2, falling back to the treasury:',
        error instanceof Error ? error.message : error,
      )
    }
  }

  let fromTreasury = 0
  if (remaining > 0) {
    await transferShares({ tokenId, from: getOperator(), to: buyer1.accountId, amount: remaining })
    fromTreasury = remaining
  }

  return { needed, fromBuyer2, fromTreasury }
}

/**
 * Granting KYC twice is not an error on Hedera, but a failure here should not abort the
 * whole seed — the association is what the demo actually depends on.
 */
async function grantKycIfNeeded(tokenId: string, accountId: string): Promise<void> {
  try {
    await grantKyc(tokenId, accountId)
  } catch (error) {
    console.warn(
      `[seed] Could not grant KYC to ${accountId}:`,
      error instanceof Error ? error.message : error,
    )
  }
}
