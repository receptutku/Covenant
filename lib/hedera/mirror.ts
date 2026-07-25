import { hashscanUrl, mirrorNodeBaseUrl } from './client'
import type { HcsEnvelope } from '../types'

/**
 * Mirror Node reads — the public verification surface.
 *
 * Everything here could equally be fetched by a judge with curl. That is the point: the
 * audit trail is not something the application asserts, it is something anyone can read
 * back from Hedera independently of us. If our server disappeared, the record would stand.
 *
 * Mirror trails consensus by a few seconds. An event that was just written may not appear
 * yet, which is normal and must never be reported as an error — a short retry covers the
 * common case and a missing tail is simply a shorter list.
 */

const RETRY_DELAYS_MS = [0, 800, 2000]

async function mirrorGet<T>(path: string): Promise<T | null> {
  let lastError: unknown

  for (const delay of RETRY_DELAYS_MS) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
    try {
      const response = await fetch(`${mirrorNodeBaseUrl()}${path}`, {
        headers: { Accept: 'application/json' },
      })
      // A 404 is a real answer ("no such record"), not a transient failure worth retrying.
      if (response.status === 404) return null
      if (!response.ok) {
        lastError = new Error(`Mirror Node returned ${response.status}`)
        continue
      }
      return (await response.json()) as T
    } catch (error) {
      lastError = error
    }
  }

  console.warn(`[mirror] Giving up on ${path}:`, lastError)
  return null
}

type MirrorTopicMessage = {
  consensus_timestamp: string
  sequence_number: number
  message: string
}

export type AuditEvent = {
  eventType: string
  timestamp: string
  consensusTimestamp: string
  sequenceNumber: number
  propertyId: string
  payload: Record<string, unknown>
  explorerUrl: string
}

/**
 * Reads the audit trail for one property from HCS via Mirror.
 *
 * Messages arrive base64-encoded and are filtered client-side by `propertyId`, because all
 * properties share a single topic — one chronological timeline is far easier to show and
 * verify than a topic per property.
 *
 * A message that fails to parse is skipped rather than throwing. The topic is public and
 * anyone may submit to it; one malformed entry from a stranger must not blank out a
 * legitimate timeline.
 */
/** Pages of 100 to walk back through before giving up. */
const MAX_PAGES = 6

export async function readAuditTrail(
  topicId: string,
  propertyId?: string,
  wanted = 100,
): Promise<AuditEvent[]> {
  // Newest first, paging backwards, then reversed into chronological order at the end.
  //
  // Two traps live here. With `order=asc` the limit caps the OLDEST hundred messages, so
  // once the topic outgrows the window the timeline silently stops showing anything new.
  // And because all properties share one topic, fetching a single page and filtering by
  // propertyId afterwards can return ZERO events for a property whose history is provably
  // on-chain — it simply fell outside the window. So we keep paging until we have enough
  // matches rather than filtering whatever one page happened to contain.
  const events: AuditEvent[] = []
  // 0 means "no cursor yet"; Mirror sequence numbers start at 1.
  let before = 0

  for (let page = 0; page < MAX_PAGES && events.length < wanted; page++) {
    const cursor = before === 0 ? '' : `&sequencenumber=lt:${before}`
    const data = await mirrorGet<{ messages?: MirrorTopicMessage[] }>(
      `/topics/${topicId}/messages?limit=100&order=desc${cursor}`,
    )

    const messages: MirrorTopicMessage[] = data?.messages ?? []
    if (messages.length === 0) break

    for (const message of messages) {
      let envelope: HcsEnvelope
      try {
        envelope = JSON.parse(Buffer.from(message.message, 'base64').toString('utf8'))
      } catch {
        // The topic is public and anyone may submit to it; one malformed entry from a
        // stranger must not blank out a legitimate timeline.
        continue
      }
      if (!envelope?.eventType) continue
      if (propertyId && envelope.propertyId !== propertyId) continue

      events.push({
        eventType: envelope.eventType,
        timestamp: envelope.timestamp,
        consensusTimestamp: message.consensus_timestamp,
        sequenceNumber: message.sequence_number,
        propertyId: envelope.propertyId,
        payload: envelope.payload ?? {},
        explorerUrl: hashscanUrl('topic', topicId),
      })
    }

    before = messages[messages.length - 1].sequence_number
    if (before <= 1) break
  }

  // Collected newest-first across pages; the UI reads a timeline forwards.
  return events.reverse()
}

export type TokenSummary = {
  tokenId: string
  name: string
  symbol: string
  totalSupply: string
  decimals: string
  treasuryAccountId: string
  customFees: unknown
  explorerUrl: string
}

export async function readToken(tokenId: string): Promise<TokenSummary | null> {
  const data = await mirrorGet<{
    token_id: string
    name: string
    symbol: string
    total_supply: string
    decimals: string
    treasury_account_id: string
    custom_fees?: unknown
  }>(`/tokens/${tokenId}`)

  if (!data) return null

  return {
    tokenId: data.token_id,
    name: data.name,
    symbol: data.symbol,
    totalSupply: data.total_supply,
    decimals: data.decimals,
    treasuryAccountId: data.treasury_account_id,
    customFees: data.custom_fees ?? null,
    explorerUrl: hashscanUrl('token', tokenId),
  }
}

export type TokenRelationship = {
  accountId: string
  tokenId: string
  balance: number
  kycStatus: string
  freezeStatus: string
}

/**
 * Reads an account's relationship to a token — the independent proof of the KYC gate.
 *
 * This is what lets the demo claim be checked rather than believed: the nokyc account
 * shows `KYC_NOT_GRANTED` on a public endpoint, which is why its transfer was refused.
 */
export async function readTokenRelationship(
  accountId: string,
  tokenId: string,
): Promise<TokenRelationship | null> {
  const data = await mirrorGet<{
    tokens?: { token_id: string; balance: number; kyc_status: string; freeze_status: string }[]
  }>(`/accounts/${accountId}/tokens?token.id=${tokenId}`)

  const relationship = data?.tokens?.[0]
  if (!relationship) return null

  return {
    accountId,
    tokenId: relationship.token_id,
    balance: relationship.balance,
    kycStatus: relationship.kyc_status,
    freezeStatus: relationship.freeze_status,
  }
}
