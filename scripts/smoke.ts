import './env'
import { getHbarBalance, getOperator, hashscanUrl, withClient } from '../lib/hedera/client'

/**
 * Operator hesabının canlı olduğunu ve anahtar formatının doğru çözüldüğünü doğrular.
 * R1'in ilk adımı: bu geçmeden token/topic oluşturmaya girişmek zaman kaybıdır.
 */
async function main() {
  const operator = getOperator()
  console.log('Operator      :', operator.accountId.toString())
  console.log('Anahtar tipi  :', operator.privateKey.type ?? 'bilinmiyor')
  console.log('Public key    :', operator.privateKey.publicKey.toString())

  await withClient(async (client) => {
    const balance = await getHbarBalance(client, operator.accountId)
    console.log('Bakiye        :', balance.toString())
    console.log('HashScan      :', hashscanUrl('account', operator.accountId.toString()))

    const hbars = balance.toBigNumber().toNumber()
    if (hbars < 20) {
      console.warn(
        `\n⚠ Bakiye düşük (${hbars} ℏ). Token oluşturma + escrow demosu için en az 20 ℏ öneriliyor.`,
      )
    } else {
      console.log('\n✅ Operator hazır.')
    }
  })
}

main().catch((error) => {
  console.error('\n❌ Smoke test başarısız:', error instanceof Error ? error.message : error)
  process.exit(1)
})
