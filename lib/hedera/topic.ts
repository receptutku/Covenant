import {
  Client,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from '@hashgraph/sdk'
import { getClient, getOperator, hashscanUrl } from './client'
import { recordTransaction } from '../store'
import type { HcsEnvelope, HcsEventType } from '../types'

/**
 * Hedera Consensus Service — an immutable audit trail that carries no personal data.
 *
 * WHAT GOES ON-CHAIN: the event type, propertyId, a timestamp, and derived digests
 * (Merkle root, document count, token id, transaction id).
 *
 * WHAT NEVER GOES ON-CHAIN: World nullifiers or proofs, selfie/identity data, document
 * bytes, salts, or any personal field such as income, name, or date of birth.
 * `assertNoSensitiveKeys()` enforces this during development — a single silent leak would
 * invalidate the entire privacy claim.
 */

const FORBIDDEN_KEY_PATTERN =
  /nullifier|proof|selfie|salt|secret|privatekey|private_key|passport|birth|dob|fullname|full_name|income|merkle_proof|filebytes|file_bytes|databuffer|base64/i

function assertNoSensitiveKeys(payload: Record<string, unknown>, path = 'payload'): void {
  for (const [key, value] of Object.entries(payload)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) {
      throw new Error(
        `HCS payload contains a sensitive field: ${path}.${key} — it cannot be written on-chain.`,
      )
    }
    // Arrays used to be skipped outright, which left the guard blind to the shape it is
    // most likely to meet as payloads grow: `{items: [{nullifier: "..."}]}` would have
    // been published untouched. The index stays in the path so the failure points at the
    // element that has to be fixed.
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item && typeof item === 'object') {
          assertNoSensitiveKeys(item as Record<string, unknown>, `${path}.${key}[${index}]`)
        }
      })
    } else if (value && typeof value === 'object') {
      assertNoSensitiveKeys(value as Record<string, unknown>, `${path}.${key}`)
    }
  }
}

export async function createAuditTopic(client: Client): Promise<string> {
  const operator = getOperator()

  const receipt = await (
    await new TopicCreateTransaction()
      .setTopicMemo('PPREV audit trail v1')
      // Without an admin key the topic could never be deleted or updated; we also leave the
      // submit key unset (the topic is publicly readable) to back the audit trail's
      // immutability claim.
      .setAdminKey(operator.privateKey.publicKey)
      .execute(client)
  ).getReceipt(client)

  const topicId = receipt.topicId
  if (!topicId) throw new Error('Failed to create the HCS topic')
  return topicId.toString()
}

export function getAuditTopicId(): string {
  const topicId = process.env.AUDIT_TOPIC_ID
  if (!topicId || topicId.trim() === '') {
    throw new Error('AUDIT_TOPIC_ID is not set. Run `npm run bootstrap` first.')
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
 * Writes a versioned audit event to the topic.
 * `schemaVersion` travels inside the envelope so that when fields are added later, older
 * readers can still parse the message.
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
 * Failing to write an audit event must not stop the demo — the real operation (token,
 * transfer) is already on-chain. We swallow the error and log it so that a single slow HCS
 * call doesn't break the flow.
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
      `Failed to write HCS event (${eventType}/${propertyId}):`,
      error instanceof Error ? error.message : error,
    )
    return null
  }
}
