# `sanning.agent/1`: the agent event vocabulary

> **Version 1.0.** A vocabulary of records carried under the `sanning.events/v2` profile ([`events.md`](events.md)). This document and `events.md` are the whole specification: section 12 lists the outside standards they cite.

This document defines the records an agent writes when it runs: which types exist, which fields each carries in clear, what each commits to by hash, and how a verifier reads them. The schemas are in [`schemas/sanning.agent/1/`](../schemas/sanning.agent/1/), and every example is a case in [`conformance/cases/`](../conformance/cases/).

**Terms.** An *adapter* is the code inside an agent's process that turns a framework's callbacks into records; an *SDK* signs and sends them. A *record* is a `sanning.events/v2` event record (`events.md` section 3). Its *envelope* is the signed object that carries the record's SHA-256 (`payload_hash`), the signing key and an Ed25519 signature (`events.md` section 2). Sanning places each envelope under an *interval stamp*: one Merkle root over many envelopes, anchored on a permanent public record (`events.md` section 6). An *evidence pack* is what a holder hands a third party to verify: records, their envelopes, their inclusion proofs and the stamps. An *invocation* is one run of an agent from its input to its output; its id is `run.root_run_id`. An *operation* is one unit of work inside it (a step, a model call, a tool call, a retrieval, an approval), written as a *start* record and an *end* record. A *verifier* reads records on its own machine. The records it reads beside the one under test are the records it *holds*: a set, in which two copies of one record (the same `event_id`, the same signing key and the same JCS bytes) are one record.

## 1. What a record proves, and what it does not

A verifier reads every rule here on its own machine, from the record and the schemas, with no account and no call to Sanning. Sanning is never in the trust path: nothing in this document asks a verifier to believe anything Sanning says.

A verified `agent.*` record proves four things:

- the holder of the signing key signed exactly these bytes (the envelope, `events.md` section 2);
- the record is well formed under this vocabulary: its type is in the closed set of its version, and every field is one this document names, in the shape it names;
- `event.content_hash` commits to one exact byte string, so anyone later handed the content can confirm it is what the agent recorded;
- on a chain, no record between two links was removed or reordered (`events.md` section 5).

It does not prove:

- **that what the record says happened.** Signed is not true. A record is the agent's own account, written by an adapter inside the agent's process.
- **that the adapter saw every step.** A step the framework never reported has no record. `capture.not_captured` lists the types the adapter knows it cannot write, and that list is the adapter's own word.
- **that an operation with no end failed.** A start with no end says only that no end record was written.
- **that `gen_ai.*` names what served a request.** Each value is what the integration reported.
- **that a revealed field matches the content.** A revealed field and `event.content_hash` agree only where a verifier holds the content and compares them.
- **that a hidden field cannot be recovered.** A hidden field keeps the hash of its value. Anyone who holds the record and guesses a short value, such as a tool name, can confirm the guess. The record salt does not change this: it protects `payload_hash` in the envelope, not the hashes inside the record (section 7).
- **that a clear field carries no customer data.** The schema bounds each field's shape and length, never its meaning. An id that passes the opaque grammar can still spell a word.
- **that a scrubbed content hash matches the framework's raw object.** Where `context.content_scrubbed` is `true`, the hash commits to the object after the adapter replaced credential-shaped values (section 9.3).
- **that two SDKs in two languages hash one step alike.** A framework in Python and the same framework in TypeScript hand their adapters different objects.
- **what Sanning received or stored.** `context.data_mode` is the agent's statement of what it sent.
- **that `private` hides how records connect.** `private` hides content, names and values, but not the ids that link records, the record types, how each operation ended, or when each record was signed. From those, Sanning (and anyone who breaches or compels its envelope store) can tell at most which records belong together, which key handed off to which where both sides anchor with Sanning, and whether more records followed an approval's answer. It never receives the verdict itself (section 7).
- **that every envelope field is a fixed format.** Two fields of the envelope, which Sanning receives in every mode, are set by the caller: `payload_ref`, a URI of up to 2048 characters, and the fraction of a second in `signed_at` (section 7).
- **that a closing record lists every record of its invocation.** A verifier checks a closing record against the records it lists. A record left out of the list is the completeness question, which this vocabulary does not answer.
- **that an outside record it links to is about this invocation.** `run.runner_event_id` is the agent's claim, and no step of section 10 checks it (section 8.4).
- **that the verifier holds the whole run.** The findings `seq_gap` and `closing_not_held` say a run may be incomplete. A verifier that holds part of a run cannot tell a record it lacks from a record that was never written (section 10).

## 2. Where the vocabulary sits

An `agent.*` record is a `sanning.events/v2` event record (the committed payload, never its envelope). This vocabulary governs the whole event record of each of its 19 types:

| Section | What this vocabulary sets |
|---|---|
| Core: `payload_version`, `spec_version`, `event_type`, `subject`, `previous_hash` | `event_type` is one of the 19 names. The rest are as the profile sets them, with `subject` closed to `type`, `agent_id` and `name`. |
| `event` | What the record commits to: `content_hash` for 17 types, the hand-off fields for the two hand-off types (section 4.2). |
| `context` | Fields a verifier reads to interpret the record: the data mode, the salt, the case, the reveal and hide lists, the scrubbing flag (section 4.3). |
| `metadata` | The clear fields: who ran what, when, and how it ended (section 4.4 to section 5). |
| `extras` | Exactly one member, `event_schema`, the vocabulary version: `"sanning.agent/1"`. |

Every object in the record is closed: a member this document does not name reads `failed` (`additionalProperties: false` in every schema). A field that is missing from the vocabulary is added to the vocabulary, never carried as an extra.

**What a verifier reads on an agent record.** On a record outside this vocabulary, `metadata` is the caller's and no verifier reads it, and a member of `event` or `context` outside the profile's lists is not part of the record. For an `agent.*` record, a verifier validates the whole record against the schema, `metadata` included, and a record with a member no schema names reads `failed`. `events.md` section 3 states each rule this narrows for the `agent.*` types.

**Versions.** `extras.event_schema` is `sanning.agent/<major>` or `sanning.agent/<major>.<minor>`, where each of `<major>` and `<minor>` is 1 to 9 ASCII digits (`0` to `9`) with no leading zero, starting at 1. The whole string is the version: a trailing newline or any other character after it reads `failed` ([`conformance/cases/event-schema/trailing-newline`](../conformance/cases/event-schema/trailing-newline), [`conformance/cases/event-schema/non-ascii-digit`](../conformance/cases/event-schema/non-ascii-digit)). Minor 0 is written as the bare major: `sanning.agent/1.0` is not a spelling of `sanning.agent/1` and reads `failed` ([`conformance/cases/event-schema/minor-zero`](../conformance/cases/event-schema/minor-zero)). Adding a type or a field is a minor change; renaming or removing one is a major change. A verifier reads the version before the type, so a type a later minor adds reads `incomplete` on an older verifier, never `failed` ([`conformance/cases/event-schema/unknown-minor-new-type`](../conformance/cases/event-schema/unknown-minor-new-type)), and any version the verifier does not know reads `incomplete`, never `verified` ([`conformance/cases/event-schema/unknown-minor`](../conformance/cases/event-schema/unknown-minor), [`conformance/cases/event-schema/unknown-major`](../conformance/cases/event-schema/unknown-major)).

| `extras.event_schema` | Reads | Case |
|---|---|---|
| `sanning.agent/1` | known | every `valid` case |
| `sanning.agent/1.1`, `sanning.agent/2` | `incomplete`, `event_schema_unknown` | `event-schema/unknown-minor`, `event-schema/unknown-major` |
| `sanning.agent/0`, `/01`, `/1.0`, `/1.01`, `/v1`, `/1234567890`, `/1` and a newline, `/` and ARABIC-INDIC DIGIT ONE, the number `1` | `failed`, `event_schema_invalid` | `event-schema/major-zero`, `major-leading-zero`, `minor-zero`, `minor-leading-zero`, `v-prefix`, `major-too-long`, `trailing-newline`, `non-ascii-digit`, `not-a-string` |

> **Why `metadata` and not `context`.** The fields an auditor reads (`run.*`, `gen_ai.*`, `closing.*`, `artifact.*`) are facts about the work, and `metadata` is the section that carries facts about the work. Putting them in `context` would change nothing a verifier can check. A `metadata` that stayed caller-owned and unread would be a clear field no rule governs, and any field could carry content in clear.

### 2.1 Where the names come from

A field keeps the name the profile or OpenTelemetry 1.41.0 already gives the same thing: the record core, `context.case_id`, `context.chain_key`, `context.in_reply_to`, `context.protocol`, the hand-off members of `event` (`events.md` section 3), and every `gen_ai.*`, `error.type`, `exception.message`, `openai.response.system_fingerprint` and `otel.scope.*` name. The following table lists every name this vocabulary adds. The reason codes and findings are in section 10.1.

| Name | What it names |
|---|---|
| `extras.event_schema` | The vocabulary version (section 2). |
| `context.data_mode` | What Sanning receives (section 7). |
| `context.salt` | The record salt (section 4.3). |
| `context.revealed`, `context.hidden` | The per-field controls (section 6). |
| `context.content_scrubbed` | The credential scrub (section 9.3). |
| `context.unchecked_held_part_count` | The count of held but unchecked parts (section 8.1): the list's name and `_count`, as `closing.record_count` counts `closing.record_ids`. |
| `run.run_id`, `run.parent_run_id`, `run.root_run_id`, `run.seq`, `run.prev_event_id`, `run.name`, `run.client` | Where a record sits (section 4.4). |
| `run.source_type`, `run.plumbing`, `run.observed_started_at` | The framework's step name, a plumbing step, a start time a source reported. |
| `run.started_event_id`, `run.runner_event_id`, `run.handoff_event_id` | A link to one record by its `event_id`. |
| `otel.trace_id`, `otel.span_id` | Real OpenTelemetry ids. |
| `capture.not_captured` | The cannot-capture list (section 4.8). |
| `closing.promised`, `closing.record_count`, `closing.record_ids`, `closing.outcome.observed.*`, `closing.outcome.stated.*` | The closing record (section 5.1). |
| `outcome.status` | How an operation ended. OpenTelemetry has no status member for a record. |
| `authority.scope`, `authority.expires_at`, `authority.principal` | Who authorised a run, and for what. |
| `retrieval.document_count` | OpenTelemetry 1.41.0 has no count for retrieval (section 5.5). |
| `approval.*` | The approval (section 5.6). |
| `handoff.parts`, `handoff.file_parts`, `handoff.sent_event_id`, `handoff.unchecked_held_parts` | The hand-off's counts, its link and its unchecked parts (section 5.7). |
| `decision.name`, `decision.value` | The decision (section 5.8). |
| `custom.name`, `custom.value` | The custom record (section 5.11). |
| `artifact.name`, `artifact.byte_length`, `artifact.content_type`, `artifact.path` | The file (section 5.9). |
| `artifact.tool_call_event_id`, `artifact.role`, `artifact.reason`, `artifact.source`, `artifact.destination` | The file (section 5.9). |

## 3. The closed set

A `sanning.events/v2` record has one of the seven types outside this vocabulary, or a type of the `sanning.agent` version it names in `extras.event_schema`. For `sanning.agent/1` that is these 26 types, and no other. A verifier reads any other type `failed`, whatever its namespace ([`conformance/cases/event-type/builder-defined-type`](../conformance/cases/event-type/builder-defined-type)).

| Kind | Types | Governed by |
|---|---|---|
| Run | `agent.run_opened`, `agent.run_closed` | this document |
| Step | `agent.step.started`, `agent.step.ended`, `agent.step.occurred` | this document |
| Model call | `agent.model_call.started`, `agent.model_call.ended` | this document |
| Tool call | `agent.tool_call.started`, `agent.tool_call.ended` | this document |
| Retrieval | `agent.retrieval.started`, `agent.retrieval.ended` | this document |
| Approval | `agent.approval.requested`, `agent.approval.resolved` | this document |
| Hand-off | `agent.handoff.sent`, `agent.handoff.received` | this document |
| Decision | `agent.decision` | this document |
| File | `agent.file` | this document |
| Error | `agent.error` | this document |
| Custom | `agent.custom` | this document |
| Outside this vocabulary | `event`, `checkpoint`, `declaration`, `runner.run_opened`, `runner.run_closed`, `runner.egress`, `runner.relay` | the profile (`events.md` section 4) |

Names compare exactly: `AGENT.TOOL_CALL.STARTED` is not in the set ([`conformance/cases/event-type/uppercase-agent-type`](../conformance/cases/event-type/uppercase-agent-type)). `handoff.sent`, `handoff.received` and every adapter-namespaced name such as `langchain.tool_start` are outside the set, as is any other name not listed here ([`conformance/cases/event-type/unknown-agent-type`](../conformance/cases/event-type/unknown-agent-type)).

> **Why a closed set, not the open grammar.** With an open grammar, a record typed `myapp.tool_call` carries nothing a verifier can check, and an auditor reads two adapters' approvals under two names. With adapter namespaces beside the `agent.*` names, nothing stops an adapter writing its own name for a type this document defines. `agent.custom` (section 5.11) is not a way around the set: it is one type, its name is a field of fixed format, its value is hash-only, and an adapter writes it only for an event the customer named.

## 4. Shared fields

### 4.1 Value types

| Type | Meaning |
|---|---|
| id | An opaque identifier: 1 to 128 characters of `A-Z a-z 0-9 _ . : -`. Never hashed, never a name, a path or customer content. An id that fails the grammar is refused: the record reads `failed`, `bad_value`, and an SDK refuses to sign it (section 11). An adapter never leaves the id out or rewrites it to pass ([`conformance/cases/rules/case-id-not-opaque`](../conformance/cases/rules/case-id-not-opaque)). |
| event id | An envelope `event_id`: a lowercase UUID v4. Compared exactly. |
| provider id | An identifier a model provider minted, or an adapter assigned: 1 to 256 characters of the id grammar. |
| label | A short name or code: 1 to 128 characters, no control characters. |
| text | A name: 1 to 256 characters, no control characters. |
| locator | Where a file was or went, in the tool's words: 1 to 2048 characters, no control characters. |
| package name | A published package's name: an npm name with an optional `@scope/`, or a PyPI name, in `A-Z a-z 0-9 . _ -` with no `~`. At most 214 characters ([`conformance/cases/rules/scope-name-tilde`](../conformance/cases/rules/scope-name-tilde)). |
| semver | A [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) version, at most 64 characters. |
| sha256 | 64 lowercase hex characters. |
| count | An integer from 0 to 2^53 - 1. |
| RFC 3339 UTC | `YYYY-MM-DDTHH:MM:SS`, an optional fraction of 1 to 9 digits, and `Z`: month `01` to `12`, day `01` to `31`, hour `00` to `23`, minute and second `00` to `59`. At most 30 characters ([`conformance/cases/rules/observed-start-not-a-date`](../conformance/cases/rules/observed-start-not-a-date)). |
| any | Any JSON value. Used only for hash-only fields (section 6), which carry what the content held when revealed. |

**How a pattern is tested.** Every pattern in the schemas is an ECMA-262 regular expression, tested as `RegExp.prototype.test` does, which is what JSON Schema's `pattern` is: a search, in which the pattern carries its own anchors. `^` is the start of the string, `$` is its end with no exception for a final newline, and `[0-9]` is the ten ASCII digits. A pattern anchored at both ends matches only the whole string; a pattern anchored at the start alone, such as the `data:` prefix a locator must not begin with, matches a prefix ([`conformance/cases/rules/event-ref-data-uri`](../conformance/cases/rules/event-ref-data-uri)). A verifier or SDK whose regular expressions differ must translate each pattern: in Python, `re.search` with `re.ASCII`, a final `$` written `\Z`. `re.fullmatch` is wrong: it turns the prefix test into a whole-string test and admits a `data:` URI. Cases: [`conformance/cases/rules/id-trailing-newline`](../conformance/cases/rules/id-trailing-newline), [`conformance/cases/rules/version-non-ascii-digit`](../conformance/cases/rules/version-non-ascii-digit).

**Present and absent.** A member is present when its key is in the object, whatever its value: a member written as `null` is present ([`conformance/cases/disclosure/revealed-null-listed`](../conformance/cases/disclosure/revealed-null-listed), [`conformance/cases/disclosure/revealed-null-unlisted`](../conformance/cases/disclosure/revealed-null-unlisted)). A field whose type does not admit `null` reads `bad_value` when written as `null`.

**Every list has a cap.** `gen_ai.response.finish_reasons` at most 16, `authority.scope` at most 32 ([`conformance/cases/rules/authority-scope-too-many`](../conformance/cases/rules/authority-scope-too-many)), `capture.not_captured` at most 19, `context.revealed` at most the number of the type's hash-only fields, `handoff.unchecked_held_parts` at most 1024, and `closing.record_ids` at most 65536. A hash-only field's value is content and has no cap; it reaches Sanning only in `full` (section 7).

### 4.2 The `event` section

For every type except the two hand-off types, `event` is closed to three members:

| Field | Type | Required | Meaning |
|---|---|---|---|
| `content_hash` | sha256 | yes | SHA-256 of the content (section 9.3). |
| `content_length` | count | no | The content's length in bytes. Sanning receives it only in `full`: a length can tell two values apart (section 7). |
| `ref` | URI, at most 2048 characters | no | A locator for the content, opaque by default (`events.md` section 2). A `data:` URI carries content, not a locator, and reads `bad_value` ([`conformance/cases/rules/event-ref-data-uri`](../conformance/cases/rules/event-ref-data-uri)). |

For `agent.handoff.sent` and `agent.handoff.received`, `event` is closed to these members, and a member outside the list reads `failed` ([`conformance/cases/rules/event-section-unknown-field`](../conformance/cases/rules/event-section-unknown-field)):

| Field | Type | Required | On | Meaning |
|---|---|---|---|---|
| `message_hash` | 64 hex characters, either case | yes | both | SHA-256 of the JCS bytes of the message object, as sent or as held (section 8.2). What the record commits to, and a check on a formed pair (section 8.3). |
| `message_bytes_hash` | 64 hex characters, either case | no | both | SHA-256 of the bytes as they crossed the transport, so a reader can see what each side held. Diagnostic only. Section 10 checks its form and reads a value not of this form `failed`, `bad_value`. A hand-off reader's own checks never read this field: it MUST NOT match, pair or grade on its value. A hand-off reading reports such a record `nonconforming_record` only through section 10's reading, as it does for any record section 10 reads `failed` (section 8.3). The two sides of an honest pair can differ here while `message_hash` agrees ([`conformance/cases/rules/message-bytes-hash-not-a-hash`](../conformance/cases/rules/message-bytes-hash-not-a-hash)). |
| `content_type` | label | yes | both | What the hashed message is, so a reader can tell a changed message from another representation of it ([`conformance/cases/rules/content-type-control-character`](../conformance/cases/rules/content-type-control-character)). |
| `counterparty_public_key` | 64 lowercase hex characters | yes | both | The Ed25519 key on the other side: the intended receiver on `agent.handoff.sent`, the sender on `agent.handoff.received`. It names a party and never forms a pair (section 8.3). |
| `sequence` | integer from 1 to 2^53 - 1 | yes | both | The message's position among the messages its sender sent in the case (`context.case_id`), counted from 1 by the sender. The receiver records the sender's number unchanged. |
| `outcome` | `accepted`, `rejected` or `failed` | yes | received | What the receiving agent did with the message. |

### 4.3 `context`

| Field | Type | Required | On | Meaning |
|---|---|---|---|---|
| `context.data_mode` | `private`, `standard` or `full` | yes | every type | What Sanning receives (section 7). Signed, so a verifier can see the agent's statement. One invocation has one mode. |
| `context.salt` | exactly 32 lowercase hex characters | yes | every type | A random 128-bit value, fresh for each record, from a cryptographically secure source. It stops Sanning, which holds the envelope and not the record, from confirming a guess about the record against `payload_hash` (section 7). It commits to nothing else, and no rule compares the salts of two records: two halves of an operation, or two records of one hand-off, carry different salts and still pair. Sanning receives it only in `full`. A verifier checks its form only ([`conformance/cases/rules/salt-upper-case`](../conformance/cases/rules/salt-upper-case), [`conformance/cases/rules/salt-too-short`](../conformance/cases/rules/salt-too-short), [`conformance/cases/rules/salt-too-long`](../conformance/cases/rules/salt-too-long), [`conformance/cases/salt/missing-on-agent.handoff.received`](../conformance/cases/salt/missing-on-agent.handoff.received)). |
| `context.case_id` | id | no | every type | The case this record belongs to: the exchange it is part of, named by the producer, so a reader can gather one case's records from records several parties hold. Sanning receives it in every mode (section 7). |
| `context.chain_key` | id | when chained | every type | The chain this record is on (`events.md` section 5). Present on every record of a chain, its first included. An unchained record has none, and its `previous_hash` is `GENESIS`: a `previous_hash` that names a previous record with no `chain_key` reads `bad_value` at the record, `""` ([`conformance/cases/rules/chain-key-without-chain`](../conformance/cases/rules/chain-key-without-chain)). An id, because Sanning receives it in every mode ([`conformance/cases/rules/chain-key-not-opaque`](../conformance/cases/rules/chain-key-not-opaque)). |
| `context.content_scrubbed` | `true` | no | every type except the hand-off types and `agent.file` | The adapter replaced credential-shaped values in the content before hashing it (section 9.3). Absent otherwise, never `false`. A verifier shows it ([`conformance/cases/rules/content-scrubbed`](../conformance/cases/rules/content-scrubbed)). |
| `context.revealed` | list of field paths | no | types with a hash-only field | The hash-only fields this record carries in clear (section 6). |
| `context.hidden` | object: field path to sha256 | no | types with a hidable field | The clear fields this record withholds, each with the hash of its value (section 6). |
| `context.in_reply_to` | 64 hex characters, either case | no | hand-off types | The `event.message_hash` of the message this one answers. Absent on the first message of a case. |
| `context.protocol` | 1 to 64 characters, no control characters | no | hand-off types | The protocol whose identifiers the message follows, such as `a2a/1.0.0`: a note for the reader, never a claim of protocol support ([`conformance/cases/rules/protocol-control-character`](../conformance/cases/rules/protocol-control-character)). |
| `context.unchecked_held_part_count` | integer from 1 | when not zero | `agent.handoff.received` | How many parts of the message the receiver held bytes for and did not check (section 8.1). Absent means zero; `0` is refused ([`conformance/cases/handoff/unchecked-parts-zero`](../conformance/cases/handoff/unchecked-parts-zero)). |

**The salt on every other record.** `context.salt` is defined once for every `sanning.events/v2` record, not only for this vocabulary (`events.md` section 3). The rules:

| Record | The salt is | A verifier reads |
|---|---|---|
| An `agent.*` record | required | missing: `failed`, `missing_field` |
| `event`, `checkpoint`, `declaration`, and the four `runner.*` types | optional | absent: no verdict |
| Any record | in one form: exactly 32 lowercase hex characters | present in any other form, `null` included: `failed`, `bad_value`, at `/context/salt` |

It is optional on the seven other types, so a record of those types anchored without a salt still verifies. An SDK writes a fresh salt on every record it builds, of any type. A record outside this vocabulary has no data mode, so its salt never reaches Sanning. A verifier checks the form and nothing else: it makes no finding about a weak or repeated salt. Cases: [`conformance/cases/salt/present-on-event`](../conformance/cases/salt/present-on-event), [`conformance/cases/salt/absent-on-event`](../conformance/cases/salt/absent-on-event), [`conformance/cases/salt/wrong-form-on-declaration`](../conformance/cases/salt/wrong-form-on-declaration), and one `salt/missing-on-<type>` case for each of the 19 types.

> **Why the mode is in `context`.** A verifier reads `context`, and the mode decides how a verifier interprets what is missing from Sanning's copy. In `metadata` it would read as one more fact about the work.

### 4.4 `metadata.run`: where the record sits

Every record carries `metadata.run`. Where a framework has no id for an operation, the adapter assigns one, and assigns it once: the start and the end carry the same value.

| Field | Type | Required | On | Meaning |
|---|---|---|---|---|
| `run.run_id` | id | yes | every type | This operation, in the framework's own id or one the adapter assigned. A start and its end carry the same value. On a record that is not an operation (a run, a step that occurred, a hand-off, a decision, a custom record, a file, an error), the operation it was written inside, or `run.root_run_id` outside any operation. |
| `run.parent_run_id` | id or `null` | yes | every type | The operation this one runs inside: for a hand-off, the operation that sent or received the message. `null` at the root. |
| `run.root_run_id` | id | yes | every type | One agent invocation, everywhere: every record of one invocation carries one value. |
| `run.seq` | count | yes | every type | This record's position in the invocation's chain of records: `0` on its first record, and only there. |
| `run.prev_event_id` | event id or `null` | yes | every type | The previous record's `event_id` on that chain: `null` on the first record, and only there. |
| `run.source_type` | label; on `agent.step.occurred`, a dotted name (section 5.11) | no; yes on `agent.step.occurred` | every type except `agent.run_closed` | The framework's own name for the step (`chain`, `tool`, `chat_model`, a graph node type), or for the event a step that occurred records (`langchain.agent_action`). Absent where the framework names none. |
| `run.name` | text | no | run opened, step, model call, tool call, retrieval | The step's own name. Hidable (section 6). |
| `run.client` | label | no | model call | The framework client that made the call, apart from who served it. |
| `run.started_event_id` | event id or `null` | yes | every `.ended` type and `agent.approval.resolved` | The `event_id` of the record that began this operation (section 9.1). `null` only for an end whose start this adapter cannot observe, which its cannot-capture list names (section 4.8). |
| `run.observed_started_at` | RFC 3339 UTC | no | every `.ended` type | When the operation started, as its source reported it (a gateway log, a framework event's own timestamp). A verifier shows it as the source's word; it is never a signed start. |
| `run.plumbing` | `true` | no | step | This step is framework plumbing (section 9.2). Absent otherwise, never `false`. |
| `run.runner_event_id` | event id | no | `agent.run_opened` | The `event_id` of a `runner.run_opened` record, a record outside this vocabulary that the adapter was handed: the agent's claim, which no step of section 10 checks (section 8.4). |
| `run.handoff_event_id` | event id | no | `agent.run_opened` | The `event_id` of the `agent.handoff.received` record whose message started this invocation (section 8.1). |

**The first record.** An invocation's first record is the record with `run.seq` 0 and `run.prev_event_id` `null`. The schema refuses a record with one and not the other: `bad_value` at `/metadata/run` ([`conformance/cases/rules/head-seq-zero-prev-set`](../conformance/cases/rules/head-seq-zero-prev-set), [`conformance/cases/rules/head-prev-null-seq-set`](../conformance/cases/rules/head-prev-null-seq-set)). Each position holds one record: two records of one invocation under one key at one `run.seq` are the finding `seq_duplicate` (step 7g, [`conformance/cases/seq/two-records-at-seq-zero`](../conformance/cases/seq/two-records-at-seq-zero)), and an invocation with two records at `run.seq` 0 has no first record. `agent.run_opened`, where the adapter writes one, is the first record of its invocation ([`conformance/cases/rules/run-opened-not-at-head`](../conformance/cases/rules/run-opened-not-at-head)). A record no invocation contains, such as a file a storage wrapper records outside any agent run, is a one-record invocation: its own `run.run_id` and `run.root_run_id`, `run.parent_run_id` `null`, `run.seq` 0 and `run.prev_event_id` `null`. A hand-off received before the invocation it starts is not a record of that invocation: it carries the receiving operation's own root run id.

**What reads `run.prev_event_id`.** Only the first-record rule above: `null` at `run.seq` 0, and only there. No step of section 10 checks that it names the record one position before, so a verifier cannot rely on it to order records or find gaps. Steps 7g and 7i read `run.seq`.

> **Why `run.started_event_id` names a record, not a run id.** A start and its end already share `run.run_id`, and a framework can reuse a run id. An event id is unique and is what the start's envelope signs, so the end points at exactly one record.

### 4.5 `metadata.otel`: who wrote the record

| Field | Type | Required | Meaning |
|---|---|---|---|
| `otel.scope.name` | package name | yes | The published package that wrote the record, as its registry spells it ([`conformance/cases/rules/scope-name-free-text`](../conformance/cases/rules/scope-name-free-text)). |
| `otel.scope.version` | semver | yes | That package's version ([`conformance/cases/rules/scope-version-not-semver`](../conformance/cases/rules/scope-version-not-semver)). A Python package writes its PEP 440 version in the form below. |
| `otel.scope.schema_url` | `https://opentelemetry.io/schemas/1.41.0` | yes | The OpenTelemetry semantic-conventions version the `gen_ai.*` names follow. |
| `otel.trace_id` | 32 lowercase hex, not all zero | no | A real OpenTelemetry trace id, where a real span exists. Never a framework run id. |
| `otel.span_id` | 16 lowercase hex, not all zero | no | A real OpenTelemetry span id, on the same terms. |

**A PEP 440 version as a semantic version.** The adapter takes the canonical form the `packaging` library gives (`str(packaging.version.Version(v))`) and writes:

- the release as three numbers, with `0` for a missing one: `2.1` is `2.1.0`;
- a pre-release `aN`, `bN` or `rcN` as `-a.N`, `-b.N` or `-rc.N`, and a development release `.devN` as `.dev.N` after it, or as `-dev.N` alone: `1.0.0rc1` is `1.0.0-rc.1`, `1.0.dev2` is `1.0.0-dev.2`;
- the epoch, a fourth or later release number, a post-release and a local label as build metadata, in that order: `1!2.0.post1` is `2.0.0+epoch.1.post.1`, `1.0.0.1` is `1.0.0+release.1`, `1.0+abc.5` is `1.0.0+local.abc.5`.

The string names one version. Semantic Versioning ignores build metadata when it orders versions, and orders a development release differently from PEP 440, so a verifier orders Python versions by PEP 440, never by this string. The mapping is producer-side: no case here tests it.

### 4.6 `metadata.gen_ai`: the shared members

Names are OpenTelemetry GenAI 1.41.0's, the last release that holds them. A value is what the integration reported.

| Field | Type | Required | On | Meaning |
|---|---|---|---|---|
| `gen_ai.operation.name` | OpenTelemetry's value | yes | run, model call, tool call, retrieval | `invoke_agent`, one of `chat`, `text_completion`, `generate_content`, `embeddings`, `execute_tool` or `retrieval`. Absent on the other kinds: OpenTelemetry has no word for them. |
| `gen_ai.agent.version` | label | no | every type | The caller's own version for its agent. |
| `gen_ai.conversation.id` | id | no | every type | The conversation this record belongs to. LangGraph's `thread_id` goes here. It ties an approval to its answer across two invocations (section 9.1). Where the framework has no thread, the adapter writes the id the caller supplies, or omits the field; it never generates one. |

> **Why the adapter never generates a conversation id.** A generated id differs for each invocation, so it ties nothing to anything, and it reads as a conversation that exists.

### 4.7 How an operation ended

Every `.ended` record carries these. `agent.file` carries `outcome.status` with only the two values section 5.9 defines; `agent.error` carries `error.type` and `exception.message`.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `outcome.status` | `completed`, `failed`, `interrupted` or `skipped` | yes | How the operation ended. `interrupted` is an operation the framework paused or cancelled, such as a graph node that called an interrupt to wait for a human ([`conformance/cases/rules/step-ended-interrupted`](../conformance/cases/rules/step-ended-interrupted)). An adapter never writes an interrupt as `failed` or `completed`. `skipped` is an operation that never ran because a policy, a hook or an approval stopped it; the reason is in the `agent.approval.resolved` or `agent.error` record that stopped it ([`conformance/cases/rules/agent.tool_call.ended-skipped`](../conformance/cases/rules/agent.tool_call.ended-skipped), [`conformance/cases/rules/agent.step.ended-skipped`](../conformance/cases/rules/agent.step.ended-skipped)). A tool call whose approval resolved `rejected` or `responded` in the same invocation ends `skipped`; one that was open at an interrupt ends `interrupted` (section 5.6). `skipped` ends an operation, never a run ([`conformance/cases/rules/run-closed-skipped`](../conformance/cases/rules/run-closed-skipped)). |
| `error.type` | label | no | The class of error, as OpenTelemetry's `error.type`. |
| `exception.message` | string | no | The error's message. Hash-only unless revealed (section 6). |

### 4.8 `metadata.capture`: what the adapter cannot write

| Field | Type | Required | Meaning |
|---|---|---|---|
| `capture.not_captured` | list of type names | yes, inside `capture` | The `agent.*` types this adapter cannot write for this invocation. |

`capture` is allowed on every type and read only on the invocation's first record (section 4.4): `agent.run_opened` where the adapter writes one, otherwise whatever record comes first, as with a middleware or a storage wrapper that never sees a run open. On any other record it reads `failed`, `capture_not_at_head` ([`conformance/cases/rules/capture-not-at-head`](../conformance/cases/rules/capture-not-at-head)). An invocation with two records at `run.seq` 0 under one key has no first record, so no list in it counts ([`conformance/cases/end-only/declared-on-a-second-head`](../conformance/cases/end-only/declared-on-a-second-head)). An absent list says the adapter declared nothing, never that it captures everything.

> **Why the first record and not every record.** A declaration made at the head of the invocation is made before the adapter knows which records it will miss. A declaration allowed on any record could be written beside the gap it excuses, and so could a second record at `run.seq` 0, which is why two first records count as none.

## 5. The types

Each table lists the fields beyond section 4. **Hashed content** is what `event.content_hash` commits to; section 9.3 says how its bytes are made. Where no framework step produces a record, its content is the fixed object given here: every member is always present, `null` where the adapter has no value.

### 5.1 Run: `agent.run_opened`, `agent.run_closed`

`agent.run_opened` is written when an invocation starts, as its first record. `agent.run_closed` is written by the adapter's `close()`.

| Field | Type | Required | On | Meaning |
|---|---|---|---|---|
| `closing.promised` | `true` | yes | opened | The adapter will write `agent.run_closed`. A promise with no closing record means the process ended before the run did. |
| `authority.scope` | list of labels | no | opened | What the run was authorised to do. |
| `authority.expires_at` | RFC 3339 UTC | no | opened | When that authority ends. |
| `authority.principal` | any | no | opened | Who authorised the run. Hash-only unless revealed. |
| `closing.record_count` | count | yes | closed | How many records this invocation anchored under this key before this one. |
| `closing.record_ids` | list of event ids | yes | closed | Their `event_id`s, never its own. Its length is `closing.record_count`. |
| `closing.outcome.observed.status` | `completed`, `failed`, `interrupted` or `unknown` | yes | closed | How the adapter saw the run end. `interrupted`: the adapter saw the run end while an operation it started had no end, such as an approval waiting for a human. Only an approval request can be answered in a later invocation; every other operation ends in its own invocation (section 9.1). `unknown`: the adapter never saw the run end. |
| `closing.outcome.stated.status` | `completed`, `failed`, `interrupted` or `unknown` | yes, inside `stated` | closed | How the caller said the run ended, where it said so. |
| `closing.outcome.observed.reason`, `closing.outcome.stated.reason` | `error`, `timeout`, `cancelled`, `interrupted` or `policy` | no | closed | Why the run did not complete, as a code ([`conformance/cases/rules/closing-reason-free-text`](../conformance/cases/rules/closing-reason-free-text)). Any text about the failure is in the content of the `.ended` or `agent.error` record that carries it. |

A run that ends on an interrupt closes `interrupted`, never `completed` ([`conformance/cases/rules/run-closed-interrupted`](../conformance/cases/rules/run-closed-interrupted)).

**A closing record is judged only on every record it lists.** Where the verifier holds, under the closing record's key, a record that verifies for every `event_id` in `closing.record_ids`, it checks the closing record: `completed` in `closing.outcome.observed.status` over a listed start with no listed end is the finding `completed_with_open_operation` ([`conformance/cases/run-closed/completed-with-an-open-request`](../conformance/cases/run-closed/completed-with-an-open-request)). Where it does not hold one of them, the closing record reads `incomplete`, with `listed_record_absent` at each such id, and nothing about the run's operations is claimed ([`conformance/cases/run-closed/completed-with-a-listed-end-not-held`](../conformance/cases/run-closed/completed-with-a-listed-end-not-held)). A closing record does not list itself. One that does reads `incomplete`, `listed_record_absent`, at its own id, because a record is never one of its own held records (section 10, step 7) ([`conformance/cases/run-closed/lists-itself`](../conformance/cases/run-closed/lists-itself)). A closing record that leaves a record of its invocation out of the list is the completeness question, outside this vocabulary (section 1).

Hashed content. On opened, the fixed object `{"authority": {"expires_at", "principal", "scope"}, "input"}`: `input` is the invocation's input as the framework handed it over, never rewritten, and `authority` holds what the adapter was handed about who authorised the run, so `authority.principal` is committed by the content hash. On closed, the empty object `{}`. Where a run fails, the failure is in the `.ended` or `agent.error` record that carries it, not in the closing record.

**The invocation's output is its root step.** The adapter writes the invocation's root (the graph, the chain, the crew the caller invoked) as an `agent.step.started` and `agent.step.ended` pair like any other step, and the final output is the content of that `agent.step.ended` record. `agent.run_opened` commits the input; the root step commits the output.

Examples: [`conformance/cases/valid/agent.run_opened-every-field`](../conformance/cases/valid/agent.run_opened-every-field), [`conformance/cases/valid/agent.run_closed-every-field`](../conformance/cases/valid/agent.run_closed-every-field).

### 5.2 Step: `agent.step.started`, `agent.step.ended`, `agent.step.occurred`

A framework step: a graph node, a chain, the invocation's root. The pair types, started and ended, are written when the framework starts and ends the step; `agent.step.occurred` is written when the framework reports the moment. Beyond section 4: `run.name`, `run.plumbing`.

Hashed content: the step's inputs on started, its outputs or error on ended. Examples: [`conformance/cases/valid/agent.step.started-every-field`](../conformance/cases/valid/agent.step.started-every-field), [`conformance/cases/valid/agent.step.ended-required-only`](../conformance/cases/valid/agent.step.ended-required-only).

**A step that occurred.** `agent.step.occurred` records one moment the framework reports inside a run: LangChain's agent action and agent finish, a retry between two attempts of a call, CrewAI's skill used. It is one record and not an operation: it has no start, no end and no outcome, so section 9.1 does not pair it and step 7 looks for no end of it ([`conformance/cases/pairing/step-occurred-is-not-an-operation`](../conformance/cases/pairing/step-occurred-is-not-an-operation)). An end that names it as its start reads `failed`, `pair_type_mismatch` ([`conformance/cases/pairing/end-names-a-step-occurred`](../conformance/cases/pairing/end-names-a-step-occurred)).

| Field | Type | Required | Meaning |
|---|---|---|---|
| `run.run_id` | id | yes | The operation the step occurred inside, or `run.root_run_id` outside any operation. A retry between two attempts of a tool call carries the tool call's run id ([`conformance/cases/rules/step-occurred-retry`](../conformance/cases/rules/step-occurred-retry)). |
| `run.source_type` | a dotted name of 1 to 64 characters, in the grammar of `custom.name` (section 5.11) | yes | The framework's own name for the event: `langchain.agent_action`, `langchain.agent_finish`, `langchain.retry`, `crewai.skill_used` ([`conformance/cases/missing-field/agent.step.occurred.metadata.run.source_type`](../conformance/cases/missing-field/agent.step.occurred.metadata.run.source_type), [`conformance/cases/rules/step-occurred-source-type-not-a-dotted-name`](../conformance/cases/rules/step-occurred-source-type-not-a-dotted-name), [`conformance/cases/rules/step-occurred-source-type-too-long`](../conformance/cases/rules/step-occurred-source-type-too-long), [`conformance/cases/rules/step-occurred-source-type-64-characters`](../conformance/cases/rules/step-occurred-source-type-64-characters)). |
| `run.name` | text | no | The step's own name. Hidable (section 6). |
| `run.plumbing` | `true` | no | The step is framework plumbing (section 9.2). |

It carries none of the fields of an operation, and each reads `failed`, `unknown_field`: `outcome` ([`conformance/cases/rules/step-occurred-with-outcome`](../conformance/cases/rules/step-occurred-with-outcome)), `run.started_event_id` ([`conformance/cases/rules/step-occurred-with-started-event-id`](../conformance/cases/rules/step-occurred-with-started-event-id)), `run.observed_started_at` ([`conformance/cases/rules/step-occurred-with-observed-started-at`](../conformance/cases/rules/step-occurred-with-observed-started-at)), and the tool and model fields: `run.client`, `gen_ai.operation.name`, `gen_ai.tool.*`, `gen_ai.request.*`, `gen_ai.provider.name`, `gen_ai.response.*` and `gen_ai.usage.*` ([`conformance/cases/rules/step-occurred-with-tool`](../conformance/cases/rules/step-occurred-with-tool), [`conformance/cases/rules/step-occurred-with-model`](../conformance/cases/rules/step-occurred-with-model), [`conformance/cases/rules/step-occurred-with-provider`](../conformance/cases/rules/step-occurred-with-provider), [`conformance/cases/rules/step-occurred-with-response`](../conformance/cases/rules/step-occurred-with-response), [`conformance/cases/rules/step-occurred-with-usage`](../conformance/cases/rules/step-occurred-with-usage), [`conformance/cases/rules/step-occurred-with-client`](../conformance/cases/rules/step-occurred-with-client), [`conformance/cases/rules/step-occurred-with-operation-name`](../conformance/cases/rules/step-occurred-with-operation-name)). A tool call is an `agent.tool_call.*` pair and a model call an `agent.model_call.*` pair, never a step that occurred.

Hashed content: the event as the framework handed it to the adapter (section 9.3), such as LangChain's `AgentAction`. Examples: [`conformance/cases/valid/agent.step.occurred-required-only`](../conformance/cases/valid/agent.step.occurred-required-only), [`conformance/cases/valid/agent.step.occurred-every-field`](../conformance/cases/valid/agent.step.occurred-every-field).

> **Why a third step type, and not `agent.custom` or a pair.** A framework reports some moments as one event: LangChain's agent action has no matching end, and a retry happens between two attempts. Written as a pair, each would be a start and an end the adapter makes up at one instant; written as `agent.custom`, a framework's own event would sit beside the events the customer named, under one type.

### 5.3 Model call: `agent.model_call.started`, `agent.model_call.ended`

Written before the request, and after the response or the failure. A streamed response ends when the stream does.

| Field | Type | Required | On | Meaning |
|---|---|---|---|---|
| `gen_ai.request.model` | text | no | started | The model as the caller named it. |
| `gen_ai.request.temperature` | number | no | started | A JSON number, an exception to the profile's float discipline (`events.md` section 3). |
| `gen_ai.request.max_tokens` | count | no | started | |
| `gen_ai.request.seed` | integer | no | started | |
| `gen_ai.request.top_p` | number | no | started | As `temperature`. |
| `gen_ai.prompt.name` | text | no | started | The name the caller gave the prompt. Hidable. |
| `gen_ai.input.messages` | any | no | started | The prompt. Hash-only unless revealed. |
| `gen_ai.system_instructions` | any | no | started | Hash-only unless revealed. |
| `gen_ai.provider.name` | OpenTelemetry's well-known values, plus `openrouter` | yes, inside `provider` | both | The service that served the call, read from the endpoint the client was pointed at (below), never from a client class name. |
| `gen_ai.response.model` | text | no | ended | The model the provider says answered. |
| `gen_ai.response.id` | provider id | no | ended | The provider's id for the response ([`conformance/cases/rules/response-id-free-text`](../conformance/cases/rules/response-id-free-text)). |
| `gen_ai.response.finish_reasons` | list of labels | no | ended | |
| `gen_ai.usage.input_tokens` | count | no | ended | |
| `gen_ai.usage.output_tokens` | count | no | ended | |
| `gen_ai.usage.reasoning.output_tokens` | count | yes, inside `reasoning` | ended | |
| `gen_ai.output.messages` | any | no | ended | The response, streamed output included. Hash-only unless revealed. |
| `openai.response.system_fingerprint` | label | yes, inside `openai` | ended | The provider's marker for its serving configuration, where the response carries one. |

**Where the provider name comes from.** Where the framework gives only a base URL, the adapter maps its host, or any subdomain of it, by this table, and writes nothing for any other host: a gateway, a proxy or a self-hosted server names no provider.

| Host | `gen_ai.provider.name` |
|---|---|
| `openrouter.ai` | `openrouter` |
| `api.openai.com` | `openai` |
| `openai.azure.com` | `azure.ai.openai` |
| `api.anthropic.com` | `anthropic` |
| `aiplatform.googleapis.com`, and `<region>-aiplatform.googleapis.com` | `gcp.vertex_ai` |
| `generativelanguage.googleapis.com` | `gcp.gemini` |
| `api.mistral.ai` | `mistral_ai` |
| `api.groq.com` | `groq` |
| `api.deepseek.com` | `deepseek` |
| `api.x.ai` | `x_ai` |
| `api.perplexity.ai` | `perplexity` |
| `api.cohere.com`, `api.cohere.ai` | `cohere` |
| `bedrock.<region>.amazonaws.com`, `bedrock-runtime.<region>.amazonaws.com`, and their `-fips` forms | `aws.bedrock` |

Only an `http` or `https` URL is read. Where the framework names its provider directly with one of the values above, the adapter writes that value. This table is producer-side behaviour: no case here tests it.

Hashed content: the request on started; the response, streamed output included, or the error on ended. Examples: [`conformance/cases/valid/agent.model_call.started-every-field`](../conformance/cases/valid/agent.model_call.started-every-field), [`conformance/cases/valid/agent.model_call.ended-every-field`](../conformance/cases/valid/agent.model_call.ended-every-field).

### 5.4 Tool call: `agent.tool_call.started`, `agent.tool_call.ended`

Written before the tool runs, and when it returns or fails.

| Field | Type | Required | On | Meaning |
|---|---|---|---|---|
| `gen_ai.tool.call.id` | provider id | yes | both | The id the model gave this call. Where the framework has none, the adapter assigns one and writes it on both records: the start and the end carry one value (section 9.1). Free text is refused ([`conformance/cases/rules/tool-call-id-free-text`](../conformance/cases/rules/tool-call-id-free-text)). |
| `gen_ai.tool.name` | text | no | both | The tool's own name, never a run label. Hidable. The start and the end name one tool. |
| `gen_ai.tool.call.arguments` | any | no | started | Hash-only unless revealed. |
| `gen_ai.tool.call.result` | any | no | ended | Hash-only unless revealed. |

Hashed content: the arguments on started; the result or error on ended. Examples: [`conformance/cases/valid/agent.tool_call.started-every-field`](../conformance/cases/valid/agent.tool_call.started-every-field), [`conformance/cases/valid/agent.tool_call.ended-every-field`](../conformance/cases/valid/agent.tool_call.ended-every-field).

> **Why the call id is required and adapter-assigned where missing.** Some frameworks report a tool call with no id of its own. With the id optional, two concurrent calls to one tool in one step carry nothing that tells their ends apart.

### 5.5 Retrieval: `agent.retrieval.started`, `agent.retrieval.ended`

Written before the query, and after the documents return.

| Field | Type | Required | On | Meaning |
|---|---|---|---|---|
| `gen_ai.retrieval.query.text` | string | no | started | Hash-only unless revealed. |
| `gen_ai.retrieval.documents` | any | no | ended | Hash-only unless revealed. |
| `retrieval.document_count` | count | yes, inside `retrieval` | ended | How many documents came back. |

> **Why `retrieval.document_count` and not a `gen_ai.*` name.** OpenTelemetry 1.41.0 has no count attribute for retrieval. A name inside `gen_ai.*` that OpenTelemetry does not define would collide with whatever it defines later.

Hashed content: the query on started; the documents on ended. Examples: [`conformance/cases/valid/agent.retrieval.ended-every-field`](../conformance/cases/valid/agent.retrieval.ended-every-field).

### 5.6 Approval: `agent.approval.requested`, `agent.approval.resolved`

Written when an action waits for a human, a policy or a model, and when the answer arrives. The answer can arrive in a later invocation: a graph that interrupts to wait for a human ends its run, and the resume is a separate run on the same conversation (section 9.1).

| Field | Type | Required | On | Meaning |
|---|---|---|---|---|
| `approval.actor` | `human`, `policy` or `model` | yes | both | Who decides. The request and the answer name one decider. |
| `approval.policy_hash` | sha256 | no | both | The policy the decision runs under, by hash. Where both halves carry it, one value. |
| `approval.subject_event_id` | event id | yes | both | The `event_id` of the start of the operation the approval is about: a tool call's `agent.tool_call.started`, or the `agent.step.started` of the step that paused for the answer. The request and the answer name the same record. |
| `approval.action` | any | no | requested | The action under review. Hash-only unless revealed. |
| `approval.verdict` | `approved`, `rejected`, `edited` or `responded` | yes | resolved | The answer (below). |
| `approval.reviewer` | any | no | resolved | Who approved. Hash-only unless revealed. |
| `approval.notes` | any | no | resolved | The reviewer's notes. Hash-only unless revealed. |
| `approval.edited_action` | any | no | resolved | The action as edited. Hash-only unless revealed. |

**The verdicts.** `approved`: the action runs as asked. `edited`: it runs as `approval.edited_action` says. `rejected`: it does not run. `responded`: it does not run, and the person's text goes back to the model in place of the tool's result, as LangChain's `respond` does; the text is in the content's `response` ([`conformance/cases/rules/approval-responded`](../conformance/cases/rules/approval-responded), [`conformance/cases/rules/approval-verdict-respond`](../conformance/cases/rules/approval-verdict-respond)). **Ending the tool call.** Which end the adapter writes depends on where the answer arrives:

| The answer arrives | The tool call's start | After `rejected` or `responded` |
|---|---|---|
| In the invocation that holds the start | open | The adapter ends the start `skipped`, so it is not left open. |
| In a later invocation, after an interrupt and a resume | already ended `interrupted` at the interrupt | The adapter writes no end. The answer is the evidence: it names the start in `approval.subject_event_id`. |

An interrupt stops the tool call, and the resume starts any re-run as a new operation with new ids, so the old start is never ended in the new invocation ([`conformance/cases/refusal/rejected-in-a-later-run`](../conformance/cases/refusal/rejected-in-a-later-run)). A verifier that holds the answer beside a tool call end that is `completed` or `failed` shows the finding `ran_after_refusal` (step 7h, [`conformance/cases/refusal/completed-after-rejected`](../conformance/cases/refusal/completed-after-rejected), [`conformance/cases/refusal/skipped-after-responded`](../conformance/cases/refusal/skipped-after-responded)).

**What the adapter keeps across a resume.** The adapter that writes `agent.approval.requested` stores that record's `event_id` and its `approval.subject_event_id` with the conversation (LangGraph's thread, a flow's state), and the adapter that resumes the conversation reads them back and writes them on `agent.approval.resolved` as `run.started_event_id` and `approval.subject_event_id`. Where it cannot, it writes `run.started_event_id` `null` and names `agent.approval.requested` in its cannot-capture list (section 4.8).

Hashed content. On requested: the action under review, as the framework handed it over (a graph's interrupt value, a policy engine's request). On resolved, the fixed object `{"edited_action", "notes", "response", "reviewer"}`: `response` is the answer as the framework or the policy engine handed it over (a graph's resume value), and the other three are what the adapter was handed about who answered and how, so `approval.reviewer` is committed by the content hash. Examples: [`conformance/cases/valid/agent.approval.resolved-every-field`](../conformance/cases/valid/agent.approval.resolved-every-field), [`conformance/cases/disclosure/approver-revealed`](../conformance/cases/disclosure/approver-revealed), [`conformance/cases/pairing/approval-resolved-in-a-later-run`](../conformance/cases/pairing/approval-resolved-in-a-later-run).

### 5.7 Hand-off: `agent.handoff.sent`, `agent.handoff.received`

One agent sends a message to another; each side signs its own record (section 8.1).

| Field | Type | Required | On | Meaning |
|---|---|---|---|---|
| `handoff.parts` | count | yes | both | How many parts the message has: the members of its top-level `parts` array, 0 for a message with none. |
| `handoff.file_parts` | count | yes | both | How many of those carry a file: a part with `kind: "file"`, or an A2A part whose `raw` or `url` member is present and not `null`. At most `handoff.parts` ([`conformance/cases/handoff/file-parts-exceed-parts`](../conformance/cases/handoff/file-parts-exceed-parts)). |
| `handoff.sent_event_id` | event id | no | received | The `event_id` of the sender's `agent.handoff.sent` record, where the receiver held it. A link for verifiers, never a pairing key (section 8.1). |
| `handoff.unchecked_held_parts` | list of counts | no | received | The positions of the parts the receiver held bytes for and did not check (section 8.1). |

The message hash, protocol and the receiver's outcome are in `event` and `context` (sections 4.2 and 4.3). The operation that sent the message, or received it, is `run.parent_run_id`: the run id of that operation's start and end records. The receiver does not restate the sender's parts: `event.message_hash` commits to the message as held, parts included, and the record carries only the counts and the positions it did not check. The two records of one message carry the same counts (section 8.1). Hashed content: none beyond `event.message_hash`, which commits to the JCS bytes of the message, as sent or as held. Examples: [`conformance/cases/valid/agent.handoff.sent-every-field`](../conformance/cases/valid/agent.handoff.sent-every-field), [`conformance/cases/valid/agent.handoff.received-every-field`](../conformance/cases/valid/agent.handoff.received-every-field).

### 5.8 Decision: `agent.decision`

Written when the agent states a business outcome.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `decision.name` | label | yes | What was decided, as a name the builder chose: `loan_verdict`. |
| `decision.value` | any | no | The decision's value. Hash-only unless revealed. |

**Naming a decision.** The name says what was decided, and the value holds the result: `decision.name` `loan_verdict` with `decision.value` `"declined"`, never `loan_declined` with no value. A name that holds the result puts the result in clear wherever names travel (`standard`, section 7), where a value stays hash-only below `full`. A name is a short code the builder fixes in advance, one per question the agent answers, never text built from the case.

Hashed content: the fixed object `{"name", "value"}`, as the builder handed them to the SDK. Example: [`conformance/cases/valid/agent.decision-required-only`](../conformance/cases/valid/agent.decision-required-only).

### 5.9 File: `agent.file`

Written when a tool produces or reads a file. One record per file. `outcome.status` is `completed` when the adapter hashed the file, and `failed` when it could not, with `artifact.reason` saying why. It takes no other value: a file is hashed or it is not, so `interrupted` and `skipped`, which describe an operation, read `bad_value` here ([`conformance/cases/rules/file-skipped`](../conformance/cases/rules/file-skipped), [`conformance/cases/rules/file-interrupted`](../conformance/cases/rules/file-interrupted)).

| Field | Type | Required | Meaning |
|---|---|---|---|
| `artifact.name` | text | no | The file's name. Hidable. |
| `artifact.tool_call_event_id` | event id | no | The `event_id` of the `agent.tool_call.started` record of the call that produced or read the file. Absent for a file recorded outside a tool call. |
| `artifact.byte_length` | count | no | Its size: the file record's content length, so Sanning receives it only in `full` (section 7). |
| `artifact.content_type` | label | no | Its media type. |
| `artifact.role` | `input` or `output` | no | As the tool stated it, never inferred. |
| `artifact.reason` | `outside_root`, `not_found`, `not_a_regular_file`, `too_large`, `read_failed` or `path_reading_disabled` | when failed | Why the file could not be hashed. Present if and only if `outcome.status` is `failed`. |
| `artifact.path` | locator | no | Where the file was. Hidable. Sanning receives it only in `full`. |
| `artifact.source` | locator | no | Where an input came from, in the tool's words. Hidable. Sanning receives it only in `full`. |
| `artifact.destination` | locator | no | Where an output went, in the tool's words. Hidable. Sanning receives it only in `full`. |

Hashed content: the file's own bytes, so `sha256sum` of the file is `event.content_hash`. A file that could not be read has the JCS bytes of `{}`. A verifier links a file to its tool call by `artifact.tool_call_event_id`, never by a name. Examples: [`conformance/cases/valid/agent.file-required-only`](../conformance/cases/valid/agent.file-required-only), [`conformance/cases/rules/file-failed-without-reason`](../conformance/cases/rules/file-failed-without-reason).

> **Why the path is hidable and not hash-only.** A path routinely encodes a customer, a tenant or a case name, and a signed record cannot be redacted. A file's content is its bytes, so nothing in the content hash could commit to a hash-only path: it would be committed nowhere. So the path, the source and the destination stay in the record in clear, Sanning receives them only in `full` (section 7), and each can be hidden with the per-field control of section 6, which keeps its hash in `context.hidden` so a verifier handed the path can confirm it.

### 5.10 Error: `agent.error`

Written for an error outside any operation, such as a callback that failed. An error that ends an operation is that operation's `.ended` record with `outcome.status` `failed`. A failure the framework handles inside an operation, such as a failed attempt a retry follows, is an `agent.step.occurred` (section 5.2).

| Field | Type | Required | Meaning |
|---|---|---|---|
| `error.type` | label | yes | The class of error. |
| `exception.message` | string | no | The message. Hash-only unless revealed. |

Hashed content: the fixed object `{"message", "type"}`, with `type` equal to `error.type`. Example: [`conformance/cases/valid/agent.error-every-field`](../conformance/cases/valid/agent.error-every-field).

### 5.11 Custom: `agent.custom`

Written for an event the customer named, even when an adapter relays it: LangChain's `dispatch_custom_event`, Pydantic AI's `CustomEvent`, a custom `WorkflowEvent` in Microsoft Agent Framework. It is shaped like `agent.decision`. A framework's own event is not a custom record: a moment the framework reports is an `agent.step.occurred` (section 5.2), and a tool call is an `agent.tool_call.*` pair, never a custom record named `tool_call`.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `custom.name` | a dotted name of 1 to 64 characters (below) | yes | What the record is, as the customer named it: `order.flagged`. Cannot be hidden ([`conformance/cases/rules/custom-name-upper-case`](../conformance/cases/rules/custom-name-upper-case), [`conformance/cases/rules/custom-name-too-long`](../conformance/cases/rules/custom-name-too-long), [`conformance/cases/rules/custom-name-free-text`](../conformance/cases/rules/custom-name-free-text), [`conformance/cases/disclosure/custom-name-not-hidable`](../conformance/cases/disclosure/custom-name-not-hidable)). |
| `custom.value` | any | no | The event's value. Hash-only unless revealed ([`conformance/cases/disclosure/custom-value-revealed`](../conformance/cases/disclosure/custom-value-revealed), [`conformance/cases/disclosure/custom-value-not-listed`](../conformance/cases/disclosure/custom-value-not-listed)). |

**A custom name** is one or more segments joined by `.`. A segment is a letter `a-z` followed by any number of `a-z`, `0-9` and `_`. The whole name is 1 to 64 characters. The schema states it as the pattern `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$` with `maxLength` 64. `order.flagged`, `flagged` and `a` are names ([`conformance/cases/rules/custom-name-one-segment`](../conformance/cases/rules/custom-name-one-segment), [`conformance/cases/rules/custom-name-64-characters-dotted`](../conformance/cases/rules/custom-name-64-characters-dotted)). A name with an empty segment, a segment that starts with a digit or an underscore, or a character outside `a-z 0-9 _ .` reads `failed`, `bad_value`, at `/metadata/custom/name`: `1..`, `order..flagged`, `order.`, `order.2fa_passed` and `order.flag-raised` are not names ([`conformance/cases/rules/custom-name-digit-dot-dot`](../conformance/cases/rules/custom-name-digit-dot-dot), [`conformance/cases/rules/custom-name-empty-segment`](../conformance/cases/rules/custom-name-empty-segment), [`conformance/cases/rules/custom-name-segment-leading-digit`](../conformance/cases/rules/custom-name-segment-leading-digit), [`conformance/cases/rules/custom-name-hyphen`](../conformance/cases/rules/custom-name-hyphen)).

The naming rule of section 5.8 holds: the name says what happened, and the value holds what it was. A verifier checks the shape of a custom record and nothing it says.

Hashed content: the fixed object `{"name", "value"}`, as the adapter handed them to the SDK. Examples: [`conformance/cases/valid/agent.custom-required-only`](../conformance/cases/valid/agent.custom-required-only), [`conformance/cases/valid/agent.custom-every-field`](../conformance/cases/valid/agent.custom-every-field).

## 6. Hidden and revealed fields

A record has three kinds of field: clear fields, which it shows; hash-only fields, which it commits to through `event.content_hash` and does not show; and ids, which are always clear. Two controls move one field across that line, and each is listed inside the signed record, so a verifier can tell a withheld field from a missing one.

**Reveal a field.** A hash-only field carried in clear, for example tool arguments for an auditor. The field appears under its own name and its path is listed in `context.revealed`. A field in clear that is not listed reads `failed`, `revealed_field_unlisted`; a listed field that is absent reads `failed`, `revealed_field_absent`. A revealed field written as `null` is present (section 4.1). Example: [`conformance/cases/disclosure/revealed-field-listed`](../conformance/cases/disclosure/revealed-field-listed).

**Hide a field.** A clear field withheld, for example a tool name. The field is absent and `context.hidden` maps its path to SHA-256 of the JCS bytes of its value. A hidden field that is also present reads `failed`, `hidden_field_present`. Example: [`conformance/cases/disclosure/hidden-field-listed`](../conformance/cases/disclosure/hidden-field-listed). A value JCS cannot encode (a string holding a lone surrogate, an integer outside ±(2^53 − 1)) has no JCS bytes and commits to nothing: no hidden hash matches it, so where step 7a compares a field one half of a pair holds such a value in clear and the other half hides, the pair reads `pair_field_mismatch` at that field, and two halves that hold the same such value in clear agree ([`conformance/cases/pairing/tool-call-hidden-name-not-encodable`](../conformance/cases/pairing/tool-call-hidden-name-not-encodable), [`conformance/cases/pairing/tool-call-name-not-encodable-in-both-halves`](../conformance/cases/pairing/tool-call-name-not-encodable-in-both-halves)).

The fields a type can reveal or hide are fixed by its schema, and each is marked in section 5 as hash-only or hidable. Ids are never hidden ([`conformance/cases/disclosure/hidden-path-not-hidable`](../conformance/cases/disclosure/hidden-path-not-hidable)). An SDK option that drops names, such as `recordNames: false`, hides `run.name` and `gen_ai.tool.name`.

> **Why a hidden field keeps a hash and not nothing.** With a hash, the agent can later disclose the one value, and a verifier can confirm it without the whole content. The cost is that a guessable value can be confirmed by a guess (section 1). A field left out with no hash would make a withheld name and a name the adapter never knew read the same.

## 7. The data modes

The data mode decides only what Sanning receives. The signed record and the evidence pack are the same in every mode, and verification reads every mode the same way. One invocation has one mode: a verifier that holds two records of one invocation in two modes, both signed by one key, shows the finding `data_mode_mixed` ([`conformance/cases/data-mode/mixed-in-one-invocation`](../conformance/cases/data-mode/mixed-in-one-invocation)). An invocation is one key's: a record another key signed under the same `run.root_run_id` is not compared ([`conformance/cases/data-mode/two-modes-under-two-keys`](../conformance/cases/data-mode/two-modes-under-two-keys)). The SDK sends Sanning the fields below beside each envelope. How they travel is outside this vocabulary.

Every field of the record is in exactly one row, and `npm test` fails if a field of any schema is missing from its row or named in another. A mode receives its own row and every row above it.

| Least mode | Fields Sanning receives |
|---|---|
| `private` (the default) | The envelope. The record core: `payload_version`, `spec_version`, `event_type`, `subject.type`, `subject.agent_id`, `previous_hash`. Every id: `run.run_id`, `run.parent_run_id`, `run.root_run_id`, `run.seq`, `run.prev_event_id`, `run.started_event_id`, `run.runner_event_id`, `run.handoff_event_id`, `context.case_id`, `context.chain_key`, `gen_ai.conversation.id`, `gen_ai.tool.call.id`, `gen_ai.response.id`, `approval.subject_event_id`, `closing.record_ids`, `handoff.sent_event_id`, `artifact.tool_call_event_id`, and all of `otel.*`. When: `run.observed_started_at`. The outcome: `outcome.status`, `closing.outcome.observed.status`, `closing.outcome.stated.status`, `closing.outcome.observed.reason`, `closing.outcome.stated.reason`, `event.outcome`, `closing.promised`, `closing.record_count`. How to read it: `context.data_mode`, `context.content_scrubbed`, `capture.not_captured`, `extras.event_schema`. |
| `standard` | Every other clear field that is a fixed format or a name. Who and what: `subject.name`, `gen_ai.agent.version`, `run.name`, `run.source_type`, `run.client`, `run.plumbing`, `gen_ai.operation.name`, `gen_ai.tool.name`, `gen_ai.prompt.name`. The model call: `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.request.temperature`, `gen_ai.request.max_tokens`, `gen_ai.request.seed`, `gen_ai.request.top_p`, `gen_ai.response.model`, `gen_ai.response.finish_reasons`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.usage.reasoning.output_tokens`, `openai.response.system_fingerprint`. Retrieval: `retrieval.document_count`. Approval: `approval.actor`, `approval.verdict`, `approval.policy_hash`. Names: `decision.name`, `custom.name`, `error.type`. Authority: `authority.scope`, `authority.expires_at`. The file: `artifact.name`, `artifact.content_type`, `artifact.role`, `artifact.reason`. The hand-off: `handoff.parts`, `handoff.file_parts`, `handoff.unchecked_held_parts`, `event.content_type`, `event.counterparty_public_key`, `event.sequence`, `context.protocol`, `context.unchecked_held_part_count`. How to read it: `context.revealed`. |
| `full` | The salt, `context.salt`. Every hash and every length of customer content: `event.content_hash`, `event.content_length`, `event.message_hash`, `event.message_bytes_hash`, `context.in_reply_to`, `context.hidden`, `artifact.byte_length`. The locators: `event.ref`, `artifact.path`, `artifact.source`, `artifact.destination`. Every hash-only field, when revealed: `gen_ai.input.messages`, `gen_ai.system_instructions`, `gen_ai.output.messages`, `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result`, `gen_ai.retrieval.query.text`, `gen_ai.retrieval.documents`, `approval.action`, `approval.reviewer`, `approval.notes`, `approval.edited_action`, `authority.principal`, `exception.message`, `decision.value`, `custom.value`. And the content, as a separate object. |

**The default mode is `private`.** An SDK writes `private` unless the caller chooses another mode. `standard` and `full` are defined so that a record reads the same whichever modes a service offers; Sanning's service does not offer them today.

Of what Sanning receives in `private`, every field of the record has a fixed format: an id, an event id, a hex hash of a record, a package name, a semantic version, a timestamp, an integer or a closed list of words. The envelope is not part of the record, and two of its fields are set by the caller; Sanning receives both in every mode:

| Envelope field | What the SDK writes | What a caller can write |
|---|---|---|
| `payload_ref` | an opaque locator: a scheme and a hash (`events.md` section 2) | any URI of up to 2048 characters, signed as given, which can encode a customer or a path |
| `signed_at` | a time to the millisecond | a fraction of a second of any length |

Every field `standard` adds is a fixed format, a number, a key, the policy hash, or a name: a label, a text or a custom name, at most 256 characters with no control characters. `npm test` fails if a schema lets free text into either row, or puts the salt, a hash or a length of content in either. Each mode case carries a `sent.json`, the fields of its record that Sanning receives in that mode ([`conformance/cases/data-mode/private`](../conformance/cases/data-mode/private), [`conformance/cases/data-mode/standard`](../conformance/cases/data-mode/standard), [`conformance/cases/data-mode/full`](../conformance/cases/data-mode/full), [`conformance/cases/data-mode/standard-file`](../conformance/cases/data-mode/standard-file), [`conformance/cases/data-mode/full-file`](../conformance/cases/data-mode/full-file)).

`standard` withholds every hash of customer content, because a guess can confirm a hash of a short value, and every length of it, because a length can confirm a value with no guess: `{"name":"credit_approved","value":true}` is 39 bytes and the same with `false` is 40. It withholds the locators, because a path routinely encodes a customer. It sends `approval.policy_hash`, which is the hash of the deployer's policy, not of customer content, and `previous_hash`, which is the previous record's `payload_hash` that Sanning already holds in that record's envelope. Token counts and the retrieval document count are sizes too, and `standard` sends them.

**Why the salt.** Below `full`, Sanning stores each record's envelope and the fields its mode sends, never the whole record. The envelope carries `payload_hash`, SHA-256 of the JCS bytes of the whole record. Without a salt, the fields it does not receive are often short or guessable (a tool's arguments, a decision's value). So Sanning could rebuild the record from a guess, hash it, and compare the result with `payload_hash`. The salt puts 128 random bits into the record, and Sanning never receives them below `full`, so no guess can be confirmed.

- **Who can make that guess:** Sanning, and anyone who breaches Sanning's envelope store or compels Sanning to hand it over. The envelopes are not public: only each interval's Merkle root is anchored on the permanent public record.
- **Who gains nothing from it:** a party that holds a pack. It already holds the records, salts included.
- **Which records:** every record, not only `agent.*` records, because a plain `event` record is open to the same guess (section 4.3).
- **What it does not cover:** a hidden field's hash in `context.hidden` stays unsalted, so the two halves of an operation can be compared (section 9.1). Sanning receives it only in `full`, and a party that holds the record can confirm a guess against it (section 1).

**What Sanning can still learn below `full`.** The mode limits the fields Sanning receives. It does not hide how records connect. In `private`, Sanning receives these fields that link records, and so does anyone who breaches Sanning's envelope store or compels Sanning to hand it over:

- **Ids that point at other records:** the `run.*` ids in the `private` row, `approval.subject_event_id`, `handoff.sent_event_id`, `artifact.tool_call_event_id` and `closing.record_ids`.
- **`context.case_id`,** the same on every record of one case.
- **`gen_ai.conversation.id`,** the same on every invocation of one conversation, a resume included.
- **Record types and `outcome.status`:** what each record is, and how each operation ended.
- **Envelope timing and keys:** when each record was signed (`signed_at`), and which key signed it.

From these fields, records that follow this vocabulary let Sanning infer at most the following:

- **Which records belong together.** Where records share a `run.root_run_id`, a `gen_ai.conversation.id` or a `context.case_id`, Sanning can tell they belong to one invocation, one conversation or one case.
- **Who handed off to whom.** Where both sides of a hand-off anchor with Sanning, Sanning can tell which key sent a message to which, through `handoff.sent_event_id` or through a `context.case_id` both sides write, though `private` withholds `event.counterparty_public_key`. Sanning knows which customer owns each key, so this can show that two customers do business.
- **Whether more records followed an approval's answer.** When an answer arrives, in the invocation that asked or in a later invocation of the same conversation, Sanning can see whether more records follow it and how each ended, which for some agent designs shows whether the action under review was refused. For other designs the records look the same whichever way the answer went, so this is never a verdict, and version 1 draws no finding from it (section 10, step 7h).
- **How long an operation took.** Where an operation's start and end are both sent, the gap between their `signed_at` values approximates how long it took, and for a model call, roughly how much the model wrote.

**What Sanning cannot infer.** In `private`, Sanning never receives `approval.verdict`, any content, or the names and values in the `standard` and `full` rows. So it cannot read an approval's verdict, what an agent read or wrote, or which tool or model it used, unless an id spells it (section 1).

**A hand-off's message in another mode.** The two sides of a hand-off choose their modes separately and hold the same message. Where either side sends `full`, Sanning receives that side's record and the message, whatever mode the other side chose.

> **Why the content is a separate object.** The record commits to the content by `event.content_hash` and names no storage, so the content object can be encrypted under a key the customer holds without changing a byte of the record. Content inside the record would be under the signature, and permanent.

## 8. Hand-offs and links

### 8.1 Hand-offs

Two agents exchange a message, and each side records what it held: the sender writes `agent.handoff.sent` and the receiver writes `agent.handoff.received`. A reader that holds both can tell whether what the receiver acted on is exactly what the sender produced. Section 8.2 says what `event.message_hash` commits to and how a receiver checks the parts of a message. Section 8.3 says how a reader pairs the two records and grades the pair. A pair forms only from one `agent.handoff.sent` and one `agent.handoff.received`.

Each record also carries:

- its place in a run: `run.run_id`, `run.root_run_id`, `run.seq`;
- on `agent.handoff.sent`, the operation that sent the message, in `run.parent_run_id`;
- on `agent.handoff.received`, the sender's record, in `handoff.sent_event_id`, where the receiver held it;
- on the receiving agent's `agent.run_opened`, the `agent.handoff.received` record that started it, in `run.handoff_event_id`;
- the count of parts the receiver held and did not check, in `context.unchecked_held_part_count`, required when it is not zero.

`handoff.sent_event_id` and `run.handoff_event_id` are optional in the record format. A producer that writes them gives a verifier a shortcut to the sender's record and to the invocation the message started; pairing does not need them, because it is by keys. Leaving them out does not hide which key handed off to which from Sanning when both sides write the same `context.case_id` (section 7). `handoff.sent_event_id` is what the receiving record says about its counterpart, so it is never a condition of pairing: section 8.3 forms a pair from the signing keys alone, and a verifier that paired on this field would let the receiving side choose its own counterpart. A verifier uses it to find the sender's record, then pairs by section 8.3.

**Which parts are counted.** A part the receiver held bytes for and did not check, which section 8.2 reads `part_unchecked` or `part_malformed_descriptor`, and a `url` part whose file the receiver held. A `url` part is a part with no `kind: "file"` whose `url` member is present and not `null`; section 8.2 reads it `part_not_a_file` and refuses bytes supplied for it as `bytes_for_unknown_part`. The message commits the URL and not the file, so the file behind it is held and not checked. `handoff.unchecked_held_parts` lists the positions, and `context.unchecked_held_part_count` is the length of that list. The list and the count are present together or absent together ([`conformance/cases/handoff/unchecked-parts-count-missing`](../conformance/cases/handoff/unchecked-parts-count-missing), [`conformance/cases/handoff/unchecked-parts-count-without-list`](../conformance/cases/handoff/unchecked-parts-count-without-list)), and the count is at most `handoff.file_parts` ([`conformance/cases/handoff/unchecked-parts-exceed-file-parts`](../conformance/cases/handoff/unchecked-parts-exceed-file-parts)). Examples: [`conformance/cases/handoff/unchecked-parts-counted`](../conformance/cases/handoff/unchecked-parts-counted), [`conformance/cases/handoff/url-part-held-and-counted`](../conformance/cases/handoff/url-part-held-and-counted).

**The two records of one message agree on its parts.** Where a verifier holds an `agent.handoff.sent` and an `agent.handoff.received` that are candidates for each other (each record's envelope key is the key the other names in `event.counterparty_public_key`), and whose `event.message_hash` values are equal, compared case-insensitively ([`conformance/cases/handoff/pair-hash-in-upper-case`](../conformance/cases/handoff/pair-hash-in-upper-case)), the two records commit to one message object. Their `handoff.parts` and their `handoff.file_parts` are then equal, or each record shows the finding `handoff_parts_mismatch` and keeps its verdict ([`conformance/cases/handoff/pair-parts-disagree`](../conformance/cases/handoff/pair-parts-disagree), [`conformance/cases/handoff/pair-parts-disagree-sender-side`](../conformance/cases/handoff/pair-parts-disagree-sender-side), [`conformance/cases/handoff/pair-one-of-two-counterparts-disagrees`](../conformance/cases/handoff/pair-one-of-two-counterparts-disagrees)). A candidate with another `message_hash` is another message, or a failure section 8.3 already names, and its counts are not compared ([`conformance/cases/handoff/pair-other-message-not-compared`](../conformance/cases/handoff/pair-other-message-not-compared)). Two records that are not candidates for each other are not compared either, read from either side ([`conformance/cases/handoff/pair-receiver-names-another-sender`](../conformance/cases/handoff/pair-receiver-names-another-sender), [`conformance/cases/handoff/pair-receiver-names-another-sender-read-from-receiver`](../conformance/cases/handoff/pair-receiver-names-another-sender-read-from-receiver)): section 8.3 forms a pair from one side's naming and grades the other's (`counterparty_named`), and this check reads both, so a received record that names a third key reads the same from both records. Section 8.3 still fails that pair.

**Why a finding and not a verdict.** The two records are signed by two keys, and the two counts cannot say which side miscounted. A verdict would let either side make the other's honest record read `failed` by writing a wrong count on its own. The counts are not one of the checks section 8.3 makes on a formed pair: `event.message_hash` already binds both records to one message, parts included, and section 8.3 grades that hash. So the rule stands as two: the checks on a formed pair hold as section 8.3 states them, and any deviation in them is a failure of the pair; the part counts, which section 8.3 does not read, are a finding on each record and move neither record's verdict nor the pair's.

Only the receiver knows which bytes it held. A receiver that omits both the list and the count, and writes the sender's counts, writes a record that reads like one with nothing unchecked. The SDK is where the count is enforced, and a verifier reads what the records say.

### 8.2 The message and its parts

`event.message_hash` is SHA-256 over the JCS (RFC 8785) bytes of the message object. It is canonical rather than raw, so a transport that parses and re-serializes JSON does not fail an honest hand-off. A file travels in a message as a file part, committed by its own hash inside that object, so a hand-off is not limited to JSON.

**Where the parts are.** The parts of a message are the members of the message object's top-level `parts` array, in order. A message with no `parts` member, or with `"parts": null`, has no parts. A `parts` value that is present, not `null` and not an array gives the result `parts_not_an_array`, and nothing in it is checked.

**What a file part is.** A file part is an object in `parts` whose `kind` is exactly `"file"`. A part of any other kind is ordinary JSON content, committed by the message like every other value. Whether a file part is inline is decided first: a file part that carries a value other than `null` under `bytes` is *inline*, whatever else it carries ("Inline parts", later in this section). Any other file part is a *descriptor*: its bytes are not in the message, and it carries these two members:

| Member | Type | Meaning |
|---|---|---|
| `content_hash` | 64 hex characters, either case | SHA-256 of the part's exact bytes. Compared with case ignored. |
| `content_length` | integer from 0 to 2^53 - 1 | The byte count. It is compared too: both values are committed, so both are checked. |

A descriptor without a `content_hash` and a `content_length` of that form reads `part_malformed_descriptor`. It is never checked, and it is the sender's defect, not the receiver's.

**A receiver handed a descriptor's bytes MUST hash them.** Where the SHA-256 of the bytes it holds is not the part's `content_hash`, or their count is not its `content_length`, the part reads `part_mismatched`. The receiver then writes `agent.handoff.received` committing to the message as it held it: that part's `content_hash` and `content_length` replaced by the values of the bytes it held, nothing else changed, and `event.outcome` `rejected`. Its `message_hash` then differs from the sender's, and the pair fails on `message_hash` (section 8.3). The reason: a transport that keeps a part's description and swaps its bytes leaves both sides committing to one message object, so without this rule the pair verifies and nothing names the swap. The difference belongs inside the one value both sides sign, where a reader of the sender's records sees it too.

**A receiver that never holds a descriptor's bytes checks nothing.** It substitutes nothing and reports the part `part_unchecked`. A reader MUST NOT treat an unchecked part as checked, and a surface that reports a hand-off over a message with file parts states how many of them were checked.

**Base64 and hex.** The readings of inline content and the result `part_encoding_mismatch` read a string as base64 or as hex under these rules and no others:

- **Base64** is a non-empty string in the standard alphabet (`A-Z a-z 0-9 + /`) or in the URL-safe alphabet (`A-Z a-z 0-9 - _`), never the two mixed in one string. Any other character, whitespace and line breaks included, means the string has no base64 decoding. Padding is optional. Where present it is one or two `=` at the end, and it makes the length a multiple of 4. A string with a lone character after its last full group of four, or with unused low bits in its last character that are not zero, has no decoding.
- **Hex** is a non-empty string of an even number of characters, each of `0-9 a-f A-F`.
- **The respellings of a byte string** are its base64 encoding in either alphabet, padded and unpadded, and its hex encoding in lower and in upper case.

So `aGVsbG8=` and `aGVsbG8` both decode to the bytes of `hello`, and so does the hex `68656C6C6F`. `aGVs` and `bG8=` with a line break between them, `aGVsbG9=` (non-zero unused bits) and `+_8=` (two alphabets) have no base64 decoding, and `68656c6c6f0` (odd length) has no hex decoding.

**Inline parts.** `bytes` is the only member read for inline content, and `"bytes": null` is an absent member. An inline part is committed by the message itself: changing its content changes `message_hash`. Nothing is hashed against it or substituted. Bytes supplied for an inline part are refused as `bytes_for_unknown_part`, naming the part; the part keeps its result, and it is not a part the receiver held and did not check. Where the part carries a `content_hash` or a `content_length` of the form the descriptor table gives, the receiver checks each against the inline content, read three ways: the raw UTF-8 of the string, its base64 decoding and its hex decoding. One reading has to satisfy every claim present, because a hash that agrees under one reading beside a length that agrees under another describes no bytes that exist. Where one reading satisfies every claim present, or no claim is present, the part reads `part_inline_bytes`. Where no reading satisfies them all, it reads `part_inline_mismatched`. A `bytes` value that is not a string has no reading, so a claim beside it disagrees with it. A claim that is absent, or not of the table's form, is not compared.

**Known limit.** A `content_length` beside inline content that is not an integer from 0 to 2^53 - 1, such as the string `"36"`, is not a claim, so it is not compared, and the part reads `part_inline_bytes` with nothing named. A descriptor that also carries a `content` or `data` member meaning something else is a descriptor, checked against supplied bytes: the only member read for inline content is `bytes`. On a descriptor, a `content_length` out of that range reads `part_malformed_descriptor`.

**Parts that are not file parts.** A part with no `kind: "file"` reads `part_not_a_file` and is committed as ordinary JSON content. That includes every part of an A2A 1.0.0 message, which has no `kind` member:

- a `raw` part carries its bytes inside the message, so `message_hash` covers them;
- a `url` part, whose `url` member is present and not `null`, commits the URL and not the file behind it, so a changed file is not caught;
- a `data` part is ordinary JSON content.

Bytes supplied for a part that is not a file part are refused as `bytes_for_unknown_part`, naming that part. To commit the file itself, an integrator writes the part as a file part.

**A refusal is scoped to the supply it is about.** A refused supply for a descriptor leaves it `part_unchecked`, never substituted. A refused supply for a `url` part, an inline part or a malformed descriptor leaves that part's own result: `part_not_a_file`, `part_inline_bytes` or `part_inline_mismatched`, or `part_malformed_descriptor`. Every other part reads on its own terms, every other substitution applies, and the receiver still commits to the message as it held it. A refusal that dropped the whole reading would let a sender, or any part the rule cannot check, erase a real swap in another part. A refusal is about the whole message only where bytes are supplied for an index that is no part of the message; it still gives a named result, and the record is still written.

A receiver reports one result per part, in the order of `parts`, and any message-level result. It reports refusals in a fixed order: by name, in the order the following table lists them, then by the part each names, a refusal that names no part first, then by the position of the supplied entry it is about. The following table lists the results:

| Name | Where | What it means |
|---|---|---|
| `part_matched` | a part | Bytes were supplied, and their SHA-256 and count are the part's `content_hash` and `content_length`. |
| `part_mismatched` | a part | Bytes were supplied and miss the part's `content_hash` or `content_length`, and no decoding or respelling of them explains it. The receiver commits to the message as it held it. |
| `part_unchecked` | a part | A descriptor whose bytes were not supplied, or whose supply was refused as `conflicting_part_bytes` or `part_encoding_mismatch`. Not checked, and not clean. |
| `part_inline_bytes` | a part | An inline part, committed by the message itself. |
| `part_inline_mismatched` | a part | An inline part whose `content_hash` or `content_length` no single reading of its content satisfies. |
| `part_malformed_descriptor` | a part | A descriptor without a conformant `content_hash` and `content_length`. |
| `part_not_a_file` | a part | Any other part. |
| `bytes_for_unknown_part` | refusal | Bytes were supplied for no part of the message, or for a part this rule cannot check. It names the part where one exists, and otherwise the position of the supplied entry. |
| `conflicting_part_bytes` | refusal | Two different byte strings were supplied for one part. A receiver that holds two answers has not established which one it held. The same bytes supplied twice are one supply, the note `part_supplied_twice`, and checked normally. |
| `part_encoding_mismatch` | refusal | The supplied bytes miss the part, and a base64 or hex decoding of them, or a respelling of them, as "Base64 and hex" defines, hashes to it. This is a coding defect in the receiver, not a change by the sender, so it is never written as a mismatch. |
| `parts_not_an_array` | the message | The message carries a `parts` value that is present, not `null` and not an array. |

**Which parts the receiver held and did not check.** A part is held and not checked where the receiver held bytes for it and the message does not commit its content: a `part_unchecked` part whose supply was refused, a `part_malformed_descriptor` part, and a `url` part whose file the receiver held. These are the positions `handoff.unchecked_held_parts` lists (section 8.1). A `part_inline_bytes`, `part_inline_mismatched` or other `part_not_a_file` part carries its content inside the message, so bytes held beside it hide nothing, and it is not listed.

**What a refusal can hide.** A changed copy of a part supplied alone reads `part_mismatched`, and the pair fails. The same copy supplied beside the true one is refused as `conflicting_part_bytes`, never substituted, and the pair verifies; `part_encoding_mismatch` behaves the same way. Both refusals are correct, because the receiver has established nothing. So `event.outcome` `accepted` says what the receiving agent did with the message, and a caller that decides it from "nothing was substituted" alone calls a part clean that it never checked. `context.unchecked_held_part_count` is how the record says so.

**What hashing the bytes does not establish.** A receiver always chooses what its own record commits to, so a receiver that wants to accuse an honest sender can write a `message_hash` of its own making. Hashing the bytes changes only what an honest receiver does. A rejection from a receiver that lies and one from a receiver that hashed the bytes it held look alike to a reader of the receiver's record alone.

### 8.3 Pairing a hand-off

A *hand-off reader* reads the hand-off records a verifier holds, pairs them, and grades each pair. These rules decide which records pair and how a pair reads. Throughout, the party being audited writes every value inside its own records, so no value a record states about itself decides whether that record is read or which record it pairs with.

**Every record gets a reading.** A hand-off reader returns one reading per record it holds, in the order it was given them, and MUST NOT leave a record out. A surface can group the readings for display, and MUST NOT drop them from the reading it computes. Each record a hand-off reader is handed carries a *reference*, an identifier its caller assigns, and a reading names each record and each candidate by its reference.

**A key is compared as a key.** Wherever this section says "the same key", a reader compares the 32 key bytes: it decodes each key, or lowers it to lowercase hex, and compares that. A value that is not 64 hex characters names no key, and no whitespace is stripped from it. A record a reader holds whose own envelope key names no key reads `incomplete`, with the finding `malformed_record`: a rule under which such a key matched nothing would let the record drop out of the reading in silence. Where either side of a "same key" comparison names no key, a reader MUST NOT read the two as two parties.

**Which records a hand-off reader governs.** A record is a hand-off record for this section where either holds:

- its `event` carries `counterparty_public_key`, whatever its `event_type` says;
- its `event_type` is a string whose folded form has `handoff` as one of its `.`-separated segments. The fold removes ASCII whitespace from each end, lowers ASCII upper case, and reads `-` and `_` as `.`. So `HANDOFF.RECEIVED`, `handoff.received ` with a trailing space, `sanning.handoff.received`, `handoff-received` and `handoff.ack` are governed, and `asset_missing` and `handoffs.received` are not.

The field test comes first because it does not turn on a name, and a test on a name alone lets the next spelling walk around it. The test does not read `spec_version`, so a record of another profile, or with no `spec_version`, that carries `event.counterparty_public_key` is governed. Three readings follow from this test, before any pairing:

- a governed record whose type is not exactly `agent.handoff.sent` or `agent.handoff.received`, or whose envelope key names no key (as "A key is compared as a key" defines), reads `incomplete`, with the finding `malformed_record`;
- an `agent.handoff.*` record that is wrong (a field of section 4.2 other than `event.message_bytes_hash` is missing or not of the form it states, or section 10 reads the record `failed`, which covers a `message_bytes_hash` of the wrong form) reads `failed` with no failed check, and the finding `nonconforming_record`. It is a producer's defect and no proof of alteration;
- a record that is not governed reads with the finding `not_a_handoff_record` and no verdict.

Where a record is both `malformed_record` and `nonconforming_record`, the reading reports `malformed_record`.

Only the two exact type names are candidates for a pair, so a respelled type buys a different line in the reading, never no line.

**Candidates come from who signed.** An `agent.handoff.sent` names the key it was sent to in `event.counterparty_public_key`. Its *candidates* are the held `agent.handoff.received` records whose envelope `public_key` is that key, read from the envelope and never from inside the record, because the envelope key is what the signature binds. An `agent.handoff.received` takes its candidates the same way, from the `agent.handoff.sent` records signed by the key it names. Matching MUST NOT use tenancy, so a pair forms across records two organizations hold. Apart from the record's type, a reader MUST NOT make any value a record states about itself a condition of candidacy: not its own `event.counterparty_public_key`, not `context.case_id`, not `event.sequence`. A record that deviates in such a value would otherwise form no pair at all, and its deviation would read as two absences.

**Ordering never removes a candidate.** Where there is more than one candidate, a reader MAY order them by `context.case_id` and then by `event.sequence`, so the candidate in the record's own case is named first. It MUST NOT remove a candidate from grading on either value: both are written by the party being audited, and `event.sequence` is a value the pair checks grade. For ordering, two records name the same case when both name no case or both carry the same string; an absent `context.case_id` and one written as `null` both name no case.

**Every candidate is graded.** A reader MUST grade every candidate and MUST NOT select one: a reader permitted to take one match can be handed an honest decoy beside a changed record. The reading MUST carry what each candidate graded to and which checks it failed. The verdict is the worst over the candidates not set aside (as the next paragraph says). In a hand-off reading `incomplete` is worse than `failed`, unlike the record reading of section 10, and `failed` is worse than `verified`. The failed checks are the union of theirs, and more than one such candidate is the finding `counterpart_ambiguous`. Where a reading carries more than one finding, `counterpart_ambiguous` comes first, then `malformed_record` or `nonconforming_record`. The reading names each candidate's checks because `incomplete` outranks `failed`, so one unreadable record signed by the counterparty key would otherwise hide a named failure.

**A failed candidate another record accounts for is set aside.** A party's other exchanges are candidates too: they commit to other messages, and they fail. A candidate that grades `failed` is set aside from the record's verdict, failed checks and ambiguity when, and only when, the reader holds a record `o`, other than the record being read, for which all four hold:

1. `o` is signed by the same key as the record being read, and is of the same type;
2. `o`'s `event.counterparty_public_key` names the candidate's signing key, and the candidate's names the key of the record being read;
3. `o`'s `event.sequence` differs from that of the record being read;
4. the candidate grades `verified` against `o` under the checks on a formed pair, which follow.

A set-aside candidate stays in the reading: it is listed with the others, its grade and failed checks are reported, and it carries `accounted_for`, the reference of the first such `o` in the order the reader was given its records, so two readers given one set of records name one record. Where every candidate is set aside, the reading is `counterpart_absent`, with no verdict, and still lists them.

The party being audited cannot steer this. Setting a candidate aside needs a verified pair between that candidate and another record signed by the key of the record being read, the side opposite the candidate's signer. A changed or truncated record commits to a digest the other side never signed, so it pairs `verified` with nothing the other side holds, and it stays live. A party can take one of its own records out of a reading only by showing it is an exact, mutually named hand-off of a different message that the other side recorded too, which is what an honest record of another exchange is. Condition 3 is the position guard: one signer, one type, one counterparty and one sequence number is one message, so a second record at the same number is a second claim about the same message. Condition 2 keeps live a received record that names another sender, and a received record of a message addressed to another receiver. The type in condition 1 keeps a party's record of receiving a message from accounting for its record of sending one.

**The checks on a formed pair.** `event.message_hash` and `event.sequence` are checks on a formed pair, never keys that form it. A pair is intact when every check holds, and fails when any check fails, naming the record and each failed check, in this order:

| Check | Holds when | Why |
|---|---|---|
| `message_hash` | The two `message_hash` values are equal, compared with case ignored. | A differing hash is a changed or truncated message. An honest side that writes the same digest in upper case has changed nothing. |
| `sequence` | The two `sequence` values are equal. | A differing number is a side that did not record the number it was given. |
| `self_handoff` | The two envelope keys are two different keys, compared as keys. | One key signing both ends proves nothing about a transfer between two parties. |
| `counterparty_named` | Each record's `event.counterparty_public_key` is the key the other record was signed with, compared as keys. | A digest and a number are all a forger has to copy: a send addressed to one key paired with a receipt signed by another is not a hand-off between the two parties that signed them. |

Any deviation on a formed pair is a failure, never an exception.

**No candidate.** Where a record has no candidate, its reading is the finding `counterpart_absent`, with no verdict. The counterparty can hold its side and never have joined it to this one, so an absence does not say whether the other side recorded the message.

**What this reading does not settle.**

- **Fan-in and fan-out.** Where one party exchanges messages with two others, the record of the third party's exchange names a third key, so condition 2 keeps it live and the record reads `failed` with `counterpart_ambiguous`. An honest fan-in has the same shape as a changed received record relabelled to name a third key beside a clean decoy, and a rule that set the first aside would set the second aside too.
- **One pair in two cases at one sequence.** Numbers are per sender per case, so the first message of each case is sequence 1, and the record that would account for the other case's candidate is at the same number, which condition 3 refuses. A reader that reads one case's records together does not meet this.
- **A message the other side did not record.** The receiving side's record of each message it did record reads `failed` with `counterpart_ambiguous`, because the unrecorded message is a candidate and nothing the receiving side signed accounts for it. The unrecorded message reads `counterpart_absent`.
- **A receipt written as a send.** Candidates are only of the other type, because an honest reply is an `agent.handoff.sent` signed by the other agent, naming this one, in the same case and at the same sequence, the same shape as a receiver that writes `agent.handoff.sent` for a message it received. Grading same-type candidates would read an honest reply as a failed hand-off. A receiver that takes this path publishes a record saying it sent what it received, with no `event.outcome`, so its evidence no longer says it accepted anything, and the reading is two absences.
- **What a party leaves out.** A reader of one party's records reads one party's account. A message that party never recorded is visible only in the other party's records, read beside these.

The words a hand-off reading uses:

| Name | Kind | When |
|---|---|---|
| `verified` | verdict | A formed pair on which every check holds. |
| `failed` | verdict | A formed pair on which a check fails, named in the failed checks. Also, with no failed check, a record or a candidate that is an `agent.handoff.*` record that is wrong (`nonconforming_record`); a named failed check on any candidate outranks that. |
| `incomplete` | verdict | The record, or a candidate, is governed and cannot be read as a hand-off record (`malformed_record`). It outranks both kinds of `failed`. |
| `message_hash`, `sequence`, `self_handoff`, `counterparty_named` | failed check | The checks on a formed pair, in that order. |
| `counterpart_absent` | finding | No candidate, or every candidate set aside. No verdict. |
| `counterpart_ambiguous` | finding | More than one candidate is graded into the verdict. |
| `malformed_record` | finding | The record, or a candidate, cannot be read as a hand-off record. |
| `nonconforming_record` | finding | The record, or a candidate, is an `agent.handoff.*` record that is wrong, and no check failed. |
| `not_a_handoff_record` | finding | The record is not governed. No verdict. |

No case in this repository pins a hand-off reading. The cases pin each hand-off record under this vocabulary, and the part counts of step 7d (section 10); the reference implementation does not form hand-off pairs.

### 8.4 Records outside this vocabulary

The four `runner.*` types (`runner.run_opened`, `runner.run_closed`, `runner.egress`, `runner.relay`) are record types defined outside this vocabulary, and this layer reads only their `extras` and salt (section 10, step 1). An agent can name a `runner.run_opened` record it was handed in `run.runner_event_id` on its `agent.run_opened`. That link is the agent's claim: an agent can leave it out or name a record it signed itself, and no step of section 10 reads anything beside it.

## 9. The three rules

### 9.1 Pairing

Every operation has a start and an end: `.started` and `.ended` for steps, model calls, tool calls and retrievals; `requested` and `resolved` for approvals. The end names its start in `run.started_event_id`, never itself, and the two describe one operation:

- both carry the same `run.run_id` and the same `run.root_run_id`: one operation is in one invocation ([`conformance/cases/pairing/end-names-a-start-in-another-invocation`](../conformance/cases/pairing/end-names-a-start-in-another-invocation));
- two tool call records also carry the same `gen_ai.tool.call.id`;
- an approval answered in a later invocation is the one exception to the first condition: its two records carry different run ids and different root run ids, both, and the same `gen_ai.conversation.id`, which is what ties the interrupted run to the resumed one ([`conformance/cases/pairing/approval-resolved-in-a-later-run`](../conformance/cases/pairing/approval-resolved-in-a-later-run)). Where only one of the two ids differs, the exception does not hold ([`conformance/cases/pairing/approval-two-run-ids-one-invocation`](../conformance/cases/pairing/approval-two-run-ids-one-invocation), [`conformance/cases/pairing/approval-one-run-id-two-invocations`](../conformance/cases/pairing/approval-one-run-id-two-invocations)). Without a conversation id, an approval resolved in another run does not pair ([`conformance/cases/pairing/approval-resolved-in-another-run-without-a-conversation`](../conformance/cases/pairing/approval-resolved-in-another-run-without-a-conversation)). The exception is for approvals only: a tool call end in another run of the same conversation does not pair ([`conformance/cases/pairing/tool-call-in-two-runs-same-conversation`](../conformance/cases/pairing/tool-call-in-two-runs-same-conversation));
- the fields both halves carry that name the operation agree where both commit a value: `gen_ai.operation.name` and `gen_ai.provider.name` on a model call, `gen_ai.tool.name` on a tool call, and `approval.subject_event_id`, `approval.actor` and `approval.policy_hash` on an approval. A hidden field commits its hash, so a hidden tool name on one half agrees with a clear name on the other when the hash is the hash of that name ([`conformance/cases/pairing/tool-call-hidden-name-matches`](../conformance/cases/pairing/tool-call-hidden-name-matches)).

An end that names itself reads as an end whose start is not held, the finding `start_absent`, because a record is never one of its own held records (section 10, step 7) ([`conformance/cases/pairing/end-names-itself`](../conformance/cases/pairing/end-names-itself)). A start and its end are signed by one key: a record another key signed under the start's `event_id` is never this end's start ([`conformance/cases/pairing/decoy-start-under-another-key`](../conformance/cases/pairing/decoy-start-under-another-key)). Only a record that itself reads `verified` on its own is a start or an end. A record that reads `failed` or `incomplete` on its own and names a start ends nothing ([`conformance/cases/pairing/start-whose-only-end-fails`](../conformance/cases/pairing/start-whose-only-end-fails), [`conformance/cases/pairing/start-whose-only-end-is-incomplete`](../conformance/cases/pairing/start-whose-only-end-is-incomplete)).

No other end pairs across invocations, `skipped` included: a tool call open at an interrupt ends `interrupted` in its own invocation (section 5.6). Hand-offs pair by section 8.3, never by this rule. Runs, steps that occurred, decisions, custom records, files and errors are one record each, and no verifier finding reads a record that names one of them as its parent.

**An end with no start.** An adapter that cannot observe an operation's start (a gateway log read after the fact, a hook that sees only the abort) writes the end alone, with `run.started_event_id` `null`, and names the start's type in the cannot-capture list on the invocation's first record (section 4.8). A verifier shows "end only; start not observed by this adapter", the finding `start_not_captured`, and no `unended` or pairing finding ([`conformance/cases/end-only/declared-on-run-opened`](../conformance/cases/end-only/declared-on-run-opened)). `run.observed_started_at` carries the start time the source reported, where it reported one ([`conformance/cases/end-only/declared-with-observed-start-time`](../conformance/cases/end-only/declared-with-observed-start-time)). Without that declaration, an end with no start is the finding `start_undeclared` ([`conformance/cases/end-only/undeclared`](../conformance/cases/end-only/undeclared)).

**An operation is open** from its start record to its end record, in the order of `run.seq` within one `run.root_run_id`, and an approval resolved in a later invocation is open from its request to the end of the invocation it was requested in and from the start of the one it is resolved in. So whether an operation is open across a gap between two records is computable from the records alone: a gap between two consecutive records of one invocation lies inside an open operation when a start before the gap has its end after it, or has no end. The length of a gap comes from the envelopes' `signed_at`, which is advisory. A verifier that folds idle time folds only a gap no operation is open across.

An operation that never ran because a policy, a hook or an approval stopped it still ends: the adapter writes its end with `outcome.status` `skipped` (section 4.7), so its start is not left open, and a run that closes `completed` over it raises no finding ([`conformance/cases/run-closed/completed-with-a-skipped-tool-call`](../conformance/cases/run-closed/completed-with-a-skipped-tool-call)).

A start with no end is evidence of an operation that never finished, and a verifier names it `unended` ([`conformance/cases/pairing/start-with-no-end`](../conformance/cases/pairing/start-with-no-end)). It is information, never a failure: the process might have died, or the verifier might not hold the end.

> **Why the conversation, and not a link from the resumed run to the interrupted one.** A framework resumes an interrupted graph as a second root run, with its own chain and `run.seq` from 0, and it carries the conversation and the resume value. The adapter keeps the request's `event_id` with the conversation (section 5.6), and that names the exact record; the old run's id would name only a run. The conversation id is what a verifier compares to see that both records belong to one thread.

### 9.2 Plumbing

A framework emits steps that are its own machinery: a sequence wrapper, a channel write, a graph's entry node. An adapter keeps them, never drops them, and marks each with `run.plumbing: true`.

**The rule.** A step is plumbing when the framework created it and the builder did not: it is not a node, chain or function the builder added or named. The adapter decides from what the framework reports about who created the step (a mark the framework sets on its internal steps, or the builder's own list of nodes), never from the step's name. Where the framework reports nothing that settles it, the step is not plumbing: an unmarked step shows, and a wrongly marked one hides.

A verifier folds plumbing by default, shows how many it folded, and never leaves one out of the reading ([`conformance/cases/rules/plumbing-marked`](../conformance/cases/rules/plumbing-marked)).

> **Why kept and marked, not dropped.** A dropped step is a gap no verifier can see, and which steps are plumbing is a judgement an adapter can get wrong.

### 9.3 Content

`event.content_hash` is SHA-256 over the JCS (RFC 8785) bytes of the content object. A file's content is its own bytes.

**The content object.** For a record a framework step produces, the object the framework handed the adapter, never rewritten: the adapter witnesses the step and does not author a summary of it. For a record no framework step produces (`agent.run_opened`, `agent.run_closed`, `agent.approval.resolved`, `agent.decision`, `agent.custom`, `agent.error`), the fixed object section 5 gives for its type. Leaving a member out, renaming one, or re-serializing in another JSON form changes the hash, so a verifier holding the object can no longer confirm it.

**Values that are not JSON.** Where the framework hands over a value JSON has no form for, the adapter uses the framework's own JSON form of it (a serializable object's own serialization), and where the framework has none: an error is `{"message", "type"}` with its class name as `type`; a date and time is an RFC 3339 UTC string with the year written in four digits, and one with no UTC offset names no instant and is refused by name, never read as UTC; a calendar date with no time is its RFC 3339 full-date, `YYYY-MM-DD`; bytes are a base64 string; a number that is not finite is the string JavaScript prints for it. These are the only conversions.

**Credential scrubbing, the one declared transformation.** An adapter can scrub the content object before hashing it. The scrub walks the object at every depth, through arrays as well as objects, and wherever a member's key contains a match of `(api[_-]?key|access[_-]?token|authorization|bearer|secret|password|credential)`, ASCII letters compared case-insensitively, it replaces that member's whole value, whatever its type, with the string `"[scrubbed]"`, and does not walk into the value it replaced. It touches nothing else: no value is matched on what it holds, and no key is renamed. An adapter that scrubs writes `context.content_scrubbed: true`, whether or not a member was replaced, because the hash then commits to the object after the scrub. A verifier shows the finding `content_scrubbed`, and confirms the hash against the scrubbed object, which is the content object the agent keeps ([`conformance/cases/valid/agent.model_call.started-every-field`](../conformance/cases/valid/agent.model_call.started-every-field)). No other rewriting is allowed. A hand-off message and a file are never scrubbed: both are committed as they crossed.

## 10. Verifying a record against this vocabulary

A verifier runs these steps on each record after its envelope has been verified: the signature, and `payload_hash` against the record's JCS bytes (`events.md` sections 2 and 7). Steps 1 to 6 read the record on its own and stop at the first failure. Step 7 reads it with the records the verifier holds beside it, runs every sub-step, and reports every problem it finds. The reference implementation is [`scripts/read.mjs`](../scripts/read.mjs), about 480 lines.

A reading is one of three verdicts, the same three words a hand-off reading, a pack and a case use:

- `verified`: the record follows this vocabulary, and step 7 gives no reason. Findings can stand beside it.
- `failed`: the record does not follow this vocabulary. Its reason kind is `nonconforming`: the record is signed and intact, and its producer wrote something the spec does not allow. Every reason in section 10.1 except the two below.
- `incomplete`: nothing is proven wrong, and a check could not be completed: a version this verifier does not know (`event_schema_unknown`), or a listed record it does not hold (`listed_record_absent`).

A record outside this vocabulary that step 1 does not fail has no verdict at this layer.

1. **The namespace.** An `event_type` that is one of the seven types outside this vocabulary is read by the profile. This layer reads only two things on it, in this order: if its `extras` carries `event_schema`, `failed`, `event_schema_misplaced`; if its `context` carries `salt` in any form but exactly 32 lowercase hex characters (`null` included, section 4.1), `failed`, `bad_value`, at `/context/salt` ([`conformance/cases/salt/wrong-form-on-runner.egress`](../conformance/cases/salt/wrong-form-on-runner.egress)). Otherwise this layer gives no verdict and the finding `not_an_agent_record` ([`conformance/cases/event-type/runner-record-is-not-an-agent-record`](../conformance/cases/event-type/runner-record-is-not-an-agent-record)). This layer needs no `extras` and no other `context` member to read the salt ([`conformance/cases/salt/wrong-form-on-event-no-extras`](../conformance/cases/salt/wrong-form-on-event-no-extras), [`conformance/cases/salt/wrong-form-on-event-beside-chain-key`](../conformance/cases/salt/wrong-form-on-event-beside-chain-key)). An `event_type` that is a string beginning `agent.` goes to step 2, and its salt is read at step 4 with the rest of the schema, so an earlier step or an earlier schema reason comes first ([`conformance/cases/precedence/bad-salt-after-missing-version`](../conformance/cases/precedence/bad-salt-after-missing-version), [`conformance/cases/precedence/bad-salt-after-unknown-field`](../conformance/cases/precedence/bad-salt-after-unknown-field)). Anything else: `failed`, `event_type_not_in_set`.
2. **The version.** `extras.event_schema` is present (else `event_schema_missing`) and matches the grammar of section 2 (else `event_schema_invalid`), both `failed`. A version the verifier does not know reads `incomplete`, `event_schema_unknown`, and stops here.
3. **The type.** `event_type` is one of the types of that version (section 3). Otherwise `failed`, `event_type_not_in_set`.
4. **The schema.** The record validates against `schemas/sanning.agent/1/<event_type>.json` (JSON Schema draft 2020-12, loaded from disk, never fetched, each pattern tested as section 4.1 says). Otherwise `failed`, with `unknown_field` for a member no schema names, `missing_field` for a required member that is absent, and `bad_value` for anything else. Where the record breaks the schema in several places, section 10.1 says which one is reported.
5. **The rules the schema cannot state.** In this order, each list of paths in sorted order (by UTF-16 code units), each list of indexes in its own order:
   - every path in `context.hidden` is absent from `metadata`, else `hidden_field_present`;
   - every path in `context.revealed` is present, else `revealed_field_absent`;
   - every hash-only field present is listed in `context.revealed`, else `revealed_field_unlisted`;
   - `metadata.capture` is present only where `run.seq` is 0, else `capture_not_at_head`;
   - on the hand-off types: `handoff.file_parts` is at most `handoff.parts`, else `file_parts_exceed_parts`;
   - on `agent.handoff.received`: `handoff.unchecked_held_parts` and `context.unchecked_held_part_count` are both present or both absent, else `unchecked_held_parts_missing`, at the one that is absent; the count equals the list's length, else `unchecked_held_parts_mismatch`; the count is at most `handoff.file_parts`, else `unchecked_held_parts_exceed_file_parts`; every index is below `handoff.parts`, else `part_index_out_of_range`;
   - on `agent.run_closed`: `closing.record_ids` has `closing.record_count` entries, else `closing_count_mismatch`;
   - on `agent.file`: `artifact.reason` is present if and only if `outcome.status` is `failed`, else `artifact_reason_mismatch`.

   Each failure reads `failed`. The order holds across rules as well as within one: a record that breaks two rules reports the one listed first ([`conformance/cases/precedence/hidden-before-capture`](../conformance/cases/precedence/hidden-before-capture), [`conformance/cases/precedence/exceed-before-index`](../conformance/cases/precedence/exceed-before-index), [`conformance/cases/precedence/hidden-before-artifact-reason`](../conformance/cases/precedence/hidden-before-artifact-reason)).
6. **Verified.** The record reads `verified`. A record with `run.plumbing` carries the finding `plumbing`, then a record with `context.content_scrubbed` the finding `content_scrubbed`.
7. **The records held beside it.** Each held record is `{event_id, public_key, record}`, and the held records are a set: two with the same `event_id`, the same key and the same JCS bytes of `record` are one record ([`conformance/cases/pairing/start-held-twice`](../conformance/cases/pairing/start-held-twice)). The record itself is not one of its held records: a held copy of it (the same `event_id`, key and JCS bytes) is set aside, so a record reads the same whether or not the verifier holds it beside itself ([`conformance/cases/seq/same-record-held-beside-itself`](../conformance/cases/seq/same-record-held-beside-itself), [`conformance/cases/run-closed/lists-itself-held-beside-itself`](../conformance/cases/run-closed/lists-itself-held-beside-itself), [`conformance/cases/pairing/end-names-itself-held-beside-itself`](../conformance/cases/pairing/end-names-itself-held-beside-itself)). A held record with its `event_id` and other bytes is another record, and stays. Only a held agent record that reads `verified` at steps 1 to 6 takes part. The sub-steps are 7a, 7b, 7c, 7d, 7f, 7g, 7h, 7i and 7j; the letters are identifiers. Every sub-step runs, in order, whatever an earlier one found: a reason at 7a or 7c does not stop step 7 ([`conformance/cases/pairing/failed-pair-keeps-reading-step-7`](../conformance/cases/pairing/failed-pair-keeps-reading-step-7), [`conformance/cases/run-closed/incomplete-keeps-reading-step-7`](../conformance/cases/run-closed/incomplete-keeps-reading-step-7)). Keys compare as keys: 64 hex characters, case ignored ([`conformance/cases/pairing/end-key-in-upper-case`](../conformance/cases/pairing/end-key-in-upper-case)). Event ids compare exactly. *This invocation's records* are the record itself and the held records signed by its key with its `run.root_run_id`.
   - **a. An end and its start.** Where `run.started_event_id` is `null`: the finding `start_not_captured` when this invocation's records hold exactly one record at `run.seq` 0 and it names the start's type in `capture.not_captured`, else `start_undeclared`. Otherwise, the candidates are the held records signed by this record's key whose `event_id` is `run.started_event_id`. With none, the finding `start_absent`; with more than one, the finding `start_ambiguous`. Each candidate is graded by the first of these checks it fails: not the matching start type, `pair_type_mismatch`; another `run.run_id` or `run.root_run_id`, outside the approval exception, `pair_run_mismatch`; two tool call records with different `gen_ai.tool.call.id`, `pair_call_mismatch`; a field of section 9.1 the two halves commit to differently, `pair_field_mismatch`, at that field, the fields checked in the order section 9.1 lists them. Where any candidate fails, 7a gives one reason, the worst failure over every candidate, and the record reads `failed`: the earlier check is worse, and between two `pair_field_mismatch`, the earlier field. The order the records are held in never changes the reading ([`conformance/cases/pairing/two-candidates-one-good`](../conformance/cases/pairing/two-candidates-one-good), [`conformance/cases/pairing/two-candidates-one-good-other-order`](../conformance/cases/pairing/two-candidates-one-good-other-order), [`conformance/cases/pairing/two-failing-candidates`](../conformance/cases/pairing/two-failing-candidates), [`conformance/cases/pairing/two-failing-candidates-other-order`](../conformance/cases/pairing/two-failing-candidates-other-order)).
   - **b. A start and its ends.** The ends of a start are the held records of the matching end type, signed by the start's key, that name it and that grade clean against it by 7a's checks. Each end is graded against this start alone: another candidate of that end does not stop it ending this one ([`conformance/cases/pairing/start-ended-by-an-end-with-a-second-candidate`](../conformance/cases/pairing/start-ended-by-an-end-with-a-second-candidate)). With none, the finding `unended`; with more than one, `ended_more_than_once`.
   - **c. A closing record.** For each `event_id` in `closing.record_ids`, in order, a held record signed by the same key with that `event_id` takes part; each that has none gives the reason `listed_record_absent`, at `/metadata/closing/record_ids/<index>`, whatever the status, and the record reads `incomplete` ([`conformance/cases/run-closed/interrupted-with-a-listed-record-not-held`](../conformance/cases/run-closed/interrupted-with-a-listed-record-not-held), [`conformance/cases/run-closed/no-listed-record-held`](../conformance/cases/run-closed/no-listed-record-held), [`conformance/cases/run-closed/first-and-last-listed-records-not-held`](../conformance/cases/run-closed/first-and-last-listed-records-not-held)). Where every listed record is held, `closing.outcome.observed.status` is `completed` (the stated status is not read, [`conformance/cases/run-closed/stated-completed-over-an-open-request`](../conformance/cases/run-closed/stated-completed-over-an-open-request)), and a listed record signed by the same key is a start none of whose ends (7b) is listed, the finding `completed_with_open_operation` ([`conformance/cases/run-closed/completed-with-a-start-under-another-key`](../conformance/cases/run-closed/completed-with-a-start-under-another-key)).
   - **d. A hand-off and its counterpart.** The part counts of section 8.1, over every held record of the other hand-off type (a sent record against a received one, never two of one type, [`conformance/cases/handoff/pair-two-sent-records-not-compared`](../conformance/cases/handoff/pair-two-sent-records-not-compared)) that is a candidate for this one, with an equal `message_hash`. Where any of them differs on `handoff.parts` or `handoff.file_parts`, the finding `handoff_parts_mismatch`, once. It moves no verdict ([`conformance/cases/handoff/pair-two-counterparts-disagree`](../conformance/cases/handoff/pair-two-counterparts-disagree), [`conformance/cases/handoff/pair-file-parts-disagree`](../conformance/cases/handoff/pair-file-parts-disagree)).
   - **f. One mode.** A held record of this invocation's records with another `context.data_mode`: the finding `data_mode_mixed`, whatever chain each is on ([`conformance/cases/data-mode/mixed-on-two-chains`](../conformance/cases/data-mode/mixed-on-two-chains)).
   - **g. One record at each position.** Another of this invocation's records with the same `run.seq`: the finding `seq_duplicate` ([`conformance/cases/seq/two-records-at-one-position`](../conformance/cases/seq/two-records-at-one-position)). Another record is any record that is not this one by the set rule above, so a held record with this record's `event_id` and other bytes counts ([`conformance/cases/seq/same-event-id-other-bytes`](../conformance/cases/seq/same-event-id-other-bytes)).

   - **h. A tool call that ran after its approval refused it.** On `agent.tool_call.ended` whose `run.started_event_id` is not `null` and whose `outcome.status` is `completed` or `failed`: where the held records signed by this record's key include an `agent.approval.resolved` whose `approval.subject_event_id` is this record's `run.started_event_id` and whose `approval.verdict` is `rejected` or `responded`, the finding `ran_after_refusal` ([`conformance/cases/refusal/completed-after-rejected`](../conformance/cases/refusal/completed-after-rejected), [`conformance/cases/refusal/failed-after-responded`](../conformance/cases/refusal/failed-after-responded), [`conformance/cases/refusal/skipped-after-rejected`](../conformance/cases/refusal/skipped-after-rejected), [`conformance/cases/refusal/completed-after-approved`](../conformance/cases/refusal/completed-after-approved), [`conformance/cases/refusal/refusal-under-another-key`](../conformance/cases/refusal/refusal-under-another-key), [`conformance/cases/refusal/refusal-that-fails`](../conformance/cases/refusal/refusal-that-fails)). An end `skipped` did not run, and an end `interrupted` stopped at an interrupt, before any answer ([`conformance/cases/refusal/interrupted-after-rejected`](../conformance/cases/refusal/interrupted-after-rejected)). The finding is on the end only ([`conformance/cases/refusal/refusal-read-from-the-start`](../conformance/cases/refusal/refusal-read-from-the-start)). Three readings are fixed:
     - A refusal from any invocation under this key counts, not only one from this invocation, so a refusal after a resume is seen ([`conformance/cases/refusal/completed-after-a-rejection-in-another-invocation`](../conformance/cases/refusal/completed-after-a-rejection-in-another-invocation)).
     - Any refusal counts, whatever other answers name the same start. An escalation, a policy's rejection later approved by a human, still shows the finding on an honest run ([`conformance/cases/refusal/completed-after-rejected-then-approved`](../conformance/cases/refusal/completed-after-rejected-then-approved)).
     - A refusal counts whether or not it pairs with its request: one with `run.started_event_id` `null`, as after a resume with no store, is still the agent's signed refusal ([`conformance/cases/refusal/refusal-that-names-no-request`](../conformance/cases/refusal/refusal-that-names-no-request)).

     **What this check does not cover in version 1.** It matches a tool call's end against a refusal of that call's own start. It cannot match an approval whose subject is another record, such as the step that called the interrupt. It does not cover a tool call re-run after a resume either: the re-run is a new operation with a new start, and version 1 does not link it to the refusal. The records still show both.
   - **i. A gap before this record.** Where `run.seq` is above 0, this invocation's records hold a record at a lower `run.seq`, and none at `run.seq` minus 1: the finding `seq_gap`, "the run may be incomplete" ([`conformance/cases/incomplete/seq-gap-before-this-record`](../conformance/cases/incomplete/seq-gap-before-this-record), [`conformance/cases/incomplete/seq-no-gap-before-this-record`](../conformance/cases/incomplete/seq-no-gap-before-this-record), [`conformance/cases/incomplete/seq-nothing-earlier-held`](../conformance/cases/incomplete/seq-nothing-earlier-held), [`conformance/cases/incomplete/seq-earlier-record-under-another-key`](../conformance/cases/incomplete/seq-earlier-record-under-another-key)). A verifier handed only later records sees a slice, not a gap, and makes no finding. Only a held record that reads `verified` at steps 1 to 6 takes part, so a record held at `run.seq` minus 1 that reads `failed` leaves the gap as it is ([`conformance/cases/incomplete/seq-record-before-fails`](../conformance/cases/incomplete/seq-record-before-fails)).
   - **j. A promised closing record not held.** On `agent.run_opened`, which promises a closing record in `closing.promised`: where this invocation's records hold no `agent.run_closed`, the finding `closing_not_held`, "the run may be incomplete" ([`conformance/cases/incomplete/closing-not-held`](../conformance/cases/incomplete/closing-not-held), [`conformance/cases/incomplete/closing-held`](../conformance/cases/incomplete/closing-held), [`conformance/cases/incomplete/closing-held-under-another-key`](../conformance/cases/incomplete/closing-held-under-another-key), [`conformance/cases/incomplete/closing-fails`](../conformance/cases/incomplete/closing-fails)).

   **What step 7 reports.** Every reason step 7 gives is reported, each with its `at`, in step order, and within 7c in list order. The reading's verdict is the worst over every reason: `failed`, then `incomplete`. `reason` and `at` are the first reported reason of that verdict, for a one-line summary, and `reasons` lists them all (section 10.1). In this version 7a reads only ends and 7c only closing records, so the reasons of one record come from one sub-step. Findings are reported in the order step 6, then 7a to 7j ([`conformance/cases/seq/mixed-mode-and-duplicate-in-step-order`](../conformance/cases/seq/mixed-mode-and-duplicate-in-step-order), [`conformance/cases/refusal/refused-with-a-gap-in-step-order`](../conformance/cases/refusal/refused-with-a-gap-in-step-order)), whatever the verdict. No finding moves a verdict. `seq_gap` and `closing_not_held` say only that the run may be incomplete, because a verifier that holds part of a run cannot tell a record it lacks from a record that was never written.

`incomplete` never displays as a pass.

**The words beside this layer's.** A record reaches this layer only after its envelope verified. Every reading that combines records (one pack, or a case read over several packs) uses the same three verdicts. A `failed` reading carries one of two reason kinds:

- `changed`: a check proved bytes or a signature wrong, such as a signature or `payload_hash` that does not hold (`events.md` section 2). A record that reaches this layer passed those checks, so this layer never gives `changed`.
- `nonconforming`: the record is signed and intact, and does not follow this vocabulary, or, for a record outside it, the profile rule this layer reads on it: a salt in the wrong form (`events.md` section 3). Every `failed` reading of this layer has this reason kind.

A `failed` reading of this layer displays as a failure and never as tampering: it says a record does not follow the rules, not that anything was altered.

**How readings combine.** This layer grades one record. A pack reads no better than its worst record, and a case reads its worst pack, with `failed` worse than `incomplete` and `incomplete` worse than `verified`. A `failed` pack or case has the reason kind `nonconforming` where every failure in it is `nonconforming`, and `changed` where any failure is `changed`.

> **Why two kinds of failure and not a fourth verdict.** A record that breaks this vocabulary and a pack whose bytes changed both mean a reader must not rely on the evidence as it stands. What differs is what went wrong, so they share the verdict `failed` and are told apart by the reason kind (`nonconforming` or `changed`) and by the sentence a verifier shows a person, which says a record does not follow the rules rather than that something was altered. A fourth verdict would give every tool that reports a verdict one more word to rank, and would let a pack or a case holding such a record read as something other than its worst record.

> **Why the worst candidate and not the one that pairs.** A verifier permitted to take the one candidate that pairs can be handed a decoy beside a record that fails, and publishes the decoy. A hand-off reader grades every candidate for the same reason (section 8.3). Candidates are only records the end's own key signed: a record another key signed is never this end's start, so grading it would catch nothing and would let anyone who writes into a shared pile make an honest end read `failed`. Only the key that signed the end can make its candidates ambiguous.

> **Why a closing record is judged only on every record it lists.** A verifier that holds part of a run cannot tell an end it lacks from an end that was never written. Judging on part of the list would accuse an honest run whose verifier was handed the start and not the end.

### 10.1 Reason codes and findings

Each reason maps to one claim and one state, for a verifier that reports its reading as claims rather than as a verdict alone. This layer touches two claims: `follows_rules` (the record follows the vocabulary it names) and `complete` (the verifier holds everything the record lists). A claim is *disproven*, which reads `failed`, or *not proven*, which reads `incomplete` and carries why: `not_checked` (this verifier could not check it) or `missing` (something it needs is not held). A finding is a note: it maps to no claim and never moves a verdict.

| Name | Kind | Claim and state | Step |
|---|---|---|---|
| `event_type_not_in_set` | reason, `failed` | `follows_rules`, disproven | 1, 3 |
| `event_schema_misplaced` | reason, `failed` | `follows_rules`, disproven | 1 |
| `event_schema_missing` | reason, `failed` | `follows_rules`, disproven | 2 |
| `event_schema_invalid` | reason, `failed` | `follows_rules`, disproven | 2 |
| `event_schema_unknown` | reason, `incomplete` | `follows_rules`, not proven (`not_checked`) | 2 |
| `unknown_field` | reason, `failed` | `follows_rules`, disproven | 4 |
| `missing_field` | reason, `failed` | `follows_rules`, disproven | 4 |
| `bad_value` | reason, `failed` | `follows_rules`, disproven | 1 (the salt), 4 |
| `hidden_field_present` | reason, `failed` | `follows_rules`, disproven | 5 |
| `revealed_field_absent` | reason, `failed` | `follows_rules`, disproven | 5 |
| `revealed_field_unlisted` | reason, `failed` | `follows_rules`, disproven | 5 |
| `capture_not_at_head` | reason, `failed` | `follows_rules`, disproven | 5 |
| `file_parts_exceed_parts` | reason, `failed` | `follows_rules`, disproven | 5 |
| `unchecked_held_parts_missing` | reason, `failed` | `follows_rules`, disproven | 5 |
| `unchecked_held_parts_mismatch` | reason, `failed` | `follows_rules`, disproven | 5 |
| `unchecked_held_parts_exceed_file_parts` | reason, `failed` | `follows_rules`, disproven | 5 |
| `part_index_out_of_range` | reason, `failed` | `follows_rules`, disproven | 5 |
| `closing_count_mismatch` | reason, `failed` | `follows_rules`, disproven | 5 |
| `artifact_reason_mismatch` | reason, `failed` | `follows_rules`, disproven | 5 |
| `pair_type_mismatch` | reason, `failed` | `follows_rules`, disproven | 7a |
| `pair_run_mismatch` | reason, `failed` | `follows_rules`, disproven | 7a |
| `pair_call_mismatch` | reason, `failed` | `follows_rules`, disproven | 7a |
| `pair_field_mismatch` | reason, `failed` | `follows_rules`, disproven | 7a |
| `listed_record_absent` | reason, `incomplete` | `complete`, not proven (`missing`) | 7c |
| `not_an_agent_record` | finding, no verdict | none: the record is outside this vocabulary | 1 |
| `plumbing` | finding | none: a note | 6 |
| `content_scrubbed` | finding | none: a note | 6 |
| `start_absent` | finding | none: a note | 7a |
| `start_ambiguous` | finding | none: a note | 7a |
| `start_not_captured` | finding: "end only; start not observed by this adapter" | none: a note | 7a |
| `start_undeclared` | finding | none: a note | 7a |
| `unended` | finding | none: a note | 7b |
| `ended_more_than_once` | finding | none: a note | 7b |
| `completed_with_open_operation` | finding | none: a note | 7c |
| `handoff_parts_mismatch` | finding: "the two records of this message count its parts differently" | none: a note | 7d |
| `data_mode_mixed` | finding | none: a note | 7f |
| `seq_duplicate` | finding | none: a note | 7g |
| `ran_after_refusal` | finding: "the tool ran after its approval refused it" | none: a note | 7h |
| `seq_gap` | finding: "the run may be incomplete: no verified record is held at the position before this record" | none: a note | 7i |
| `closing_not_held` | finding: "the run may be incomplete: the promised closing record is not held" | none: a note | 7j |

**The shape of a reading.** A reading has five members:

| Member | When | What it holds |
|---|---|---|
| `verdict` | always | `verified`, `failed` or `incomplete`; `null` for a record outside this vocabulary that step 1 does not fail. |
| `reason` | not `verified` | The first reason of the verdict, for a one-line summary. |
| `at` | not `verified` | Its JSON Pointer. |
| `reasons` | not `verified` | Every reason, in the order steps 1 to 7 give them, each as `{"reason", "at"}`. Steps 1 to 6 stop at the first failure, so a reading from them has one; step 7 can give several ([`conformance/cases/run-closed/no-listed-record-held`](../conformance/cases/run-closed/no-listed-record-held)). Its first entry is `reason` and `at`. |
| `findings` | always | The findings, in the order step 6 then 7a to 7j make them. |

Each reason comes with `at`, a JSON Pointer to the field it is about. Every place a record can fail in more than one way has one rule, so two verifiers that follow these rules give one record the same verdict, `reason`, `at`, `reasons` and findings:

- **Several schema errors.** The verifier collects every error (a JSON Schema validator in its all-errors mode) and reports one: `unknown_field` before `missing_field` before `bad_value`, then the smallest pointer. Pointers compare token by token; a token that indexes an array compares as a number, any other token by UTF-16 code units; a pointer comes before every pointer it is a prefix of ([`conformance/cases/precedence/misspelt-required-member`](../conformance/cases/precedence/misspelt-required-member), [`conformance/cases/precedence/array-indexes-compare-as-numbers`](../conformance/cases/precedence/array-indexes-compare-as-numbers)). The order the members are written in, and the order a validator reports errors in, never decide.
- **Several step 5 failures.** The order of step 5, across rules and within one, and sorted paths within a rule ([`conformance/cases/precedence/two-hidden-fields-present`](../conformance/cases/precedence/two-hidden-fields-present), [`conformance/cases/precedence/hidden-before-revealed`](../conformance/cases/precedence/hidden-before-revealed)).
- **Several failing candidates.** One reason, the worst, by 7a ([`conformance/cases/pairing/two-failing-candidates`](../conformance/cases/pairing/two-failing-candidates)).
- **Several step 7 reasons.** Every one, in step order, and within 7c in list order ([`conformance/cases/run-closed/first-and-last-listed-records-not-held`](../conformance/cases/run-closed/first-and-last-listed-records-not-held)).

## 11. What the SDK does

An SDK refuses to sign a record that reads `failed` or `incomplete` at steps 1 to 6: the same steps, run before signing. A refusal is never a silent drop: the adapter reports the record it could not write. This covers a framework id that fails the id grammar (section 4.1): the SDK refuses the record and reports it, and never leaves the id out, rewrites it or hashes it to make the record pass.

**Which type an adapter writes.** An adapter follows what the framework reports:

- A framework that reports an operation's start or end gets a pair, or an end-only record where the adapter sees only the end (section 9.1). `agent.step.occurred` is only for a moment the framework reports as one event, never for an operation that takes time. For LangChain, that is an agent action, an agent finish, and a retry between two attempts.
- A failure the framework handles inside an operation is an `agent.step.occurred` inside that operation. `agent.error` is only for an error outside any operation (section 5.10).
- A fragment of a stream (a token, a chunk, a partial message) is not a record. The response it belongs to is the content of the operation's end (section 5.3).
- A customer's event name that breaks the grammar of `custom.name` is refused and reported, never rewritten to pass (section 5.11).

The adapter's obligations that no record-level case can test, collected:

- the content object of section 9.3, and scrubbing only as section 9.3 allows;
- a fresh random `context.salt` on every record it builds, of any type, from a cryptographically secure source (section 4.3);
- `private` unless the caller chooses another mode (section 7);
- one value for `run.root_run_id` over an invocation, and one record at each `run.seq` (section 4.4);
- `run.runner_event_id` only as the `event_id` the adapter was handed, never one it made up (section 8.4);
- `skipped` on the end of an operation a policy, a hook or an approval stopped, and on a tool call whose approval resolved `rejected` or `responded` in the same invocation; `interrupted` on a tool call open at an interrupt, and no end for it after the resume (sections 4.7 and 5.6);
- a decision or custom name that names the question, with the result in the value (sections 5.8 and 5.11);
- a conversation id only where the framework or caller supplies one (section 4.6);
- the request's `event_id` kept with the conversation across a resume (section 5.6);
- the cannot-capture list on the invocation's first record, written before the records it excuses (section 4.8);
- the root step for the invocation's output (section 5.1);
- the provider name from the endpoint (section 5.3), plumbing from what the framework reports (section 9.2);
- the receiver's unchecked parts counted and listed (section 8.1);
- what Sanning receives in each mode (section 7).

## 12. References

- **The profile**: [`events.md`](events.md), the `sanning.events/v2` profile: the envelope, the event record and the closed set of types.
- **JSON Canonicalization Scheme (JCS)**: [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785).
- **Ed25519**: [RFC 8032](https://www.rfc-editor.org/rfc/rfc8032).
- **Requirement keywords**: [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).
- **OpenTelemetry GenAI semantic conventions 1.41.0**: [opentelemetry.io/schemas/1.41.0](https://opentelemetry.io/schemas/1.41.0).
- **A2A 1.0.0**: [`specification/a2a.proto` at tag `v1.0.0`](https://github.com/a2aproject/A2A/blob/v1.0.0/specification/a2a.proto).

Reading a record needs only this repository: the schemas, the cases and the reference implementation run offline. The reference implementation reads one record and the records held beside it, as section 10 says. It does not form hand-off pairs (section 8.3).
