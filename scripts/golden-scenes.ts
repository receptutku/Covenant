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
 * R1 exit criterion: the three Hedera "golden scenes" — pure on-chain proof, without World
 * or the UI.
 *
 *   1. Primary   operator → buyer1   succeeds, NO fee (treasury is exempt)
 *   2. Secondary buyer1  → buyer2    succeeds, fee = 2 (2% fractional, inclusive)
 *   3. No-KYC    operator → nokyc    REJECTED with ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN
 *
 * The subtle but critical detail for scene 3: the nokyc account IS ASSOCIATED with the token
 * but is NEVER GRANTED KYC. Skipping the association would yield
 * `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, which tells the wrong story: not "you cannot transfer
 * without KYC" but "the account never opted into the token at all".
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
    console.log('▶ Creating token…')
    const token = await createPropertyToken(
      { propertyId: 'PROP-001', displayName: 'Alfama Seed', tokenSymbol: 'PPRV1' },
      client,
    )
    console.log(`  ✅ tokenId=${token.tokenId}  supply=${token.totalSupply}  fee=2% (min 1)`)
    console.log(`     ${token.hashscanUrl}\n`)
    evidence.push(`| HTS property token (PROP-001) | \`${token.tokenId}\` | ${token.hashscanUrl} |`)

    // ── Association + KYC ────────────────────────────────────────────────────
    console.log('▶ Setting up association and KYC…')
    for (const [name, account] of [
      ['buyer1', buyer1],
      ['buyer2', buyer2],
      ['nokyc', nokyc],
    ] as const) {
      const result = await associateToken(token.tokenId, account, client)
      console.log(
        `  associate ${name.padEnd(6)} ${result.alreadyAssociated ? '(already associated)' : '✅'}`,
      )
    }

    // nokyc is skipped ON PURPOSE — scene 3 only produces the right error because of this.
    await grantKyc(token.tokenId, buyer1.accountId, client)
    console.log('  grantKyc  buyer1 ✅')
    await grantKyc(token.tokenId, buyer2.accountId, client)
    console.log('  grantKyc  buyer2 ✅')
    console.log('  grantKyc  nokyc  ⛔ withheld on purpose\n')

    // ── SCENE 1: primary transfer, no fee ────────────────────────────────────
    console.log('▶ SCENE 1 — primary transfer (operator → buyer1)')
    const primary = await transferShares(
      { tokenId: token.tokenId, from: operator, to: buyer1.accountId, amount: TRANSFER_AMOUNT },
      client,
    )
    const primaryFees = primary.assessedCustomFees
    console.log(`  ✅ ${TRANSFER_AMOUNT} shares transferred`)
    console.log(`     fee charged: ${primaryFees.length === 0 ? 'NONE (treasury is exempt) ✅' : JSON.stringify(primaryFees)}`)
    console.log(`     ${primary.hashscanUrl}\n`)
    assert(primaryFees.length === 0, 'No fee should have been charged on the primary transfer')
    evidence.push(`| Primary transfer (no fee) | operator → buyer1, ${TRANSFER_AMOUNT} shares | ${primary.hashscanUrl} |`)

    // ── SCENE 2: secondary transfer, fee = 2 ─────────────────────────────────
    console.log('▶ SCENE 2 — secondary transfer (buyer1 → buyer2)')
    const before2 = await tokenBalance(client, buyer2.accountId.toString(), token.tokenId)
    const secondary = await transferShares(
      { tokenId: token.tokenId, from: buyer1, to: buyer2.accountId, amount: TRANSFER_AMOUNT },
      client,
    )
    const after2 = await tokenBalance(client, buyer2.accountId.toString(), token.tokenId)
    const feeAmount = secondary.assessedCustomFees[0]?.amount ?? 0

    console.log(`  ✅ ${TRANSFER_AMOUNT} shares sent`)
    console.log(`     fee charged    : ${feeAmount}`)
    console.log(`     buyer2 received: ${after2 - before2} shares (${TRANSFER_AMOUNT} − ${feeAmount})`)
    console.log(`     ${secondary.hashscanUrl}\n`)
    assert(feeAmount === 2, `The fee on the secondary transfer should have been 2, got ${feeAmount}`)
    assert(after2 - before2 === 98, `buyer2 should have received 98 shares, got ${after2 - before2}`)
    evidence.push(`| Secondary transfer + 2% fee | buyer1 → buyer2, fee=${feeAmount}, receiver gets 98 | ${secondary.hashscanUrl} |`)

    // ── SCENE 3: KYC-less transfer rejected at network level ─────────────────
    console.log('▶ SCENE 3 — transfer to an account without KYC (operator → nokyc)')
    let rejected = false
    try {
      await transferShares(
        { tokenId: token.tokenId, from: operator, to: nokyc.accountId, amount: 1 },
        client,
      )
    } catch (error) {
      if (error instanceof ApiError && error.code === 'KYC_DENIED') {
        rejected = true
        console.log(`  ✅ REJECTED — code=${error.code}`)
        console.log(`     hederaStatus=${error.extra.hederaStatus}`)
        console.log('     This rejection is not an application rule — it comes from the Hedera network itself.\n')
      } else {
        throw error
      }
    }
    assert(rejected, 'The nokyc transfer should have been rejected but it went through')
    evidence.push(
      `| KYC rejection (network level) | operator → nokyc, \`ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN\` | ${hashscanUrl('account', nokyc.accountId.toString())} |`,
    )

    // Persist the seed token — /api/seed will set up PROP-001 with it.
    persistSeedTokenId(token.tokenId)
    console.log(
      '\n⚠ SEED_TOKEN_ID changed. Two things are now stale until you act:',
      '\n  1. RESTART the dev server. Next.js reads .env.local once at startup, so a running',
      '\n     server keeps serving the PREVIOUS seed token no matter what this file says.',
      '\n  2. Run `npm run ens:write` so the prop-001 discovery record matches the chain.',
    )
  })

  console.log('━'.repeat(70))
  console.log('✅ ALL THREE GOLDEN SCENES PASSED\n')
  console.log('Rows for docs/EVIDENCE.md:\n')
  for (const line of evidence) console.log(line)
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

function persistSeedTokenId(tokenId: string) {
  const path = '.env.local'
  const content = readFileSync(path, 'utf8')
  writeFileSync(path, content.replace(/^SEED_TOKEN_ID=.*$/m, `SEED_TOKEN_ID=${tokenId}`))
}

main().catch((error) => {
  console.error('\n❌ Golden scene failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
