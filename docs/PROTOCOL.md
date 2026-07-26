# Covenant — protocol architecture

This document states Covenant as a protocol rather than as an application. Everything below is
implemented; the file:line references are where, and the last section says where each property
is tested. Where something is asserted rather than proven, it says so.

## The thesis

A property transaction rests on three facts: *does this person own it*, *is this buyer an
eligible person*, and *is this transfer permitted*. Today each is established by handing a
document to a counterparty who then holds it indefinitely — the trust is discharged into a
relationship, and the data outlives the transaction.

Covenant discharges each one into a **cryptographic artifact that outlives the party that produced
it**:

| Trust assumption | Discharged into | Who can check it afterwards |
|---|---|---|
| The verifier looked at the deed | An Ed25519 signature over a commitment | Anyone holding `pk_V` — forever, offline |
| The buyer is a unique adult | A nullifier from a ZK proof of personhood | The protocol, without learning who |
| This transfer is permitted | A KYC key on the token itself | Hedera consensus, without our code |
| These are the protocol parameters | Text records in a namespace we do not own | Anyone, by resolving the name |
| This sequence actually happened | Digests on an append-only public topic | Anyone, straight from a public endpoint |

The consequence is the design's whole point: **no participant has to be online, honest, or even
still in existence for a later party to check their work.**

---

## 1. Parties

| Party | Trusted for | NOT trusted for |
|---|---|---|
| Seller `S` | Nothing. Everything it submits is committed and later checked against a signature it cannot produce. | — |
| Verifier `V` | The *correctness* of one human judgment: that the documents shown support ownership. | Anything after that. Its authority is bounded by `exp`, by the property id, and by the document root — all inside the signature. |
| Buyer `B` | Nothing. | — |
| Personhood oracle (World ID) | That a proof corresponds to one unique human over 18. | Learning or revealing who. We never receive an identity. |
| Registry (Hedera) | Consensus and the enforcement of the token's own key policy. | — |
| Directory (ENS) | Publishing parameters. | Being reachable — an outage degrades, it does not block. |
| **Covenant server** | **Two things, and they are the weakest links in this design.** It computes the document root, and it decides what `V` is shown. Everything *else* it claims is independently checkable against an artifact it did not produce. | Anything downstream of the attestation. Once `σ` exists, the server cannot alter what it authorizes. |

## 2. Primitives

```
H         SHA-256
Sig       Ed25519                      (verifier attestation)
Sig'      ECDSA / EIP-191              (relying-party request signature, World)
MAC       HMAC-SHA-256                 (nullifier storage)
```

## 3. Artifacts

### 3.1 Document commitment — a salted, domain-separated vector commitment

`lib/crypto/merkle.ts`

```
fileHash_i   = H(bytes_i)
salt_i       ← {0,1}^256                        (SALT_BYTES = 32)
C_i          = H("PPREV_DOC_V1" ‖ u32be(|pid|) ‖ pid ‖ u32be(i) ‖ salt_i ‖ fileHash_i)
leaf_i       = H(0x00 ‖ C_i)
parent(l,r)  = H(0x01 ‖ l ‖ r)
R            = MerkleRoot(leaf_1 … leaf_n)
```

Published: `R` and `n`. Never published, never persisted to disk: `bytes_i`, `salt_i`, `C_i`.

Four design decisions, each closing a specific attack:

- **`0x00` / `0x01` prefixes** separate the leaf and internal-node hash spaces. Without them an
  internal node can be presented as a leaf and a membership proof forged — the classic
  second-preimage attack on unprefixed Merkle trees.
- **`u32be(|pid|) ‖ pid`** is length-prefixed. Plain concatenation makes `("AB", "C")` and `("A", "BC")`
  hash identically; length-prefixing removes the field-boundary ambiguity.
- **`u32be(i)`** binds each commitment to its position, so leaves cannot be permuted.
- **Odd levels promote rather than duplicate.** Duplicating the last node makes a one-leaf and
  a two-leaf tree produce the same root; promotion keeps `n` unambiguous.
- **`salt_i`** makes the commitment hiding *and* unlinkable: the same deed under two different
  properties produces unrelated commitments, so `R` cannot be used to ask "do these two listings
  share a title deed?".

### 3.2 Ownership attestation — an offline-verifiable authorization

`lib/verifier/attestation.ts`

```
m = "PPREV_OWNERSHIP_V1"
    ‖ "propertyId="       ‖ pid
    ‖ "sellerAccountId="  ‖ acct
    ‖ "documentRoot="     ‖ R
    ‖ "decision=APPROVED"
    ‖ "issuedAt="         ‖ t0
    ‖ "expiresAt="        ‖ t1          (newline-joined, field order fixed)

σ = Sig_{sk_V}(m)
```

The verifying side regenerates `m` byte-for-byte and checks `σ` against the server's configured
`pk_V` — **not** against a public key supplied in the request. So *which* property, *which*
seller and *which* document set an attestation belongs to are inside the signature: none of them
can be swapped afterwards, and an attestation for one property cannot be replayed onto another.

`t1` bounds `V`'s authority in time. `pk_V` is also published to the directory, so a third party
can verify an attestation without asking us for anything.

### 3.3 Personhood nullifier — pseudonymous, and unlinkable even to us

`lib/world/verify.ts`, `lib/world/session.ts`

The oracle returns a proof `π` and a nullifier `ν = f(identity, app, action)`. The proof is
re-verified server-side against the oracle; the client's own success flag is never trusted,
because a client can assert any boolean.

What we retain is not `ν`:

```
h = MAC_k(action ‖ ν)          k = server secret, never leaves the process
```

Deliberately keyed rather than a plain hash. A plain hash of a nullifier is invertible by anyone
who can enumerate the nullifier space, which would reduce "we never store identifiers" to a
technicality. Without `k` the digest is meaningless.

Each role uses a **distinct action**, so `ν` differs per role: one person can be a seller in one
flow and a buyer in another without the first proof consuming the second.

### 3.4 Transfer capability — the rule lives in the token

`lib/hedera/token.ts`

The token is minted with a KYC key held by the operator, finite supply, and no supply key and no
fee schedule key — so supply and fee are immutable in the strict sense, not by convention. A
transfer to an account without a KYC grant is rejected **at consensus**:
`ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`, with an empty transfer list.

There is no branch in this codebase that could be deleted to permit it.

---

## 4. Phases

```
     S                     V                   Registry            Oracle           Directory
     │                     │                      │                   │                 │
 (1) │ commit D → (R,n)    │                      │                   │                 │
     │ ─── metadata only, never the bytes ────▶   │                   │                 │
 (2) │                     │ σ = Sig_sk_V(m)      │                   │                 │
     │ ◀──────── σ ────────│                      │                   │                 │
 (3) │ ───────── σ ───────────────────────────▶ mint T (KYC key)      │                 │
     │                     │                      │ ──── publish tokenId ──────────────▶│
 (4) B ◀───────────────────────────────────────────── π, ν ───────────│                 │
 (5) │ ──── verify π ─────────────────────────▶ grant KYC to B        │                 │
 (6) │                     │                      │                   │                 │
 (7) │ before value moves: resolve params ◀──────────────────────────────────────────────│
     │                     │                      │                   │                 │
     └── every phase appends a digest to the public transcript ───────────────────────────
```

**(1) Commit.** `S` submits `D`; the server computes `R` and publishes `(R, n)`. The documents
never leave the server, and the salts never leave memory.

**(2) Attest.** `V` decides once and issues `σ`. **`V`'s role ends here** — the verifier is a
one-time *issuer*, not a standing oracle, and nothing later in the protocol asks `V` anything.

**What `V` actually sees in this build, stated plainly because it is the sharpest limitation
here: metadata only.** The review queue returns the property id, the display name, the city, the
seller's account id and each file's name, type and size. The document bytes never travel over
the API — not even to the verifier's own browser. That is the privacy property working exactly
as designed, and it is simultaneously the hole: the reviewer cannot see what they are attesting
to, and the four review checkboxes in the panel assert more than the interface supports.

Two things a production deployment needs, and neither is built: a review surface that shows `D`
to `V` without persisting it (a signed, expiring, single-use view), and — more importantly —
`V` computing `R` itself, so that `σ` covers what the reviewer actually saw rather than what the
server says it saw.

**(3) Mint.** A valid, unexpired `σ` for a property in state `APPROVED` is the sole precondition
for minting. No `σ` ⟹ no token. The gate is a signature check, not an access-control list.

**(4) Prove personhood.** `B` obtains `π` from the oracle; the server verifies it and stores only
`h`.

**(5) Authorize.** On a valid `π`, the KYC capability is granted to `B`'s account. **From this
point authorization is a consensus-level predicate**, not an application-level one.

**(6) Transfer.** The registry enforces the predicate. The 2% fractional fee is assessed by the
network; the application never handles it.

**(7) Discover and cross-check.** Parameters are resolved from the directory. Before any share
moves, the token named by the directory is compared with the token the server holds; a record
naming a token this protocol did not create refuses the transfer (`ENS_CONFIG_MISMATCH`).
Unreachable does not block — a directory outage must not be able to halt a registry transfer.

**Transcript.** Each phase appends `{schemaVersion, eventType, propertyId, timestamp, payload}`
to an append-only public topic, where `payload` carries digests and identifiers only. The reader
keeps only messages paid for by the operator account, because the topic has no submit key and
anyone can post a well-formed forgery to it.

---

## 5. Security claims

Each claim states what it reduces to. None of them is a formal proof; each is checkable by
inspection and, where marked, by a test that runs.

**C1 — No token without an approval.** An adversary who holds neither `sk_V` **nor an
attestation already issued for that property** cannot cause a token to be minted for it, except
by forging Ed25519 or by finding a SHA-256 collision that preserves `R`. *Reduces to:* EUF-CMA
of Ed25519; collision resistance of SHA-256.

The bearer caveat is not incidental: `σ` is returned to the client at decision time and is
sufficient on its own — `/api/tokenize` takes no session. Whoever holds it can mint, once. This
is why `/api/property` deliberately does not return it and why `t1` is short.

**C2 — An approval cannot be moved.** An attestation issued for `(pid, acct, R)` cannot be
replayed onto another property, another seller, or another document set, because all three are
inside the signed message. *Reduces to:* C1, plus the canonical encoding being injective
over the admissible values.

That injectivity deserves a precise argument, because the encoding is newline-joined with no
length prefix — the prefix in §3.1 protects the *commitment*, not the attestation. What makes
the attestation encoding injective is that **no admissible value can contain the separator or a
field delimiter**: `propertyId` is `^[A-Za-z0-9-]+$` (3–40), `sellerAccountId` is
`^\d+\.\d+\.\d+$`, `decision` is the literal `APPROVED`, and the root and both timestamps are
server-generated. So no value can smuggle a newline or a `field=` sequence and shift the field
boundaries. The property therefore rests on the validators in `lib/schemas.ts`: **relax one of
those character classes and this claim stops holding.**

**C3 — Documents are not recoverable from what is published.** Given `(R, n)`, recovering `d_i`
requires inverting SHA-256 or guessing `salt_i`. *Reduces to:* preimage resistance; 256 bits of
salt entropy.

**C4 — Listings are not linkable by their documents.** The same document under two properties
yields unrelated commitments. *Reduces to:* the salt and the property id being inside the
commitment.

**C5 — Selective disclosure.** Proving `d_i ∈ D` costs `⌈log₂ n⌉` hashes and reveals nothing
about the siblings. *Reduces to:* the tree structure and C3.

**C6 — Identity is never learned, and never stored even in pseudonymous form.** The server sees
`ν`, never an identity, and retains only `MAC_k(action ‖ ν)`. *Reduces to:* the oracle's ZK
property; PRF security of HMAC-SHA-256.

**C7 — Transfer authorization does not depend on this application.** A transfer to an
un-granted account fails at consensus. *Reduces to:* the registry's key policy. Independently
observable — the rejection is a real consensus result with an empty transfer list.

**C8 — The transcript proves the sequence without revealing anyone's private position.** An
observer learns which protocol steps occurred, in what order, and what they committed to.

Be precise about what that does and does not include, because "no prices" would be false. The
transcript **does** publish the commercial terms: `RENTAL_LISTED` carries `monthlyRent` and
`reqDeposit`, `RENTAL_EXPIRED` carries the refund and the slash, and `TOKEN_TRANSFERRED` carries
`amount`, `netAmount` and the fee. That is deliberate — a listing is a public offer and a
transfer is already public on Hedera, so hiding those would be theatre rather than privacy, and
Mirror Node would contradict us either way.

What it never publishes is anyone's *private position*: no document content, no identity, no
nullifier, no salt, and — the one that matters for the rental predicate — **no income figure at
all**. `requiredMonthlyEarnings` is `3 × the advertised rent`, derivable by anyone from the
listing; the tenant's actual earnings are never collected, so there is nothing to leak.

Honest residue: an observer also learns timing, message counts and event ordering, and 39
messages below sequence ~190 still carry a `city` field from before that was stripped. The log
is append-only, so they stay.

---

## 6. What is not proven

Stated here rather than left to be found.

**The verifier's honesty is bounded, not established.** The protocol constrains *what* `V` can
authorize — one property, one document set, one time window — but nothing forces `V`'s judgment
to be correct. The natural completion is economic: with a stake `Ŝ`, a fraud gain `G` and a
detection probability `p`, fraud is irrational when `Ŝ > G(1−p)/p`. Our architecture makes `p`
structurally high, because the attestation is permanent, public and bound to `R` — anyone who
later obtains `D` can prove the attestation was false. Slashing is **not implemented**.

**A proof is not bound to an account.** `π` shows that a unique human performed an action, not
that a particular Hedera account did. The account id arrives in the same request and is not
cryptographically tied to the proof. Closing this requires the account inside the oracle's action
context.

**The server is trusted to compute `R` honestly and to show `V` the truth.** This is the
weakest link and it is structural, not an oversight: `V` signs a root the *server* computed over
documents the *server* selected, and in this build `V` never sees the bytes at all. A malicious
server could commit to one document set and describe another. Closing it means moving the root
computation to `V` — then `σ` covers what the reviewer actually saw, and the server drops out of
the trusted set entirely. Everything downstream of `σ` is already safe from this: once the
attestation exists, the server cannot alter what it authorizes.

**One predicate is asserted rather than proven.** The rental income condition returns
`incomeProven: false`. The threshold is real and derived from the landlord's listing, so an
applicant cannot set their own bar; whether the tenant clears it is unproven. It needs a zkTLS
transcript and a circuit over it. The protocol defines where that plugs in and what it must
output; the demo supplies the output.

---

## 7. Where each property is tested

| Property | Test | Result |
|---|---|---|
| C1, C2 | `npm run tamper` — six doctored attestations, including the realistic case where the payload is edited and the signature left intact | 6/6 refused |
| C3, C4, C5 | `npm run merkle` — domain separation, salt decorrelation, field-boundary ambiguity, promote-not-duplicate | passes |
| C7 | `npm run e2e:sale`, and the live no-KYC scene | consensus rejection, empty transfer list |
| Phase 7 | `npm run test:ens-guard` — all four verdicts against the live records | 4/4 |
| Phase 3 idempotence | `npm run e2e:sale` — a second mint attempt | `ALREADY_TOKENIZED` |
| C8 | `docs/EVIDENCE.md`, and the public Mirror endpoint anyone can curl | — |
