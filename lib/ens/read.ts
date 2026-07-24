import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { ApiError } from '../errors'
import {
  RECORD_KEYS,
  REQUIRED_COMMON,
  REQUIRED_RENTAL,
  REQUIRED_SALE,
  UNIVERSAL_RESOLVER,
} from './constants'

/**
 * Live ENS config resolution — the discovery layer.
 *
 * Nothing about a property's token, audit topic, or verifier key is baked into this
 * application. The client asks for a property, we resolve `prop-xxx.<parent>` on Sepolia
 * through the UniversalResolver, and whatever the records say is what the protocol uses.
 * Change the record, and every client picks it up on the next resolve — no redeploy.
 *
 * Two defensive layers, both of which have already earned their keep:
 *   - a 60s in-memory cache, so a burst of UI refreshes is one RPC round trip, not nine;
 *   - an env fallback, because this name lives on the ENSv2 ALPHA deployment, which ENS
 *     documents may reset state on redeploys. If Sepolia or the alpha hiccups mid-demo,
 *     the response degrades to `source: "env-fallback"` instead of taking the flow down —
 *     and it says so honestly rather than pretending it resolved.
 */

const CACHE_TTL_MS = 60_000

export type EnsConfig = {
  name: string
  mode: 'SALE' | 'RENTAL'
  source: 'ens' | 'env-fallback'
  network: string
  resolvedAt: string
  records: Record<string, string>
}

type CacheEntry = { config: EnsConfig; expiresAt: number }
const CACHE_KEY = Symbol.for('pprev.ens.cache.v1')
type GlobalWithCache = typeof globalThis & { [CACHE_KEY]?: Map<string, CacheEntry> }

function cache(): Map<string, CacheEntry> {
  const g = globalThis as GlobalWithCache
  if (!g[CACHE_KEY]) g[CACHE_KEY] = new Map()
  return g[CACHE_KEY]
}

function parentName(): string {
  return process.env.ENS_PARENT_NAME?.trim() || 'pprevlisbon.eth'
}

function subnameFor(propertyId: string): string {
  return `${propertyId.toLowerCase()}.${parentName()}`
}

/** Every key we ever publish; reads fetch all of them and validate per mode afterwards. */
const ALL_KEYS = Object.values(RECORD_KEYS)

async function resolveFromEns(name: string): Promise<Record<string, string>> {
  const client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL, { timeout: 8_000 }),
  })

  const records: Record<string, string> = {}
  // Sequential would be nine round trips; the resolver answers these independently.
  const values = await Promise.all(
    ALL_KEYS.map((key) =>
      client
        .getEnsText({ name, key, universalResolverAddress: UNIVERSAL_RESOLVER })
        .catch(() => null),
    ),
  )
  ALL_KEYS.forEach((key, index) => {
    const value = values[index]
    if (value) records[key] = value
  })
  return records
}

/**
 * Env fallback — mirrors what the ENS records hold, so a flaky RPC cannot kill the demo.
 * Only the fields that exist in the environment are populated; validation below decides
 * whether that is enough.
 */
function resolveFromEnv(propertyId: string): Record<string, string> {
  const mode = propertyId === 'PROP-003' ? 'RENTAL' : 'SALE'
  const records: Record<string, string | undefined> = {
    [RECORD_KEYS.mode]: mode,
    [RECORD_KEYS.network]: process.env.HEDERA_NETWORK ?? 'testnet',
    [RECORD_KEYS.policyHash]: process.env.FALLBACK_POLICY_HASH,
    [RECORD_KEYS.policyVersion]: process.env.FALLBACK_POLICY_VERSION ?? '1',
    [RECORD_KEYS.verifierPublicKey]: process.env.VERIFIER_PUBLIC_KEY,
    [RECORD_KEYS.auditTopicId]: process.env.AUDIT_TOPIC_ID,
    [RECORD_KEYS.propertyId]: propertyId,
  }

  if (mode === 'SALE') {
    records[RECORD_KEYS.propertyTokenId] =
      propertyId === 'PROP-001' ? process.env.SEED_TOKEN_ID : process.env.PROP002_TOKEN_ID
    records[RECORD_KEYS.revenueTreasury] =
      process.env.FALLBACK_REVENUE_TREASURY || process.env.OPERATOR_ID
  } else {
    records[RECORD_KEYS.rentalEscrowAccount] =
      process.env.FALLBACK_RENTAL_ESCROW_ACCOUNT || process.env.OPERATOR_ID
    records[RECORD_KEYS.rentalReqDeposit] = process.env.FALLBACK_RENTAL_REQ_DEPOSIT ?? '50'
  }

  const clean: Record<string, string> = {}
  for (const [key, value] of Object.entries(records)) {
    if (value?.trim()) clean[key] = value.trim()
  }
  return clean
}

/** Mode-aware validation: which fields are mandatory depends on what the config claims to be. */
function validate(records: Record<string, string>, name: string): 'SALE' | 'RENTAL' {
  const mode = records[RECORD_KEYS.mode]
  if (mode !== 'SALE' && mode !== 'RENTAL') {
    throw new ApiError(
      'ENS_CONFIG_INCOMPLETE',
      `${name} has no readable com.pprev.mode record (got "${mode ?? 'nothing'}").`,
    )
  }

  const required = [
    ...REQUIRED_COMMON,
    ...(mode === 'SALE' ? REQUIRED_SALE : REQUIRED_RENTAL),
  ]
  const missing = required.filter((key) => !records[key])
  if (missing.length > 0) {
    throw new ApiError(
      'ENS_CONFIG_INCOMPLETE',
      `${name} is missing required record(s): ${missing.join(', ')}`,
    )
  }
  return mode
}

export async function readEnsConfig(propertyId: string): Promise<EnsConfig> {
  const name = subnameFor(propertyId)

  const cached = cache().get(name)
  if (cached && cached.expiresAt > Date.now()) return cached.config

  let records: Record<string, string>
  let source: EnsConfig['source'] = 'ens'

  try {
    records = await resolveFromEns(name)
    if (Object.keys(records).length === 0) {
      // The name resolved to nothing at all — treat like an outage, not a partial config.
      throw new Error('no records returned')
    }
  } catch (error) {
    console.warn(
      `ENS config unavailable → env fallback (${name}):`,
      error instanceof Error ? error.message : error,
    )
    records = resolveFromEnv(propertyId)
    source = 'env-fallback'
  }

  const mode = validate(records, name)

  const config: EnsConfig = {
    name,
    mode,
    source,
    network: records[RECORD_KEYS.network],
    resolvedAt: new Date().toISOString(),
    records,
  }

  cache().set(name, { config, expiresAt: Date.now() + CACHE_TTL_MS })
  return config
}
