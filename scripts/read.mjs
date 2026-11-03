// The reference reading of a sanning.agent/1 record: agent-events.md section 10, step by step.
//
// It reads only the schemas on disk and the records it is given. Every step names the section it
// implements, so a second implementation can be checked against it line by line. It runs offline
// and calls nothing.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

import { jcs, jcsHash } from "./lib.mjs";

const AGENT_PREFIX = "agent.";
// Step 2: sanning.agent/<major>[.<minor>], each 1 to 9 digits with no leading zero, minor never 0.
const EVENT_SCHEMA_RE = /^sanning\.agent\/[1-9][0-9]{0,8}(\.[1-9][0-9]{0,8})?$/;
// Step 1: the records outside this vocabulary that a sanning.events/v2 record can be.
const OUTSIDE = new Set([
  "event",
  "checkpoint",
  "declaration",
  "runner.run_opened",
  "runner.run_closed",
  "runner.egress",
  "runner.relay",
]);

const OPENER = {
  "agent.step.ended": "agent.step.started",
  "agent.model_call.ended": "agent.model_call.started",
  "agent.tool_call.ended": "agent.tool_call.started",
  "agent.retrieval.ended": "agent.retrieval.started",
  "agent.approval.resolved": "agent.approval.requested",
};
// Step 1: the record salt, the same form on every sanning.events/v2 record (events.md section 3).
const SALT_RE = /^[0-9a-f]{32}$/;

const CLOSER = Object.fromEntries(Object.entries(OPENER).map(([c, o]) => [o, c]));

// Step 7a: the checks on a candidate start, worst first. The worst failing check over every
// candidate is the reading. Candidates are under the end's key, so the signer is not a check.
const PAIR_REASONS = [
  "pair_type_mismatch",
  "pair_run_mismatch",
  "pair_call_mismatch",
  "pair_field_mismatch",
];
// Step 7a: the fields the two halves of one operation agree on where both commit a value, in the
// order they are checked.
const PAIR_FIELDS = [
  "gen_ai.operation.name",
  "gen_ai.provider.name",
  "gen_ai.tool.name",
  "approval.subject_event_id",
  "approval.actor",
  "approval.policy_hash",
];
// Step 7h: the verdicts that tell the adapter not to run the tool.
const REFUSALS = new Set(["rejected", "responded"]);
// Step 7h: the end statuses that say the tool ran.
const RAN = new Set(["completed", "failed"]);
// The two reasons that read incomplete: a check that could not be completed. Every other reason reads
// failed, with the reason kind nonconforming.
const INCOMPLETE = new Set(["event_schema_unknown", "listed_record_absent"]);
// Step 4: when a record breaks the schema in several places, the reason that comes first here is
// reported, then the smallest JSON Pointer.
const SCHEMA_REASONS = ["unknown_field", "missing_field", "bad_value"];

/** Load every schema under `dir` (schemas/sanning.agent/1) and return a reader. */
export function createReader(dir) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const schemas = {};
  for (const f of files) {
    const s = JSON.parse(readFileSync(join(dir, f), "utf8"));
    ajv.addSchema(s);
    if (f !== "common.json") schemas[s.title] = s;
  }
  const validators = Object.fromEntries(
    Object.entries(schemas).map(([type, s]) => [type, ajv.getSchema(s.$id)]),
  );
  // The versions this reader knows, and the types each one defines.
  const known = { "sanning.agent/1": new Set(Object.keys(schemas)) };

  function revealableOf(type) {
    return schemas[type].properties.context.properties.revealed?.items.enum ?? [];
  }

  /** Steps 1 to 6: one record on its own. */
  function readRecord(record) {
    const type = record?.event_type;
    const extras = record?.extras;
    const hasSchema = isObject(extras) && has(extras, "event_schema");
    // Step 1: the namespace.
    if (typeof type === "string" && OUTSIDE.has(type)) {
      if (hasSchema) return failed("event_schema_misplaced", "/extras/event_schema");
      // The salt is optional here, so a record without one still reads; one present is checked
      // for its form only.
      const ctx = record.context;
      if (isObject(ctx) && has(ctx, "salt") && !(typeof ctx.salt === "string" && SALT_RE.test(ctx.salt))) {
        return failed("bad_value", "/context/salt");
      }
      return { verdict: null, findings: ["not_an_agent_record"] };
    }
    if (typeof type !== "string" || !type.startsWith(AGENT_PREFIX)) {
      return failed("event_type_not_in_set", "/event_type");
    }
    // Step 2: the version, before the type, so a type a later minor adds reads incomplete.
    if (!hasSchema) return failed("event_schema_missing", "/extras/event_schema");
    const version = extras.event_schema;
    if (typeof version !== "string" || !EVENT_SCHEMA_RE.test(version)) {
      return failed("event_schema_invalid", "/extras/event_schema");
    }
    if (!has(known, version)) {
      const at = "/extras/event_schema";
      return { verdict: "incomplete", reason: "event_schema_unknown", at, reasons: [{ reason: "event_schema_unknown", at }], findings: [] };
    }
    // Step 3: the type, in the closed set of that version.
    if (!known[version].has(type)) return failed("event_type_not_in_set", "/event_type");
    // Step 4: the schema.
    const validate = validators[type];
    if (!validate(record)) {
      const e = pickError(record, validate.errors);
      return failed(e.reason, e.at);
    }
    // Step 5: the rules the schema cannot state, in this order.
    const ctx = record.context;
    const meta = record.metadata;
    for (const path of Object.keys(ctx.hidden ?? {}).sort()) {
      if (present(meta, path)) return failed("hidden_field_present", pointer(path));
    }
    const revealed = new Set(ctx.revealed ?? []);
    for (const path of [...revealed].sort()) {
      if (!present(meta, path)) return failed("revealed_field_absent", pointer(path));
    }
    for (const path of [...revealableOf(type)].sort()) {
      if (present(meta, path) && !revealed.has(path)) return failed("revealed_field_unlisted", pointer(path));
    }
    if (meta.capture !== undefined && meta.run.seq !== 0) return failed("capture_not_at_head", "/metadata/capture");
    if (type.startsWith("agent.handoff.")) {
      const h = meta.handoff;
      if (h.file_parts > h.parts) return failed("file_parts_exceed_parts", "/metadata/handoff/file_parts");
      if (type === "agent.handoff.received") {
        const indexes = h.unchecked_held_parts;
        const count = ctx.unchecked_held_part_count;
        if (indexes !== undefined && count === undefined) {
          return failed("unchecked_held_parts_missing", "/context/unchecked_held_part_count");
        }
        if (indexes === undefined && count !== undefined) {
          return failed("unchecked_held_parts_missing", "/metadata/handoff/unchecked_held_parts");
        }
        if (count !== undefined && count !== indexes.length) {
          return failed("unchecked_held_parts_mismatch", "/context/unchecked_held_part_count");
        }
        if (count !== undefined && count > h.file_parts) {
          return failed("unchecked_held_parts_exceed_file_parts", "/context/unchecked_held_part_count");
        }
        for (const [i, index] of (indexes ?? []).entries()) {
          if (index >= h.parts) return failed("part_index_out_of_range", `/metadata/handoff/unchecked_held_parts/${i}`);
        }
      }
    }
    if (type === "agent.run_closed" && meta.closing.record_ids.length !== meta.closing.record_count) {
      return failed("closing_count_mismatch", "/metadata/closing/record_count");
    }
    if (type === "agent.file") {
      const unhashed = meta.outcome.status === "failed";
      if (unhashed !== (meta.artifact?.reason !== undefined)) {
        return failed("artifact_reason_mismatch", "/metadata/artifact/reason");
      }
    }
    // Step 6: verified, with the findings a reader shows.
    const findings = [];
    if (meta.run.plumbing === true) findings.push("plumbing");
    if (ctx.content_scrubbed === true) findings.push("content_scrubbed");
    return { verdict: "verified", findings };
  }

  /**
   * Steps 1 to 7: the record under test, with the records the reader holds beside it. Each item is
   * { event_id, public_key, record }, as a reader has it after the envelope layer verified it.
   */
  function read(subject, held = []) {
    const one = readRecord(subject.record);
    if (one.verdict !== "verified") return one;
    const record = subject.record;
    const type = record.event_type;
    const run = record.metadata.run;
    const key = keyOf(subject.public_key);
    const findings = [...one.findings];
    // Every sub-step of step 7 runs, and every reason it gives is kept, in step order.
    const reasons = [];
    // The held records are a set: one record held twice is one record (sameRecord). The record itself
    // is not one of its held records, so a held copy of it is set aside; a held record with its
    // event_id and other bytes is another record and stays. Only a held record that itself reads
    // verified at steps 1 to 6 takes part in step 7.
    const peers = distinct(held).filter((h) => !sameRecord(h, subject) && readRecord(h.record).verdict === "verified");
    // The records of this invocation under this key: the record itself and its held peers.
    const mine = distinct([subject, ...peers]).filter(
      (h) => keyOf(h.public_key) === key && h.record.metadata.run.root_run_id === run.root_run_id,
    );

    // Step 7a: an end and the record it names.
    const opener = OPENER[type];
    if (opener !== undefined && run.started_event_id === null) {
      // The invocation's first record is its one record at run.seq 0. With two, it has none, and no
      // declaration counts (step 7g names the second).
      const heads = mine.filter((h) => h.record.metadata.run.seq === 0);
      const declared = heads.length === 1 && (heads[0].record.metadata.capture?.not_captured ?? []).includes(opener);
      findings.push(declared ? "start_not_captured" : "start_undeclared");
    } else if (opener !== undefined) {
      // A candidate is a record this key signed under the event_id the end names: candidacy is bound
      // to the signer. A record another key signed is never this end's start.
      const candidates = peers.filter((h) => h.event_id === run.started_event_id && keyOf(h.public_key) === key);
      if (candidates.length === 0) findings.push("start_absent");
      if (candidates.length > 1) findings.push("start_ambiguous");
      let worst;
      for (const c of candidates) {
        const g = gradePair(record, c.record, opener);
        if (g !== undefined && (worst === undefined || compareGrade(g, worst) < 0)) worst = g;
      }
      if (worst !== undefined) reasons.push({ reason: worst.reason, at: worst.at });
    }
    // Step 7b: a start and the records that end it.
    if (CLOSER[type] !== undefined) {
      const ends = endsOf(subject, peers);
      if (ends.length === 0) findings.push("unended");
      if (ends.length > 1) findings.push("ended_more_than_once");
    }
    // Step 7c: a closing record, judged only on every record it lists.
    if (type === "agent.run_closed") {
      const ids = record.metadata.closing.record_ids;
      let absent = 0;
      for (const [i, id] of ids.entries()) {
        if (!peers.some((h) => h.event_id === id && keyOf(h.public_key) === key)) {
          reasons.push({ reason: "listed_record_absent", at: `/metadata/closing/record_ids/${i}` });
          absent++;
        }
      }
      if (absent === 0 && record.metadata.closing.outcome.observed.status === "completed") {
        const listed = new Set(ids);
        const open = peers.some(
          (h) =>
            listed.has(h.event_id) &&
            keyOf(h.public_key) === key &&
            CLOSER[h.record.event_type] !== undefined &&
            !endsOf(h, peers).some((e) => listed.has(e.event_id)),
        );
        if (open) findings.push("completed_with_open_operation");
      }
    }
    // Step 7d: the two records of one hand-off message agree on its parts.
    if (type.startsWith("agent.handoff.")) {
      const other = type === "agent.handoff.sent" ? "agent.handoff.received" : "agent.handoff.sent";
      const named = keyOf(record.event.counterparty_public_key);
      const hash = record.event.message_hash.toLowerCase();
      // Candidates for each other: each is signed by the key the other names.
      const counterparts = peers.filter(
        (h) =>
          h.record.event_type === other &&
          keyOf(h.public_key) === named &&
          keyOf(h.record.event.counterparty_public_key) === key &&
          h.record.event.message_hash.toLowerCase() === hash,
      );
      // A finding on both records, never a verdict: two keys signed them, so a verdict would let one
      // side's count make the other side's honest record read failed.
      const counts = (h) => [h.metadata.handoff.parts, h.metadata.handoff.file_parts].join("/");
      if (counterparts.some((h) => counts(h.record) !== counts(record))) findings.push("handoff_parts_mismatch");
    }
    // Step 7f: one invocation, one data mode.
    const mixed = peers.some(
      (h) =>
        keyOf(h.public_key) === key &&
        h.record.metadata.run.root_run_id === run.root_run_id &&
        h.record.context.data_mode !== record.context.data_mode,
    );
    if (mixed) findings.push("data_mode_mixed");
    // Step 7g: one record at each position of the invocation's chain.
    if (mine.some((h) => !sameRecord(h, subject) && h.record.metadata.run.seq === run.seq)) {
      findings.push("seq_duplicate");
    }
    // Step 7h: a tool call that ran after its approval refused it. A refusal is an answer, under this
    // key, whose subject is this call's start and whose verdict is rejected or responded. Only an end
    // that says the tool ran (completed or failed) is read: skipped did not run, and interrupted ended
    // at an interrupt, before any answer.
    if (type === "agent.tool_call.ended" && run.started_event_id !== null) {
      const refused = peers.some(
        (h) =>
          h.record.event_type === "agent.approval.resolved" &&
          keyOf(h.public_key) === key &&
          h.record.metadata.approval.subject_event_id === run.started_event_id &&
          REFUSALS.has(h.record.metadata.approval.verdict),
      );
      if (refused && RAN.has(record.metadata.outcome.status)) findings.push("ran_after_refusal");
    }
    // Step 7i: the position directly before this record is not held, and an earlier one of this
    // invocation is. The run may be incomplete; the verifier cannot tell missing from never written.
    if (
      run.seq > 0 &&
      mine.some((h) => h.record.metadata.run.seq < run.seq) &&
      !mine.some((h) => h.record.metadata.run.seq === run.seq - 1)
    ) {
      findings.push("seq_gap");
    }
    // Step 7j: the run promised a closing record, and none of this invocation is held.
    if (type === "agent.run_opened" && !mine.some((h) => h.record.event_type === "agent.run_closed")) {
      findings.push("closing_not_held");
    }
    return reading(reasons, findings);
  }

  /** Step 7b: the held records that end `start`: under its key, they name it and grade clean (7a). */
  function endsOf(start, peers) {
    const closer = CLOSER[start.record.event_type];
    return peers.filter(
      (h) =>
        h.record.event_type === closer &&
        keyOf(h.public_key) === keyOf(start.public_key) &&
        h.record.metadata.run.started_event_id === start.event_id &&
        gradePair(h.record, start.record, start.record.event_type) === undefined,
    );
  }

  return { readRecord, read, schemas };
}

/**
 * Step 7: the reading from every reason step 7 gave. The verdict is the worst (failed, then
 * incomplete); `reason` and `at` are the first reason of that verdict, for a one-line summary.
 */
function reading(reasons, findings) {
  if (reasons.length === 0) return { verdict: "verified", findings };
  const verdict = reasons.some((r) => !INCOMPLETE.has(r.reason)) ? "failed" : "incomplete";
  const first = reasons.find((r) => (verdict === "incomplete") === INCOMPLETE.has(r.reason));
  return { verdict, reason: first.reason, at: first.at, reasons, findings };
}

/** Step 7a: one candidate start, under the end's key, graded against the end. undefined when it is the end's start. */
function gradePair(end, start, opener) {
  const at = "/metadata/run/started_event_id";
  if (start.event_type !== opener) return grade("pair_type_mismatch", at);
  const a = end.metadata;
  const b = start.metadata;
  if (a.run.run_id !== b.run.run_id || a.run.root_run_id !== b.run.root_run_id) {
    // The one exception: an approval answered in a later invocation of the same conversation. Both
    // ids differ: a resumed invocation runs the answer as its own operation.
    const approval = end.event_type === "agent.approval.resolved";
    const conv = a.gen_ai?.conversation?.id;
    const both = a.run.run_id !== b.run.run_id && a.run.root_run_id !== b.run.root_run_id;
    if (!approval || !both || conv === undefined || conv !== b.gen_ai?.conversation?.id) return grade("pair_run_mismatch", at);
  }
  if (end.event_type === "agent.tool_call.ended" && a.gen_ai.tool.call.id !== b.gen_ai.tool.call.id) {
    return grade("pair_call_mismatch", at);
  }
  for (const [i, path] of PAIR_FIELDS.entries()) {
    const x = committed(end, path);
    const y = committed(start, path);
    if (x !== undefined && y !== undefined && x !== y) return grade("pair_field_mismatch", pointer(path), i);
  }
  return undefined;
}

function grade(reason, at, field = -1) {
  return { reason, at, rank: [PAIR_REASONS.indexOf(reason), field] };
}

function compareGrade(a, b) {
  return a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1];
}

/**
 * What a record commits to for a field: SHA-256 of the JCS bytes of its value, or its hidden hash. A
 * value JCS cannot encode has no hash, so it never equals a hidden one, and equals only itself.
 */
function committed(record, path) {
  if (present(record.metadata, path)) {
    const value = lookup(record.metadata, path);
    return encodable(value) ? jcsHash(value) : `unencodable:${JSON.stringify(value)}`;
  }
  return record.context.hidden?.[path];
}

/** Whether JCS (RFC 8785) can encode a value: no lone surrogate in a string, no integer past 2^53 - 1. */
function encodable(value) {
  if (typeof value === "string") return !/\p{Surrogate}/u.test(value);
  if (typeof value === "number") return !Number.isInteger(value) || Number.isSafeInteger(value);
  if (Array.isArray(value)) return value.every(encodable);
  if (isObject(value)) return Object.entries(value).every(([k, v]) => encodable(k) && encodable(v));
  return true;
}

/** Two held records are one record when their event ids, their keys and their JCS bytes are equal. */
function sameRecord(x, y) {
  return x.event_id === y.event_id && keyOf(x.public_key) === keyOf(y.public_key) && jcs(x.record) === jcs(y.record);
}

/** The held records as a set: the first of each group of copies (sameRecord). */
function distinct(list) {
  return list.filter((h, i) => list.findIndex((x) => sameRecord(x, h)) === i);
}

/** A key compared as a key: 64 hex characters, case ignored (agent-events.md section 10, step 7). */
function keyOf(k) {
  return String(k).toLowerCase();
}

/** Steps 1 to 6 stop at the first failure: one reason. A failed record's reason kind is nonconforming. */
function failed(reason, at) {
  return { verdict: "failed", reason, at, reasons: [{ reason, at }], findings: [] };
}

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function has(obj, k) {
  return Object.prototype.hasOwnProperty.call(obj, k);
}

/** A member is present when its key is there, whatever its value: a null value is present. */
function present(obj, dotted) {
  let cur = obj;
  for (const k of dotted.split(".")) {
    if (!isObject(cur) || !has(cur, k)) return false;
    cur = cur[k];
  }
  return true;
}

function lookup(obj, dotted) {
  let cur = obj;
  for (const k of dotted.split(".")) cur = cur[k];
  return cur;
}

function pointer(dotted) {
  return "/metadata/" + dotted.split(".").map(escapeToken).join("/");
}

function escapeToken(t) {
  return String(t).replaceAll("~", "~0").replaceAll("/", "~1");
}

/**
 * Step 4: every schema error as a reason and a JSON Pointer, and the one reported: the reason that
 * comes first in SCHEMA_REASONS, then the smallest pointer. Pointers compare token by token, an
 * array index as a number and any other token by UTF-16 code units; a pointer comes before every
 * pointer it is a prefix of.
 */
function pickError(record, errors) {
  const all = errors.map((e) => {
    if (e.keyword === "additionalProperties") {
      return { reason: "unknown_field", at: `${e.instancePath}/${escapeToken(e.params.additionalProperty)}` };
    }
    if (e.keyword === "required") {
      return { reason: "missing_field", at: `${e.instancePath}/${escapeToken(e.params.missingProperty)}` };
    }
    return { reason: "bad_value", at: e.instancePath };
  });
  all.sort(
    (a, b) => SCHEMA_REASONS.indexOf(a.reason) - SCHEMA_REASONS.indexOf(b.reason) || comparePointers(record, a.at, b.at),
  );
  return all[0];
}

function tokens(p) {
  return p === "" ? [] : p.slice(1).split("/").map((t) => t.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function comparePointers(record, a, b) {
  const x = tokens(a);
  const y = tokens(b);
  let container = record;
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) {
      if (Array.isArray(container)) return Number(x[i]) - Number(y[i]);
      return x[i] < y[i] ? -1 : 1;
    }
    container = container?.[x[i]];
  }
  return x.length - y.length;
}
