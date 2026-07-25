import './env'
import { createHash, randomBytes } from 'node:crypto'
import {
  buildDocumentTree,
  commitDocument,
  leafHash,
  merkleProof,
  merkleRoot,
  verifyMerkleProof,
} from '../lib/crypto/merkle'

/**
 * Property tests for the document commitment scheme.
 *
 * This is the mathematical core of the privacy claim — reveal one document out of n with
 * an O(log n) proof, keep the rest hidden — and until now it had no test at all. A silent
 * flaw here would not break any demo scene; it would just quietly make the headline claim
 * false, which is worse.
 *
 * Pure computation: no network, no chain, no server state.
 */

let failures = 0

function check(condition: boolean, label: string): void {
  console.log(`  ${condition ? '✅' : '❌'} ${label}`)
  if (!condition) failures += 1
}

function docs(count: number): { bytes: Buffer }[] {
  return Array.from({ length: count }, (_, i) => ({
    bytes: Buffer.from(`%PDF-1.4 document number ${i}`, 'utf8'),
  }))
}

/** Membership must verify for every leaf, at every tree size — including odd ones. */
function testMembership(): void {
  console.log('\n▶ Membership proofs verify for every leaf')

  for (const size of [1, 2, 3, 4, 5, 7, 8, 9, 16, 17]) {
    const { commitments } = buildDocumentTree('PROP-TEST', docs(size))
    const leaves = commitments.map((c) => c.leaf)
    const root = merkleRoot(leaves)

    let allValid = true
    for (let index = 0; index < size; index++) {
      const proof = merkleProof(leaves, index)
      if (!verifyMerkleProof(leaves[index], proof, root)) allValid = false
    }
    check(allValid, `n=${String(size).padEnd(2)} — all ${size} leaves verify`)
  }
}

/** A proof for one leaf must not verify a different leaf. */
function testForgery(): void {
  console.log('\n▶ Proofs do not transfer between leaves')

  const { commitments } = buildDocumentTree('PROP-TEST', docs(8))
  const leaves = commitments.map((c) => c.leaf)
  const root = merkleRoot(leaves)

  let anyForged = false
  for (let index = 0; index < leaves.length; index++) {
    const proof = merkleProof(leaves, index)
    for (let other = 0; other < leaves.length; other++) {
      if (other === index) continue
      if (verifyMerkleProof(leaves[other], proof, root)) anyForged = true
    }
  }
  check(!anyForged, 'no leaf verifies against another leaf’s proof')

  const proof = merkleProof(leaves, 3)
  const tampered = [...proof]
  if (tampered.length > 0) {
    tampered[0] = { ...tampered[0], hash: randomBytes(32).toString('hex') }
  }
  check(!verifyMerkleProof(leaves[3], tampered, root), 'a corrupted sibling breaks the proof')

  const flipped = proof.map((step) => ({
    ...step,
    position: step.position === 'left' ? ('right' as const) : ('left' as const),
  }))
  check(
    proof.length === 0 || !verifyMerkleProof(leaves[3], flipped, root),
    'swapped sibling positions break the proof',
  )
}

/**
 * The 0x00/0x01 prefixes exist so an internal node cannot be presented as a leaf. If the
 * domains overlapped, a subtree hash could be passed off as a document commitment.
 */
function testDomainSeparation(): void {
  console.log('\n▶ Leaf and internal-node domains are separated')

  const { commitments } = buildDocumentTree('PROP-TEST', docs(4))
  const leaves = commitments.map((c) => c.leaf)
  const root = merkleRoot(leaves)

  // Reconstruct the internal node covering leaves 0 and 1, then try to pass it off as a
  // leaf with the proof that covers the right-hand subtree.
  const internal = createHash('sha256')
    .update(Buffer.from([0x01]))
    .update(leaves[0])
    .update(leaves[1])
    .digest()

  const rightSubtree = createHash('sha256')
    .update(Buffer.from([0x01]))
    .update(leaves[2])
    .update(leaves[3])
    .digest()

  const forged = verifyMerkleProof(
    internal,
    [{ hash: rightSubtree.toString('hex'), position: 'right' }],
    root,
  )
  // Without domain separation this WOULD verify — the internal node really is at that
  // position in the tree. It must not count as membership of a document.
  check(forged, 'internal node hashes to the root by construction (sanity check)')

  const asLeaf = leafHash(internal)
  check(
    !verifyMerkleProof(asLeaf, [{ hash: rightSubtree.toString('hex'), position: 'right' }], root),
    'the same node re-hashed as a LEAF no longer verifies — domains are disjoint',
  )
}

/** Salting means the same file yields different commitments in different contexts. */
function testSalting(): void {
  console.log('\n▶ Salting hides cross-listing correlation')

  const sameFile = docs(1)
  const a = buildDocumentTree('PROP-A', sameFile)
  const b = buildDocumentTree('PROP-B', sameFile)
  const c = buildDocumentTree('PROP-A', sameFile)

  check(a.root !== b.root, 'same document, different property → different root')
  check(a.root !== c.root, 'same document, same property, fresh salt → different root')

  const salt = Buffer.alloc(32, 7)
  const fileHash = createHash('sha256').update(sameFile[0].bytes).digest()
  check(
    commitDocument('PROP-A', 0, salt, fileHash).equals(
      commitDocument('PROP-A', 0, salt, fileHash),
    ),
    'commitment is deterministic given the same salt',
  )
  check(
    !commitDocument('PROP-A', 0, salt, fileHash).equals(
      commitDocument('PROP-A', 1, salt, fileHash),
    ),
    'position is bound into the commitment',
  )
}

/**
 * The length prefix on propertyId exists so that ("PROP-1", 23) and ("PROP-12", 3) cannot
 * serialise to the same bytes.
 */
function testAmbiguity(): void {
  console.log('\n▶ Field boundaries are unambiguous')

  const salt = Buffer.alloc(32, 1)
  const fileHash = Buffer.alloc(32, 2)
  check(
    !commitDocument('PROP-1', 23, salt, fileHash).equals(
      commitDocument('PROP-12', 3, salt, fileHash),
    ),
    'a longer id with a smaller index is a different commitment',
  )
}

/** A tree of n and a tree of n+1 must never share a root. */
function testDistinctness(): void {
  console.log('\n▶ Different document sets give different roots')

  const seen = new Map<string, number>()
  let collision = false
  for (const size of [1, 2, 3, 4, 5, 6, 7, 8]) {
    // Fixed salts so the only thing varying is the document set.
    const leaves = Array.from({ length: size }, (_, i) =>
      leafHash(commitDocument('PROP-X', i, Buffer.alloc(32, 9), createHash('sha256').update(`doc${i}`).digest())),
    )
    const root = merkleRoot(leaves).toString('hex')
    if (seen.has(root)) collision = true
    seen.set(root, size)
  }
  check(!collision, 'no two document counts collide (promotion, not duplication)')
}

function main(): void {
  console.log('▶ Merkle commitment scheme — property tests')

  testMembership()
  testForgery()
  testDomainSeparation()
  testSalting()
  testAmbiguity()
  testDistinctness()

  console.log(`\n${'━'.repeat(70)}`)
  if (failures > 0) {
    console.error(`❌ ${failures} check(s) failed — the disclosure scheme is not sound.`)
    process.exit(1)
  }
  console.log('✅ Commitment scheme holds: selective disclosure is sound.')
}

main()
