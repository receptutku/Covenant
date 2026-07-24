import './env'
import { AccountCreateTransaction, Hbar, PrivateKey } from '@hashgraph/sdk'
import { readFileSync, writeFileSync } from 'node:fs'
import { getOperator, hashscanUrl, withClient } from '../lib/hedera/client'

/**
 * Generates the demo accounts and writes them to `.env.local`.
 *
 * The operator is the only account opened through the Hedera portal; the remaining three
 * come from this script:
 *   buyer1 — primary buyer (the KYC'd buyer in a sale, the tenant in a rental)
 *   buyer2 — secondary buyer (the secondary transfer + fractional fee scene)
 *   nokyc  — IS associated with the token but is NEVER granted KYC (network-level rejection scene)
 *
 * The keys are generated as ED25519; even though the operator is ECDSA, the mix causes no
 * trouble because `parseKey()` resolves both from the DER header.
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
          // setKey() is deprecated — we want an account without an alias (no EVM address needed).
          .setKeyWithoutAlias(privateKey.publicKey)
          .setInitialBalance(new Hbar(spec.initialHbar))
          .execute(client)
      ).getReceipt(client)

      const accountId = receipt.accountId
      if (!accountId) throw new Error(`Failed to create the ${spec.name} account`)

      console.log(
        `✅ ${spec.name.padEnd(6)} ${accountId.toString().padEnd(12)} ${spec.initialHbar} ℏ  ${hashscanUrl('account', accountId.toString())}`,
      )

      created.push({
        name: spec.name,
        id: accountId.toString(),
        // DER export — parseKey() reads this directly.
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

  console.log('\n✅ .env.local updated. Keys were not printed to the console.')
}

/**
 * Updates the keys inside `.env.local` in place.
 * We don't rewrite the file from scratch — the existing World/ENS/verifier values must be
 * preserved.
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
  console.error('\n❌ Account creation failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
