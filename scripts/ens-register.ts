import './env'
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  namehash,
  zeroHash,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { randomBytes } from 'node:crypto'
import {
  ENS_REGISTRY,
  ETH_REGISTRAR_CONTROLLER,
  PUBLIC_RESOLVER,
  REGISTRY_ABI,
} from '../lib/ens/constants'

/**
 * Registers the parent name on ENS v1 (Sepolia), entirely from code.
 *
 * ABI note, learned the hard way: the currently deployed controller takes a single
 * `Registration` STRUCT — `(label, owner, duration, secret, resolver, data, reverseRecord
 * uint8, referrer bytes32)` — not the older flat parameter list ending in
 * `ownerControlledFuses uint16` that most tutorials (and our first attempt) use. The flat
 * call reverts on `makeCommitment`. This ABI was extracted from ensjs's contract
 * snippets, which track what is actually deployed.
 *
 * Why not just call ensjs? Its ESM dependency graph (multiformats) does not survive tsx's
 * loader. viem alone loads fine, so the script stays pure viem with the correct ABI.
 *
 * Registration is commit–reveal: publish a hash of your intent, wait out the minimum age,
 * then reveal. The delay stops mempool watchers from front-running the name. The secret
 * must be byte-identical across both calls — regenerating it between them silently
 * invalidates the commitment and wastes the gas.
 *
 * Idempotent: exits without spending if the name is already owned.
 */

const NAME = process.env.ENS_PARENT_NAME ?? 'pprevlisbon.eth'
const LABEL = NAME.replace(/\.eth$/, '')
const DURATION_SECONDS = BigInt(365 * 24 * 60 * 60)

const CONTROLLER_ABI = [
  {
    name: 'rentPrice',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'label', type: 'string' },
      { name: 'duration', type: 'uint256' },
    ],
    outputs: [
      {
        name: 'price',
        type: 'tuple',
        components: [
          { name: 'base', type: 'uint256' },
          { name: 'premium', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'makeCommitment',
    type: 'function',
    stateMutability: 'pure',
    inputs: [REGISTRATION_INPUT()],
    outputs: [{ name: 'commitment', type: 'bytes32' }],
  },
  {
    name: 'commit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'commitment', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'register',
    type: 'function',
    stateMutability: 'payable',
    inputs: [REGISTRATION_INPUT()],
    outputs: [],
  },
] as const

function REGISTRATION_INPUT() {
  return {
    name: 'registration',
    type: 'tuple',
    components: [
      { name: 'label', type: 'string' },
      { name: 'owner', type: 'address' },
      { name: 'duration', type: 'uint256' },
      { name: 'secret', type: 'bytes32' },
      { name: 'resolver', type: 'address' },
      { name: 'data', type: 'bytes[]' },
      { name: 'reverseRecord', type: 'uint8' },
      { name: 'referrer', type: 'bytes32' },
    ],
  } as const
}

async function main() {
  const account = privateKeyToAccount(process.env.ENS_PRIVATE_KEY as `0x${string}`)
  const transport = http(process.env.SEPOLIA_RPC_URL)
  const publicClient = createPublicClient({ chain: sepolia, transport })
  const walletClient = createWalletClient({ account, chain: sepolia, transport })

  console.log('Name    :', NAME)
  console.log('Owner   :', account.address)

  const currentOwner = (await publicClient.readContract({
    address: ENS_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: 'owner',
    args: [namehash(NAME)],
  })) as string

  if (currentOwner !== '0x0000000000000000000000000000000000000000') {
    console.log('\n✅ Already registered. Registry owner:', currentOwner)
    console.log('   Nothing to do — run `npm run ens:write` to publish the records.')
    return
  }

  const price = (await publicClient.readContract({
    address: ETH_REGISTRAR_CONTROLLER,
    abi: CONTROLLER_ABI,
    functionName: 'rentPrice',
    args: [LABEL, DURATION_SECONDS],
  })) as { base: bigint; premium: bigint }

  const total = price.base + price.premium
  // 10% cushion: the price is quoted in USD at an oracle rate that can tick between the
  // quote and the transaction. Underpaying reverts; the controller refunds the excess.
  const value = (total * 110n) / 100n
  console.log('Price   :', formatEther(total), 'ETH (sending', formatEther(value), 'with headroom)')

  const registration = {
    label: LABEL,
    owner: account.address,
    duration: DURATION_SECONDS,
    secret: `0x${randomBytes(32).toString('hex')}` as `0x${string}`,
    resolver: PUBLIC_RESOLVER,
    data: [] as `0x${string}`[],
    reverseRecord: 0,
    referrer: zeroHash,
  }

  const commitment = await publicClient.readContract({
    address: ETH_REGISTRAR_CONTROLLER,
    abi: CONTROLLER_ABI,
    functionName: 'makeCommitment',
    args: [registration],
  })

  console.log('\n▶ Step 1/2 — commit')
  const commitHash = await walletClient.writeContract({
    address: ETH_REGISTRAR_CONTROLLER,
    abi: CONTROLLER_ABI,
    functionName: 'commit',
    args: [commitment],
  })
  await publicClient.waitForTransactionReceipt({ hash: commitHash })
  console.log('  ✅ https://sepolia.etherscan.io/tx/' + commitHash)

  // The controller enforces a minimum commitment age (60s). Revealing a block early
  // reverts with CommitmentTooNew, so wait with a margin.
  const waitSeconds = 75
  console.log(`\n⏳ Waiting ${waitSeconds}s for the commitment to mature…`)
  await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000))

  console.log('\n▶ Step 2/2 — register')
  const registerHash = await walletClient.writeContract({
    address: ETH_REGISTRAR_CONTROLLER,
    abi: CONTROLLER_ABI,
    functionName: 'register',
    args: [registration],
    value,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash: registerHash })
  console.log('  ✅ https://sepolia.etherscan.io/tx/' + registerHash)
  console.log('  status:', receipt.status)

  const owner = (await publicClient.readContract({
    address: ENS_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: 'owner',
    args: [namehash(NAME)],
  })) as string

  console.log(`\n✅ ${NAME} registered. Registry owner: ${owner}`)
  console.log('   Next: npm run ens:write')
}

main().catch((error) => {
  console.error('\n❌ Registration failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
