import { handler, jsonResponse, parseBody } from '@/lib/api'
import { createPropertyToken } from '@/lib/hedera/token'
import { submitEventSafe } from '@/lib/hedera/topic'
import { assertTokenizable, requireProperty } from '@/lib/property'
import { tokenizeSchema } from '@/lib/schemas'
import { putProperty } from '@/lib/store'
import { HCS_EVENTS } from '@/lib/types'
import { assertAttestationValid } from '@/lib/verifier/attestation'
import { withLock } from '@/lib/lock'
import { publishTokenIdInBackground } from '@/lib/ens/write'
import { prepareTokenForDemoInBackground } from '@/lib/hedera/demo-setup'

/**
 * The security gate between a reviewed property and an on-chain asset.
 *
 * Order matters, and it is checked cheapest-first so a doctored request fails before it
 * costs a network round trip:
 *
 *   1. The property exists and is in `APPROVED` (not pending, rejected, or already minted).
 *   2. The submitted attestation carries a valid verifier signature.
 *   3. That attestation actually describes THIS property — the signature alone is not
 *      enough, since a valid signature for a different property would otherwise be
 *      accepted here.
 *   4. The attestation has not expired.
 *
 * Only then is the token created. Tampering with a single character of the attestation —
 * the property id, the document root, the expiry — breaks step 2 and the mint never happens.
 */
export const POST = handler(async (request) => {
  const body = await parseBody(request, tokenizeSchema)

  // Serialized per property: without this, two concurrent requests both saw APPROVED and
  // both minted, putting two real tokens on-chain for one property. Reproduced with a
  // parallel curl — a double-clicked button does the same.
  return withLock(`property:${body.propertyId}`, async () => {
    const property = requireProperty(body.propertyId)
    assertTokenizable(property)
    assertAttestationValid(body.attestation, property)

    const token = await createPropertyToken({
      propertyId: property.propertyId,
      displayName: property.displayName,
      tokenSymbol: property.tokenSymbol,
    })

    putProperty({ ...property, state: 'TOKENIZED', tokenId: token.tokenId })

    // Publish the new token id to ENS so discovery matches the chain. Every live run
    // mints a NEW token for the same property, so a record written once goes stale on the
    // next rehearsal — which showed up as the discovery panel resolving one token id
    // while the transfer underneath used another. Fired in the background: the mint is
    // already final, and a Sepolia hiccup must not fail a successful tokenization.
    publishTokenIdInBackground(property.propertyId, token.tokenId)

    // A brand new token has no relationships yet, so every compliance scene would fail
    // against it for the wrong reason — the no-KYC transfer in particular returned
    // TOKEN_NOT_ASSOCIATED_TO_ACCOUNT, which reads as "this account was never set up"
    // rather than "identity verification is enforced". Association is a precondition of
    // the KYC gate, not a bypass: Hedera checks it first, so the gate is unreachable
    // until it is satisfied. nokyc is associated and deliberately left ungranted.
    prepareTokenForDemoInBackground(token.tokenId)

    await submitEventSafe(HCS_EVENTS.PROPERTY_TOKEN_CREATED, property.propertyId, {
      tokenId: token.tokenId,
      totalSupply: token.totalSupply,
      decimals: token.decimals,
      fractionalFeeBps: token.fractionalFeeBps,
      transactionId: token.transactionId,
    })

    return jsonResponse({
      propertyId: property.propertyId,
      state: 'TOKENIZED',
      tokenId: token.tokenId,
      totalSupply: token.totalSupply,
      decimals: token.decimals,
      fractionalFeeBps: token.fractionalFeeBps,
      hashscanUrl: token.hashscanUrl,
    })
  })
})
