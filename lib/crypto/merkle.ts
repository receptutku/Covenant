import { createHash, randomBytes } from 'node:crypto'

/**
 * Salted, domain-separated document commitments and Merkle tree.
 *
 * Goal: reveal exactly one of n documents with an O(log n) proof while keeping the rest
 * hidden. Only the root and the document count are written on-chain (HCS) — the document
 * bytes and salts stay private on the server.
 *
 * Scheme (matches docs/API.md):
 *   fileHash   = SHA-256(fileBytes)
 *   salt       = randomBytes(32)
 *   commitment = SHA-256("PPREV_DOC_V1" || len(propertyId) || propertyId || index || salt || fileHash)
 *   leaf       = SHA-256(0x00 || commitment)
 *   parent     = SHA-256(0x01 || left || right)
 *
 * Why the 0x00 / 0x01 prefixes: they separate the leaf and internal-node hash spaces.
 * Without them an attacker could present an internal node as if it were a leaf and forge
 * a membership proof (second-preimage attack).
 *
 * Why the salt: the same document yields a different commitment under a different property,
 * so nobody can use the root to ask "do these two listings share the same title deed?".
 */

const DOMAIN_DOC = 'PPREV_DOC_V1'
const LEAF_PREFIX = Buffer.from([0x00])
const NODE_PREFIX = Buffer.from([0x01])

export const SALT_BYTES = 32

function sha256(...parts: Buffer[]): Buffer {
  const h = createHash('sha256')
  for (const p of parts) h.update(p)
  return h.digest()
}

function u32be(n: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n, 0)
  return b
}

export function newSalt(): Buffer {
  return randomBytes(SALT_BYTES)
}

export function hashFile(fileBytes: Buffer): Buffer {
  return sha256(fileBytes)
}

/**
 * Commitment for a single document. propertyId is length-prefixed; otherwise pairs like
 * ("PROP-1", 23) and ("PROP-12", 3) would serialize to the same byte string.
 */
export function commitDocument(
  propertyId: string,
  index: number,
  salt: Buffer,
  fileHash: Buffer,
): Buffer {
  const pid = Buffer.from(propertyId, 'utf8')
  return sha256(
    Buffer.from(DOMAIN_DOC, 'utf8'),
    u32be(pid.length),
    pid,
    u32be(index),
    salt,
    fileHash,
  )
}

export function leafHash(commitment: Buffer): Buffer {
  return sha256(LEAF_PREFIX, commitment)
}

function parentHash(left: Buffer, right: Buffer): Buffer {
  return sha256(NODE_PREFIX, left, right)
}

/**
 * When a level has an odd number of nodes, the last one is carried up to the next level
 * unchanged (promoted). The common alternative — duplicating the last node — makes a
 * one-leaf tree and a two-leaf tree produce the same root; promoting avoids that.
 */
function buildLevels(leaves: Buffer[]): Buffer[][] {
  if (leaves.length === 0) throw new Error('merkle: at least one leaf is required')
  const levels: Buffer[][] = [leaves]
  let current = leaves
  while (current.length > 1) {
    const next: Buffer[] = []
    for (let i = 0; i < current.length; i += 2) {
      next.push(
        i + 1 < current.length ? parentHash(current[i], current[i + 1]) : current[i],
      )
    }
    levels.push(next)
    current = next
  }
  return levels
}

export function merkleRoot(leaves: Buffer[]): Buffer {
  const levels = buildLevels(leaves)
  return levels[levels.length - 1][0]
}

export type ProofStep = { hash: string; position: 'left' | 'right' }

/** Sibling hashes along the root path of the leaf at `index`. Promoted levels add no step. */
export function merkleProof(leaves: Buffer[], index: number): ProofStep[] {
  if (index < 0 || index >= leaves.length) throw new Error('merkle: index out of range')
  const levels = buildLevels(leaves)
  const proof: ProofStep[] = []
  let idx = index

  for (let level = 0; level < levels.length - 1; level++) {
    const nodes = levels[level]
    const isRightChild = idx % 2 === 1
    const siblingIdx = isRightChild ? idx - 1 : idx + 1
    if (siblingIdx < nodes.length) {
      proof.push({
        hash: nodes[siblingIdx].toString('hex'),
        position: isRightChild ? 'left' : 'right',
      })
    }
    idx = Math.floor(idx / 2)
  }
  return proof
}

export function verifyMerkleProof(leaf: Buffer, proof: ProofStep[], root: Buffer): boolean {
  let acc = leaf
  for (const step of proof) {
    const sibling = Buffer.from(step.hash, 'hex')
    if (sibling.length !== 32) return false
    acc =
      step.position === 'left' ? parentHash(sibling, acc) : parentHash(acc, sibling)
  }
  return acc.equals(root)
}

export type DocumentCommitment = {
  index: number
  /** Stays private on the server; never appears in a response, on HCS, or in a log. */
  salt: Buffer
  fileHash: Buffer
  commitment: Buffer
  leaf: Buffer
}

/**
 * Turns every document of a property into a commitment and derives the root.
 * The returned `commitments` are kept private; only `root` and `documentCount` leave the server.
 */
export function buildDocumentTree(
  propertyId: string,
  files: { bytes: Buffer }[],
): { root: string; commitments: DocumentCommitment[] } {
  const commitments = files.map((file, index) => {
    const salt = newSalt()
    const fileHash = hashFile(file.bytes)
    const commitment = commitDocument(propertyId, index, salt, fileHash)
    return { index, salt, fileHash, commitment, leaf: leafHash(commitment) }
  })

  const root = merkleRoot(commitments.map((c) => c.leaf))
  return { root: root.toString('hex'), commitments }
}
