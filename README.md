# Sanning specifications

This repository specifies `sanning.agent/1`, the vocabulary of records an AI agent writes when it runs, and the `sanning.events/v2` profile that signs and carries them. It also holds the JSON Schemas that check each record, a reference reading of a record, and a conformance suite every implementation runs.

Everything here works offline: you need no account, no API key and no network to read a specification, validate a record or run the suite. Verification is client-side, and Sanning is never in the trust path: no rule in this repository asks a verifier to believe anything Sanning says.

A customer hashes its data locally and signs an event record that commits to it by hash. Only a Merkle root over many envelopes goes on a permanent public record.

The data mode decides what Sanning receives:

- **`private`** (the default): the signed envelope and a fixed list of the record's fields, never the content.
- **`standard`**: more of the record's clear fields, never the content or a hash or length of it.
- **`full`**: every field, and the content as well.

All three are defined so records read the same whatever a service offers. Sanning's service offers only `private` today ([`specs/agent-events.md`](specs/agent-events.md) section 7).

## The path of one record

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/record-path-dark.png">
  <img alt="The path of one record. An agent action becomes an event record in the sanning.agent/1 vocabulary (agent-events.md). The SDK signs it in an envelope under the sanning.events/v2 profile (events.md section 2). Sanning stamps many envelopes into one Merkle root on a permanent public record (events.md section 6). The records, envelopes, inclusion proofs and stamps are collected into an evidence pack for a third party. A reader verifies the pack offline and gets one verdict: Verified, Failed or Incomplete." src="images/record-path.png" width="820">
</picture>

1. An agent action becomes an **event record**, in the `sanning.agent/1` vocabulary. The agent hashes the content locally, and the record contains only the hash.
2. The SDK signs the record in a **signed envelope** under the `sanning.events/v2` profile. The envelope contains `payload_hash`, the SHA-256 of the record's canonical bytes, an Ed25519 signature and the signing key.
3. Sanning places the envelope in an **interval stamp**: one Merkle root over many envelopes, anchored on a permanent public record. The envelopes are not public; only the root is.
4. The holder collects records, envelopes, their inclusion proofs and the stamps into an **evidence pack** for a third party.
5. A **verifier** reads the pack offline, on its own machine, and gives each record a **verdict**: `verified` (every check holds), `failed` (a check proves the record wrong) or `incomplete` (nothing is proven wrong, and a check could not be completed). A pack reads no better than its worst record. A **finding**, such as a start with no end, is a note beside a verdict and never changes it.

This release specifies the record, the envelope, and the leaf and tree of a stamp (steps 1 to 3), and how a verifier reads one record and a hand-off pair. A later release specifies how a holder obtains an inclusion proof, the format of an evidence pack, where a stamp is published, and the verdicts over a pack.

## Where to start

Read [`specs/agent-events.md`](specs/agent-events.md) sections 1 to 3 first: what a record proves and what it does not, where the vocabulary sits, and the closed set of types. Then:

| If you | Read |
|---|---|
| write an adapter for an agent framework | `agent-events.md` sections 4 to 9 for the fields you emit, and section 11 for what your SDK refuses to sign. |
| write a verifier | [`specs/events.md`](specs/events.md) sections 2 and 7 for the envelope, then `agent-events.md` section 10 for one record and section 8.3 for a hand-off pair. |
| audit agent evidence | `agent-events.md` section 7, what Sanning receives in each data mode, and section 10, what each verdict and finding means. |
| test an implementation | [`conformance/README.md`](conformance/README.md): the format of a case, and how to claim conformance. |
| propose a change | [`CONTRIBUTING.md`](CONTRIBUTING.md). |
| found a vulnerability | [`SECURITY.md`](SECURITY.md). Do not open an issue. |

`MUST`, `MUST NOT`, `SHOULD` and `MAY` carry their RFC 2119 meanings wherever they appear in capitals.

## What is in this repository

| Path | What it is |
|---|---|
| [`specs/agent-events.md`](specs/agent-events.md) | The `sanning.agent/1` vocabulary: the 19 record types an agent writes, every field, what each commits to by hash, what Sanning receives in each data mode, how hand-offs pair, and how a verifier reads a record. |
| [`specs/events.md`](specs/events.md) | The `sanning.events/v2` profile: the envelope, the event record and its sections, the closed set of types, chains, the record salt and the interval stamp. |
| [`schemas/sanning.agent/1/`](schemas/sanning.agent/1/) | One JSON Schema (draft 2020-12) per type, plus `common.json`. Generated. |
| [`conformance/`](conformance/) | The suite: 635 cases, their index, and the format of a case. Generated, except its README. |
| [`scripts/`](scripts/) | The reference reading of a record (`read.mjs`), the generator of the schemas and cases, the suite check and the mutation run. |
| [`images/`](images/) | The diagrams, in light and dark. |
| [`AGENTS.md`](AGENTS.md) | Instructions for a coding agent working in this repository. |

The schemas' `$id` values (`https://sanning.io/specs/schemas/sanning.agent/1/...`) are identifiers, not addresses: a validator loads the schemas from this repository's files and never fetches them.

## Run the suite

You need Node.js 22 or later.

```sh
CI=true npm ci     # the one dependency, the JSON Schema validator
npm test           # the committed files match the generator, and every case reads as expected
npm run mutate     # 194 alternative readings, each caught by at least one case
```

## Status

`sanning.agent/1` is version 1.0, with 635 cases. A change to a schema or to a case's reading is a new version. [`CHANGELOG.md`](CHANGELOG.md) lists the releases.

## License

MIT. See [`LICENSE`](LICENSE).
