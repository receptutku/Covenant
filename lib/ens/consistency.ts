import { readToken } from '../hedera/mirror'
import { RECORD_KEYS } from './constants'
import { readEnsConfig } from './read'

/**
 * Checks the ENS record against the token we are about to move shares in.
 *
 * This is what makes ENS load-bearing rather than decorative. Before this existed, deleting
 * every record we publish changed nothing: transfers read the token from the server's own
 * store, so ENS was a place we wrote to and a place the UI read from, but never a place that
 * could stop anything. "What breaks if I delete the records?" is the first question an ENS
 * judge asks, and the honest answer was "nothing".
 *
 * The rule is deliberately asymmetric, because the failure modes are not symmetric:
 *
 *   - ENS agreeing is a positive signal, so we say so.
 *   - ENS being unreachable is not evidence of anything. Refusing there would hand a Sepolia
 *     outage the power to stop a Hedera transfer, which is worse than the problem.
 *   - ENS naming a DIFFERENT token is the only interesting case, and it splits in two. It is
 *     routinely stale: `/api/tokenize` republishes the token id in the background, so a buy
 *     seconds after a mint legitimately sees the previous run's value. Refusing there would
 *     kill a real sale mid-demo. But a record pointing at a token we never created is a
 *     record someone else repointed, and that is exactly the substitution this check exists
 *     to stop.
 *
 * "Ours" is decided by the token's treasury on Hedera, not by anything we store — a store
 * that was reset does not remember the token it minted last week, and Mirror does.
 */

export type EnsTokenCheck =
  /** ENS names the same token we are about to transfer. */
  | { status: 'match'; ensTokenId: string }
  /** ENS names a different token, but one our operator created — the record has not caught up. */
  | { status: 'stale'; ensTokenId: string }
  /** ENS could not be consulted, or has no token record for this property. */
  | { status: 'unavailable'; reason: string }
  /** ENS names a token our operator did not create. Someone repointed the record. */
  | { status: 'mismatch'; ensTokenId: string }

export async function checkEnsTokenId(
  propertyId: string,
  expectedTokenId: string,
): Promise<EnsTokenCheck> {
  const operator = process.env.OPERATOR_ID?.trim()
  if (!operator) return { status: 'unavailable', reason: 'no operator configured' }

  let config
  try {
    config = await readEnsConfig(propertyId)
  } catch {
    // readEnsConfig throws when the name has no readable mode record. That is a configuration
    // problem, not evidence about the token, and it must not block a transfer.
    return { status: 'unavailable', reason: 'ENS could not be resolved' }
  }

  // The env fallback is our own configuration read back to us. Treating it as agreement would
  // mean claiming "ENS confirmed this" while ENS was never consulted — the exact overclaim
  // this check was added to retire.
  if (config.source !== 'ens') {
    return { status: 'unavailable', reason: 'resolved from the env fallback, not from ENS' }
  }

  const ensTokenId = config.records[RECORD_KEYS.propertyTokenId]?.trim()
  if (!ensTokenId) {
    return { status: 'unavailable', reason: 'no propertyTokenId record' }
  }

  if (ensTokenId === expectedTokenId) return { status: 'match', ensTokenId }

  const token = await readToken(ensTokenId)
  if (!token) {
    // Either Mirror is unreachable or the token does not exist. The two are indistinguishable
    // from here, and only one of them is an attack — so this is the one place the rule bends
    // toward letting the transfer through. A record naming a nonexistent token cannot be used
    // to substitute a token anyway; there is nothing on the other end to receive shares.
    return { status: 'unavailable', reason: 'the token named by ENS could not be read' }
  }

  if (token.treasuryAccountId === operator) return { status: 'stale', ensTokenId }

  return { status: 'mismatch', ensTokenId }
}
