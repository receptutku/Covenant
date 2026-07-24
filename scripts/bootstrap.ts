import './env'
import { readFileSync, writeFileSync } from 'node:fs'
import { hashscanUrl, withClient } from '../lib/hedera/client'
import { createAuditTopic } from '../lib/hedera/topic'

/**
 * One-time infrastructure: the HCS audit topic.
 *
 * A single topic is shared by every property — opening a separate topic per property would
 * slow the demo down and make it hard to show one chronological timeline on Mirror Node.
 * Events are told apart by the `propertyId` in the envelope.
 */
async function main() {
  if (process.env.AUDIT_TOPIC_ID?.trim()) {
    console.log('Topic already exists:', process.env.AUDIT_TOPIC_ID)
    console.log('To create a new one, clear the AUDIT_TOPIC_ID line in .env.local.')
    return
  }

  const topicId = await withClient(async (client) => createAuditTopic(client))

  console.log('✅ HCS audit topic:', topicId)
  console.log('   HashScan:', hashscanUrl('topic', topicId))

  const path = '.env.local'
  const content = readFileSync(path, 'utf8')
  writeFileSync(path, content.replace(/^AUDIT_TOPIC_ID=.*$/m, `AUDIT_TOPIC_ID=${topicId}`))
  console.log('✅ .env.local updated.')
}

main().catch((error) => {
  console.error('\n❌ Bootstrap failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
