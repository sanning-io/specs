# Security

These specifications are part of a security product: a defect in a rule can let a verifier read tampered evidence as clean. Report one privately.

## Report a vulnerability

Email **security@sanning.io**. Do not open a public issue or pull request for a vulnerability.

Include:

- the document and section, or the case or script, the problem is in;
- what an attacker can do, and what a verifier reads as a result;
- a record or a case that shows it, if you have one.

Sanning acknowledges your report within 3 business days and keeps you informed while a fix is prepared.

## Scope

In scope: every rule in [`specs/`](specs/), the schemas, the conformance cases, and the reference reading in [`scripts/`](scripts/). A rule that lets tampered or nonconforming evidence read `verified` is in scope, and so is a case that pins such a reading.
