import './env'
import { checkEnsTokenId } from '../lib/ens/consistency'

/**
 * Proves the ENS consistency guard can actually fire.
 *
 * A guard that cannot fail is not a guard, and this one is easy to get wrong in that
 * direction: every safe path returns "proceed", so a bug that made `mismatch` unreachable
 * would look exactly like a working check. All four outcomes are exercised here against the
 * live ENS records and the live Mirror Node — nothing is stubbed.
 *
 * The `mismatch` case is produced by changing who "we" are rather than by writing a hostile
 * record to ENS. The discriminator IS the treasury comparison, so swapping OPERATOR_ID
 * exercises exactly the branch a repointed record would take, with real network data on both
 * sides, and without spending a Sepolia write or touching a name the demo depends on.
 */
async function main() {
  const seedToken = process.env.SEED_TOKEN_ID?.trim()
  const realOperator = process.env.OPERATOR_ID?.trim()
  if (!seedToken || !realOperator) {
    console.error('❌ SEED_TOKEN_ID and OPERATOR_ID must be set.')
    process.exit(1)
  }

  const checks: [string, boolean, string][] = []
  const record = (label: string, ok: boolean, detail: string) => {
    checks.push([label, ok, detail])
    console.log(`  ${ok ? '✅' : '❌'} ${label} — ${detail}`)
  }

  console.log('ENS consistency guard\n')

  // 1. The demo path. prop-001's record names the seed token, so a buy on it proceeds with a
  //    positive signal rather than merely an absent objection.
  const match = await checkEnsTokenId('PROP-001', seedToken)
  record('the demo property matches', match.status === 'match', `got ${match.status}`)

  // 2. Staleness must NOT block. /api/tokenize republishes in the background, so a buy seconds
  //    after a mint legitimately sees the previous token. Asking about a token that is not the
  //    one ENS names reproduces that exactly: the record points at a token our operator did
  //    create, so it is behind, not hostile.
  const stale = await checkEnsTokenId('PROP-001', '0.0.999999999')
  record(
    'a record our operator minted is stale, not a mismatch',
    stale.status === 'stale',
    `got ${stale.status}`,
  )

  // 3. The branch that blocks. Same live record, same live Mirror lookup — only the identity
  //    of "us" changes, which is the single fact the guard turns on.
  process.env.OPERATOR_ID = '0.0.2'
  const mismatch = await checkEnsTokenId('PROP-001', '0.0.999999999')
  process.env.OPERATOR_ID = realOperator
  record(
    'a token we did not create is a mismatch',
    mismatch.status === 'mismatch',
    `got ${mismatch.status}`,
  )

  // 4. A name with no records must not block either. Every property submitted during a live
  //    run is in this state until someone publishes for it.
  const unknown = await checkEnsTokenId('PROP-NO-SUCH-NAME-9999', seedToken)
  record(
    'an unpublished property does not block',
    unknown.status === 'unavailable',
    `got ${unknown.status}`,
  )

  console.log('\n' + '━'.repeat(70))
  const failed = checks.filter(([, ok]) => !ok).length
  if (failed === 0) {
    console.log(
      `✅ ENS can stop a transfer, and only for the right reason. (${checks.length}/${checks.length})`,
    )
    process.exit(0)
  }
  console.error(`❌ ${failed} check(s) failed.`)
  process.exit(1)
}

main().catch((error) => {
  console.error('\n❌ Guard test failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
