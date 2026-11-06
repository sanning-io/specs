# The `sanning.events/v2` profile

This document defines the profile whose `spec_version` is `sanning.events/v2`: the signed envelope an SDK writes for each record, and the event record that envelope commits to. The records an agent writes under this profile are the `sanning.agent/1` vocabulary, [`agent-events.md`](agent-events.md), which governs the whole record of each of its types. This document states the profile as far as a reader of that vocabulary needs it. The profile itself is defined in the [envelope specification](https://github.com/sanning-io/proof/blob/v0.20.0/specs/envelope-spec.md) in `sanning-io/proof`, and where the two differ, that specification governs.

`MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `RECOMMENDED`, `MAY` and `OPTIONAL` carry their [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) meanings wherever they appear in capitals.

## 1. Summary

The following table lists the profile's properties:

| Property | Value |
|---|---|
| `spec_version` | `sanning.events/v2`, or a minor version of it, in both the envelope and the record, inside the signed scope. A `sanning.agent/1` record carries exactly `sanning.events/v2` (section 2). |
| Producer | Whoever signs with the key in the envelope. |
| Where the record lives | With the caller. The envelope carries only `payload_hash`, the SHA-256 of the record's JCS bytes (section 3). |
| What the envelope discloses | Nothing about what was recorded: `event_type`, `subject` and `previous_hash` are in the record, never in the envelope (section 2). |
| `environment` | REQUIRED, `"dev"` or `"production"`, inside the signed scope |
| `event_type` | A closed set: the `sanning.agent/1` types and seven types outside that vocabulary (section 4) |
| `subject.type` | `agent`, with the identifier in `subject.agent_id` (section 5) |
| Chains | Optional chaining per key through `previous_hash` in the record; an unchained record is a `"GENESIS"` singleton (section 5) |
| Where envelopes live | Sanning stores each envelope it receives. Envelopes are not public: only each interval's Merkle root is anchored on a permanent public record (section 6). |

## 2. The envelope

A `sanning.events/v2` producer writes these members:

```json
{
  "spec_version": "sanning.events/v2",
  "event_id": "UUID_V4",
  "payload_hash": "SHA256_HEX_OF_JCS_EVENT_RECORD",
  "signed_at": "RFC3339_UTC_Z",
  "environment": "dev",
  "public_key": "ED25519_VERIFY_KEY_HEX",
  "signature": "ED25519_SIGNATURE_HEX",
  "payload_ref": "OPTIONAL_URI"
}
```

Replace the following:

- `UUID_V4`: a lowercase UUID v4.
- `SHA256_HEX_OF_JCS_EVENT_RECORD`: the lowercase hex SHA-256 of the JCS bytes of the event record.
- `RFC3339_UTC_Z`: an RFC 3339 UTC time ending in `Z`.
- `ED25519_VERIFY_KEY_HEX`: the 32-byte Ed25519 verify key, in hex.
- `ED25519_SIGNATURE_HEX`: the 64-byte Ed25519 signature, in hex.
- `OPTIONAL_URI`: the locator described in this section, or leave the member out.

Each member has one form, and a verifier MUST reject an envelope in which a present member has any other form, `null` included:

| Member | Form | Rule |
|---|---|---|
| `spec_version` | `<namespace>/v<major>`, optionally followed by `.<minor>`, each number ASCII digits | Names the profile. A verifier matches the major on its token boundary, so `sanning.events/v2` and `sanning.events/v2.3` are this profile, and `sanning.events/v20` and `sanning.events/v2.x` are not. A verifier MUST reject a major it does not know. |
| `event_id` | A lowercase UUID v4: `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`, every `x` in `0-9a-f`, `y` one of `8`, `9`, `a`, `b` | Unique for each record. |
| `payload_hash` | 64 lowercase hex characters | SHA-256 of the JCS bytes of the event record. A verifier MUST recompute it from the record and reject a mismatch. |
| `signed_at` | `YYYY-MM-DDTHH:MM:SS[.fraction]Z`, with `T` and `Z` in upper case, no numeric offset, a fraction of one or more digits, and a real date from `0001-01-01` to `9999-12-31` with no leap second | Advisory: the signer's own clock. A time a reader can rely on comes from the interval stamp that covers the envelope (section 6). |
| `environment` | `"dev"` or `"production"` | REQUIRED by this profile. A producer MUST set it, and a verifier MUST treat its absence as nonconforming. Because it is signed, a record signed for development can never be presented as production evidence. |
| `public_key` | 64 hex characters, either case, with no whitespace and no `0x` | The Ed25519 verify key, in the envelope so the signature verifies with no lookup. A producer writes lower case; a verifier accepts either case. |
| `signature` | 128 hex characters, either case, with no whitespace and no `0x` | Ed25519 over the JCS bytes of the envelope with `signature` and `co_signatures` removed. Every other member present is inside the signed scope, so a member other than `co_signatures` added after signing fails verification. |
| `payload_ref` | An ASCII scheme (`[A-Za-z][A-Za-z0-9+.-]*`), a colon, then only RFC 3986 unreserved, reserved and percent-encoded characters, at most 2048 in all | OPTIONAL. A locator for the event record. Integrity is always `payload_hash`: the locator is never trusted, and a locator that lies is caught by the hash. |

A producer MUST write every member in the table; `payload_ref` is the only OPTIONAL one. A verifier MUST reject an envelope missing `spec_version`, `public_key`, `signature` or `payload_hash`, and SHOULD treat one missing `event_id` or `signed_at` as nonconforming, never as valid.

**Versions.** A minor version of this profile only adds: a member, a field or a type, never a rename or a removal. A change that renames or removes anything is a new major. A `sanning.agent/1` record carries exactly `sanning.events/v2` as its `spec_version`, and any other value, a minor version included, reads `failed`, `bad_value`, at `/spec_version` ([`agent-events.md`](agent-events.md) section 10, step 4).

**Members this profile does not name.** A consumer MUST ignore an unknown optional member of the envelope, so a minor version can add one without breaking an older verifier. The record's sections have their own rules (section 3). A member present at signing is inside the signed scope like any other, so ignoring it never changes whether the signature holds.

**`co_signatures` is reserved.** The name is held for countersignatures over the same bytes `signature` covers, and this release defines no countersignature. The member is outside the signed scope: an envelope with `co_signatures` added after signing still verifies, and the member can be removed after signing without a trace, so its presence is not evidence of anything. A verifier ignores its content and its form in this release, and MUST NOT treat its absence as a failure.

**Locators are permanent: default to opaque.** `payload_ref` is inside the signed scope, so a locator is published with the envelope and cannot be redacted. A path such as `s3://bucket/key` publishes whatever the path encodes, and storage paths routinely encode customer, tenant, agent and model names. A producer SHOULD default to an opaque locator: `s3+opaque:` followed by the lowercase hex SHA-256 of the plaintext locator. It stays deterministic, so the same artifact has the same locator, and anyone who holds the real path can confirm it, while it discloses nothing to anyone who does not. The plaintext locator belongs in the caller's own copy of the record. A plaintext locator is conformant, and is the right choice where the path is already public, as an explicit choice of the caller and never the default.

**The disclosure fields are not in the envelope.** `event_type`, `subject` and `previous_hash` live in the event record. A verifier MUST NOT reject an envelope for lacking them. An envelope on its own says only that a key signed some bytes at some time.

**The signature rule.** Ed25519 is verified under strict [RFC 8032](https://www.rfc-editor.org/rfc/rfc8032) rules, and a verifier MUST refuse a signature unless every clause holds, checked in this order:

1. The public key A is the canonical encoding of a point: y below p, and not x zero with the sign bit set.
2. A is not of small order: 8·A is not the identity.
3. A is in the prime-order subgroup: L·A is the identity.
4. R, the signature's first 32 bytes, is the canonical encoding of a point.
5. R is not the identity.
6. R is not of small order.
7. R is in the prime-order subgroup.
8. S, the signature's last 32 bytes read little-endian, is below the group order L = 2^252 + 27742317777372353535851937790883648493.
9. The equation holds, with k = SHA-512(R ‖ A ‖ M) reduced modulo L over the bytes as given. With A and R in the prime-order subgroup, `S·B = R + k·A` and `8·S·B = 8·R + 8·k·A` are the same equation, so a verifier MAY check either.

Every signature an RFC 8032 signer makes satisfies these clauses. They exist because Ed25519 libraries that each call themselves strict disagree on signatures no honest signer makes, such as a key of small order, under which some signatures verify over any message.

**Canonical bytes.** JCS is [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785), over UTF-8. A verifier MUST reject an input that nests objects or arrays more than 128 levels deep, before canonicalizing it, so that two implementations with different recursion limits read one input alike. The outermost object or array is level 1, so an input 128 levels deep is read and one 129 levels deep is refused. Hashes are SHA-256 in lowercase hex. `GENESIS` is the literal string used in place of a SHA-256 for the first link of a chain.

## 3. The event record

The payload this profile commits to is never the caller's raw bytes. It is a JSON *event record* that itself commits to the caller's content by hash. The caller hashes its raw data locally and keeps the record, or its adapter does, and `payload_hash = SHA-256(JCS(event record))`. What else leaves the caller's system is set by the data mode ([`agent-events.md`](agent-events.md) section 7): in `private`, the default, Sanning receives the envelope and a fixed list of the record's fields, and never the content; in `full`, Sanning receives every field of the record and the content as well.

Each section of an event record is defined in one place:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../images/record-sections-dark.png">
  <img alt="The sections of one event record and where each is defined. The core is defined in events.md section 3, and the closed set of types in agent-events.md section 3. The event section, what the record commits to, in agent-events.md section 4.2, and for hand-offs also in agent-events.md section 8. The context section in agent-events.md section 4.3 and events.md section 3. The metadata section, the clear fields, in agent-events.md sections 4.4 to 5. The extras section, the vocabulary version, in agent-events.md section 2." src="../images/record-sections.png" width="760">
</picture>

```json
{
  "payload_version": 1,
  "spec_version": "sanning.events/v2",
  "event_type": "EVENT_TYPE",
  "subject": { "type": "agent", "agent_id": "AGENT_ID" },
  "previous_hash": "GENESIS",

  "event": {
    "content_hash": "SHA256_HEX_OF_CONTENT",
    "content_length": 0,
    "ref": "OPTIONAL_URI"
  },

  "context": {
    "chain_key": "CHAIN_KEY",
    "salt": "SALT_HEX"
  },

  "metadata": {},

  "extras": {}
}
```

Replace the following:

- `EVENT_TYPE`: a type of the closed set of section 4.
- `AGENT_ID`: the caller's identifier for the agent (section 5).
- `SHA256_HEX_OF_CONTENT`: the lowercase hex SHA-256 of the caller's raw bytes, OPTIONAL for `checkpoint`.
- `OPTIONAL_URI`: a locator for the caller's artifact, opaque by default (section 2), or leave the member out.
- `CHAIN_KEY`: the caller's chain key, present if and only if the record is chained (section 5).
- `SALT_HEX`: the record salt, exactly 32 lowercase hex characters (described in this section).

`previous_hash` is the previous record's `payload_hash` on a chain, or `"GENESIS"`.

The record has five sections, each with one owner, so the profile can add a field to its own sections without breaking a verifier of older records, and a caller's field never collides with one the profile adds. The following table gives the owner and the rule of each section. A record whose `event_type` begins `agent.` is governed whole by the `sanning.agent` vocabulary version it names in `extras.event_schema` ([`agent-events.md`](agent-events.md)); the table states where that changes a section's rule.

| Section | Owner | Rule |
|---|---|---|
| core (`payload_version`, `spec_version`, `event_type`, `subject`, `previous_hash`) | profile | Never changes within a major. `payload_version` is `1`. |
| `event` | profile, for each `event_type` | Fields are only added, never renamed or removed. Section 4 defines the types. On an `agent.*` type, `event` is closed to the members its schema names. |
| `context` | profile, across types | Fields are only added. Carries `chain_key` (section 5), the record salt `salt` (described in this section), and the hand-off keys `case_id`, `in_reply_to` and `protocol` (`agent-events.md` section 4.3). A verifier reads this section, so a caller-supplied identifier here MUST be opaque. On a type outside the agent vocabulary every member is optional. On an `agent.*` type, `context.data_mode` and `context.salt` are REQUIRED, `context` is closed to the members the type's schema names, and `context.chain_key` and `context.case_id` are each 1 to 128 characters of `A-Z a-z 0-9 _ . : -`. |
| `metadata` | caller, except on the `agent.*` types | On a type outside the agent vocabulary, free-form JSON: the profile MUST NOT read it for verification. On an `agent.*` type, `metadata` is a closed, schema-checked section that a verifier validates against the vocabulary's JSON Schema. |
| `extras` | profile | Reserved. On an `agent.*` type, `extras` carries exactly one member, `event_schema`, the vocabulary version. On any other type, `extras` carries no `event_schema`. |

**The schema check on an `agent.*` record.** A record whose `event_type` begins `agent.` names its vocabulary version in `extras.event_schema` and validates against that version's JSON Schema, which covers the whole event record. The SDK refuses to sign a record that fails; a verifier reads it `failed`, with the reason kind `nonconforming` and one named reason and pointer (`agent-events.md` section 10). A version the verifier does not know reads `incomplete`, never `verified`. On such a record:

- a member of `event` or `context` outside the type's list reads `failed`, the two hand-off types included;
- `event.message_bytes_hash` on the two hand-off types is 64 hex characters in either case, else section 10 reads the record `failed` (`bad_value`); a hand-off reader's own checks never read the field, and it never matches, pairs or grades on its value (`agent-events.md` sections 4.2 and 8.3);
- `context.protocol` and `event.content_type` on the hand-off types carry no control characters, and `event.content_type` is at most 128 characters;
- a record whose `previous_hash` is not `GENESIS` and that has no `context.chain_key` reads `failed` (`bad_value`).

The SDK runs this check before it signs, and a verifier runs it on the record it holds. The cases in [`../conformance/cases/`](../conformance/cases/) pin it.

**The record salt, on every record.** `context.salt` is defined once for every `sanning.events/v2` record. It is exactly 32 lowercase hex characters (128 bits), fresh for each record, from a cryptographically secure source, and sent to Sanning only in the `full` data mode (`agent-events.md` section 7). It is REQUIRED on every `agent.*` type, the two hand-off types included, and OPTIONAL on the seven other types, so a record of those types anchored without a salt still verifies; every SDK writes it on every record anyway. A verifier checks its form only: a salt present in the wrong form reads `failed` (`bad_value`) on any type, and a missing salt on an `agent.*` record reads `failed` (`missing_field`) (`agent-events.md` sections 4.3 and 10, step 1). Below `full`, Sanning stores the envelope and not the record, so without a salt Sanning, or anyone who breaches or compels its envelope store, could confirm a guess about a record against its `payload_hash`. A plain `event` record is open to this as much as an agent record.

**Floats.** JCS serializes a float as ECMA-262 does, and an unrounded float can serialize differently on two machines. On a type outside the agent vocabulary, `metadata` is caller-owned and MAY contain floats; the SDK canonicalizes the record once, when it creates it, and the caller keeps those exact bytes, so verification compares stored bytes rather than bytes derived again from a live object. The profile's own sections avoid floats (`content_length` is an integer byte count), with one exception: on the `agent.*` types, `metadata.gen_ai.request.temperature` and `metadata.gen_ai.request.top_p` are JSON numbers, serialized as JCS specifies. A caller that builds records outside the SDK MUST round floats to a fixed precision before serializing.

**Content commitment.** `event.content_hash` is `SHA-256(raw bytes)`, with no canonicalization of the caller's data, and streams are supported. A caller MAY pass a hash it computed instead of the bytes; the SDK cannot then check it, and the record is exactly as trustworthy as the hash supplied: a statement of where the content came from, not an endorsement of it. For an `agent.*` record, `agent-events.md` section 9.3 says what the content is.

## 4. The closed set of types

The set is the one [`agent-events.md`](agent-events.md) section 3 defines: the `agent.*` types of the `sanning.agent` version a record names in `extras.event_schema`, and seven types outside that vocabulary, `event`, `checkpoint`, `declaration`, `runner.run_opened`, `runner.run_closed`, `runner.egress` and `runner.relay`. A verifier reads the version before the type, so a type a later minor version adds reads `incomplete` on an older verifier. Any other type reads `failed` (`event_type_not_in_set`), so the SDKs refuse to build one. An agent's own event is an `agent.*` record: `agent.decision`, `agent.step.*`, or `agent.custom` for an event the agent's own code names.

The types outside the agent vocabulary:

- `event`, the default type for a single record when the caller names none. `event.content_hash` is REQUIRED.
- `checkpoint`, reserved: the SDKs write none.
- `declaration`, a type whose record body is specified in a later release, with the evidence pack.
- `runner.run_opened`, `runner.run_closed`, `runner.egress` and `runner.relay`, reserved: this profile names them so the set is closed, and does not define them. The SDKs build none of them.

The vocabulary reads only the `extras` and the salt of a record of these seven types (`agent-events.md` section 10, step 1).

**No `handoff.*` type.** The `handoff.*` namespace is reserved. A hand-off is `agent.handoff.sent` and `agent.handoff.received`, two `sanning.agent/1` types (`agent-events.md` sections 5.7 and 8). A record typed `handoff.sent`, `handoff.received` or any other name whose folded form has a `handoff` segment reads `failed`, `event_type_not_in_set`, under the vocabulary, and `incomplete` in a hand-off reading (`agent-events.md` section 8.3).

Adding a type to the set is a minor change; renaming or removing one is a major change.

**Why a closed set.** An open grammar lets every adapter name its own types, so two adapters' approvals are two names an auditor has to map, and a builder-defined type carries nothing a verifier can check. Adding a type is a change to the vocabulary, and a minor version can add one.

## 5. `subject` and chains

**`subject`**, in the record core, identifies the agent that signed the record. `type` is always `"agent"`. Two optional string fields, each at most 128 characters of `^[A-Za-z0-9_.:-]+$`: `agent_id`, a stable identifier the caller chooses, which in production is RECOMMENDED to be the agent's identity, and `name`, a label for people. The identity a verifier relies on is always the envelope's `public_key`; `subject` is context.

**Chains.** A caller names a chain when it anchors a record, and the SDK tracks one head for each `(public_key, chain_key)`. The record's `previous_hash` is the previous record's `payload_hash` on that chain, or `"GENESIS"` for the first link. A record anchored with no chain is an unchained singleton: `previous_hash` is `"GENESIS"`. `context.chain_key` carries the chain name, inside the committed record. A chain is evidence that no record between two links present was removed or reordered. It is not a proof that the verifier holds every record.

## 6. The interval stamp

The SDK signs each record's envelope and sends it to Sanning on its own, and returns no inclusion proof. Sanning places the envelopes it receives in an interval into one Merkle tree, and the *interval stamp* is that tree's root, anchored on a permanent public record.

- **The leaf.** An envelope's leaf is the [RFC 9162](https://www.rfc-editor.org/rfc/rfc9162) leaf hash (a `0x00` prefix) over the JCS bytes of the complete signed envelope, so inclusion commits to the signature as well as to `payload_hash`. The tree is an RFC 9162 Merkle tree.
- **What is public.** Only the root is anchored. The envelopes are not public, and nothing in this profile puts an envelope, a record or any field of either on a public record. The signed `environment` member is the only environment signal.
- **What a verifier trusts.** Anything published beside a root sits outside every signature, so a verifier checks the bytes and never trusts it.

A holder collects records, their envelopes, their inclusion proofs and the stamps into an *evidence pack*, which a third party verifies offline.

**What this release covers.** This release specifies the envelope, the event record, the leaf and the tree. How a holder obtains an inclusion proof, the format of an evidence pack, where a stamp is published, and the verdicts over a pack are specified in a later release. The cases in this repository read records, not packs.

## 7. Verification

A verifier reads a record in three layers:

1. **The envelope.** Each member's form (section 2), the Ed25519 signature over the envelope with `signature` and `co_signatures` removed, and `payload_hash` against the record's JCS bytes.
2. **The record.** Obtain the event record (the caller's copy, or through `payload_ref`), confirm `payload_hash`, then read the disclosure fields from the record core. Where the record is not available, the signature is valid and its meaning is not proven: the reading is `incomplete`, never "a valid event of unknown type."
3. **The vocabulary.** An `agent.*` record is then read as `agent-events.md` section 10 says.

A verdict says the evidence has a verifiable history, never that what it records is safe or approved. A verifier can show `environment` beside its verdict, and a consumer MAY refuse to count records signed for `dev` as production evidence.

The cases in [`../conformance/cases/`](../conformance/cases/) pin the third layer. They read each record after its envelope has verified, so no case carries an envelope or a signature.
