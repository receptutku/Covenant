import { assertDevelopmentOnly, handler, jsonResponse } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import { getDemoAccount } from '@/lib/hedera/client'
import { associateToken, grantKyc } from '@/lib/hedera/token'
import { putProperty } from '@/lib/store'
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
export const POST = handler(async () => {
  assertDevelopmentOnly()
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

  // All three calls are idempotent, so re-seeding between rehearsals is safe.
  await associateToken(tokenId, buyer1)
  await associateToken(tokenId, buyer2)
  await associateToken(tokenId, nokyc)

  await grantKycIfNeeded(tokenId, buyer1.accountId.toString())
  await grantKycIfNeeded(tokenId, buyer2.accountId.toString())
  // nokyc is intentionally left without a KYC grant.

  const now = new Date().toISOString()
  const seeded: Property = {
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
  }
  putProperty(seeded)

  return jsonResponse({
    seeded: true,
    properties: ['PROP-001'],
    tokenId,
    elapsedMs: Date.now() - startedAt,
  })
})

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
