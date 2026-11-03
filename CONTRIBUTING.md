# Contributing

Thank you for reading the specifications closely enough to want to change them.

## Report a problem

Open an issue on this repository. Say which document and section, quote the sentence, and say what an implementation following it would do wrong. Where a case reads differently from the text, name it: `conformance/cases/GROUP/NAME`.

To report a vulnerability, do not open an issue. Follow [`SECURITY.md`](SECURITY.md).

## How the suite is built

Two scripts produce every generated file, and two check them:

- [`scripts/vocabulary.mjs`](scripts/vocabulary.mjs) defines every field of every type, and writes the schemas in [`schemas/sanning.agent/1/`](schemas/sanning.agent/1/).
- [`scripts/generate.mjs`](scripts/generate.mjs) writes every case in [`conformance/cases/`](conformance/cases/): the record, the records held beside it, the content it commits to, and the reading it expects.
- `npm test` runs [`scripts/check.mjs`](scripts/check.mjs). It checks that the committed schemas and cases are what the generator writes, reads every case with the reference reading in [`scripts/read.mjs`](scripts/read.mjs), checks that each case reads as its `expected.json` says, and checks that `agent-events.md` names every type, field, reason and finding the schemas and the reading use, with each field in the right row of its data mode table.
- `npm run mutate` runs [`scripts/mutate.mjs`](scripts/mutate.mjs). It changes the reference reading in 194 ways, each a reading a second implementation could make, and fails if any change leaves every case reading the same.

## Propose a change

Open a pull request. Before you open it:

1. Change the specification and, where the change touches a field, a type, a reason or a reading, [`scripts/vocabulary.mjs`](scripts/vocabulary.mjs) or [`scripts/generate.mjs`](scripts/generate.mjs).
2. Regenerate the schemas and cases, and run the suite and the alternative readings:

   ```sh
   npm run generate
   npm test
   npm run mutate
   ```

3. Commit the regenerated files. Never edit a schema or a case by hand: CI fails when the committed files differ from what the generator writes.

In the pull request, say what changes for an implementation: which readings move, which cases change, and whether the change adds (a minor version) or breaks (a major version). A change to a schema or to a case's reading is a new version of the vocabulary.

By contributing, you agree that your contribution is licensed under the MIT License of this repository.
