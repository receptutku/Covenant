import { z } from 'zod'
import { assertDevelopmentOnly, handler, jsonResponse, parseBody, requireAdminSecret } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import { demoAccountFor, hashscanUrl } from '@/lib/hedera/client'
import { associateToken, grantKyc } from '@/lib/hedera/token'
import { submitEventSafe } from '@/lib/hedera/topic'
import { requireProperty } from '@/lib/property'
import { accountIdSchema, propertyIdSchema } from '@/lib/schemas'
import { HCS_EVENTS } from '@/lib/types'

/**
 * Grants Hedera KYC without a World proof. Development only, admin-gated.
 *
 * The buyer counterpart to `/api/dev/session`. The seller side could already be driven
 * from a script, but the buyer chain — World Identity → KYC grant → primary transfer —
 * had no path that did not go through the IDKit widget, so it could not be exercised
 * without a human and a phone.
 *
 * Separate route rather than a flag on `/api/kyc`, for the same reason as the session
 * bypass: a skip-verification branch inside the verification handler is the kind of thing
 * that survives a refactor and ships. `/api/kyc` contains no bypass at all.
 *
 * The nokyc guard is repeated here on purpose. It is the one account that must never
 * receive a grant — the network's refusal to transfer to it is the demo's strongest
 * moment, there is no revoke endpoint, and a bypass that could quietly destroy that would
 * be a worse bug than the inconvenience it exists to solve.
 */
const schema = z.object({
  propertyId: propertyIdSchema,
  buyerAccountId: accountIdSchema,
})

export const POST = handler(async (request) => {
  assertDevelopmentOnly()
  requireAdminSecret(request)

  const body = await parseBody(request, schema)
  const property = requireProperty(body.propertyId)

  if (!property.tokenId) {
    throw new ApiError(
      'PROPERTY_NOT_FOUND',
      'This property has no token yet — it must be tokenized before KYC can be granted.',
    )
  }

  if (body.buyerAccountId === process.env.NOKYC_ID?.trim()) {
    throw new ApiError(
      'KYC_DENIED',
      'This account is reserved as the unverified counter-example and cannot be granted KYC.',
    )
  }

  console.warn(
    `[dev] Granting KYC to ${body.buyerAccountId} WITHOUT a World proof (development endpoint).`,
  )

  // Association needs the account's own signature, so it only happens for accounts whose
  // keys we hold. For any other account the holder associates themselves; the grant below
  // is signed by the token's KYC key and needs nothing from them.
  const account = demoAccountFor(body.buyerAccountId)
  const associationTxId = account
    ? (await associateToken(property.tokenId, account)).transactionId
    : null

  const kycTxId = await grantKyc(property.tokenId, body.buyerAccountId)

  // Recorded with verifiedByWorld:false — the audit trail says what actually happened,
  // which is the entire point of having one.
  await submitEventSafe(HCS_EVENTS.KYC_GRANTED, property.propertyId, {
    tokenId: property.tokenId,
    buyerAccountId: body.buyerAccountId,
    transactionId: kycTxId,
    verifiedByWorld: false,
  })

  return jsonResponse({
    eligible: true,
    kycGranted: true,
    tokenId: property.tokenId,
    buyerAccountId: body.buyerAccountId,
    associationTxId,
    kycTxId,
    hashscanUrl: hashscanUrl('transaction', kycTxId),
    warning: 'Development grant — no World verification was performed.',
  })
})
