import './env'
import { readFileSync, writeFileSync } from 'node:fs'
import { hashscanUrl, withClient } from '../lib/hedera/client'
import { createAuditTopic } from '../lib/hedera/topic'

/**
 * Bir kereye mahsus altyapı: HCS denetim topic'i.
 *
 * Topic tüm mülkler için ortaktır — her mülke ayrı topic açmak demoyu yavaşlatır ve
 * Mirror Node'da tek bir kronolojik zaman çizelgesi göstermeyi zorlaştırır. Olaylar
 * zarftaki `propertyId` ile ayrıştırılır.
 */
async function main() {
  if (process.env.AUDIT_TOPIC_ID?.trim()) {
    console.log('Topic zaten var:', process.env.AUDIT_TOPIC_ID)
    console.log('Yeniden oluşturmak için .env.local içindeki AUDIT_TOPIC_ID satırını boşalt.')
    return
  }

  const topicId = await withClient(async (client) => createAuditTopic(client))

  console.log('✅ HCS audit topic:', topicId)
  console.log('   HashScan:', hashscanUrl('topic', topicId))

  const path = '.env.local'
  const content = readFileSync(path, 'utf8')
  writeFileSync(path, content.replace(/^AUDIT_TOPIC_ID=.*$/m, `AUDIT_TOPIC_ID=${topicId}`))
  console.log('✅ .env.local güncellendi.')
}

main().catch((error) => {
  console.error('\n❌ Bootstrap başarısız:', error instanceof Error ? error.message : error)
  process.exit(1)
})
