import { getDemoAccount, getOperator } from './client'
import { associateToken, grantKyc, tokenBalance, transferShares } from './token'

/**
 * Makes a freshly minted token ready for all three compliance scenes.
 *
 * The bug this closes: `/api/seed` prepared only the seed token, so a property tokenized
 * during the live flow had a BRAND NEW token that none of the demo accounts had ever
 * associated. Running the no-KYC scene against it returned
 * `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT` instead of `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN` —
 * which tells the opposite story. "This account was never set up" is a configuration
 * excuse; "this account holds the token but cannot receive a transfer without identity
 * verification" is the claim the whole protocol rests on.
 *
 * Hedera checks association BEFORE KYC, so the KYC gate is unreachable until the account
 * is associated. Association is therefore a PRECONDITION of the scene, not a shortcut
 * around it — nokyc is associated here and deliberately never granted KYC.
 */

/** Shares buyer1 needs for the secondary-market fee scene. */
const SECONDARY_SCENE_SHARES = 100

export type TokenPreparation = {
  associated: string[]
  kycGranted: string[]
  sharesSeeded: number
}

export async function prepareTokenForDemo(tokenId: string): Promise<TokenPreparation> {
  const buyer1 = getDemoAccount('BUYER1')
  const buyer2 = getDemoAccount('BUYER2')
  const nokyc = getDemoAccount('NOKYC')

  const result: TokenPreparation = { associated: [], kycGranted: [], sharesSeeded: 0 }

  // Association is idempotent, so this is safe to re-run between rehearsals.
  for (const [name, account] of [
    ['buyer1', buyer1],
    ['buyer2', buyer2],
    ['nokyc', nokyc],
  ] as const) {
    try {
      await associateToken(tokenId, account)
      result.associated.push(name)
    } catch (error) {
      console.warn(
        `[demo-setup] Could not associate ${name} with ${tokenId}:`,
        error instanceof Error ? error.message : error,
      )
    }
  }

  // buyer1 and buyer2 are the verified participants; nokyc is the counter-example and is
  // intentionally skipped.
  for (const [name, account] of [
    ['buyer1', buyer1],
    ['buyer2', buyer2],
  ] as const) {
    try {
      await grantKyc(tokenId, account.accountId)
      result.kycGranted.push(name)
    } catch (error) {
      console.warn(
        `[demo-setup] Could not grant KYC to ${name} for ${tokenId}:`,
        error instanceof Error ? error.message : error,
      )
    }
  }

  // The secondary-fee scene needs a holder who is NOT the treasury, since the treasury is
  // exempt from its own fee and would show no deduction at all.
  try {
    const held = await tokenBalance(tokenId, buyer1.accountId)
    const shortfall = SECONDARY_SCENE_SHARES - held
    if (shortfall > 0) {
      await transferShares({
        tokenId,
        from: getOperator(),
        to: buyer1.accountId,
        amount: shortfall,
      })
      result.sharesSeeded = shortfall
    }
  } catch (error) {
    console.warn(
      `[demo-setup] Could not seed buyer1 shares for ${tokenId}:`,
      error instanceof Error ? error.message : error,
    )
  }

  return result
}

/**
 * Non-blocking variant for use right after a mint.
 *
 * Not awaited by the caller: preparation is several sequential Hedera round trips, and
 * making the tokenize response wait on it would add seconds of visible latency to the
 * moment a judge is watching. The demo reaches the buy step well after this settles, and
 * `/api/buy` still repairs a missing association just in time if someone races ahead.
 */
export function prepareTokenForDemoInBackground(tokenId: string): void {
  void prepareTokenForDemo(tokenId)
    .then((result) => {
      console.log(
        `[demo-setup] ${tokenId} ready — associated: ${result.associated.join(', ') || 'none'}; ` +
          `KYC: ${result.kycGranted.join(', ') || 'none'}; shares to buyer1: ${result.sharesSeeded}`,
      )
    })
    .catch((error) => {
      console.error(
        `[demo-setup] Preparation failed for ${tokenId}:`,
        error instanceof Error ? error.message : error,
      )
    })
}
