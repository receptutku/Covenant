import { handler, jsonResponse } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import { hashscanUrl } from '@/lib/hedera/client'
import { readAuditTrail, readToken } from '@/lib/hedera/mirror'
import { getAuditTopicId } from '@/lib/hedera/topic'
import { getProperty } from '@/lib/store'

/**
 * The audit timeline, read back from public Hedera data.
 *
 * Deliberately sourced from Mirror Node rather than from our own store. Serving the
 * timeline out of server memory would make it an application claim; serving it from Mirror
 * makes it a verifiable fact. Every entry here can be independently confirmed with a curl
 * against a public endpoint, or by clicking through to HashScan.
 *
 * `propertyId` is optional: without it the full protocol trail is returned, which is what
 * the "one core, two modes" story needs — sale and rental events interleaved on a single
 * chronological record.
 */
export const GET = handler(async (request) => {
  const url = new URL(request.url)
  const propertyId = url.searchParams.get('propertyId') ?? undefined

  let topicId: string
  try {
    topicId = getAuditTopicId()
  } catch {
    throw new ApiError('INTERNAL_ERROR', 'The audit topic is not configured on the server.')
  }

  const events = await readAuditTrail(topicId, propertyId)

  // The token is looked up from the local record, but its details come from Mirror — so
  // even the token metadata shown next to the timeline is public data, not our assertion.
  const tokenId = propertyId ? getProperty(propertyId)?.tokenId : undefined
  const token = tokenId ? await readToken(tokenId) : null

  return jsonResponse({
    propertyId: propertyId ?? null,
    topicId,
    source: 'mirror-node',
    eventCount: events.length,
    events,
    token,
    links: {
      topic: hashscanUrl('topic', topicId),
      token: tokenId ? hashscanUrl('token', tokenId) : null,
      mirrorTopic: `https://testnet.mirrornode.hedera.com/api/v1/topics/${topicId}/messages`,
    },
  })
})
