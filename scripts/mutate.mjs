// Alternative readings of agent-events.md section 10, run against the suite: `npm run mutate`.
//
// Each mutation is one change to scripts/read.mjs that a second implementation could plausibly make.
// It is applied alone, the mutant reads every case, and the mutation is killed when at least one
// case reads differently. A mutation that survives is a reading the suite does not pin. Mutants are
// written to a temporary directory and removed afterwards; nothing in the repository changes.

import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { AGENT_TYPES } from "./vocabulary.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const H = mkdtempSync(join(tmpdir(), "sanning-mutants-"));
const src = readFileSync(join(ROOT, "scripts/read.mjs"), "utf8")
  .replace('from "ajv/dist/2020.js"', `from "${pathToFileURL(join(ROOT, "node_modules/ajv/dist/2020.js")).href}"`)
  .replace('from "./lib.mjs"', `from "${pathToFileURL(join(ROOT, "scripts/lib.mjs")).href}"`);
const HIDDEN_LOOP = `    for (const path of Object.keys(ctx.hidden ?? {}).sort()) {
      if (present(meta, path)) return failed("hidden_field_present", pointer(path));
    }
`;
const CAPTURE = `    if (meta.capture !== undefined && meta.run.seq !== 0) return failed("capture_not_at_head", "/metadata/capture");
`;
const FILE_PARTS = `      if (h.file_parts > h.parts) return failed("file_parts_exceed_parts", "/metadata/handoff/file_parts");
`;
const MISMATCH = `        if (count !== undefined && count !== indexes.length) {
          return failed("unchecked_held_parts_mismatch", "/context/unchecked_held_part_count");
        }
`;
const EXCEED = `        if (count !== undefined && count > h.file_parts) {
          return failed("unchecked_held_parts_exceed_file_parts", "/context/unchecked_held_part_count");
        }
`;
const INDEXES = `        for (const [i, index] of (indexes ?? []).entries()) {
          if (index >= h.parts) return failed("part_index_out_of_range", \`/metadata/handoff/unchecked_held_parts/\${i}\`);
        }
`;
const ARTIFACT = `    if (type === "agent.file") {
      const unhashed = meta.outcome.status === "failed";
      if (unhashed !== (meta.artifact?.reason !== undefined)) {
        return failed("artifact_reason_mismatch", "/metadata/artifact/reason");
      }
    }
`;
const STEP6 = "    // Step 6: verified, with the findings a reader shows.\n";
const UNLISTED = "    for (const path of [...revealableOf(type)].sort()) {\n";
const PEERS = 'const peers = distinct(held).filter((h) => !sameRecord(h, subject) && readRecord(h.record).verdict === "verified");';
const SEVEN_G = "    if (mine.some((h) => !sameRecord(h, subject) && h.record.metadata.run.seq === run.seq)) {";
const M = {
  // --- the version, the type and the schema (steps 1 to 4) ---
  "1.0 is an alias of 1": [["(\\.[1-9][0-9]{0,8})?$/;", "(\\.[0-9]{1,9})?$/;"], ['const known = { "sanning.agent/1": new Set(Object.keys(schemas)) };', 'const known = { "sanning.agent/1": new Set(Object.keys(schemas)) }; known["sanning.agent/1.0"] = known["sanning.agent/1"];']],
  "closed set (type) before the version": [["    // Step 2: the version, before the type", "    if (!known[\"sanning.agent/1\"].has(type)) return failed(\"event_type_not_in_set\", \"/event_type\");\n    // Step 2: the version, before the type"]],
  "step 2 before step 1": [["    // Step 1: the namespace.", "    if (typeof type === 'string' && !type.startsWith('agent.') && hasSchema) return failed('event_schema_misplaced', '/extras/event_schema');\n    // Step 1: the namespace."]],
  "version: $ also before a final newline, as Python's re.search": [["(\\.[1-9][0-9]{0,8})?$/;", "(\\.[1-9][0-9]{0,8})?\\n?$/;"]],
  "version: a digit is any Unicode decimal digit": [["/^sanning\\.agent\\/[1-9][0-9]{0,8}(\\.[1-9][0-9]{0,8})?$/;", "/^sanning\\.agent\\/(?!0)\\p{Nd}{1,9}(\\.(?!0)\\p{Nd}{1,9})?$/u;"]],
  "schema patterns: $ also before a final newline, as python-jsonschema": [["new Ajv2020({ allErrors: true, strict: true })", "new Ajv2020({ allErrors: true, strict: true, code: { regExp: (p, f) => new RegExp(p.replace(/\\$$/, '\\\\n?$'), f) } })"]],
  "schema patterns: a match on the whole string, not a search": [["new Ajv2020({ allErrors: true, strict: true })", "new Ajv2020({ allErrors: true, strict: true, code: { regExp: (p, f) => new RegExp('^(?:' + p + ')$', f) } })"]],
  "the head rule of the schema not read": [['const s = JSON.parse(readFileSync(join(dir, f), "utf8"));', 'const s = JSON.parse(readFileSync(join(dir, f), "utf8")); if (s.properties?.metadata?.properties?.run) delete s.properties.metadata.properties.run.not;']],
  "the chain rule of the schema not read": [['const s = JSON.parse(readFileSync(join(dir, f), "utf8"));', 'const s = JSON.parse(readFileSync(join(dir, f), "utf8")); delete s.not;']],
  "null counts as absent": [["    if (!isObject(cur) || !has(cur, k)) return false;\n    cur = cur[k];\n  }\n  return true;", "    if (!isObject(cur) || !has(cur, k)) return false;\n    cur = cur[k];\n  }\n  return cur !== null;"]],
  "schema errors in the validator's order": [["  all.sort(", "  if (false) all.sort("]],
  "schema errors by pointer only": [["SCHEMA_REASONS.indexOf(a.reason) - SCHEMA_REASONS.indexOf(b.reason) || ", ""]],
  "array index tokens compared as strings": [["if (Array.isArray(container)) return Number(x[i]) - Number(y[i]);", ""]],
  // --- step 5: each rule, and its place in the order ---
  "count without list reads unchecked_held_parts_mismatch": [['return failed("unchecked_held_parts_missing", "/metadata/handoff/unchecked_held_parts");', 'return failed("unchecked_held_parts_mismatch", "/context/unchecked_held_part_count");']],
  "step 5: revealed before hidden": [[HIDDEN_LOOP, ""], [CAPTURE, HIDDEN_LOOP + CAPTURE]],
  "step 5: capture before hidden": [[CAPTURE, ""], [HIDDEN_LOOP, CAPTURE + HIDDEN_LOOP]],
  "step 5: capture before revealed_field_unlisted": [[CAPTURE, ""], [UNLISTED, CAPTURE + UNLISTED]],
  "step 5: capture checked last": [[CAPTURE, ""], [STEP6, CAPTURE + STEP6]],
  "step 5: capture after the hand-off rules": [[CAPTURE, ""], ['    if (type === "agent.run_closed" && meta.closing', CAPTURE + '    if (type === "agent.run_closed" && meta.closing']],
  "step 5: unchecked held parts before file_parts": [[FILE_PARTS, ""], [MISMATCH, MISMATCH.replace("        if (count", FILE_PARTS.replace("      if", "        if") + "        if (count")]],
  "step 5: exceed before mismatch": [[EXCEED, ""], [MISMATCH, EXCEED + MISMATCH]],
  "step 5: index range before mismatch": [[INDEXES, ""], [MISMATCH, INDEXES + MISMATCH]],
  "step 5: index range before exceed": [[INDEXES, ""], [EXCEED, INDEXES + EXCEED]],
  "step 5: artifact reason before hidden": [[ARTIFACT, ""], [HIDDEN_LOOP, ARTIFACT + HIDDEN_LOOP]],
  "hidden keys in written order": [["Object.keys(ctx.hidden ?? {}).sort()", "Object.keys(ctx.hidden ?? {})"]],
  "revealed paths in written order": [["for (const path of [...revealed].sort())", "for (const path of [...revealed])"]],
  "file_parts <= parts removed": [['if (h.file_parts > h.parts) return', 'if (false) return']],
  "unchecked <= file_parts removed": [["if (count !== undefined && count > h.file_parts) {", "if (false) {"]],
  "capture at head not checked": [["if (meta.capture !== undefined && meta.run.seq !== 0) return", "if (false) return"]],
  "content_scrubbed not shown": [['if (ctx.content_scrubbed === true) findings.push("content_scrubbed");', ""]],
  // --- the held records ---
  "every held record pairs, verified or not": [['const peers = distinct(held).filter((h) => !sameRecord(h, subject) && readRecord(h.record).verdict === "verified");', "const peers = distinct(held).filter((h) => !sameRecord(h, subject) && h.record?.metadata?.run !== undefined);"]],
  "held is a list: a copy is a second record": [["function distinct(list) {\n  return list.filter((h, i) => list.findIndex((x) => sameRecord(x, h)) === i);", "function distinct(list) {\n  return list;"]],
  "a copy is any record with the same event id and key": [[" && jcs(x.record) === jcs(y.record)", ""]],
  "public keys compared case-sensitively": [["return String(k).toLowerCase();", "return String(k);"]],
  // --- the record itself is not one of its held records ---
  "self kept in the held records": [[PEERS, "const peers = distinct(held).filter((h) => readRecord(h.record).verdict === \"verified\");"]],
  "self set aside by event_id alone": [[PEERS, "const peers = distinct(held).filter((h) => h.event_id !== subject.event_id && readRecord(h.record).verdict === \"verified\");"]],
  "self set aside by event_id and key, any bytes": [[PEERS, "const peers = distinct(held).filter((h) => !(h.event_id === subject.event_id && keyOf(h.public_key) === key) && readRecord(h.record).verdict === \"verified\");"]],
  "self set aside at 7a only": [[PEERS, "const peers = distinct(held).filter((h) => readRecord(h.record).verdict === \"verified\");"], ["const candidates = peers.filter((h) => h.event_id", "const candidates = peers.filter((h) => !sameRecord(h, subject) && h.event_id"]],
  "self set aside at 7c only": [[PEERS, "const peers = distinct(held).filter((h) => readRecord(h.record).verdict === \"verified\");"], ["if (!peers.some((h) => h.event_id === id &&", "if (!peers.some((h) => !sameRecord(h, subject) && h.event_id === id &&"]],
  // --- 7a ---
  "7a: candidates by event_id alone, under any key": [["const candidates = peers.filter((h) => h.event_id === run.started_event_id && keyOf(h.public_key) === key);", "const candidates = peers.filter((h) => h.event_id === run.started_event_id);"]],
  "7a: any candidate that pairs wins": [["if (worst !== undefined) reasons.push", "if (worst !== undefined && candidates.every((c) => gradePair(record, c.record, opener) !== undefined)) reasons.push"]],
  "7a: the first failing candidate decides": [["if (g !== undefined && (worst === undefined || compareGrade(g, worst) < 0)) worst = g;", "if (g !== undefined && worst === undefined) worst = g;"]],
  "7a: no ambiguity finding": [['if (candidates.length > 1) findings.push("start_ambiguous");', ""]],
  "7a ignores the held record's type for approvals": [['if (start.event_type !== opener) return grade("pair_type_mismatch", at);', 'if (start.event_type !== opener && !opener.startsWith("agent.approval")) return grade("pair_type_mismatch", at);']],
  "pairs ignore run.root_run_id": [["  if (a.run.run_id !== b.run.run_id || a.run.root_run_id !== b.run.root_run_id) {", "  if (a.run.run_id !== b.run.run_id) {"]],
  "conversation exception for every type": [['const approval = end.event_type === "agent.approval.resolved";', "const approval = true;"]],
  "approval exception when either id differs": [["const both = a.run.run_id !== b.run.run_id && a.run.root_run_id !== b.run.root_run_id;", "const both = true;"]],
  "approval exception when the root run ids differ, whatever the run ids": [["const both = a.run.run_id !== b.run.run_id && a.run.root_run_id !== b.run.root_run_id;", "const both = a.run.root_run_id !== b.run.root_run_id;"]],
  "7a: halves' fields not compared": [["  for (const [i, path] of PAIR_FIELDS.entries()) {", "  for (const [i, path] of [].entries()) {"]],
  "7a: pair fields checked in another order": [['  "approval.subject_event_id",\n  "approval.actor",', '  "approval.actor",\n  "approval.subject_event_id",']],
  "7a: a value JCS cannot encode hashed as JSON.stringify writes it": [["return encodable(value) ? jcsHash(value) :", "return true ? jcsHash(value) :"]],
  "7a: a value JCS cannot encode equals nothing, itself included": [["`unencodable:${JSON.stringify(value)}`", "{}"]],
  "7a: a hidden field commits nothing": [["  return record.context.hidden?.[path];", "  return undefined;"]],
  "end only: declaration never read": [['findings.push(declared ? "start_not_captured" : "start_undeclared");', 'findings.push("start_undeclared");']],
  "end only: declaration from any invocation": [["const heads = mine.filter((h) => h.record.metadata.run.seq === 0);", "const heads = distinct([subject, ...peers]).filter((h) => keyOf(h.public_key) === key && h.record.metadata.run.seq === 0);"]],
  "end only: declaration from any key": [["const heads = mine.filter((h) => h.record.metadata.run.seq === 0);", "const heads = distinct([subject, ...peers]).filter((h) => h.record.metadata.run.root_run_id === run.root_run_id && h.record.metadata.run.seq === 0);"]],
  "end only: a declaration on any record at seq 0 counts": [["const declared = heads.length === 1 && (heads[0].record.metadata.capture?.not_captured ?? []).includes(opener);", "const declared = heads.some((h) => (h.record.metadata.capture?.not_captured ?? []).includes(opener));"]],
  // --- 7b ---
  "7b ignores the signing key": [["        keyOf(h.public_key) === keyOf(start.public_key) &&\n", ""]],
  "7b ignores sameOperation": [["h.record.metadata.run.started_event_id === start.event_id &&\n        gradePair(h.record, start.record, start.record.event_type) === undefined,", "h.record.metadata.run.started_event_id === start.event_id,"]],
  "7b: an end counts only if its own reading with the held records is verified": [["gradePair(h.record, start.record, start.record.event_type) === undefined,", "gradePair(h.record, start.record, start.record.event_type) === undefined &&\n        read(h, [...peers, start]).verdict === \"verified\","]],
  // --- 7c ---
  "7c removed": [['if (open) findings.push("completed_with_open_operation");', ""]],
  "7c: any end counts, listed or not": [["!endsOf(h, peers).some((e) => listed.has(e.event_id))", "endsOf(h, peers).length === 0"]],
  "7c judged on part of the list": [['if (absent === 0 && record.metadata.closing.outcome.observed.status === "completed") {', 'if (record.metadata.closing.outcome.observed.status === "completed") {']],
  "7c: a listed record not held gives no reason": [['reasons.push({ reason: "listed_record_absent"', 'if (false) reasons.push({ reason: "listed_record_absent"']],
  "7c: incomplete only when the run closed completed": [["for (const [i, id] of ids.entries()) {", 'for (const [i, id] of (record.metadata.closing.outcome.observed.status === "completed" ? ids : []).entries()) {']],
  "7c: a listed record held under any key": [["if (!peers.some((h) => h.event_id === id && keyOf(h.public_key) === key)) {", "if (!peers.some((h) => h.event_id === id)) {"]],
  "7c: a listed record held whether it verifies or not": [["if (!peers.some((h) => h.event_id === id &&", "if (!distinct(held).some((h) => h.event_id === id &&"]],
  "7c: only the first absent record reported": [["          absent++;\n", "          absent++;\n          break;\n"]],
  "7c: a listed_record_absent reads failed": [['const INCOMPLETE = new Set(["event_schema_unknown", "listed_record_absent"]);', 'const INCOMPLETE = new Set(["event_schema_unknown"]);']],
  "7c: the last absent record named": [["for (const [i, id] of ids.entries()) {", "for (const [i, id] of [...ids.entries()].reverse()) {"]],
  "7c: also on a stated status of completed": [['record.metadata.closing.outcome.observed.status === "completed") {', '(record.metadata.closing.outcome.observed.status === "completed" || record.metadata.closing.outcome.stated?.status === "completed")) {']],
  "7c: a start under any key": [["            listed.has(h.event_id) &&\n            keyOf(h.public_key) === key &&\n", "            listed.has(h.event_id) &&\n"]],
  // --- step 7 reports every problem ---
  "step 7: a failure at 7a stops step 7": [["if (worst !== undefined) reasons.push({ reason: worst.reason, at: worst.at });", "if (worst !== undefined) return reading([{ reason: worst.reason, at: worst.at }], findings);"]],
  "step 7: an incomplete reading at 7c stops step 7": [['    // Step 7d: the two records', '    if (reasons.length > 0) return reading(reasons, findings);\n    // Step 7d: the two records']],
  "step 7: only the first reason listed": [["return { verdict, reason: first.reason, at: first.at, reasons, findings };", "return { verdict, reason: first.reason, at: first.at, reasons: reasons.slice(0, 1), findings };"]],
  "step 7: reason and at are the last reason's": [["const first = reasons.find(", "const first = reasons.findLast("]],
  "step 7: no list of reasons": [["return { verdict, reason: first.reason, at: first.at, reasons, findings };", "return { verdict, reason: first.reason, at: first.at, findings };"]],
  "steps 1 to 6: no list of reasons": [["  return { verdict: \"failed\", reason, at, reasons: [{ reason, at }], findings: [] };", "  return { verdict: \"failed\", reason, at, findings: [] };"]],
  "step 7a: every failing candidate listed, not the worst": [["if (g !== undefined && (worst === undefined || compareGrade(g, worst) < 0)) worst = g;", "if (g !== undefined) reasons.push({ reason: g.reason, at: g.at });"]],
  "step 4: every schema error listed as a reason": [["      return failed(e.reason, e.at);\n    }", "      return { ...failed(e.reason, e.at), reasons: validate.errors.map(() => ({ reason: e.reason, at: e.at })) };\n    }"]],
  "step 2: an unknown version reads failed": [['return { verdict: "incomplete", reason: "event_schema_unknown"', 'return { verdict: "failed", reason: "event_schema_unknown"']],
  // --- agent.step.occurred ---
  "occurred: a start, waiting for its end": [["const CLOSER = Object.fromEntries(Object.entries(OPENER).map(([c, o]) => [o, c]));", "const CLOSER = Object.fromEntries(Object.entries(OPENER).map(([c, o]) => [o, c])); CLOSER[\"agent.step.occurred\"] = \"agent.step.ended\";"]],
  "occurred: an end, looking for its start": [['  "agent.step.ended": "agent.step.started",\n', '  "agent.step.ended": "agent.step.started",\n  "agent.step.occurred": "agent.step.started",\n']],
  "occurred: a step end can name it as its start": [['if (start.event_type !== opener) return grade("pair_type_mismatch", at);', 'if (start.event_type !== opener && start.event_type !== "agent.step.occurred") return grade("pair_type_mismatch", at);']],
  ...Object.fromEntries(
    [
      ["run.source_type optional", "r.required = r.required.filter((k) => k !== 'source_type');"],
      ["run.source_type a label", "r.properties.source_type = { $ref: 'common.json#/$defs/label' };"],
      ["outcome allowed", "s.properties.metadata.properties.outcome = true;"],
      ["run.started_event_id allowed", "r.properties.started_event_id = true;"],
      ["run.observed_started_at allowed", "r.properties.observed_started_at = true;"],
      ["run.client allowed", "r.properties.client = true;"],
      ["the tool fields allowed", "s.properties.metadata.properties.gen_ai.properties.tool = true;"],
      ["the model request allowed", "s.properties.metadata.properties.gen_ai.properties.request = true;"],
      ["the provider allowed", "s.properties.metadata.properties.gen_ai.properties.provider = true;"],
      ["the response allowed", "s.properties.metadata.properties.gen_ai.properties.response = true;"],
      ["the token counts allowed", "s.properties.metadata.properties.gen_ai.properties.usage = true;"],
      ["an operation name allowed", "s.properties.metadata.properties.gen_ai.properties.operation = true;"],
      ["run.name not allowed", "delete r.properties.name;"],
      ["run.plumbing not allowed", "delete r.properties.plumbing;"],
    ].map(([name, change]) => [
      `occurred: ${name}`,
      [['const s = JSON.parse(readFileSync(join(dir, f), "utf8"));', `const s = JSON.parse(readFileSync(join(dir, f), "utf8")); if (s.title === "agent.step.occurred") { const r = s.properties.metadata.properties.run; ${change} }`]],
    ]),
  ),
  // --- 7d ---
  "7d removed": [['findings.push("handoff_parts_mismatch");', "{}"]],
  "7d: a part-count mismatch moves the verdict": [['findings.push("handoff_parts_mismatch");', 'reasons.push({ reason: "handoff_parts_mismatch", at: "/metadata/handoff/parts" });']],
  "7d: either hand-off type is a counterpart": [["          h.record.event_type === other &&\n", ""]],
  "7d: parts only": [['const counts = (h) => [h.metadata.handoff.parts, h.metadata.handoff.file_parts].join("/");', "const counts = (h) => String(h.metadata.handoff.parts);"]],
  "7d: file parts only": [['const counts = (h) => [h.metadata.handoff.parts, h.metadata.handoff.file_parts].join("/");', "const counts = (h) => String(h.metadata.handoff.file_parts);"]],
  "7d: only on the received side": [['if (type.startsWith("agent.handoff.")) {', 'if (type === "agent.handoff.received") {']],
  "7d ignores the message hash": [["          keyOf(h.record.event.counterparty_public_key) === key &&\n          h.record.event.message_hash.toLowerCase() === hash,", "          keyOf(h.record.event.counterparty_public_key) === key,"]],
  "7d: candidacy one way, the counterpart's own naming ignored": [["          keyOf(h.record.event.counterparty_public_key) === key &&\n", ""]],
  "7d: message hashes compared case-sensitively": [["const hash = record.event.message_hash.toLowerCase();", "const hash = record.event.message_hash;"], ["h.record.event.message_hash.toLowerCase() === hash", "h.record.event.message_hash === hash"]],
  "7d: the first counterpart held decides": [["if (counterparts.some((h) => counts(h.record) !== counts(record)))", "if (counterparts.slice(0, 1).some((h) => counts(h.record) !== counts(record)))"]],
  // --- 7f and 7g ---
  "7f removed": [['if (mixed) findings.push("data_mode_mixed");', ""]],
  "7f: any key in the invocation": [["        keyOf(h.public_key) === key &&\n        h.record.metadata.run.root_run_id === run.root_run_id &&\n        h.record.context.data_mode", "        h.record.metadata.run.root_run_id === run.root_run_id &&\n        h.record.context.data_mode"]],
  "7f: only records on the same chain": [["        h.record.metadata.run.root_run_id === run.root_run_id &&\n        h.record.context.data_mode", "        h.record.metadata.run.root_run_id === run.root_run_id &&\n        h.record.context.chain_key === record.context.chain_key &&\n        h.record.context.data_mode"]],
  "7g before 7f": [['    if (mixed) findings.push("data_mode_mixed");\n', ""], ["    // Step 7h: a tool call that ran", '    if (mixed) findings.push("data_mode_mixed");\n    // Step 7h: a tool call that ran']],
  "7g: another record is another event_id": [["h.record.metadata.run.seq === run.seq)) {\n      findings.push(\"seq_duplicate\");", "h.event_id !== subject.event_id && h.record.metadata.run.seq === run.seq)) {\n      findings.push(\"seq_duplicate\");"]],
  "7g removed": [['findings.push("seq_duplicate");', ""]],
  "7g: only at run.seq 0": [["h.record.metadata.run.seq === run.seq)) {", "h.record.metadata.run.seq === run.seq && run.seq === 0)) {"]],
  "7g: a held copy of the record is another record": [[SEVEN_G, "    if (distinct(held).filter((h) => keyOf(h.public_key) === key && readRecord(h.record).verdict === \"verified\" && h.record.metadata.run.root_run_id === run.root_run_id).some((h) => h.record.metadata.run.seq === run.seq)) {"]],
  "7g: under any key": [[SEVEN_G, "    if (distinct([subject, ...peers]).filter((h) => h.record.metadata.run.root_run_id === run.root_run_id).some((h) => !sameRecord(h, subject) && h.record.metadata.run.seq === run.seq)) {"]],
  "7g: across invocations": [[SEVEN_G, "    if (distinct([subject, ...peers]).filter((h) => keyOf(h.public_key) === key).some((h) => !sameRecord(h, subject) && h.record.metadata.run.seq === run.seq)) {"]],
  // --- 7h ---
  "7h removed": [['if (refused && RAN.has(record.metadata.outcome.status)) findings.push("ran_after_refusal");', ""]],
  "7h: approved is a refusal too": [['const REFUSALS = new Set(["rejected", "responded"]);', 'const REFUSALS = new Set(["rejected", "responded", "approved"]);']],
  "7h: edited is a refusal too": [['const REFUSALS = new Set(["rejected", "responded"]);', 'const REFUSALS = new Set(["rejected", "responded", "edited"]);']],
  "7h: responded is not a refusal": [['const REFUSALS = new Set(["rejected", "responded"]);', 'const REFUSALS = new Set(["rejected"]);']],
  "7h: only completed is a run": [['const RAN = new Set(["completed", "failed"]);', 'const RAN = new Set(["completed"]);']],
  "7h: interrupted is a run too": [['const RAN = new Set(["completed", "failed"]);', 'const RAN = new Set(["completed", "failed", "interrupted"]);']],
  "7h: only refusals of this invocation count": [["          h.record.metadata.approval.subject_event_id === run.started_event_id &&\n", "          h.record.metadata.approval.subject_event_id === run.started_event_id &&\n          h.record.metadata.run.root_run_id === run.root_run_id &&\n"]],
  "7h: a later approved or edited answer clears a refusal": [["          REFUSALS.has(h.record.metadata.approval.verdict),\n      );", "          REFUSALS.has(h.record.metadata.approval.verdict),\n      ) && !peers.some((h) => h.record.event_type === \"agent.approval.resolved\" && keyOf(h.public_key) === key && h.record.metadata.approval.subject_event_id === run.started_event_id && !REFUSALS.has(h.record.metadata.approval.verdict));"]],
  "7h: a refusal counts only if it names its request": [["          REFUSALS.has(h.record.metadata.approval.verdict),\n      );", "          REFUSALS.has(h.record.metadata.approval.verdict) &&\n          h.record.metadata.run.started_event_id !== null,\n      );"]],
  "7h: a refusal under any key": [["          h.record.event_type === \"agent.approval.resolved\" &&\n          keyOf(h.public_key) === key &&\n", "          h.record.event_type === \"agent.approval.resolved\" &&\n"]],
  "7h: any refusal counts, whatever its subject": [["          h.record.metadata.approval.subject_event_id === run.started_event_id &&\n", ""]],
  "7h: a refusal that does not verify counts": [["      const refused = peers.some(", "      const refused = distinct(held).filter((h) => h.record?.metadata?.approval !== undefined).some("]],
  "7h: also on the start": [['if (type === "agent.tool_call.ended" && run.started_event_id !== null) {', 'if (type.startsWith("agent.tool_call.")) {'], ["subject_event_id === run.started_event_id &&", "subject_event_id === (run.started_event_id ?? subject.event_id) &&"]],
  "7i before 7h": [['      findings.push("seq_gap");', "      {}"], ["    // Step 7h: a tool call that ran after its approval refused it.", "    // Step 7i: the position directly before this record is not held.\n    if (run.seq > 0 && mine.some((h) => h.record.metadata.run.seq < run.seq) && !mine.some((h) => h.record.metadata.run.seq === run.seq - 1)) findings.push(\"seq_gap\");\n    // Step 7h: a tool call that ran after its approval refused it."]],
  // --- 7i ---
  "7i removed": [['      findings.push("seq_gap");', ""]],
  "7i: any position missing below, not only the one before": [["      !mine.some((h) => h.record.metadata.run.seq === run.seq - 1)", "      !Array.from({ length: run.seq }, (_, i) => i).every((i) => mine.some((h) => h.record.metadata.run.seq === i))"]],
  "7i: a gap whenever the position before is not held": [["      mine.some((h) => h.record.metadata.run.seq < run.seq) &&\n", ""]],
  "7i: under any key": [["      mine.some((h) => h.record.metadata.run.seq < run.seq) &&", "      distinct([subject, ...peers]).filter((h) => h.record.metadata.run.root_run_id === run.root_run_id).some((h) => h.record.metadata.run.seq < run.seq) &&"]],
  "7i: across invocations": [["      mine.some((h) => h.record.metadata.run.seq < run.seq) &&", "      distinct([subject, ...peers]).filter((h) => keyOf(h.public_key) === key).some((h) => h.record.metadata.run.seq < run.seq) &&"]],
  "7i: a held record counts whether it verifies or not": [["      mine.some((h) => h.record.metadata.run.seq < run.seq) &&", "      distinct(held).some((h) => keyOf(h.public_key) === key && h.record?.metadata?.run?.root_run_id === run.root_run_id && h.record.metadata.run.seq < run.seq) &&"]],
  // --- 7j ---
  "7j removed": [['      findings.push("closing_not_held");', ""]],
  "7j: a closing record under any key counts": [['if (type === "agent.run_opened" && !mine.some((h) => h.record.event_type === "agent.run_closed")) {', 'if (type === "agent.run_opened" && !peers.some((h) => h.record.event_type === "agent.run_closed" && h.record.metadata.run.root_run_id === run.root_run_id)) {']],
  "7j: a closing record of any invocation counts": [['if (type === "agent.run_opened" && !mine.some((h) => h.record.event_type === "agent.run_closed")) {', 'if (type === "agent.run_opened" && !peers.some((h) => h.record.event_type === "agent.run_closed" && keyOf(h.public_key) === key)) {']],
  "7j: a closing record that does not verify counts": [['if (type === "agent.run_opened" && !mine.some((h) => h.record.event_type === "agent.run_closed")) {', 'if (type === "agent.run_opened" && !distinct(held).some((h) => h.record?.event_type === "agent.run_closed" && keyOf(h.public_key) === key && h.record?.metadata?.run?.root_run_id === run.root_run_id)) {']],
  // --- the salt ---
  "7a: the halves compare their salts": [["  for (const [i, path] of PAIR_FIELDS.entries()) {", "  if (end.context.salt !== start.context.salt) return grade(\"pair_field_mismatch\", \"/context/salt\", 99);\n  for (const [i, path] of PAIR_FIELDS.entries()) {"]],
  "7d: the two hand-off records compare their salts": [["          h.record.event.message_hash.toLowerCase() === hash,", "          h.record.event.message_hash.toLowerCase() === hash &&\n          h.record.context.salt === record.context.salt,"]],
  "agent.file takes the shared outcome words": [['const s = JSON.parse(readFileSync(join(dir, f), "utf8"));', 'const s = JSON.parse(readFileSync(join(dir, f), "utf8")); if (s.$defs?.file_status) s.$defs.file_status.enum = ["completed", "failed", "interrupted", "skipped"];']],
  "the salt not read by the schema": [['const s = JSON.parse(readFileSync(join(dir, f), "utf8"));', 'const s = JSON.parse(readFileSync(join(dir, f), "utf8")); if (s.properties?.context?.properties?.salt) { delete s.properties.context.properties.salt; s.properties.context.required = s.properties.context.required.filter((k) => k !== "salt"); s.properties.context.additionalProperties = true; }']],
  // --- the salt's form, on every type (step 1 and the schema) ---
  "salt: 32 to 64 hex characters": [['const s = JSON.parse(readFileSync(join(dir, f), "utf8"));', 'const s = JSON.parse(readFileSync(join(dir, f), "utf8")); if (s.$defs?.salt) s.$defs.salt.pattern = "^[0-9a-f]{32,64}$";'], ["/^[0-9a-f]{32}$/;", "/^[0-9a-f]{32,64}$/;"]],
  "salt: 32 to 64 hex characters, in the schema only": [['const s = JSON.parse(readFileSync(join(dir, f), "utf8"));', 'const s = JSON.parse(readFileSync(join(dir, f), "utf8")); if (s.$defs?.salt) s.$defs.salt.pattern = "^[0-9a-f]{32,64}$";']],
  "salt: 32 to 64 hex characters, outside the agent types only": [["/^[0-9a-f]{32}$/;", "/^[0-9a-f]{32,64}$/;"]],
  "salt: either case": [['const s = JSON.parse(readFileSync(join(dir, f), "utf8"));', 'const s = JSON.parse(readFileSync(join(dir, f), "utf8")); if (s.$defs?.salt) s.$defs.salt.pattern = "^[0-9a-fA-F]{32}$";'], ["/^[0-9a-f]{32}$/;", "/^[0-9a-f]{32}$/i;"]],
  "salt: not read outside the agent types": [['if (isObject(ctx) && has(ctx, "salt") &&', 'if (false &&']],
  "salt: required outside the agent types too": [['if (isObject(ctx) && has(ctx, "salt") && !(', 'if (!isObject(ctx) || !has(ctx, "salt") || !(']],
  "salt outside: a null salt counts as absent": [['if (isObject(ctx) && has(ctx, "salt") &&', 'if (isObject(ctx) && ctx.salt != null &&']],
  "salt outside: any string of the right length": [['!(typeof ctx.salt === "string" && SALT_RE.test(ctx.salt))', '!(typeof ctx.salt === "string" && ctx.salt.length === 32)']],
  "salt outside: $ also before a final newline": [["/^[0-9a-f]{32}$/;", "/^[0-9a-f]{32}\\n?$/;"]],
  "salt outside: read after the misplaced version, the other way round": [['      if (hasSchema) return failed("event_schema_misplaced", "/extras/event_schema");\n', ""], ['      return { verdict: null, findings: ["not_an_agent_record"] };', '      if (hasSchema) return failed("event_schema_misplaced", "/extras/event_schema");\n      return { verdict: null, findings: ["not_an_agent_record"] };']],
  // --- where the salt is read: the schema at step 4 on the agent types, step 1 outside them ---
  "salt: also read at step 1 on the agent types": [["    // Step 2: the version, before the type", "    if (isObject(record.context) && has(record.context, \"salt\") && !(typeof record.context.salt === \"string\" && SALT_RE.test(record.context.salt))) return failed(\"bad_value\", \"/context/salt\");\n    // Step 2: the version, before the type"]],
  "salt: read on the agent types after the version, before the type": [["    // Step 3: the type, in the closed set", "    if (isObject(record.context) && has(record.context, \"salt\") && !(typeof record.context.salt === \"string\" && SALT_RE.test(record.context.salt))) return failed(\"bad_value\", \"/context/salt\");\n    // Step 3: the type, in the closed set"]],
  "salt outside: read only when extras is an object": [['if (isObject(ctx) && has(ctx, "salt") &&', 'if (isObject(extras) && isObject(ctx) && has(ctx, "salt") &&']],
  "salt outside: extras read without a guard": [['const hasSchema = isObject(extras) && has(extras, "event_schema");', 'const hasSchema = has(extras, "event_schema");']],
  "salt outside: the first context member": [['if (isObject(ctx) && has(ctx, "salt") &&', 'if (isObject(ctx) && Object.keys(ctx)[0] === "salt" &&']],
  "salt outside: the context must hold the salt alone": [['if (isObject(ctx) && has(ctx, "salt") &&', 'if (isObject(ctx) && has(ctx, "salt") && Object.keys(ctx).length === 1 &&']],
  // --- custom.name: the dotted-name grammar (section 5.11) ---
  ...Object.fromEntries(
    [
      ["the character-set pattern with no segment grammar", "^[a-z0-9_.]{1,64}$"],
      ["an empty segment allowed", "^[a-z][a-z0-9_]*(\\.([a-z][a-z0-9_]*)?)*$"],
      ["a segment may start with a digit", "^[a-z0-9][a-z0-9_]*(\\.[a-z0-9][a-z0-9_]*)*$"],
      ["only the first segment starts with a letter", "^[a-z][a-z0-9_]*(\\.[a-z0-9_]+)*$"],
      ["a segment may start with an underscore", "^[a-z_][a-z0-9_]*(\\.[a-z_][a-z0-9_]*)*$"],
      ["upper case allowed", "^[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)*$"],
      ["a hyphen allowed", "^[a-z][a-z0-9_-]*(\\.[a-z][a-z0-9_-]*)*$"],
      ["any Unicode lower-case letter", "^\\p{Ll}[\\p{Ll}0-9_]*(\\.\\p{Ll}[\\p{Ll}0-9_]*)*$"],
      ["at least two segments", "^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$"],
      ["a segment of two characters at least", "^[a-z][a-z0-9_]+(\\.[a-z][a-z0-9_]+)*$"],
      ["no underscore at the end of a segment", "^[a-z]([a-z0-9_]*[a-z0-9])?(\\.[a-z]([a-z0-9_]*[a-z0-9])?)*$"],
    ].map(([name, pattern]) => [
      `custom name: ${name}`,
      [['const s = JSON.parse(readFileSync(join(dir, f), "utf8"));', `const s = JSON.parse(readFileSync(join(dir, f), "utf8")); if (s.$defs?.custom_name) s.$defs.custom_name.pattern = ${JSON.stringify(pattern)};`]],
    ]),
  ),
  "custom name: no length bound": [['const s = JSON.parse(readFileSync(join(dir, f), "utf8"));', 'const s = JSON.parse(readFileSync(join(dir, f), "utf8")); if (s.$defs?.custom_name) delete s.$defs.custom_name.maxLength;']],
  "custom name: at most 63 characters": [['const s = JSON.parse(readFileSync(join(dir, f), "utf8"));', 'const s = JSON.parse(readFileSync(join(dir, f), "utf8")); if (s.$defs?.custom_name) s.$defs.custom_name.maxLength = 63;']],
  // One type's schema leaves the salt optional: each type's missing-salt case pins it.
  ...Object.fromEntries(
    AGENT_TYPES.map((t) => [
      `salt optional on ${t}`,
      [['const s = JSON.parse(readFileSync(join(dir, f), "utf8"));', `const s = JSON.parse(readFileSync(join(dir, f), "utf8")); if (s.title === ${JSON.stringify(t)}) s.properties.context.required = s.properties.context.required.filter((k) => k !== "salt");`]],
    ]),
  ),
};
let i = 0;
let survived = 0;
for (const [name, reps] of Object.entries(M)) {
  let s = src;
  for (const [a, b] of reps) {
    // A mutation that matches nothing tests nothing: fail the run.
    if (!s.includes(a)) {
      console.log("NO MATCH", name, JSON.stringify(a.slice(0, 60)));
      survived++;
    }
    s = s.split(a).join(b);
  }
  const f = join(H, `n${i++}.mjs`);
  writeFileSync(f, s);
  const { createReader } = await import(pathToFileURL(f).href);
  const R = createReader(join(ROOT, "schemas/sanning.agent/1"));
  const CASES = join(ROOT, "conformance/cases");
  const bad = [];
  for (const g of readdirSync(CASES)) for (const n of readdirSync(join(CASES, g))) {
    const d = join(CASES, g, n);
    const sub = JSON.parse(readFileSync(join(d, "record.json")));
    const hp = join(d, "held.json");
    const held = existsSync(hp) ? JSON.parse(readFileSync(hp)) : undefined;
    const e = JSON.parse(readFileSync(join(d, "expected.json")));
    let got;
    try { got = held === undefined ? R.readRecord(sub.record) : R.read(sub, held); } catch (err) { got = { verdict: "THREW" }; }
    const c = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
    if (!isDeepStrictEqual(c({ verdict: e.verdict, reason: e.reason, at: e.at, reasons: e.reasons, findings: e.findings }), c({ verdict: got.verdict, reason: got.reason, at: got.at, reasons: got.reasons, findings: got.findings }))) bad.push(`${g}/${n}`);
  }
  if (bad.length === 0) survived++;
  console.log(`${bad.length === 0 ? "SURVIVES" : "killed  "}  ${name}${bad.length ? "  (" + bad.slice(0, 2).join(", ") + (bad.length > 2 ? ", ..." : "") + ")" : ""}`);
}
rmSync(H, { recursive: true, force: true });
console.log(`${Object.keys(M).length} mutations, ${survived} survive`);
if (survived > 0) process.exit(1);
