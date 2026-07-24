import './env'
import { AccountBalanceQuery, Client } from '@hashgraph/sdk'
import { readFileSync, writeFileSync } from 'node:fs'
import { ApiError } from '../lib/errors'
import { getDemoAccount, getOperator, hashscanUrl, withClient } from '../lib/hedera/client'
import {
  associateToken,
  createPropertyToken,
  grantKyc,
  transferShares,
} from '../lib/hedera/token'

/**
 * R1 çıkış kriteri: üç Hedera "altın sahnesi" — World ve UI olmadan, saf zincir kanıtı.
 *
 *   1. Primary   operator → buyer1   başarılı, fee YOK (treasury muaf)
 *   2. Secondary buyer1  → buyer2    başarılı, fee = 2 (%2 fractional, inclusive)
 *   3. No-KYC    operator → nokyc    ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN ile RED
 *
 * 3. sahne için kritik incelik: nokyc hesabı token'a ASSOCIATE EDİLİR ama KYC ALMAZ.
 * Associate atlanırsa hata `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT` olur — bu yanlış hikâye:
 * "KYC olmadan transfer edemezsin" değil, "token'ı hiç kabul etmemiş" demektir.
 */

const TRANSFER_AMOUNT = 100

async function tokenBalance(client: Client, accountId: string, tokenId: string) {
  const balance = await new AccountBalanceQuery().setAccountId(accountId).execute(client)
  return balance.tokens?.get(tokenId)?.toNumber() ?? 0
}

async function main() {
  const operator = getOperator()
  const buyer1 = getDemoAccount('BUYER1')
  const buyer2 = getDemoAccount('BUYER2')
  const nokyc = getDemoAccount('NOKYC')

  const evidence: string[] = []

  await withClient(async (client) => {
    // ── Token ────────────────────────────────────────────────────────────────
    console.log('▶ Token oluşturuluyor…')
    const token = await createPropertyToken(
      { propertyId: 'PROP-001', displayName: 'Alfama Seed', tokenSymbol: 'PPRV1' },
      client,
    )
    console.log(`  ✅ tokenId=${token.tokenId}  supply=${token.totalSupply}  fee=%2 (min 1)`)
    console.log(`     ${token.hashscanUrl}\n`)
    evidence.push(`| HTS property token (PROP-001) | \`${token.tokenId}\` | ${token.hashscanUrl} |`)

    // ── Association + KYC ────────────────────────────────────────────────────
    console.log('▶ Association ve KYC ayarlanıyor…')
    for (const [name, account] of [
      ['buyer1', buyer1],
      ['buyer2', buyer2],
      ['nokyc', nokyc],
    ] as const) {
      const result = await associateToken(token.tokenId, account, client)
      console.log(
        `  associate ${name.padEnd(6)} ${result.alreadyAssociated ? '(zaten bağlı)' : '✅'}`,
      )
    }

    // nokyc BİLEREK atlanıyor — 3. sahnenin doğru hatayı vermesi buna bağlı.
    await grantKyc(token.tokenId, buyer1.accountId, client)
    console.log('  grantKyc  buyer1 ✅')
    await grantKyc(token.tokenId, buyer2.accountId, client)
    console.log('  grantKyc  buyer2 ✅')
    console.log('  grantKyc  nokyc  ⛔ bilerek verilmedi\n')

    // ── SAHNE 1: primary transfer, fee yok ───────────────────────────────────
    console.log('▶ SAHNE 1 — primary transfer (operator → buyer1)')
    const primary = await transferShares(
      { tokenId: token.tokenId, from: operator, to: buyer1.accountId, amount: TRANSFER_AMOUNT },
      client,
    )
    const primaryFees = primary.assessedCustomFees
    console.log(`  ✅ ${TRANSFER_AMOUNT} hisse transfer edildi`)
    console.log(`     kesilen fee: ${primaryFees.length === 0 ? 'YOK (treasury muaf) ✅' : JSON.stringify(primaryFees)}`)
    console.log(`     ${primary.hashscanUrl}\n`)
    assert(primaryFees.length === 0, 'Primary transferde fee kesilmemeliydi')
    evidence.push(`| Primary transfer (fee yok) | operator → buyer1, ${TRANSFER_AMOUNT} hisse | ${primary.hashscanUrl} |`)

    // ── SAHNE 2: secondary transfer, fee = 2 ─────────────────────────────────
    console.log('▶ SAHNE 2 — secondary transfer (buyer1 → buyer2)')
    const before2 = await tokenBalance(client, buyer2.accountId.toString(), token.tokenId)
    const secondary = await transferShares(
      { tokenId: token.tokenId, from: buyer1, to: buyer2.accountId, amount: TRANSFER_AMOUNT },
      client,
    )
    const after2 = await tokenBalance(client, buyer2.accountId.toString(), token.tokenId)
    const feeAmount = secondary.assessedCustomFees[0]?.amount ?? 0

    console.log(`  ✅ ${TRANSFER_AMOUNT} hisse gönderildi`)
    console.log(`     kesilen fee : ${feeAmount}`)
    console.log(`     buyer2 aldı : ${after2 - before2} hisse (${TRANSFER_AMOUNT} − ${feeAmount})`)
    console.log(`     ${secondary.hashscanUrl}\n`)
    assert(feeAmount === 2, `Secondary transferde fee 2 olmalıydı, ${feeAmount} geldi`)
    assert(after2 - before2 === 98, `buyer2 98 hisse almalıydı, ${after2 - before2} aldı`)
    evidence.push(`| Secondary transfer + %2 fee | buyer1 → buyer2, fee=${feeAmount}, alıcı 98 | ${secondary.hashscanUrl} |`)

    // ── SAHNE 3: KYC'siz transfer ağ seviyesinde reddedilir ──────────────────
    console.log('▶ SAHNE 3 — KYC verilmemiş hesaba transfer (operator → nokyc)')
    let rejected = false
    try {
      await transferShares(
        { tokenId: token.tokenId, from: operator, to: nokyc.accountId, amount: 1 },
        client,
      )
    } catch (error) {
      if (error instanceof ApiError && error.code === 'KYC_DENIED') {
        rejected = true
        console.log(`  ✅ REDDEDİLDİ — code=${error.code}`)
        console.log(`     hederaStatus=${error.extra.hederaStatus}`)
        console.log('     Bu red uygulama kuralı değil, Hedera ağ seviyesi.\n')
      } else {
        throw error
      }
    }
    assert(rejected, 'nokyc transferi reddedilmeliydi ama geçti')
    evidence.push(
      `| KYC reddi (ağ seviyesi) | operator → nokyc, \`ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN\` | ${hashscanUrl('account', nokyc.accountId.toString())} |`,
    )

    // Seed token'ı sakla — /api/seed PROP-001'i bununla kuracak.
    persistSeedTokenId(token.tokenId)
  })

  console.log('━'.repeat(70))
  console.log('✅ ÜÇ ALTIN SAHNE DE GEÇTİ\n')
  console.log('docs/EVIDENCE.md için satırlar:\n')
  for (const line of evidence) console.log(line)
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Doğrulama başarısız: ${message}`)
}

function persistSeedTokenId(tokenId: string) {
  const path = '.env.local'
  const content = readFileSync(path, 'utf8')
  writeFileSync(path, content.replace(/^SEED_TOKEN_ID=.*$/m, `SEED_TOKEN_ID=${tokenId}`))
}

main().catch((error) => {
  console.error('\n❌ Altın sahne başarısız:', error instanceof Error ? error.message : error)
  process.exit(1)
})
