import './env'
import { getHbarBalance, getOperator, hashscanUrl, withClient } from '../lib/hedera/client'

/**
 * Verifies that the operator account is live and that its key format parses correctly.
 * The first step of R1: attempting to create tokens or topics before this passes is a waste
 * of time.
 */
async function main() {
  const operator = getOperator()
  console.log('Operator      :', operator.accountId.toString())
  console.log('Key type      :', operator.privateKey.type ?? 'unknown')
  console.log('Public key    :', operator.privateKey.publicKey.toString())

  await withClient(async (client) => {
    const balance = await getHbarBalance(client, operator.accountId)
    console.log('Balance       :', balance.toString())
    console.log('HashScan      :', hashscanUrl('account', operator.accountId.toString()))

    const hbars = balance.toBigNumber().toNumber()
    if (hbars < 20) {
      console.warn(
        `\n⚠ Balance is low (${hbars} ℏ). At least 20 ℏ is recommended for token creation plus the escrow demo.`,
      )
    } else {
      console.log('\n✅ Operator is ready.')
    }
  })
}

main().catch((error) => {
  console.error('\n❌ Smoke test failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
