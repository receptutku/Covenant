import { withReplaySuppression } from '../lib/idempotency'

/**
 * Guards the guard.
 *
 * A replay suppressor that never expires is a worse bug than the double transfer it
 * prevents: the second scene of the demo would silently return the first scene's
 * transaction id. These five cases are the ones that distinguish "suppresses a double
 * click" from "swallows every subsequent click".
 */
async function main() {
  let calls = 0
  const run = () => withReplaySuppression('k', 120, async () => ++calls)

  const first = await run()
  const second = await run()
  await new Promise((resolve) => setTimeout(resolve, 200))
  const afterWindow = await run()

  const otherKey = await withReplaySuppression('other', 120, async () => ++calls)

  // A rejected call must stay retryable: a transfer refused for a transient reason is
  // exactly when the user SHOULD click again.
  let failures = 0
  const boom = () =>
    withReplaySuppression('boom', 120, async () => {
      failures++
      throw new Error('rejected')
    })
  await boom().catch(() => undefined)
  await boom().catch(() => undefined)

  const checks: [string, boolean][] = [
    ['the first call runs', first.replayed === false && first.value === 1],
    ['an immediate repeat is suppressed and returns the same value', second.replayed === true && second.value === 1],
    ['after the window it runs again', afterWindow.replayed === false && afterWindow.value === 2],
    ['a different key is unaffected', otherKey.replayed === false],
    ['a failure is not cached', failures === 2],
  ]

  for (const [name, ok] of checks) console.log(`  ${ok ? '✅' : '❌'} ${name}`)
  const failed = checks.filter(([, ok]) => !ok).length
  console.log(
    failed === 0
      ? `\n✅ Replay suppression suppresses a double click and nothing else. (${checks.length}/${checks.length})`
      : `\n❌ ${failed} check(s) failed.`,
  )
  process.exit(failed === 0 ? 0 : 1)
}

main()
