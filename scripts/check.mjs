// The suite's own check, run by `npm test`:
//
// 1. The committed schemas and cases are exactly what scripts/generate.mjs writes.
// 2. The reference reader (scripts/read.mjs) reads every case as its expected.json says.
// 3. Every case that fails on the schema fails on exactly one schema error, except the cases in
//    `precedence`, which fail on at least two and pin which one is reported (agent-events.md 10.1).
// 4. Of what Sanning receives in private mode, every field of the record has a fixed format, and in
//    standard mode a fixed format or a name: no free text, and no hash or length of content in
//    either (agent-events.md 7). The envelope is not the record: its two caller-set fields are
//    stated there, not checked here.
// 5. agent-events.md names every type, field, reason and finding the schemas and reader use.
// 6. The section 7 table puts every field in the row of the least mode that receives it, and names no other.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import Ajv2020 from "ajv/dist/2020.js";

import { build } from "./generate.mjs";
import { jcs, scrub, sha256Hex } from "./lib.mjs";
import { createReader } from "./read.mjs";
import {
  AGENT_TYPES,
  COMMON_DEFS,
  CUSTOM_NAME,
  CONTENT_DERIVED,
  OPAQUE_ID,
  PACKAGE_NAME,
  PRIVATE_PATHS,
  RFC3339_UTC,
  SEMVER,
  UUID_V4,
  contextFor,
  isFieldPath,
  leaves,
  metadataFor,
  tierOf,
  typeSchema,
} from "./vocabulary.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_DIR = join(ROOT, "schemas", "sanning.agent", "1");
const CASES = join(ROOT, "conformance", "cases");
const failures = [];
const fail = (m) => failures.push(m);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

// 1. Reproducible.
const files = build();
for (const [rel, text] of Object.entries(files)) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) fail(`missing generated file ${rel}`);
  else if (readFileSync(p, "utf8") !== text) fail(`${rel} differs from what scripts/generate.mjs writes`);
}
for (const p of [...walk(join(ROOT, "schemas")), ...walk(CASES)]) {
  const rel = relative(ROOT, p).split("\\").join("/");
  if (!(rel in files)) fail(`${rel} is not written by scripts/generate.mjs`);
}

// 2 and 3. Every case.
const reader = createReader(SCHEMA_DIR);
const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const f of readdirSync(SCHEMA_DIR)) ajv.addSchema(JSON.parse(readFileSync(join(SCHEMA_DIR, f), "utf8")));
const SCHEMA_REASONS = new Set(["unknown_field", "missing_field", "bad_value"]);

let count = 0;
for (const group of readdirSync(CASES)) {
  for (const name of readdirSync(join(CASES, group))) {
    const dir = join(CASES, group, name);
    const id = `${group}/${name}`;
    count++;
    const subject = JSON.parse(readFileSync(join(dir, "record.json"), "utf8"));
    const heldPath = join(dir, "held.json");
    const held = existsSync(heldPath) ? JSON.parse(readFileSync(heldPath, "utf8")) : undefined;
    const expected = JSON.parse(readFileSync(join(dir, "expected.json"), "utf8"));

    const got = held === undefined ? reader.readRecord(subject.record) : reader.read(subject, held);
    const want = { verdict: expected.verdict, reason: expected.reason, at: expected.at, reasons: expected.reasons, findings: expected.findings };
    const have = { verdict: got.verdict, reason: got.reason, at: got.at, reasons: got.reasons, findings: got.findings };
    if (!isDeepStrictEqual(clean(want), clean(have))) {
      fail(`${id}: expected ${JSON.stringify(clean(want))}, read ${JSON.stringify(clean(have))}`);
    }
    const alone = reader.readRecord(subject.record);
    const valid = alone.verdict === "verified" || alone.verdict === null;
    // reason and at are the first reason of the reading's verdict, so they always lead the list.
    if (expected.reasons !== undefined && !isDeepStrictEqual(expected.reasons[0], { reason: expected.reason, at: expected.at })) {
      fail(`${id}: reason and at are not the first of reasons`);
    }
    if (valid !== expected.valid) fail(`${id}: valid is ${expected.valid}, the record alone reads ${alone.verdict}`);

    // A record outside this vocabulary has no schema here: step 1 reads its salt.
    if (SCHEMA_REASONS.has(expected.reason) && AGENT_TYPES.includes(subject.record.event_type)) {
      const v = ajv.getSchema(`https://sanning.io/specs/schemas/sanning.agent/1/${subject.record.event_type}.json`);
      v(subject.record);
      const n = (v.errors ?? []).length;
      if (group === "precedence" ? n < 2 : n !== 1) {
        fail(`${id}: ${group === "precedence" ? "a precedence case must fail on at least two errors" : "a schema case must fail on exactly one error"}, got ${JSON.stringify(v.errors)}`);
      }
    }
  }
}

// 2b. Every record a case holds is one an SDK can build: a record with no context.chain_key is
// unchained, so its previous_hash is GENESIS (events.md section 5). The one exception is the case
// that pins the rule.
const CHAIN_RULE_CASE = "rules/chain-key-without-chain";
for (const group of readdirSync(CASES)) {
  for (const name of readdirSync(join(CASES, group))) {
    const dir = join(CASES, group, name);
    const id = `${group}/${name}`;
    const heldPath = join(dir, "held.json");
    const all = [JSON.parse(readFileSync(join(dir, "record.json"), "utf8"))];
    if (existsSync(heldPath)) all.push(...JSON.parse(readFileSync(heldPath, "utf8")));
    for (const [i, h] of all.entries()) {
      const r = h.record;
      const unchained = !isObject(r?.context) || r.context.chain_key === undefined;
      if (r?.previous_hash !== "GENESIS" && unchained && !(id === CHAIN_RULE_CASE && i === 0)) {
        fail(`${id}: ${i === 0 ? "record.json" : `held.json[${i - 1}]`} has a previous_hash and no context.chain_key`);
      }
    }
  }
}

// 2c. Every valid case carries what its record commits to, and the record's hash is that file's:
// message.json for a hand-off, SHA-256 of the JCS bytes of the message, either case (message_hash);
// content.bin for a file that was read, SHA-256 of the bytes as they are (content_hash); otherwise
// content.json, SHA-256 of the JCS bytes of the object (content_hash). content_length, where
// present, is the length of the bytes hashed.
for (const name of readdirSync(join(CASES, "valid"))) {
  const dir = join(CASES, "valid", name);
  const { record } = JSON.parse(readFileSync(join(dir, "record.json"), "utf8"));
  const handoff = record.event_type.startsWith("agent.handoff.");
  const fileBytes = record.event_type === "agent.file" && record.metadata.outcome.status === "completed";
  const want = handoff ? "message.json" : fileBytes ? "content.bin" : "content.json";
  const have = ["message.json", "content.bin", "content.json"].filter((f) => existsSync(join(dir, f)));
  if (have.length !== 1 || have[0] !== want) {
    fail(`valid/${name}: carries ${JSON.stringify(have)}, not ${want}`);
    continue;
  }
  const raw = readFileSync(join(dir, want));
  let bytes = raw;
  if (want !== "content.bin") {
    const value = JSON.parse(raw.toString("utf8"));
    // A scrubbed record's content is the object after the scrub, so scrubbing it again changes nothing.
    if (record.context.content_scrubbed === true && !isDeepStrictEqual(scrub(value), value)) {
      fail(`valid/${name}: content.json is not the object after the credential scrub`);
    }
    bytes = Buffer.from(jcs(value), "utf8");
  }
  const hash = handoff ? record.event.message_hash.toLowerCase() : record.event.content_hash;
  if (sha256Hex(bytes) !== hash) fail(`valid/${name}: ${want} does not hash to the record's ${handoff ? "message_hash" : "content_hash"}`);
  if (!handoff && record.event.content_length !== undefined && record.event.content_length !== bytes.length) {
    fail(`valid/${name}: event.content_length is not the length of the bytes ${want} hashes to`);
  }
}

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function clean(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

// 4. No free text reaches Sanning in private mode.
const FIXED_PATTERNS = new Set([OPAQUE_ID, UUID_V4, PACKAGE_NAME, SEMVER, RFC3339_UTC, "^[0-9a-f]{32}$", "^[0-9a-f]{16}$", "^(GENESIS|[0-9a-f]{64})$"]);
function deref(s) {
  return s.$ref ? COMMON_DEFS[s.$ref.split("/").pop()] : s;
}
function fixedFormat(s0) {
  const s = deref(s0);
  if ("const" in s || "enum" in s) return true;
  if (s.type === "integer") return true;
  if (s.type === "array") return Number.isInteger(s.maxItems) && fixedFormat(s.items);
  if (s.type === "object") {
    return s.additionalProperties === false && Object.values(s.properties ?? {}).every(fixedFormat);
  }
  const types = [].concat(s.type);
  return types.includes("string") && FIXED_PATTERNS.has(s.pattern) && types.every((t) => t === "string" || t === "null");
}
for (const type of AGENT_TYPES) {
  const schema = typeSchema(type);
  for (const path of PRIVATE_PATHS) {
    let node = schema;
    for (const k of path.split(".")) node = node && deref(node).properties?.[k];
    if (node !== undefined && !fixedFormat(node)) fail(`${type}: ${path} is sent in private mode and admits free text`);
  }
}
// What standard adds to the fixed formats of private: a name (a label or a text, at most 256
// characters, no control characters), a number, and a key or the hash of a policy (64 hex).
function standardFormat(s0) {
  const s = deref(s0);
  if (fixedFormat(s)) return true;
  if (s.type === "array") return Number.isInteger(s.maxItems) && standardFormat(s.items);
  if (s.type === "number") return true;
  if (s.type === "string" && s.pattern === "^[0-9a-f]{64}$") return true;
  if (s.type === "string" && s.pattern === CUSTOM_NAME) return true;
  return s.type === "string" && s.pattern === COMMON_DEFS.label.pattern && Number.isInteger(s.maxLength) && s.maxLength <= 256;
}
/** Every leaf of a type's record, as [dotted path, schema]: a field of the mode table is one leaf. */
function recordLeaves(type, node, path = "") {
  const s = deref(node);
  if (path !== "" && (isFieldPath(type, path) || s.type !== "object" || s.properties === undefined)) return [[path, node]];
  return Object.entries(s.properties).flatMap(([k, sub]) => recordLeaves(type, sub, path === "" ? k : `${path}.${k}`));
}
for (const type of AGENT_TYPES) {
  for (const [path, node] of recordLeaves(type, typeSchema(type))) {
    const tier = tierOf(type, path);
    if (tier === "full") continue;
    if (CONTENT_DERIVED.has(path)) fail(`${type}: ${path} is a hash or a length of content and is sent in ${tier} mode`);
    if (tier === "standard" && !standardFormat(node)) {
      fail(`${type}: ${path} is sent in standard mode and admits free text`);
    }
  }
}

// 5. The spec names everything.
const spec = readFileSync(join(ROOT, "specs", "agent-events.md"), "utf8");
const named = (s) => spec.includes("`" + s + "`") || spec.includes("`metadata." + s + "`");
const wanted = new Set();
for (const type of AGENT_TYPES) {
  wanted.add(type);
  for (const [path] of leaves(metadataFor(type))) wanted.add(path);
  for (const [path] of leaves(contextFor(type))) wanted.add(`context.${path}`);
}
for (const code of [
  "event_type_not_in_set",
  "event_schema_misplaced",
  "event_schema_missing",
  "event_schema_invalid",
  "event_schema_unknown",
  "unknown_field",
  "missing_field",
  "bad_value",
  "hidden_field_present",
  "revealed_field_absent",
  "revealed_field_unlisted",
  "listed_record_absent",
  "unchecked_held_parts_missing",
  "unchecked_held_parts_mismatch",
  "unchecked_held_parts_exceed_file_parts",
  "file_parts_exceed_parts",
  "capture_not_at_head",
  "part_index_out_of_range",
  "closing_count_mismatch",
  "artifact_reason_mismatch",
  "pair_type_mismatch",
  "pair_run_mismatch",
  "pair_call_mismatch",
  "pair_field_mismatch",
  "handoff_parts_mismatch",
  "not_an_agent_record",
  "plumbing",
  "content_scrubbed",
  "unended",
  "start_absent",
  "start_ambiguous",
  "start_not_captured",
  "start_undeclared",
  "ended_more_than_once",
  "completed_with_open_operation",
  "data_mode_mixed",
  "seq_duplicate",
  "ran_after_refusal",
  "seq_gap",
  "closing_not_held",
]) {
  wanted.add(code);
}
for (const s of wanted) if (!named(s)) fail(`agent-events.md does not name \`${s}\``);

// 6. The section 7 table names every field of every type in the row of the least mode that receives
// it, and in no other row. A field is named by its path without "metadata."; all of `otel.*` is one.
{
  const section = spec.slice(spec.indexOf("\n## 7. "), spec.indexOf("\n## 8. "));
  const rows = {};
  for (const line of section.split("\n")) {
    const m = /^\| `(private|standard|full)`[^|]*\|(.*)\|\s*$/.exec(line);
    if (m) rows[m[1]] = new Set([...m[2].matchAll(/`([^`]+)`/g)].map((x) => x[1]));
  }
  for (const mode of ["private", "standard", "full"]) if (rows[mode] === undefined) fail(`agent-events.md section 7 has no ${mode} row`);
  if (Object.keys(rows).length === 3) {
    const real = new Set();
    for (const type of AGENT_TYPES) {
      for (const [path] of recordLeaves(type, typeSchema(type))) {
        const name = path.startsWith("metadata.") ? path.slice("metadata.".length) : path;
        const spelled = name === "otel" ? "otel.*" : name;
        real.add(spelled);
        const tier = tierOf(type, path);
        if (!rows[tier].has(spelled)) fail(`agent-events.md section 7 does not name \`${spelled}\` in the ${tier} row (${type})`);
        for (const other of Object.keys(rows)) {
          if (other !== tier && rows[other].has(spelled)) fail(`agent-events.md section 7 names \`${spelled}\` in the ${other} row, and it is ${tier}`);
        }
      }
    }
    // The other way: a row names only fields some schema has.
    for (const [mode, names] of Object.entries(rows)) {
      for (const n of names) if (!real.has(n)) fail(`agent-events.md section 7 names \`${n}\` in the ${mode} row, and no schema has that field`);
    }
  }
}

// Every case agent-events.md cites exists.
for (const m of spec.matchAll(/conformance\/cases\/([a-z0-9._-]+\/[a-z0-9._-]+)/g)) {
  if (!existsSync(join(CASES, m[1]))) fail(`agent-events.md cites conformance/cases/${m[1]}, which does not exist`);
}

if (failures.length > 0) {
  for (const f of failures) console.error("FAIL " + f);
  console.error(`${failures.length} failure(s), ${count} cases`);
  process.exit(1);
}
console.log(`ok: ${count} cases, ${Object.keys(files).length} generated files, spec names ${wanted.size} terms`);
