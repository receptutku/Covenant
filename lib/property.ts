import { ApiError } from './errors'
import { buildDocumentTree } from './crypto/merkle'
import { getProperty } from './store'
import {
  ALLOWED_FILE_TYPES,
  MAX_FILES,
  MAX_FILE_BYTES,
  type AllowedFileType,
  type Property,
  type StoredFile,
} from './types'

/**
 * Property-level rules shared by the API routes: upload limits, state transitions, and
 * document commitment.
 *
 * These live outside the route handlers so that the seed script and the HTTP endpoints
 * cannot drift apart — a property created by `/api/seed` must satisfy exactly the same
 * invariants as one created by a seller.
 */

export type IncomingFile = {
  name: string
  type: AllowedFileType
  dataBase64: string
}

/**
 * Decodes and validates uploaded documents.
 *
 * The size check happens AFTER base64 decoding. Checking the encoded string would be
 * wrong by a factor of ~4/3, so a 6.5 MB file would slip past a naive 5 MB check on the
 * encoded length. We also strip an optional `data:` URL prefix because browsers produce
 * it and the client shouldn't have to remember to remove it.
 */
export function decodeFiles(files: IncomingFile[]): StoredFile[] {
  if (files.length > MAX_FILES) {
    throw new ApiError('TOO_MANY_FILES', `At most ${MAX_FILES} documents may be submitted.`)
  }

  return files.map((file) => {
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      throw new ApiError(
        'UNSUPPORTED_FILE_TYPE',
        `Unsupported file type: ${file.type}. Allowed: PDF, PNG, JPEG.`,
      )
    }

    const base64 = file.dataBase64.includes(',')
      ? file.dataBase64.slice(file.dataBase64.indexOf(',') + 1)
      : file.dataBase64

    const bytes = Buffer.from(base64, 'base64')

    if (bytes.length === 0) {
      throw new ApiError('UNSUPPORTED_FILE_TYPE', `"${file.name}" is empty or not valid base64.`)
    }
    if (bytes.length > MAX_FILE_BYTES) {
      throw new ApiError(
        'FILE_TOO_LARGE',
        `"${file.name}" is ${(bytes.length / 1024 / 1024).toFixed(1)} MB; the limit is 5 MB.`,
      )
    }
    assertMagicBytes(file.name, file.type, bytes)

    return { name: file.name, type: file.type, sizeBytes: bytes.length, bytes }
  })
}

/** File signatures for the three types we accept. */
const MAGIC_BYTES: Record<AllowedFileType, { prefix: number[]; label: string }> = {
  'application/pdf': { prefix: [0x25, 0x50, 0x44, 0x46], label: 'PDF' }, // %PDF
  'image/png': { prefix: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], label: 'PNG' },
  'image/jpeg': { prefix: [0xff, 0xd8, 0xff], label: 'JPEG' },
}

/**
 * Checks the declared MIME type against the file's actual signature.
 *
 * The `type` field is client-supplied, so on its own it asserts nothing: any bytes could
 * arrive labelled `application/pdf`. That matters here beyond ordinary hygiene — a
 * document commitment is only meaningful if what was committed to is the kind of document
 * the seller claimed to submit. A verifier reviewing "the title deed" should not be shown
 * a file whose declared type and real content disagree.
 *
 * This is a signature check, not content validation: it proves the bytes begin like a PDF,
 * not that the PDF says anything true. Provenance remains the roadmap's job.
 */
function assertMagicBytes(name: string, type: AllowedFileType, bytes: Buffer): void {
  const expected = MAGIC_BYTES[type]
  const matches =
    bytes.length >= expected.prefix.length &&
    expected.prefix.every((byte, index) => bytes[index] === byte)

  if (!matches) {
    throw new ApiError(
      'UNSUPPORTED_FILE_TYPE',
      `"${name}" is declared as ${expected.label} but its content does not match that format.`,
    )
  }
}

/** Builds the salted, domain-separated Merkle commitment for a property's documents. */
export function commitDocuments(propertyId: string, files: StoredFile[]) {
  return buildDocumentTree(propertyId, files)
}

/**
 * Loads a property or throws the stable not-found error.
 * Every route that takes a `propertyId` funnels through here so the 404 message is uniform.
 */
export function requireProperty(propertyId: string): Property {
  const property = getProperty(propertyId)
  if (!property) {
    throw new ApiError('PROPERTY_NOT_FOUND', `No property found with id "${propertyId}".`)
  }
  return property
}

/**
 * Guards the tokenization entry point.
 *
 * Each rejected state gets its own stable code rather than a generic one, because the UI
 * shows a different next step for each: a pending property needs the verifier to act, a
 * rejected one needs resubmission, and an already-tokenized one needs no action at all.
 */
export function assertTokenizable(property: Property): void {
  switch (property.state) {
    case 'APPROVED':
      return
    case 'TOKENIZED':
      throw new ApiError(
        'ALREADY_TOKENIZED',
        'This property has already been tokenized.',
        { tokenId: property.tokenId },
      )
    case 'PENDING_REVIEW':
      throw new ApiError(
        'OWNERSHIP_PENDING',
        'Ownership review is still pending for this property.',
      )
    case 'REJECTED':
      throw new ApiError(
        'OWNERSHIP_REJECTED',
        property.rejectionReason
          ? `Ownership was rejected: ${property.rejectionReason}`
          : 'Ownership was rejected for this property.',
      )
    default:
      throw new ApiError(
        'OWNERSHIP_PENDING',
        'This property has not been submitted for review yet.',
      )
  }
}

/**
 * Guards rental listing.
 *
 * A property is either for sale or for rent — never both. Once shares exist on-chain,
 * escrow-based renting would create two conflicting claims on the same asset, so a
 * TOKENIZED property is refused here. Only a plain APPROVED property can be listed.
 */
export function assertRentable(property: Property): void {
  if (property.state === 'APPROVED') return

  if (property.state === 'TOKENIZED') {
    throw new ApiError(
      'RENTAL_NOT_APPROVED',
      'This property is tokenized for sale and cannot be listed for rent.',
    )
  }
  throw new ApiError(
    'RENTAL_NOT_APPROVED',
    'Only a property with an approved ownership attestation can be listed for rent.',
  )
}
