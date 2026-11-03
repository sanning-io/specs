# Sanning specifications

This repository specifies `sanning.agent/1`, the vocabulary of records an AI agent writes when it runs, and the `sanning.events/v2` profile that signs and carries them. It also holds the JSON Schemas that check each record, a reference reading of a record, and a conformance suite every implementation runs.

Everything here works offline: you need no account, no API key and no network to read a specification, validate a record or run the suite. Verification is client-side, and Sanning is never in the trust path: no rule in this repository asks a verifier to believe anything Sanning says.

A customer hashes its data locally and signs an event record that commits to it by hash. Only a Merkle root over many envelopes goes on a permanent public record.

The data mode decides what Sanning receives:

- **`private`** (the default): the signed envelope and a fixed list of the record's fields, never the content.
- **`standard`**: more of the record's clear fields, never the content or a hash or length of it.
- **`full`**: every field, and the content as well.

All three are defined so records read the same whatever a service offers. Sanning's service offers only `private` today ([`specs/agent-events.md`](specs/agent-events.md) section 7).

## How the documents fit together

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/record-path-dark.png">
  <img alt="The path of one record. An agent action becomes an event record in the sanning.agent/1 vocabulary (agent-events.md). The SDK signs it in an envelope under the sanning.events/v2 profile (events.md section 2). Sanning stamps many envelopes into one Merkle root on a permanent public record (events.md section 6). The records, envelopes, inclusion proofs and stamps are collected into an evidence pack for a third party. A reader verifies the pack offline and gets one verdict: Verified, Failed or Incomplete." src="images/record-path.png" width="820">
</picture>

One record takes this path:

1. An agent action becomes an **event record**, in the `sanning.agent/1` vocabulary. The agent hashes the content locally, and the record contains only the hash.
2. The SDK signs the record in a **signed envelope** under the `sanning.events/v2` profile. The envelope contains `payload_hash`, the SHA-256 of the record's canonical bytes, and an Ed25519 signature.
3. Sanning places the envelope in an **interval stamp**: one Merkle root over many envelopes, anchored on a permanent public record. The envelopes are not public; only the root is.
4. The holder collects records, envelopes, their inclusion proofs and the stamps into an **evidence pack** for a third party.
5. A reader verifies the pack **offline**, on its own machine, and gets one verdict: `verified`, `failed` or `incomplete`.

This release specifies the record, the envelope, and the leaf and tree of a stamp (steps 1 to 3), and how a verifier reads one record and a hand-off pair. A later release specifies how a holder obtains an inclusion proof, the format of an evidence pack, where a stamp is published, and the verdicts over a pack.

Each section of an event record is defined in one place:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/record-sections-dark.png">
  <img alt="The sections of one event record and where each is defined. The core is defined in events.md section 3, and the closed set of types in agent-events.md section 3. The event section, what the record commits to, in agent-events.md section 4.2, and for hand-offs also in agent-events.md section 8. The context section in agent-events.md section 4.3 and events.md section 3. The metadata section, the clear fields, in agent-events.md sections 4.4 to 5. The extras section, the vocabulary version, in agent-events.md section 2." src="images/record-sections.png" width="760">
</picture>

## Terms

- **Event record**: the JSON record an agent writes for one step of its work. It commits to the step's content by hash and holds the facts an auditor reads in clear.
- **Envelope**: the signed object that contains a record's SHA-256 (`payload_hash`), an Ed25519 signature and the signing key. It says nothing about what was recorded.
- **Interval stamp**: one Merkle root over the envelopes of an interval, anchored on a permanent public record.
- **Evidence pack**: what a holder gives a third party to verify: records, their envelopes, their inclusion proofs and the stamps. A later release specifies its format.
- **Verifier**: an implementation that reads records on its own machine and gives each a verdict. [`scripts/read.mjs`](scripts/read.mjs) is the reference reading of a record.
- **Verdict**: one of three words. A pack reads no better than its worst record, and a case, a reading of several packs together, reads its worst pack.
  - `verified`: every check holds.
  - `failed`: a check proves the record wrong.
  - `incomplete`: nothing is proven wrong, and a check could not be completed.
- **Finding**: a note beside a verdict, such as a start with no end. A finding never changes a verdict.

## The documents, in reading order

| Document | What it specifies |
|---|---|
| [`specs/agent-events.md`](specs/agent-events.md) | The `sanning.agent/1` vocabulary: the 19 record types an agent writes, every field, what each commits to by hash, what Sanning receives in each data mode, how hand-offs between agents pair, and how a verifier reads a record (section 10). |
| [`specs/events.md`](specs/events.md) | The `sanning.events/v2` profile: the envelope, the event record and its sections, the closed set of types, chains, the record salt and the interval stamp. |

Read `agent-events.md` sections 1 to 3 first: what a record proves and what it does not, where the vocabulary sits, and the closed set of types. Then start where your question is:

- **You write an adapter** for an agent framework. Read `agent-events.md` sections 4 to 9 for the fields you emit, and section 11 for what your SDK refuses to sign.
- **You write a verifier.** Read `events.md` sections 2 and 7 for the envelope, then `agent-events.md` section 10 for one record and section 8.3 for a hand-off pair.
- **You audit agent evidence.** Read `agent-events.md` section 7, what Sanning receives in each data mode, and section 10, what each verdict and finding means.

`MUST`, `MUST NOT`, `SHOULD` and `MAY` carry their RFC 2119 meanings wherever they appear in capitals.

## What is in this repository

| Path | What it is |
|---|---|
| [`specs/`](specs/) | The two specifications. |
| [`schemas/sanning.agent/1/`](schemas/sanning.agent/1/) | One JSON Schema (draft 2020-12) per `sanning.agent/1` type, plus `common.json`. |
| [`conformance/cases/`](conformance/cases/) | The `sanning.agent/1` suite: 635 cases, one directory each. [`conformance/README.md`](conformance/README.md) gives the format of a case. |
| [`scripts/`](scripts/) | The reference reading of a record, the generator of the schemas and cases, the suite check and the mutation run. |
| [`images/`](images/) | The diagrams on this page, in light and dark. |

The schemas' `$id` values (`https://sanning.io/specs/schemas/sanning.agent/1/...`) are identifiers, not addresses: a validator loads the schemas from this repository's files and never fetches them.

## Run the suite

You need Node.js 22 or later.

1. Install the one dependency, the JSON Schema validator:

   ```sh
   CI=true npm ci
   ```

2. Run the suite. The command checks that the committed schemas and cases are what the generator writes, and reads every case with the reference reading:

   ```sh
   npm test
   ```

3. Read one record. This reads a case's record on its own, steps 1 to 6 of `agent-events.md` section 10:

   ```sh
   node --input-type=module -e '
   import { readFileSync } from "node:fs";
   import { createReader } from "./scripts/read.mjs";
   const reader = createReader("schemas/sanning.agent/1");
   const file = "conformance/cases/rules/response-id-free-text/record.json";
   const { record } = JSON.parse(readFileSync(file, "utf8"));
   console.log(reader.readRecord(record));
   '
   ```

   It prints a `failed` reading, reason `bad_value`, at `/metadata/gen_ai/response/id`: the SDK sends the response id to Sanning in `private` mode, so free text there is refused. To read a record of your own, put its event record in place of `record`.

4. Optional: run the alternative readings. `npm run mutate` changes the reference reading in 194 ways, each one a reading a second implementation could make, and checks that each one changes the reading of at least one case.

To change a field or a case, change [`scripts/vocabulary.mjs`](scripts/vocabulary.mjs) or [`scripts/generate.mjs`](scripts/generate.mjs) and the specification, then run `npm run generate` and `npm test`.

## Claim conformance

- **A verifier of `sanning.agent/1`** reads each case's `record.json`, with `held.json` beside it where present, and produces the `verdict`, `reason`, `at`, `reasons` and `findings` of its `expected.json`, for every case.
- **An SDK** signs the record of every case whose `expected.json` says `"valid": true` and refuses every case that says `"valid": false`, hashes each valid case's content file to its record's hash, and for each mode case sends Sanning exactly the fields in its `sent.json`.

State the commit of this repository your implementation passed against. There is nothing to register and nothing to send: a claim is your implementation's output on the suite, which anyone can rerun.

**What passing proves.** A verifier that passes the cases reads every case as the reference reading does, and makes none of the 194 alternative readings in [`scripts/mutate.mjs`](scripts/mutate.mjs). A reading of `agent-events.md` section 10 that is not in that file is not known to be pinned.

**What passing does not prove.**

- **The envelope and the hand-off pair**: the cases read each record after its envelope verified, so no case carries a signature, and no case pins a hand-off pair reading (`agent-events.md` section 8.3) or a receiver's results on the parts of a message (section 8.2).
- **Producer-side behavior**: the suite has no input a framework passes to an adapter, so it cannot check that an adapter picks the right object, scrubs only credentials, keeps the root run id, names the provider from the endpoint, marks plumbing from what the framework reports, or counts the parts it did not check. `agent-events.md` section 11 lists these obligations.
- **Meaning**: the schemas bound the shape and length of every field, never what it says.

## Status

`sanning.agent/1` is version 1.0, with 635 cases. A change to a schema or to a case's reading is a new version. [`CHANGELOG.md`](CHANGELOG.md) lists the releases.

## Contributing and security

To report a problem or propose a change, see [`CONTRIBUTING.md`](CONTRIBUTING.md). To report a vulnerability, see [`SECURITY.md`](SECURITY.md).

## License

MIT. See [`LICENSE`](LICENSE).
