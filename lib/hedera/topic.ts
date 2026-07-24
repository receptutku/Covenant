import {
  Client,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from '@hashgraph/sdk'
import { getClient, getOperator, hashscanUrl } from './client'
import { recordTransaction } from '../store'
import type { HcsEnvelope, HcsEventType } from '../types'

/**
 * Hedera Consensus Service — değiştirilemez, kişisel veri içermeyen denetim izi.
 *
 * ZİNCİRE NE ÇIKAR: olay tipi, propertyId, zaman damgası ve türetilmiş özetler
 * (Merkle kökü, belge sayısı, token id, işlem id).
 *
 * ZİNCİRE NE ÇIKMAZ: World nullifier veya proof, selfie/kimlik verisi, belge byte'ı,
 * salt, gelir/ad/doğum tarihi gibi hiçbir kişisel alan. `assertNoSensitiveKeys()`
 * bunu geliştirme sırasında zorlar — sessiz bir sızıntı, mahremiyet iddiasının
 * tamamını çürütür.
 */

const FORBIDDEN_KEY_PATTERN =
  /nullifier|proof|selfie|salt|secret|privatekey|private_key|passport|birth|dob|fullname|full_name|income|merkle_proof|filebytes|file_bytes|databuffer|base64/i

function assertNoSensitiveKeys(payload: Record<string, unknown>, path = 'payload'): void {
  for (const [key, value] of Object.entries(payload)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) {
      throw new Error(
        `HCS payload'ı hassas alan içeriyor: ${path}.${key} — zincire yazılamaz.`,
      )
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      assertNoSensitiveKeys(value as Record<string, unknown>, `${path}.${key}`)
    }
  }
}

export async function createAuditTopic(client: Client): Promise<string> {
  const operator = getOperator()

  const receipt = await (
    await new TopicCreateTransaction()
      .setTopicMemo('PPREV audit trail v1')
      // Admin key olmadan topic silinemez/değiştirilemez; denetim izinin
      // değiştirilemezlik iddiası için submit key de koymuyoruz (public okunur).
      .setAdminKey(operator.privateKey.publicKey)
      .execute(client)
  ).getReceipt(client)

  const topicId = receipt.topicId
  if (!topicId) throw new Error('HCS topic oluşturulamadı')
  return topicId.toString()
}

export function getAuditTopicId(): string {
  const topicId = process.env.AUDIT_TOPIC_ID
  if (!topicId || topicId.trim() === '') {
    throw new Error('AUDIT_TOPIC_ID tanımlı değil. Önce `npm run bootstrap` çalıştır.')
  }
  return topicId.trim()
}

export type SubmittedEvent = {
  topicId: string
  sequenceNumber: number
  transactionId: string
  hashscanUrl: string
}

/**
 * Versiyonlu bir denetim olayını topic'e yazar.
 * `schemaVersion` zarfın içinde taşınır ki ileride alan eklendiğinde eski okuyucular
 * mesajı hâlâ ayrıştırabilsin.
 */
export async function submitEvent(
  eventType: HcsEventType,
  propertyId: string,
  payload: Record<string, unknown> = {},
  client: Client = getClient(),
): Promise<SubmittedEvent> {
  assertNoSensitiveKeys(payload)

  const envelope: HcsEnvelope = {
    schemaVersion: 1,
    eventType,
    propertyId,
    timestamp: new Date().toISOString(),
    payload,
  }

  const topicId = getAuditTopicId()
  const response = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(JSON.stringify(envelope))
    .execute(client)

  const receipt = await response.getReceipt(client)
  const transactionId = response.transactionId.toString()
  const url = hashscanUrl('transaction', transactionId)

  recordTransaction({
    transactionId,
    kind: 'TOPIC_MESSAGE',
    propertyId,
    at: envelope.timestamp,
    hashscanUrl: url,
  })

  return {
    topicId,
    sequenceNumber: receipt.topicSequenceNumber?.toNumber() ?? 0,
    transactionId,
    hashscanUrl: url,
  }
}

/**
 * Denetim olayı yazamamak demoyu durdurmamalı — asıl işlem (token, transfer) zaten
 * zincirde. Hatayı yutup logluyoruz ki tek bir HCS gecikmesi akışı kesmesin.
 */
export async function submitEventSafe(
  eventType: HcsEventType,
  propertyId: string,
  payload: Record<string, unknown> = {},
): Promise<SubmittedEvent | null> {
  try {
    return await submitEvent(eventType, propertyId, payload)
  } catch (error) {
    console.error(
      `HCS event yazılamadı (${eventType}/${propertyId}):`,
      error instanceof Error ? error.message : error,
    )
    return null
  }
}
