import {
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  Status,
  StatusError,
  TransferTransaction,
} from '@hashgraph/sdk'
import { ApiError } from '../errors'
import { recordTransaction } from '../store'
import { getClient, hashscanUrl } from './client'

/**
 * HBAR movements for the rental escrow.
 *
 * The rental mode deliberately does NOT tokenize. Renting is not a transfer of ownership,
 * so minting shares for it would misrepresent what is happening — a deposit is locked and
 * later released. That distinction is the point of having two modes over one core: the
 * three phases (Register → Engage → Settle) are identical, only the predicate and the
 * settlement differ.
 *
 * The escrow is held by the operator account. A separate fifth account would add setup
 * cost without changing what the demo proves: the HBAR really moves, and both the lock and
 * the release are permanent, independently verifiable transactions on HashScan.
 */

export type HbarTransferResult = {
  transactionId: string
  hashscanUrl: string
  amount: number
}

/** Which direction the money is going — see `insufficientFundsMessage`. */
export type HbarTransferContext = 'deposit-lock' | 'escrow-release'

/**
 * Two accounts can starve the same transfer, and naming the wrong one sends someone to top
 * up an account that was never short.
 *
 * The fee payer is always the operator, because every transaction here is executed through
 * the operator-configured client. The debited account, by contrast, depends on the
 * direction: the tenant when a deposit is locked, the escrow when one is released. So
 * INSUFFICIENT_PAYER_BALANCE is an operator problem whichever way the HBAR was moving,
 * while INSUFFICIENT_ACCOUNT_BALANCE is the sender's — and on a release nothing is being
 * "deposited" at all, so the old wording told the tenant to fund a wallet that would not
 * have helped.
 *
 * The code stays INSUFFICIENT_DEPOSIT in every case: that list is closed and documented in
 * docs/API.md, the UI branches on the code, and the text is free to change.
 */
function insufficientFundsMessage(
  status: StatusError['status'],
  from: AccountId,
  amount: number,
  context?: HbarTransferContext,
): string | null {
  const operation =
    context === 'deposit-lock'
      ? 'lock this deposit'
      : context === 'escrow-release'
        ? 'release the escrow'
        : 'complete this transfer'

  if (status._code === Status.InsufficientPayerBalance._code) {
    return `The operator account cannot pay the network fee to ${operation}; it needs to be topped up. Nothing was moved.`
  }

  if (status._code === Status.InsufficientAccountBalance._code) {
    const sender =
      context === 'deposit-lock'
        ? `The tenant account ${from.toString()}`
        : context === 'escrow-release'
          ? `The escrow account ${from.toString()}`
          : `Account ${from.toString()}`
    return `${sender} does not hold the ${amount} HBAR needed to ${operation}.`
  }

  return null
}

/**
 * Moves HBAR between two accounts.
 *
 * The sender must sign, which is why the full key pair is required rather than an account
 * id: the escrow lock is a real debit from the tenant, not a bookkeeping entry.
 *
 * `context` changes nothing about the transfer; it exists only so a funding failure can
 * name the account that actually has to be funded.
 */
export async function transferHbar(
  params: {
    from: { accountId: AccountId; privateKey: PrivateKey }
    to: AccountId | string
    amount: number
    memo?: string
    propertyId?: string
    context?: HbarTransferContext
    /**
     * Fired the moment the transfer is irreversibly submitted — after `execute`, before the
     * receipt. This is where a caller must persist its terminal state.
     *
     * Persisting after `transferHbar` returns is the bug this exists to remove: a receipt
     * timeout throws on a transfer that may well have succeeded, the listing stays ENGAGED
     * with a lapsed lock, and `/api/rental/expire` is permissionless — so anyone can fire it
     * again and the escrow pays deposit + slash a second time. `withLock` does not help; it
     * serializes concurrent calls, never a sequential retry.
     */
    onSubmitted?: (transactionId: string) => void
    /**
     * Fired only when consensus DEFINITIVELY rejected the transaction, so nothing moved and
     * the caller may safely undo what `onSubmitted` wrote. Never fired on a timeout or a
     * dropped connection: those leave the outcome genuinely unknown, and the safe side of
     * unknown is to stay terminal and be unstuck by hand rather than risk paying twice.
     */
    onDefinitiveFailure?: () => void
  },
  client: Client = getClient(),
): Promise<HbarTransferResult> {
  const to = typeof params.to === 'string' ? AccountId.fromString(params.to) : params.to

  // Rounded down to a whole tinybar at the single choke point every HBAR movement passes
  // through. Callers validate their own inputs, but validation with a tolerance still
  // admits values like 5000.000000000001 — which construct an Hbar that throws
  // `Hbar in tinybars contains decimals`, and because that happens before the try block it
  // surfaced as an unhandled 500 on every retry, permanently bricking that listing.
  // Down rather than nearest: never attempt to move more than the sender was asked for.
  const hbar = new Hbar(Math.floor(params.amount * 100_000_000) / 100_000_000)

  try {
    const transaction = new TransferTransaction()
      .addHbarTransfer(params.from.accountId, hbar.negated())
      .addHbarTransfer(to, hbar)

    if (params.memo) transaction.setTransactionMemo(params.memo)

    const response = await (
      await transaction.freezeWith(client).sign(params.from.privateKey)
    ).execute(client)

    const transactionId = response.transactionId.toString()

    // Record the id BEFORE waiting for the receipt.
    //
    // The HBAR has already moved by the time `execute` returns; the receipt only tells us
    // what consensus decided. A timeout or a dropped connection while waiting therefore
    // throws AFTER the money is gone, and every caller updates its state only after this
    // function returns — so a retry debits the tenant a second deposit, or pays a second
    // refund out of the escrow, with nothing recording the first. `/api/rental/expire` is
    // permissionless, so anyone could drive that retry.
    //
    // Writing the id first means a failed wait leaves a trace to reconcile against instead
    // of a silent second transfer.
    recordTransaction({
      transactionId,
      kind: 'HBAR_TRANSFER',
      propertyId: params.propertyId,
      at: new Date().toISOString(),
      hashscanUrl: hashscanUrl('transaction', transactionId),
    })

    params.onSubmitted?.(transactionId)

    try {
      await response.getReceipt(client)
    } catch (error) {
      // A StatusError here is consensus speaking: the transaction reached the network and
      // was rejected, so no HBAR moved and the caller's state change was premature. Anything
      // else — a timeout, a dropped socket — means we simply do not know, and guessing
      // "failed" is what pays the escrow out twice.
      if (error instanceof StatusError) params.onDefinitiveFailure?.()
      throw error
    }

    return {
      transactionId,
      hashscanUrl: hashscanUrl('transaction', transactionId),
      amount: params.amount,
    }
  } catch (error) {
    if (error instanceof StatusError) {
      const message = insufficientFundsMessage(
        error.status,
        params.from.accountId,
        params.amount,
        params.context,
      )
      if (message) {
        throw new ApiError('INSUFFICIENT_DEPOSIT', message, {
          hederaStatus: error.status.toString(),
        })
      }
    }
    throw error
  }
}
