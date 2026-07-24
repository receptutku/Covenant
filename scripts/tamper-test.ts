import './env'
import { createPrivateKey, sign } from 'node:crypto'
import { ApiError } from '../lib/errors'
import {
  assertAttestationValid,
  canonicalPayload,
  signOwnershipAttestation,
} from '../lib/verifier/attestation'
import type { OwnershipAttestation, Property } from '../lib/types'

/**
 * Negative test for the verifier gate — the R3 exit criterion.
 *
 * Claim under test: a forged or edited ownership attestation cannot mint a token. This is
 * pure cryptography with no network calls, so it is fast enough to run live in front of
 * judges.
 *
 * Each case takes a genuinely signed attestation and changes exactly one field. If any case
 * still validates, that field is not actually bound by the signature and the whole security
 * story collapses — so the script exits non-zero.
 */

const property: Property = {
  propertyId: 'PROP-002',
  displayName: 'Alfama 2+1',
  city: 'Lisbon',
  sellerAccountId: '0.0.123456',
  tokenSymbol: 'ALFM',
  state: 'APPROVED',
  createdAt: new Date().toISOString(),
  documentRoot: 'a'.repeat(64),
  documentCount: 2,
  files: [],
  commitments: [],
}

/**
 * Signs an attestation over an arbitrary validity window.
 *
 * Needed for the expiry case: to prove the freshness check works on its own, the stale
 * attestation must carry a VALID signature. Otherwise it would be rejected for being
 * forged and we would learn nothing about expiry handling.
 */
function signWithWindow(issuedAt: Date, expiresAt: Date): OwnershipAttestation {
  const fields = {
    propertyId: property.propertyId,
    sellerAccountId: property.sellerAccountId,
    documentRoot: property.documentRoot!,
    decision: 'APPROVED' as const,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  }

  const key = createPrivateKey({
    key: Buffer.from(process.env.VERIFIER_PRIVATE_KEY!, 'hex'),
    format: 'der',
    type: 'pkcs8',
  })

  return {
    ...fields,
    signature: sign(null, Buffer.from(canonicalPayload(fields), 'utf8'), key).toString('base64'),
    verifierPublicKey: process.env.VERIFIER_PUBLIC_KEY!,
  }
}

type Case = {
  label: string
  tamper: (attestation: OwnershipAttestation) => OwnershipAttestation
  expected: 'ATTESTATION_INVALID' | 'ATTESTATION_EXPIRED'
}

const CASES: Case[] = [
  {
    label: 'propertyId swapped to another property',
    tamper: (a) => ({ ...a, propertyId: 'PROP-999' }),
    expected: 'ATTESTATION_INVALID',
  },
  {
    label: 'documentRoot replaced (different documents)',
    tamper: (a) => ({ ...a, documentRoot: 'b'.repeat(64) }),
    expected: 'ATTESTATION_INVALID',
  },
  {
    label: 'sellerAccountId redirected to another account',
    tamper: (a) => ({ ...a, sellerAccountId: '0.0.999999' }),
    expected: 'ATTESTATION_INVALID',
  },
  {
    label: 'expiry extended without re-signing',
    tamper: (a) => ({ ...a, expiresAt: new Date(Date.now() + 86_400_000).toISOString() }),
    expected: 'ATTESTATION_INVALID',
  },
  {
    label: 'signature replaced with a forged one',
    tamper: (a) => ({ ...a, signature: Buffer.alloc(64, 7).toString('base64') }),
    expected: 'ATTESTATION_INVALID',
  },
  {
    label: 'genuinely expired attestation (signature still valid)',
    tamper: () => signWithWindow(new Date(Date.now() - 7_200_000), new Date(Date.now() - 3_600_000)),
    expected: 'ATTESTATION_EXPIRED',
  },
]

function main() {
  console.log('▶ Verifier tamper test\n')

  const genuine = signOwnershipAttestation(property)
  assertAttestationValid(genuine, property)
  console.log('✅ Baseline: a genuine attestation validates and would unlock tokenization.\n')

  let failures = 0

  for (const testCase of CASES) {
    const tampered = testCase.tamper(genuine)
    try {
      assertAttestationValid(tampered, property)
      console.log(`❌ ${testCase.label}`)
      console.log('   ACCEPTED — the gate did not hold.\n')
      failures += 1
    } catch (error) {
      if (error instanceof ApiError && error.code === testCase.expected) {
        console.log(`✅ ${testCase.label}`)
        console.log(`   blocked with ${error.code}\n`)
      } else {
        const code = error instanceof ApiError ? error.code : String(error)
        console.log(`❌ ${testCase.label}`)
        console.log(`   expected ${testCase.expected}, got ${code}\n`)
        failures += 1
      }
    }
  }

  console.log('━'.repeat(70))
  if (failures > 0) {
    console.error(`❌ ${failures} case(s) failed — the verifier gate is not sound.`)
    process.exit(1)
  }
  console.log('✅ Every tampered attestation was rejected. Tokenization stays locked.')
}

main()
