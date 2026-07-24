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

/**
 * Moves HBAR between two accounts.
 *
 * The sender must sign, which is why the full key pair is required rather than an account
 * id: the escrow lock is a real debit from the tenant, not a bookkeeping entry.
 */
export async function transferHbar(
  params: {
    from: { accountId: AccountId; privateKey: PrivateKey }
    to: AccountId | string
    amount: number
    memo?: string
    propertyId?: string
  },
  client: Client = getClient(),
): Promise<HbarTransferResult> {
  const to = typeof params.to === 'string' ? AccountId.fromString(params.to) : params.to
  const hbar = new Hbar(params.amount)

  try {
    const transaction = new TransferTransaction()
      .addHbarTransfer(params.from.accountId, hbar.negated())
      .addHbarTransfer(to, hbar)

    if (params.memo) transaction.setTransactionMemo(params.memo)

    const response = await (
      await transaction.freezeWith(client).sign(params.from.privateKey)
    ).execute(client)

    await response.getReceipt(client)

    const transactionId = response.transactionId.toString()
    const url = hashscanUrl('transaction', transactionId)

    recordTransaction({
      transactionId,
      kind: 'HBAR_TRANSFER',
      propertyId: params.propertyId,
      at: new Date().toISOString(),
      hashscanUrl: url,
    })

    return { transactionId, hashscanUrl: url, amount: params.amount }
  } catch (error) {
    if (
      error instanceof StatusError &&
      (error.status._code === Status.InsufficientAccountBalance._code ||
        error.status._code === Status.InsufficientPayerBalance._code)
    ) {
      throw new ApiError(
        'INSUFFICIENT_DEPOSIT',
        'The account does not hold enough HBAR to lock this deposit.',
        { hederaStatus: error.status.toString() },
      )
    }
    throw error
  }
}
