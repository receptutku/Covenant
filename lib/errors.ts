/**
 * Stabil hata kodları — docs/API.md §1 ile birebir aynı.
 *
 * Bu liste KAPALIDIR. Yeni kod eklemek docs/API.md'deki KONTRAT-SÜRÜM'ü artırır ve
 * Akif'e haber verilmesini gerektirir. UI mantığı yalnız `code` alanına bakar;
 * `error` metni serbestçe değişebilir.
 */
export const ERROR_CODES = [
  // Oturum / seller
  'SELLER_SESSION_REQUIRED',
  'SELLER_SESSION_EXPIRED',
  // Belge yükleme
  'TOO_MANY_FILES',
  'FILE_TOO_LARGE',
  'UNSUPPORTED_FILE_TYPE',
  // Property / sahiplik
  'PROPERTY_NOT_FOUND',
  'OWNERSHIP_PENDING',
  'OWNERSHIP_REJECTED',
  'ATTESTATION_INVALID',
  'ATTESTATION_EXPIRED',
  'ALREADY_TOKENIZED',
  // Hedera / transfer
  'TOKEN_NOT_ASSOCIATED',
  'KYC_DENIED',
  // World
  'WORLD_PROOF_INVALID',
  'WORLD_PROOF_REPLAY',
  // ENS
  'ENS_CONFIG_INCOMPLETE',
  // Kiralama
  'RENTAL_NOT_APPROVED',
  'RENTAL_NOT_ENGAGED',
  'LOCK_EXPIRED',
  'LOCK_NOT_EXPIRED',
  'INSUFFICIENT_DEPOSIT',
  'NOT_LANDLORD',
  // Genel
  'INVALID_INPUT',
  'UNAUTHORIZED',
  'INTERNAL_ERROR',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

/** Her koda karşılık gelen HTTP durumu — docs/API.md §0 tablosuyla aynı. */
const STATUS_BY_CODE: Record<ErrorCode, number> = {
  SELLER_SESSION_REQUIRED: 401,
  SELLER_SESSION_EXPIRED: 401,
  TOO_MANY_FILES: 400,
  FILE_TOO_LARGE: 400,
  UNSUPPORTED_FILE_TYPE: 400,
  PROPERTY_NOT_FOUND: 404,
  OWNERSHIP_PENDING: 422,
  OWNERSHIP_REJECTED: 422,
  ATTESTATION_INVALID: 422,
  ATTESTATION_EXPIRED: 422,
  ALREADY_TOKENIZED: 409,
  TOKEN_NOT_ASSOCIATED: 422,
  KYC_DENIED: 422,
  WORLD_PROOF_INVALID: 422,
  WORLD_PROOF_REPLAY: 422,
  ENS_CONFIG_INCOMPLETE: 422,
  RENTAL_NOT_APPROVED: 422,
  RENTAL_NOT_ENGAGED: 422,
  LOCK_EXPIRED: 422,
  LOCK_NOT_EXPIRED: 409,
  INSUFFICIENT_DEPOSIT: 422,
  NOT_LANDLORD: 403,
  INVALID_INPUT: 400,
  UNAUTHORIZED: 401,
  INTERNAL_ERROR: 500,
}

/**
 * API katmanının fırlattığı tek hata tipi.
 *
 * `extra` yalnız vitrin alanları içindir (örn. `hederaStatus`, `tokenId`) — asla proof,
 * nullifier, salt, private key ya da ham SDK nesnesi konmaz.
 */
export class ApiError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly extra: Record<string, unknown>

  constructor(code: ErrorCode, message: string, extra: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = STATUS_BY_CODE[code]
    this.extra = extra
  }
}

export function errorStatus(code: ErrorCode): number {
  return STATUS_BY_CODE[code]
}
