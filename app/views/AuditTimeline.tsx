"use client";

import { useState } from "react";
import { api, ApiRequestError } from "@/lib/apiClient";
import type { ReadAuditResult, AuditEvent } from "@/lib/api-types";
import { ActionCard } from "@/app/components/common/ActionCard";
import { StatusBadge } from "@/app/components/common/StatusBadge";
import { ErrorCard } from "@/app/components/common/ErrorCard";
import { EvidenceLink } from "@/app/components/common/EvidenceLink";

/**
 * Public verification panel.
 *
 * Everything here is read back from Hedera's Mirror Node, not from our own store —
 * which is the only reason it is worth showing. The raw Mirror endpoint is linked
 * so anyone can curl it and reach the same list without going through this server.
 */

/** Colour carries meaning: refusals and approvals should be findable at a glance. */
function toneFor(eventType: string): "success" | "error" | "pending" | "info" {
  if (eventType.endsWith("_REJECTED") || eventType.includes("DENIED") || eventType.includes("SLASH")) {
    return "error";
  }
  if (
    eventType.endsWith("_APPROVED") ||
    eventType.endsWith("_CREATED") ||
    eventType.endsWith("_TRANSFERRED") ||
    eventType.endsWith("_GRANTED") ||
    eventType.endsWith("_SETTLED")
  ) {
    return "success";
  }
  if (eventType.endsWith("_SUBMITTED") || eventType.endsWith("_APPLIED") || eventType.endsWith("_LISTED")) {
    return "pending";
  }
  return "info";
}

/** Hedera consensus time is `seconds.nanos`, not an ISO string. */
function consensusToClock(consensusTimestamp: string): string {
  const seconds = Number(consensusTimestamp.split(".")[0]);
  if (!Number.isFinite(seconds)) return consensusTimestamp;
  return new Date(seconds * 1000).toLocaleTimeString();
}

function PayloadRow({ event }: { event: AuditEvent }) {
  const entries = Object.entries(event.payload ?? {});
  if (entries.length === 0) return null;
  return (
    <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-1 text-xs">
          <dt className="text-[var(--faint)]">{key}</dt>
          <dd className="max-w-[22rem] truncate font-mono">
            {typeof value === "object" ? JSON.stringify(value) : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function AuditTimeline() {
  const [propertyId, setPropertyId] = useState("");
  const [audit, setAudit] = useState<ReadAuditResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiRequestError | Error | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      // An empty id asks for every property at once — sale and rental events interleaved on
      // one record, which is what "one core, two modes" looks like.
      //
      // Not the WHOLE trail, though the label used to say so: /api/audit walks Mirror in
      // pages of 100 and stops at the first, so this is the newest 100 of a topic that is
      // past 400. The count in the badge is what came back, not what exists.
      const res = await api.readAudit(propertyId.trim());
      setAudit(res);
    } catch (e) {
      setError(e as ApiRequestError);
    } finally {
      setBusy(false);
    }
  }

  // Consensus timestamp is the orderable one; the envelope timestamp is whatever
  // the writer claimed.
  const events = audit
    ? [...audit.events].sort((a, b) => Number(a.consensusTimestamp) - Number(b.consensusTimestamp))
    : [];

  return (
    <div className="audit-view flex flex-col gap-3">
      <div className="seller-workspace">
      <ActionCard
        title="5. Evidence — public audit trail"
        description="Read back from Hedera Mirror Node. Nothing here comes from this application's own store."
      >
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value.trim().toUpperCase())}
          placeholder="all properties"
          className="field w-40 font-mono"
        />
        <button
          onClick={load}
          disabled={busy}
          className="btn btn-primary"
        >
          {busy ? "Reading Mirror Node..." : "Read the audit trail"}
        </button>
        <span className="text-xs text-[var(--muted)]">Leave the field empty for the newest 100 events across all properties.</span>
      </div>

      {audit && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status="success">source: {audit.source}</StatusBadge>
            <StatusBadge status="info">topic {audit.topicId}</StatusBadge>
            <StatusBadge status="info">{audit.eventCount} events</StatusBadge>
            {audit.token && <StatusBadge status="success">token {audit.token.tokenId}</StatusBadge>}
          </div>

          <div className="flex flex-wrap gap-4">
            {audit.links.topic && <EvidenceLink href={audit.links.topic} label="Topic on HashScan" />}
            {audit.links.token && <EvidenceLink href={audit.links.token} label="Token on HashScan" />}
            {audit.links.mirrorTopic && (
              <EvidenceLink href={audit.links.mirrorTopic} label="Raw Mirror Node JSON" />
            )}
          </div>

          {events.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No events yet. Mirror Node lag is normal — a message that has reached consensus can take a few
              seconds to surface here, and a shorter list is not an error.
            </p>
          ) : (
            <ol className="scroll-quiet flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
              {events.map((event) => (
                <li
                  key={`${event.sequenceNumber}-${event.consensusTimestamp}`}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-[var(--faint)]">#{event.sequenceNumber}</span>
                    <StatusBadge status={toneFor(event.eventType)}>{event.eventType}</StatusBadge>
                    {event.propertyId && (
                      <span className="font-mono text-xs text-[var(--muted)]">{event.propertyId}</span>
                    )}
                    <span className="ml-auto font-mono text-xs text-[var(--faint)]">
                      {consensusToClock(event.consensusTimestamp)}
                    </span>
                  </div>
                  <PayloadRow event={event} />
                </li>
              ))}
            </ol>
          )}

          <p className="text-xs text-[var(--muted)]">
            Append-only, not immutable: the topic has no submit key, so anyone may publish to it. The reader
            keeps only messages paid for by the operator account and drops the rest — the same rule anyone can
            apply to the same public topic to reach this exact list.
          </p>
        </div>
      )}

      {error && <ErrorCard error={error} />}
      </ActionCard>
      </div>
    </div>
  );
}
