import './env'
import { createHash } from 'node:crypto'
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  namehash,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { RECORD_KEYS, RESOLVER_ABI, UNIVERSAL_RESOLVER } from '../lib/ens/constants'

/**
 * Publishes per-property protocol config as ENS text records — programmatically, no UI.
 *
 * How this works on ENSv2 (discovered by probing, since the alpha has thin docs):
 *   - The parent name owns a permissioned resolver; the owner wallet may setText on it
 *     for the parent node AND for subname nodes directly. No subname registration
 *     transaction is needed — resolution walks up to the resolver covering the longest
 *     suffix, so `prop-002.pprevlisbon.eth` resolves through the parent's resolver.
 *   - Reads work from plain viem via the UniversalResolver, so any client can verify.
 *
 * One multicall per property: all records land in a single transaction, which keeps the
 * demo re-runnable (re-tokenize → re-run this script → one signature per property).
 *
 * Usage:
 *   npx tsx scripts/ens-write.ts                     # writes all three properties
 *   npx tsx scripts/ens-write.ts PROP-002=0.0.12345  # override a token id
 */

const PARENT = process.env.ENS_PARENT_NAME ?? 'pprevlisbon.eth'

/** The policy hash commits to the rule set a config was published under. */
function policyHash(mode: 'SALE' | 'RENTAL'): string {
  return '0x' + createHash('sha256').update(`PPREV_POLICY_${mode}_V1`).digest('hex')
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value?.trim()) throw new Error(`Missing environment variable: ${name}`)
  return value.trim()
}

type PropertyConfig = { subname: string; records: Record<string, string> }

function buildConfigs(
  overrides: Map<string, string>,
  publishedTokens: Map<string, string>,
): PropertyConfig[] {
  const network = process.env.HEDERA_NETWORK ?? 'testnet'
  const operator = requireEnv('OPERATOR_ID')
  const topicId = requireEnv('AUDIT_TOPIC_ID')
  const verifierKey = requireEnv('VERIFIER_PUBLIC_KEY')

  const common = (propertyId: string, mode: 'SALE' | 'RENTAL') => ({
    [RECORD_KEYS.mode]: mode,
    [RECORD_KEYS.network]: network,
    [RECORD_KEYS.policyHash]: policyHash(mode),
    [RECORD_KEYS.policyVersion]: '1',
    [RECORD_KEYS.verifierPublicKey]: verifierKey,
    [RECORD_KEYS.auditTopicId]: topicId,
    [RECORD_KEYS.propertyId]: propertyId,
  })

  return [
    {
      // Seed property — the compliance showcase (secondary fee, KYC rejection).
      subname: 'prop-001',
      records: {
        ...common('PROP-001', 'SALE'),
        [RECORD_KEYS.propertyTokenId]: overrides.get('PROP-001') ?? requireEnv('SEED_TOKEN_ID'),
        [RECORD_KEYS.revenueTreasury]: operator,
      },
    },
    {
      // Live-flow property. Its token changes on every run, and `/api/tokenize` already
      // publishes the new id automatically — so the CURRENTLY PUBLISHED value is the
      // freshest source of truth, ahead of the env file which goes stale immediately.
      //
      // Getting this order wrong was actively harmful: the runbook tells you to run this
      // script whenever prop-001 drifts, and with env first that instruction silently
      // reverted prop-002 to a token from two rehearsals ago. Preflight only validated
      // prop-001, so the damage was invisible.
      subname: 'prop-002',
      records: {
        ...common('PROP-002', 'SALE'),
        [RECORD_KEYS.propertyTokenId]:
          overrides.get('PROP-002') ??
          publishedTokens.get('prop-002') ??
          process.env.PROP002_TOKEN_ID?.trim() ??
          requireEnv('SEED_TOKEN_ID'),
        [RECORD_KEYS.revenueTreasury]: operator,
      },
    },
    {
      // Rental property — no token by design; escrow account + required deposit instead.
      subname: 'prop-003',
      records: {
        ...common('PROP-003', 'RENTAL'),
        [RECORD_KEYS.rentalEscrowAccount]: operator,
        [RECORD_KEYS.rentalReqDeposit]: process.env.FALLBACK_RENTAL_REQ_DEPOSIT?.trim() || '50',
      },
    },
  ]
}

async function main() {
  const overrides = new Map<string, string>()
  for (const arg of process.argv.slice(2)) {
    const [id, value] = arg.split('=')
    if (id && value) overrides.set(id, value)
  }

  const account = privateKeyToAccount(process.env.ENS_PRIVATE_KEY as `0x${string}`)
  const transport = http(process.env.SEPOLIA_RPC_URL)
  const publicClient = createPublicClient({ chain: sepolia, transport })
  const walletClient = createWalletClient({ account, chain: sepolia, transport })

  // The resolver is discovered at run time rather than hard-coded: the v2 alpha
  // redeploys periodically, and a stale resolver address would fail silently.
  const resolver = await publicClient.getEnsResolver({
    name: PARENT,
    universalResolverAddress: UNIVERSAL_RESOLVER,
  })
  console.log('Parent   :', PARENT)
  console.log('Resolver :', resolver)
  console.log('Writer   :', account.address, '\n')

  // Read what is already published before overwriting anything. A rewrite must not undo
  // a token id that /api/tokenize published more recently than our env file was updated.
  const publishedTokens = new Map<string, string>()
  for (const sub of ['prop-001', 'prop-002', 'prop-003']) {
    const current = await publicClient
      .getEnsText({
        name: `${sub}.${PARENT}`,
        key: RECORD_KEYS.propertyTokenId,
        universalResolverAddress: UNIVERSAL_RESOLVER,
      })
      .catch(() => null)
    if (current) publishedTokens.set(sub, current)
  }

  for (const config of buildConfigs(overrides, publishedTokens)) {
    const name = `${config.subname}.${PARENT}`
    const node = namehash(name)

    const calls = Object.entries(config.records).map(([key, value]) =>
      encodeFunctionData({ abi: RESOLVER_ABI, functionName: 'setText', args: [node, key, value] }),
    )

    console.log(`▶ ${name} — ${calls.length} records in one multicall`)
    const hash = await walletClient.writeContract({
      address: resolver,
      abi: RESOLVER_ABI,
      functionName: 'multicall',
      args: [calls],
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    console.log(`  ${receipt.status === 'success' ? '✅' : '❌'} https://sepolia.etherscan.io/tx/${hash}`)
  }

  // Read back through the UniversalResolver — the same path any outside verifier uses.
  console.log('\n▶ Read-back via UniversalResolver (public path)')
  for (const config of buildConfigs(overrides, publishedTokens)) {
    const name = `${config.subname}.${PARENT}`
    const mode = await publicClient.getEnsText({
      name,
      key: RECORD_KEYS.mode,
      universalResolverAddress: UNIVERSAL_RESOLVER,
    })
    const propertyId = await publicClient.getEnsText({
      name,
      key: RECORD_KEYS.propertyId,
      universalResolverAddress: UNIVERSAL_RESOLVER,
    })
    console.log(`  ${name.padEnd(28)} mode=${mode} propertyId=${propertyId}`)
  }

  console.log('\n✅ ENS config published and readable.')
}

main().catch((error) => {
  console.error('\n❌ ENS write failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
