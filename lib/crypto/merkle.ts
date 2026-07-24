import { createHash, randomBytes } from 'node:crypto'

/**
 * Salted, domain-separated belge taahhüdü ve Merkle ağacı.
 *
 * Amaç: n belgeden yalnız birini O(log n) kanıtla açabilmek, diğerlerini gizli tutmak.
 * Zincire (HCS) yalnız kök ve belge sayısı yazılır — belge byte'ları ve salt sunucuda
 * private kalır.
 *
 * Şema (docs/API.md ile aynı):
 *   fileHash   = SHA-256(fileBytes)
 *   salt       = randomBytes(32)
 *   commitment = SHA-256("PPREV_DOC_V1" || len(propertyId) || propertyId || index || salt || fileHash)
 *   leaf       = SHA-256(0x00 || commitment)
 *   parent     = SHA-256(0x01 || left || right)
 *
 * Neden 0x00 / 0x01 önekleri: yaprak ile iç düğüm hash uzayları ayrışır. Bu olmadan bir
 * saldırgan bir iç düğümü yaprakmış gibi sunarak sahte üyelik kanıtı üretebilir
 * (ikinci-preimage saldırısı).
 *
 * Neden salt: aynı belge farklı mülklerde farklı commitment üretir, yani kök üzerinden
 * "bu iki ilanda aynı tapu mu var?" diye bakılamaz.
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
 * Tek belgenin taahhüdü. propertyId uzunluk-önekli yazılır, aksi halde
 * ("PROP-1", 23) ile ("PROP-12", 3) gibi çiftler aynı byte dizisine çözülebilirdi.
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
 * Tek sayıda düğüm kalırsa son düğüm bir üst seviyeye olduğu gibi taşınır (promote).
 * Yaygın alternatif olan "son düğümü kopyala" yaklaşımı, tek yaprakla iki yapraklı bir
 * ağacın aynı kökü üretmesine yol açar; promote bunu önler.
 */
function buildLevels(leaves: Buffer[]): Buffer[][] {
  if (leaves.length === 0) throw new Error('merkle: en az bir yaprak gerekir')
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

/** index'inci yaprağın kök yolundaki kardeş hash'leri. Promote edilen seviyelerde adım yok. */
export function merkleProof(leaves: Buffer[], index: number): ProofStep[] {
  if (index < 0 || index >= leaves.length) throw new Error('merkle: index aralık dışı')
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
  /** Sunucuda private kalır; asla yanıtta, HCS'de veya logda yer almaz. */
  salt: Buffer
  fileHash: Buffer
  commitment: Buffer
  leaf: Buffer
}

/**
 * Bir mülkün tüm belgelerini taahhüde çevirip kökü üretir.
 * Dönen `commitments` private saklanır; dışarı yalnız `root` ve `documentCount` çıkar.
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
