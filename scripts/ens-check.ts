import './env'
import { createPublicClient, formatEther, http, namehash } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'

/**
 * Diagnostic for the ENS wallet: who are we, do we have gas, and which name do we own?
 *
 * Run this before attempting any registration or record write. Every failure mode here
 * (wrong network, empty balance, name owned by someone else) is cheap to see now and
 * expensive to debug from inside a failed transaction.
 */

const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as const

const REGISTRY_ABI = [
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'resolver',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

/** Names to probe. The one we asked for, plus the variants suggested as fallbacks. */
const CANDIDATES = [
  'pprevlisbon.eth',
  'pprev-lisbon.eth',
  'pprevdemo.eth',
  'pprevlisbon2026.eth',
  'pprev.eth',
]

async function main() {
  const account = privateKeyToAccount(process.env.ENS_PRIVATE_KEY as `0x${string}`)
  const client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL),
  })

  console.log('Wallet   :', account.address)

  const balance = await client.getBalance({ address: account.address })
  const eth = Number(formatEther(balance))
  console.log('Balance  :', `${eth.toFixed(4)} SepoliaETH`)
  console.log('Explorer :', `https://sepolia.etherscan.io/address/${account.address}`)

  if (eth < 0.005) {
    console.warn('\n⚠ Balance is low. Writing subnames and text records needs roughly 0.02 ETH.')
  }

  console.log('\nChecking name ownership on Sepolia:\n')

  let owned: string | null = null

  for (const name of CANDIDATES) {
    const node = namehash(name)
    const owner = (await client.readContract({
      address: ENS_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: 'owner',
      args: [node],
    })) as string

    const isUnowned = owner === '0x0000000000000000000000000000000000000000'
    const isOurs = owner.toLowerCase() === account.address.toLowerCase()

    // A registered .eth name is usually held by the NameWrapper or the BaseRegistrar on
    // behalf of the owner, so the registry owner is often a contract rather than the
    // wallet. "someone else" therefore does not necessarily mean "not ours".
    const status = isUnowned ? 'unregistered' : isOurs ? '✅ OURS (direct)' : `held by ${owner}`
    console.log(`  ${name.padEnd(24)} ${status}`)

    if (isOurs) owned = name
    else if (!isUnowned && !owned) owned = name // candidate: may be wrapped
  }

  if (!owned) {
    console.log('\n❌ None of the candidate names are registered on Sepolia.')
    console.log('   Tell me the exact name you registered and I will re-check.')
    return
  }

  const resolver = (await client.readContract({
    address: ENS_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: 'resolver',
    args: [namehash(owned)],
  })) as string

  console.log(`\nLikely name : ${owned}`)
  console.log(`Resolver    : ${resolver}`)
  if (resolver === '0x0000000000000000000000000000000000000000') {
    console.log('⚠ No resolver set — text records cannot be written until one is assigned.')
  }
}

main().catch((error) => {
  console.error('\n❌ ENS check failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
