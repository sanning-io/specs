# AGENTS.md

Instructions for a coding agent working in this repository. A person starts at [`README.md`](README.md).

This repository specifies the `sanning.agent/1` vocabulary and the `sanning.events/v2` profile, and holds their JSON Schemas, a reference reading and a conformance suite. Everything runs offline.

## Which file wins

When two files disagree, the first in this list is right, and the other one is a defect to fix:

1. The specifications in [`specs/`](specs/). For the `sanning.events/v2` profile and the hand-off rules (`agent-events.md` sections 8.2 and 8.3), the envelope specification in `sanning-io/proof` governs, as `specs/events.md` and `agent-events.md` section 8.2 say.
2. The schemas in [`schemas/sanning.agent/1/`](schemas/sanning.agent/1/).
3. The cases in [`conformance/cases/`](conformance/cases/).
4. The reference reading, [`scripts/read.mjs`](scripts/read.mjs).

## Generated files

Never edit these by hand. CI regenerates them and fails when the committed files differ.

| Files | Written by | From |
|---|---|---|
| `schemas/sanning.agent/1/*.json` | `npm run generate` | [`scripts/vocabulary.mjs`](scripts/vocabulary.mjs) |
| `conformance/cases/**` | `npm run generate` | [`scripts/generate.mjs`](scripts/generate.mjs) |
| `conformance/index.md`, `conformance/index.json` | `npm run generate` | [`scripts/generate.mjs`](scripts/generate.mjs) |

Everything else is written by hand: `specs/`, `scripts/`, the README files, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, and the diagrams in `images/`.

## Commands

Node.js 22 or later. Run each from the repository root.

```sh
CI=true npm ci     # install the one dependency, the JSON Schema validator
npm run generate   # rewrite the schemas, the cases and the index
npm test           # the committed files match the generator, every case reads as expected.json says, and agent-events.md names every type, field, reason and finding
npm run mutate     # 194 alternative readings; fails if any one leaves every case reading the same
```

A change is ready when `npm run generate` changes no committed file, and `npm test` and `npm run mutate` pass.

## The format of a case

One directory per case, `conformance/cases/<group>/<name>/`, holding `record.json` (the record under test), `expected.json` (its reading) and, where the case needs them, `held.json`, `sent.json` and a content file. [`conformance/README.md`](conformance/README.md) defines every file and every member of `expected.json`, and [`conformance/index.md`](conformance/index.md) lists the cases.

## Rules for a change

- Change the specification and the generator together, in one pull request.
- A case `agent-events.md` cites must exist: `npm test` checks every `conformance/cases/...` link.
- A change to a schema or to a case's reading is a new version of the vocabulary. Say in the pull request whether it adds (a minor version) or breaks (a major version), and add it to [`CHANGELOG.md`](CHANGELOG.md).
- Never weaken a case to make a reading pass. Fix the reading, or change the rule in the specification first.
