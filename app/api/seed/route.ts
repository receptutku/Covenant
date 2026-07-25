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

  const rebalanced = await rebalanceShares(tokenId, buyer1, buyer2)

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
    rebalanced,
    preparedTokens: repaired,
    elapsedMs: Date.now() - startedAt,
  })
})

/** Shares the treasury needs on hand to keep serving primary transfers. */
const TREASURY_FLOAT_SHARES = 300

/**
 * Rebalances the three demo accounts so every scene can run again.
 *
 * Supply is fixed at 1000 and nothing is ever destroyed, so this is not topping up — it is
 * moving the same shares back to where the scenes expect them. Two sinks drain in opposite
 * directions and neither refills itself:
 *
 *   - the fee scene moves 100 from buyer1 to buyer2 on every run;
 *   - the primary sale moves shares out of the treasury, and only the 2% fee comes back.
 *
 * Measured after a day of rehearsals: treasury 16, buyer1 213, buyer2 771. The earlier
 * version of this function only refilled buyer1, so the fee scene kept working while
 * primary sales quietly ran out of inventory — which is what INSUFFICIENT_TOKEN_BALANCE
 * turned out to mean when it appeared mid-rehearsal.
 *
 * buyer2 is the reservoir both sinks drain into, so both are refilled from there. It is
 * also the only source that does not cost the demo anything: buyer2 holds shares purely as
 * the counterparty of a scene that has already been shown.
 */
async function rebalanceShares(
  tokenId: string,
  buyer1: ReturnType<typeof getDemoAccount>,
  buyer2: ReturnType<typeof getDemoAccount>,
): Promise<{
  buyer1: { sent: number; reached: number; short: number }
  treasury: { sent: number; reached: number; short: number }
  ok: boolean
}> {
  const operator = getOperator()

  /**
   * Moves shares from buyer2 and reports whether the TARGET was reached, not merely how
   * much was sent.
   *
   * Reporting the amount sent hid two failures behind a 200. If buyer2 held less than the
   * shortfall it emptied itself and left the target unmet; if it held exactly the shortfall
   * the `Math.min` clipped the fee buffer away and the recipient landed one or two short —
   * the buffer failing at precisely the moment it was needed. Either way seed answered
   * "rebalanced" and the next secondary buy died mid-demo.
   */
  const moveFromBuyer2 = async (
    to: typeof buyer1.accountId,
    target: number,
  ): Promise<{ sent: number; reached: number; short: number }> => {
    const held = await tokenBalance(tokenId, to)
    const shortfall = target - held
    if (shortfall <= 0) return { sent: 0, reached: held, short: 0 }

    const available = await tokenBalance(tokenId, buyer2.accountId)
    // A buyer2 → anyone transfer is fee-bearing (neither side is the treasury), so ask for
    // a little more than the shortfall and let the 2% come out of the surplus.
    const amount = Math.min(available, shortfall + 5)
    if (amount <= 0) return { sent: 0, reached: held, short: shortfall }

    try {
      await transferShares({ tokenId, from: buyer2, to, amount })
    } catch (error) {
      console.warn(
        '[seed] Could not recycle shares from buyer2:',
        error instanceof Error ? error.message : error,
      )
      return { sent: 0, reached: held, short: shortfall }
    }

    // Re-read rather than assume: the inclusive fee means the recipient is credited less
    // than was sent, and that gap is exactly what used to go unnoticed.
    const reached = await tokenBalance(tokenId, to)
    return { sent: amount, reached, short: Math.max(0, target - reached) }
  }

  // The fee scene first: it is the one that fails most visibly, mid-narration.
  const buyer1Result = await moveFromBuyer2(buyer1.accountId, SECONDARY_SCENE_SHARES)

  // Then the treasury, so primary sales have inventory. Without this the demo works right
  // up until someone buys, which is the worst place to discover it.
  const treasuryResult = await moveFromBuyer2(operator.accountId, TREASURY_FLOAT_SHARES)

  const ok = buyer1Result.short === 0 && treasuryResult.short === 0
  if (!ok) {
    console.warn(
      `[seed] Rebalance incomplete — buyer1 short ${buyer1Result.short}, treasury short ` +
        `${treasuryResult.short}. buyer2 is the only reservoir and may be exhausted.`,
    )
  }

  return { buyer1: buyer1Result, treasury: treasuryResult, ok }
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
