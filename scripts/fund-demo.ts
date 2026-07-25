import './env'
import { AccountBalanceQuery } from '@hashgraph/sdk'
import { getDemoAccount, getOperator, hashscanUrl, withClient } from '../lib/hedera/client'
import { transferHbar } from '../lib/hedera/hbar'

/**
 * Tops the demo accounts back up to the levels the scenes actually require.
 *
 * The rental deposit is advertised at 50 ℏ (in ENS and in the env fallback), and engaging
 * a second listing before settling the first locks two deposits at once — so the tenant
 * needs 2× the advertised deposit plus fee headroom. buyer1 sat at 63 ℏ, which covered
 * exactly one, and nothing checked it against the advertised figure until preflight did.
 *
 * Safe to re-run: it transfers only the shortfall, and nothing at all when balances are
 * already sufficient.
 */

const TARGET_TENANT_HBAR = (() => {
  const deposit = Number(process.env.FALLBACK_RENTAL_REQ_DEPOSIT ?? 50)
  // Two deposits, plus ~20% for transaction fees and the expiry penalty.
  return Math.ceil(deposit * 2 * 1.2)
})()

async function main() {
  const operator = getOperator()
  const buyer1 = getDemoAccount('BUYER1')

  await withClient(async (client) => {
    const balanceOf = async (accountId: string) =>
      (await new AccountBalanceQuery().setAccountId(accountId).execute(client)).hbars
        .toBigNumber()
        .toNumber()

    const operatorBalance = await balanceOf(operator.accountId.toString())
    const tenantBalance = await balanceOf(buyer1.accountId.toString())

    console.log('operator :', operatorBalance.toFixed(2), 'ℏ')
    console.log('buyer1   :', tenantBalance.toFixed(2), 'ℏ  (target', TARGET_TENANT_HBAR, 'ℏ)')

    const shortfall = Math.ceil(TARGET_TENANT_HBAR - tenantBalance)
    if (shortfall <= 0) {
      console.log('\n✅ buyer1 already covers two deposits. Nothing to do.')
      return
    }

    // Leave the operator enough to keep paying transaction fees and funding escrow refunds.
    if (operatorBalance - shortfall < 100) {
      console.error(
        `\n❌ Operator would drop below 100 ℏ (has ${operatorBalance.toFixed(0)}, needs to send ${shortfall}).`,
      )
      console.error('   Top the operator up from the Hedera portal faucet first.')
      process.exit(1)
    }

    console.log(`\n▶ Sending ${shortfall} ℏ operator → buyer1`)
    const transfer = await transferHbar(
      { from: operator, to: buyer1.accountId, amount: shortfall, memo: 'PPREV demo top-up' },
      client,
    )
    console.log('  ✅', transfer.hashscanUrl)
    console.log('\nbuyer1 :', (await balanceOf(buyer1.accountId.toString())).toFixed(2), 'ℏ')
    console.log('HashScan:', hashscanUrl('account', buyer1.accountId.toString()))
  })
}

main().catch((error) => {
  console.error('\n❌ Funding failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
