import { generateKeyPairSync } from 'node:crypto'

/**
 * Prints a fresh Ed25519 keypair for the verifier.
 *
 * `.env.example` has always told the reader this script generates `VERIFIER_PRIVATE_KEY`
 * and `VERIFIER_PUBLIC_KEY`. It did not exist. Without those two values `/api/attest` and
 * `/api/tokenize` both throw, and the failure surfaces as a generic `INTERNAL_ERROR` with
 * the real cause visible only in the server console — so the gate the whole project is
 * built around ("a signed attestation, or no token") could not be exercised at all by
 * anyone starting from a clean checkout.
 *
 * The encoding is not arbitrary: `lib/verifier/attestation.ts` reads both as hex DER, so
 * they are printed exactly as they must be pasted.
 *
 * This key is what makes an approval unforgeable. Generate it once, keep the private half
 * out of source control, and treat rotating it as invalidating every attestation ever
 * issued — including any that a property is mid-flight on.
 */
const { privateKey, publicKey } = generateKeyPairSync('ed25519')

const privateHex = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('hex')
const publicHex = publicKey.export({ format: 'der', type: 'spki' }).toString('hex')

console.log('Ed25519 verifier keypair — paste both into .env.local:\n')
console.log(`VERIFIER_PRIVATE_KEY=${privateHex}`)
console.log(`VERIFIER_PUBLIC_KEY=${publicHex}`)
console.log(
  '\nThe public half is also published to ENS as com.pprev.verifier.publicKey by' +
    '\n`npm run ens:write`, so anyone can check an attestation against it without asking us.',
)
