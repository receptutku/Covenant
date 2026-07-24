/**
 * ENS v1 deployment on Sepolia.
 *
 * We target the classic (v1) deployment deliberately. The name is also registered on the
 * ENSv2 alpha at app.ens.dev, but that deployment carries two properties a live demo
 * cannot absorb: ENS documents that alpha state "may be reset periodically due to routine
 * contract deployments", and v2's hierarchical registries are not yet resolvable by viem
 * or ensjs. v1 is boring, and boring is what a demo needs.
 *
 * Addresses are identical across networks for the registry and base registrar; the
 * controller and resolver are Sepolia-specific.
 */

export const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as const
export const BASE_REGISTRAR = '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85' as const
export const ETH_REGISTRAR_CONTROLLER = '0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968' as const
export const PUBLIC_RESOLVER = '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5' as const

/**
 * The v2 UniversalResolver. This is the piece that made the v2 path viable: plain viem
 * (`getEnsText` / `getEnsAddress` with `universalResolverAddress`) resolves names
 * registered through the ENSv2 alpha, so no special client is needed on the read side.
 */
export const UNIVERSAL_RESOLVER = '0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe' as const

export const REGISTRY_ABI = [
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
  {
    name: 'setSubnodeRecord',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'label', type: 'bytes32' },
      { name: 'owner', type: 'address' },
      { name: 'resolver', type: 'address' },
      { name: 'ttl', type: 'uint64' },
    ],
    outputs: [],
  },
] as const

export const RESOLVER_ABI = [
  {
    name: 'text',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
    ],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'setText',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
      { name: 'value', type: 'string' },
    ],
    outputs: [],
  },
  {
    // Batches several setText calls into one transaction — one signature per property
    // instead of one per record.
    name: 'multicall',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'data', type: 'bytes[]' }],
    outputs: [{ name: 'results', type: 'bytes[]' }],
  },
] as const

export const CONTROLLER_ABI = [
  {
    name: 'available',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'name', type: 'string' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'rentPrice',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'name', type: 'string' },
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
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'owner', type: 'address' },
      { name: 'duration', type: 'uint256' },
      { name: 'secret', type: 'bytes32' },
      { name: 'resolver', type: 'address' },
      { name: 'data', type: 'bytes[]' },
      { name: 'reverseRecord', type: 'bool' },
      { name: 'ownerControlledFuses', type: 'uint16' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
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
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'owner', type: 'address' },
      { name: 'duration', type: 'uint256' },
      { name: 'secret', type: 'bytes32' },
      { name: 'resolver', type: 'address' },
      { name: 'data', type: 'bytes[]' },
      { name: 'reverseRecord', type: 'bool' },
      { name: 'ownerControlledFuses', type: 'uint16' },
    ],
    outputs: [],
  },
  {
    name: 'minCommitmentAge',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

/**
 * The record keys that carry protocol configuration.
 *
 * Namespaced under `com.pprev` so they cannot collide with the conventional ENS keys
 * (`avatar`, `url`, `com.twitter`) a general-purpose client might read.
 */
export const RECORD_KEYS = {
  mode: 'com.pprev.mode',
  network: 'com.pprev.hedera.network',
  propertyTokenId: 'com.pprev.hedera.propertyTokenId',
  auditTopicId: 'com.pprev.hedera.auditTopicId',
  revenueTreasury: 'com.pprev.hedera.revenueTreasury',
  policyHash: 'com.pprev.policy.hash',
  policyVersion: 'com.pprev.policy.version',
  verifierPublicKey: 'com.pprev.verifier.publicKey',
  propertyId: 'com.pprev.property.id',
  rentalEscrowAccount: 'com.pprev.rental.escrowAccount',
  rentalReqDeposit: 'com.pprev.rental.reqDeposit',
} as const

/** Keys every config must carry, regardless of mode. */
export const REQUIRED_COMMON = [
  RECORD_KEYS.network,
  RECORD_KEYS.policyHash,
  RECORD_KEYS.policyVersion,
  RECORD_KEYS.verifierPublicKey,
  RECORD_KEYS.auditTopicId,
  RECORD_KEYS.propertyId,
] as const

export const REQUIRED_SALE = [RECORD_KEYS.propertyTokenId, RECORD_KEYS.revenueTreasury] as const
export const REQUIRED_RENTAL = [
  RECORD_KEYS.rentalEscrowAccount,
  RECORD_KEYS.rentalReqDeposit,
] as const
