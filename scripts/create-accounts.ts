import './env'
import { AccountCreateTransaction, Hbar, PrivateKey } from '@hashgraph/sdk'
import { readFileSync, writeFileSync } from 'node:fs'
import { getOperator, hashscanUrl, withClient } from '../lib/hedera/client'

/**
 * Demo hesaplarını üretir ve `.env.local`'a yazar.
 *
 * Recep portaldan yalnız operator'ı açar; kalan üç hesap buradan gelir:
 *   buyer1 — birincil alıcı (satışta KYC'li alıcı, kiralamada tenant)
 *   buyer2 — ikincil alıcı (secondary transfer + fractional fee sahnesi)
 *   nokyc  — token'a associate EDİLİR ama KYC ALMAZ (ağ seviyesi red sahnesi)
 *
 * Anahtarlar ED25519 üretilir; operator ECDSA olsa da `parseKey()` her ikisini de
 * DER başlığından çözdüğü için karışım sorun çıkarmaz.
 */

const ACCOUNTS = [
  { name: 'BUYER1', initialHbar: 60 },
  { name: 'BUYER2', initialHbar: 20 },
  { name: 'NOKYC', initialHbar: 10 },
] as const

async function main() {
  const operator = getOperator()
  console.log('Operator:', operator.accountId.toString(), '\n')

  const created: { name: string; id: string; key: string }[] = []

  await withClient(async (client) => {
    for (const spec of ACCOUNTS) {
      const privateKey = PrivateKey.generateED25519()

      const receipt = await (
        await new AccountCreateTransaction()
          // setKey() deprecated — alias'sız hesap istiyoruz (EVM adresi gerekmiyor).
          .setKeyWithoutAlias(privateKey.publicKey)
          .setInitialBalance(new Hbar(spec.initialHbar))
          .execute(client)
      ).getReceipt(client)

      const accountId = receipt.accountId
      if (!accountId) throw new Error(`${spec.name} hesabı oluşturulamadı`)

      console.log(
        `✅ ${spec.name.padEnd(6)} ${accountId.toString().padEnd(12)} ${spec.initialHbar} ℏ  ${hashscanUrl('account', accountId.toString())}`,
      )

      created.push({
        name: spec.name,
        id: accountId.toString(),
        // DER export — parseKey() bunu doğrudan çözer.
        key: privateKey.toStringDer(),
      })
    }
  })

  writeEnvValues(
    created.flatMap((account) => [
      [`${account.name}_ID`, account.id] as const,
      [`${account.name}_KEY`, account.key] as const,
    ]),
  )

  console.log('\n✅ .env.local güncellendi. Anahtarlar konsola basılmadı.')
}

/**
 * `.env.local` içindeki anahtarları yerinde günceller.
 * Dosyayı baştan yazmıyoruz — mevcut World/ENS/verifier değerleri korunmalı.
 */
function writeEnvValues(entries: readonly (readonly [string, string])[]) {
  const path = '.env.local'
  let content = readFileSync(path, 'utf8')

  for (const [key, value] of entries) {
    const pattern = new RegExp(`^${key}=.*$`, 'm')
    const line = `${key}=${value}`
    content = pattern.test(content) ? content.replace(pattern, line) : `${content}\n${line}`
  }

  writeFileSync(path, content)
}

main().catch((error) => {
  console.error('\n❌ Hesap oluşturma başarısız:', error instanceof Error ? error.message : error)
  process.exit(1)
})
