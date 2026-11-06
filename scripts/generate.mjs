// Writes schemas/sanning.agent/1/ and conformance/cases/ from scripts/vocabulary.mjs.
//
// Deterministic: the same script writes the same bytes. scripts/check.mjs regenerates into memory
// and fails when a committed file differs.
//
//   node scripts/generate.mjs           write the files
//   (imported by check.mjs)             build them in memory

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { clone, eid, jcs, jcsHash, scrub, sha256Hex, testKey } from "./lib.mjs";
import {
  AGENT_TYPES,
  CLOSERS,
  COMMON_DEFS,
  EVENT_SCHEMA,
  KINDS,
  OCCURRED,
  OPENER_OF,
  OTEL_SCHEMA_URL,
  SCRUBBABLE,
  commonSchema,
  contextFor,
  kindOf,
  leaves,
  metadataFor,
  isFieldPath,
  revealableOf,
  tierOf,
  typeSchema,
} from "./vocabulary.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const CASES_DIR = join(ROOT, "conformance", "cases");

export const KEY_A = testKey("agent-a");
export const KEY_B = testKey("agent-b");
const ROOT_RUN = eid("run/root");
const EV = Object.fromEntries(AGENT_TYPES.map((t) => [t, eid(`event/${t}`)]));
const OUTSIDE_OPENED = eid("event/runner.run_opened");

// --- sample values ----------------------------------------------------------------------------

const SOURCE_TYPE = {
  run: "graph",
  step: "chain",
  model_call: "chat_model",
  tool_call: "tool",
  retrieval: "retriever",
  approval: "interrupt",
  handoff: "tool",
  decision: "decision",
  file: "tool",
  custom: "custom",
  error: "callback",
};
const RUN_NAME = {
  run: "quote_agent",
  step: "plan_node",
  model_call: "ChatOpenAI",
  tool_call: "lookup_rate",
  retrieval: "policy_search",
};
const OPERATION = { run: "invoke_agent", model_call: "chat", tool_call: "execute_tool", retrieval: "retrieval" };

function runIdOf(type) {
  const kind = kindOf(type);
  return kind === "run" ? ROOT_RUN : eid(`run/${kind}`);
}

/**
 * What event.content_hash commits to (agent-events.md 9.3): the framework's own object for a record
 * a framework step produces, and the fixed object of 5.x for the records no step produces, every
 * member present and null where the record shows the adapter had no value.
 */
function contentOf(type, metadata, scrubbed = false) {
  const raw = rawContentOf(type, metadata);
  return scrubbed ? scrub(raw) : raw;
}

function rawContentOf(type, metadata) {
  const kind = kindOf(type);
  const side = type.split(".").pop();
  switch (type) {
    case "agent.run_opened": {
      const a = metadata.authority ?? {};
      return {
        authority: { expires_at: a.expires_at ?? null, principal: a.principal ?? null, scope: a.scope ?? null },
        input: { messages: [{ role: "user", content: "Quote EUR." }] },
      };
    }
    case "agent.run_closed":
      return {};
    case "agent.approval.resolved": {
      const a = metadata.approval;
      return {
        edited_action: a.edited_action ?? null,
        notes: a.notes ?? null,
        response: RESPONSE[a.verdict],
        reviewer: a.reviewer ?? null,
      };
    }
    case "agent.decision":
      return { name: metadata.decision.name, value: sampleFor(type, "decision.value") };
    case "agent.custom":
      return { name: metadata.custom.name, value: sampleFor(type, "custom.value") };
    case "agent.error":
      return { message: sampleFor(type, "exception.message"), type: metadata.error.type };
    // A file that could not be read commits to the JCS bytes of {} (5.9); one that was read, to its
    // bytes (fileBytesOf).
    case "agent.file":
      return metadata.outcome.status === "failed" ? {} : undefined;
    default:
  }
  switch (kind) {
    case "step":
      // A step that occurred commits to the event as the framework handed it: here, an agent action.
      if (side === "occurred") return { log: "Look up the EUR rate.", tool: "lookup_rate", tool_input: { currency: "EUR" } };
      return side === "started" ? { inputs: { query: "Quote EUR." }, run_type: "chain" } : { outputs: { plan: ["lookup"] } };
    case "model_call":
      return side === "started"
        ? { messages: [[{ role: "user", content: "Quote EUR." }]], invocation_params: { model: "gpt-4o-mini", openai_api_key: "sk-test-0001" } }
        : { generations: [[{ text: "", tool_calls: [{ id: "call_0001", name: "lookup_rate" }] }]] };
    case "tool_call":
      return side === "started" ? { input: "{\"currency\":\"EUR\"}", tool_call_id: "call_0001" } : { output: "{\"rate\":\"3.50\"}" };
    case "retrieval":
      return side === "started" ? { query: "fee schedule" } : { documents: [{ id: "doc-1", page_content: "Fees: 1%" }] };
    case "approval":
      return { action: { tool: "transfer", amount: "120.00" } };
    default:
      return {};
  }
}

/** The answer as the framework hands it over, by verdict: LangChain's decision words. */
const RESPONSE = {
  approved: { decision: "approve" },
  edited: { decision: "edit", args: { amount: "100.00" } },
  rejected: { decision: "reject" },
  responded: { decision: "respond", message: "Use the published rate." },
};

/** The bytes of a file record that was read: its content, hashed as they are (5.9). */
const FILE_BYTES = "%PDF-1.4\n% quote-0001\n%%EOF\n";
function fileBytesOf(type, metadata) {
  return type === "agent.file" && metadata.outcome.status === "completed" ? FILE_BYTES : undefined;
}

const MESSAGE = { parts: [{ text: "Quote EUR for case-0001." }, { kind: "file", content_hash: sha256Hex("quote.pdf"), content_length: 18342 }] };

/** A sample value for a metadata leaf, by its dotted path. */
function sampleFor(type, path) {
  const kind = kindOf(type);
  const failedEnd = type.endsWith(".ended");
  const v = {
    "run.run_id": runIdOf(type),
    "run.parent_run_id": kind === "run" ? null : ROOT_RUN,
    "run.root_run_id": ROOT_RUN,
    "run.seq": AGENT_TYPES.indexOf(type),
    // Each sample record sits at its type's position and names the sample record one position before.
    "run.prev_event_id": type === "agent.run_opened" ? null : EV[AGENT_TYPES[AGENT_TYPES.indexOf(type) - 1]],
    // On a step that occurred, the framework's own event name, in the dotted-name grammar.
    "run.source_type": type === OCCURRED ? "langchain.agent_action" : SOURCE_TYPE[kind],
    "run.name": RUN_NAME[kind],
    "run.client": "ChatOpenAI",
    "run.started_event_id": EV[OPENER_OF[type]],
    "run.observed_started_at": "2026-10-27T09:30:00.125Z",
    "run.plumbing": true,
    "run.runner_event_id": OUTSIDE_OPENED,
    "run.handoff_event_id": EV["agent.handoff.received"],
    "gen_ai.operation.name": OPERATION[kind],
    "gen_ai.agent.version": "2.3.0",
    "gen_ai.conversation.id": "thread-0001",
    "gen_ai.request.model": "gpt-4o-mini",
    "gen_ai.request.temperature": 0.2,
    "gen_ai.request.max_tokens": 512,
    "gen_ai.request.seed": 7,
    "gen_ai.request.top_p": 1,
    "gen_ai.provider.name": "openai",
    "gen_ai.prompt.name": "rate-quote-v3",
    "gen_ai.input.messages": [{ role: "user", parts: [{ type: "text", content: "Quote EUR." }] }],
    "gen_ai.system_instructions": [{ type: "text", content: "You quote rates." }],
    "gen_ai.response.model": "gpt-4o-mini-2024-07-18",
    "gen_ai.response.id": "chatcmpl-0001",
    "gen_ai.response.finish_reasons": ["tool_calls"],
    "gen_ai.usage.input_tokens": 812,
    "gen_ai.usage.output_tokens": 64,
    "gen_ai.usage.reasoning.output_tokens": 0,
    "gen_ai.output.messages": [{ role: "assistant", parts: [{ type: "tool_call", id: "call_0001", name: "lookup_rate" }] }],
    "gen_ai.tool.name": "lookup_rate",
    "gen_ai.tool.call.id": "call_0001",
    "gen_ai.tool.call.arguments": { currency: "EUR" },
    "gen_ai.tool.call.result": { rate: "3.50" },
    "gen_ai.retrieval.query.text": "fee schedule",
    "gen_ai.retrieval.documents": [{ id: "doc-1", score: 0.82 }],
    "outcome.status": failedEnd || kind === "file" ? "failed" : "completed",
    "error.type": kind === "error" ? "RateLimitError" : "TimeoutError",
    "exception.message": kind === "error" ? "429 from provider" : "upstream timed out after 30 s",
    "closing.promised": true,
    "closing.record_count": 2,
    "closing.record_ids": [EV["agent.tool_call.started"], EV["agent.tool_call.ended"]],
    "closing.outcome.observed.status": "failed",
    "closing.outcome.observed.reason": "error",
    "closing.outcome.stated.status": "failed",
    "closing.outcome.stated.reason": "timeout",
    "capture.not_captured": ["agent.retrieval.started", "agent.retrieval.ended"],
    "authority.scope": ["rates:read", "quotes:write"],
    "authority.expires_at": "2026-10-27T18:00:00Z",
    "authority.principal": { subject: "user-0042" },
    "openai.response.system_fingerprint": "fp_0001",
    "retrieval.document_count": 1,
    "approval.actor": "human",
    "approval.policy_hash": sha256Hex("policy: transfers over 100 need a human"),
    "approval.subject_event_id": EV["agent.tool_call.started"],
    "approval.action": { tool: "transfer", amount: "120.00" },
    "approval.verdict": "edited",
    "approval.reviewer": { id: "reviewer-7" },
    "approval.notes": "amount capped",
    "approval.edited_action": { tool: "transfer", amount: "100.00" },
    "handoff.parts": 2,
    "handoff.file_parts": 1,
    "handoff.unchecked_held_parts": [1],
    "handoff.sent_event_id": eid("event/agent-b/agent.handoff.sent"),
    "artifact.tool_call_event_id": EV["agent.tool_call.started"],
    "decision.name": "quote_rate",
    "custom.name": "order.flagged",
    "custom.value": { rule: "rate_above_limit" },
    "decision.value": { rate: "3.50" },
    "artifact.name": "quote.pdf",
    "artifact.byte_length": 18342,
    "artifact.content_type": "application/pdf",
    "artifact.role": "output",
    "artifact.reason": "too_large",
    "artifact.path": "/work/out/quote.pdf",
    "artifact.source": "quote template",
    "artifact.destination": "outbox",
  };
  if (!(path in v)) throw new Error(`no sample for ${type} ${path}`);
  return v[path];
}

function setPath(obj, dotted, value) {
  const keys = dotted.split(".");
  let cur = obj;
  for (const k of keys.slice(0, -1)) cur = cur[k] ??= {};
  cur[keys.at(-1)] = value;
}

/** Fill a tree: every leaf when `all`, else only the required ones (and the objects they need). */
function fill(type, tree, all, prefix = "", out = {}) {
  for (const [k, node] of Object.entries(tree.children)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (!all && !node.req) continue;
    if (node.kind === "obj") {
      const sub = {};
      fill(type, node, all, path, sub);
      if (Object.keys(sub).length > 0) out[k] = sub;
      else if (node.req) throw new Error(`${type}: required object ${path} has no required member`);
    } else if (path === "otel") {
      out[k] = all
        ? { scope: { ...SCOPE }, trace_id: "4bf92f3577b34da6a3ce929d0e0e4736", span_id: "00f067aa0ba902b7" }
        : { scope: { ...SCOPE } };
    } else {
      out[k] = sampleFor(type, path);
    }
  }
  return out;
}

const SCOPE = { name: "@sanning/anchor-langchain", version: "1.0.0", schema_url: OTEL_SCHEMA_URL };

/** A conformant record of `type`: every field (`all`) or only the required ones. */
export function recordOf(type, { all = false, mode = "private" } = {}) {
  const kind = kindOf(type);
  const metadata = fill(type, metadataFor(type), all);
  // The capture list is read only on the invocation's first record.
  if (metadata.run.seq !== 0) delete metadata.capture;
  if (!all && CLOSERS.includes(type) && type.endsWith(".ended")) metadata.outcome = { status: "completed" };
  if (!all && type === "agent.run_closed") {
    metadata.closing.outcome.observed = { status: "completed" };
  }
  if (!all && type === "agent.file") metadata.outcome = { status: "completed" };
  if (!all && type === "agent.approval.resolved") metadata.approval.verdict = "approved";

  // Fresh for each record in an SDK; derived from the type here so the suite is reproducible.
  const context = { data_mode: mode, salt: sha256Hex(`salt/${type}/${all}`).slice(0, 32) };
  if (all) {
    context.case_id = "case-0001";
    context.chain_key = "chain-quote-agent";
    if (SCRUBBABLE.has(type)) context.content_scrubbed = true;
    const revealable = revealableOf(type);
    if (revealable.length > 0) context.revealed = revealable;
    if (kind === "handoff") {
      context.in_reply_to = sha256Hex("previous message");
      context.protocol = "a2a/1.0.0";
    }
    if (type === "agent.handoff.received") context.unchecked_held_part_count = 1;
  }

  let event;
  if (kind === "handoff") {
    event = {
      message_hash: jcsHash(MESSAGE),
      content_type: "application/json",
      counterparty_public_key: KEY_B,
      sequence: 1,
    };
    if (all) event.message_bytes_hash = sha256Hex(JSON.stringify(MESSAGE));
    if (type === "agent.handoff.received") event.outcome = "accepted";
  } else {
    const bytes = fileBytesOf(type, metadata) ?? jcs(contentOf(type, metadata, context.content_scrubbed === true));
    event = { content_hash: sha256Hex(Buffer.from(bytes, "utf8")) };
    if (all) {
      event.content_length = Buffer.byteLength(bytes, "utf8");
      event.ref = `s3+opaque:${sha256Hex("locator/" + type)}`;
    }
  }

  return {
    payload_version: 1,
    spec_version: "sanning.events/v2",
    event_type: type,
    subject: all ? { type: "agent", agent_id: "agent-a", name: "quote-agent" } : { type: "agent", agent_id: "agent-a" },
    // Only a chained record (all, with context.chain_key) links to a previous record.
    previous_hash: all && type !== "agent.run_opened" ? sha256Hex("previous record") : "GENESIS",
    event,
    context,
    metadata,
    extras: { event_schema: EVENT_SCHEMA },
  };
}

function wrap(record, { key = KEY_A, eventId } = {}) {
  return { event_id: eventId ?? EV[record.event_type] ?? eid(`event/${record.event_type}`), public_key: key, record };
}

// --- the cases --------------------------------------------------------------------------------

const cases = [];

/** One case: a record under test, the records held beside it, and the reading expected. */
/** `extra`: more files of the case, { file name: text }. */
function add(group, name, about, subject, expected, held, sent, extra) {
  cases.push({ group, name, about, subject, held, expected, sent, extra });
}

function verified(findings = []) {
  return { valid: true, verdict: "verified", findings };
}
function failed(reason, at, valid = false) {
  return { valid, verdict: "failed", reason, at, findings: [] };
}

/** The step 6 findings of a record that verifies: plumbing, then a scrubbed content. */
function stepSixFindings(record) {
  const f = [];
  if (record.metadata.run.plumbing === true) f.push("plumbing");
  if (record.context.content_scrubbed === true) f.push("content_scrubbed");
  return f;
}

/**
 * What a valid case's record commits to, as a file of the case: the message a hand-off's
 * message_hash commits to, the bytes of a file that was read, or the content object.
 */
function contentFile(record) {
  const type = record.event_type;
  if (kindOf(type) === "handoff") return { "message.json": pretty(MESSAGE) };
  const bytes = fileBytesOf(type, record.metadata);
  if (bytes !== undefined) return { "content.bin": bytes };
  return { "content.json": pretty(contentOf(type, record.metadata, record.context.content_scrubbed === true)) };
}

// Every type valid, with only the required fields and with every field.
for (const type of AGENT_TYPES) {
  const min = recordOf(type);
  add("valid", `${type}-required-only`, `An ${type} record with only its required fields.`, wrap(min), verified(), undefined, undefined, contentFile(min));
  const max = recordOf(type, { all: true });
  add("valid", `${type}-every-field`, `An ${type} record with every field it can carry, revealed fields listed.`, wrap(max), verified(stepSixFindings(max)), undefined, undefined, contentFile(max));
}

// Pairing: every closer with its opener, read from both sides.
for (const [closer, opener] of Object.entries(OPENER_OF)) {
  const end = wrap(recordOf(closer));
  const start = wrap(recordOf(opener));
  add("pairing", `${closer}-names-its-start`, `${closer} names the ${opener} the reader holds.`, end, verified(), [start]);
  add("pairing", `${opener}-is-ended`, `${opener} with the ${closer} that ends it.`, start, verified(), [end]);
}
{
  const start = wrap(recordOf("agent.tool_call.started"));
  add("pairing", "start-with-no-end", "A tool call started and no record ends it: an operation that never finished.", start, verified(["unended"]), []);
  const end = wrap(recordOf("agent.tool_call.ended"));
  add("pairing", "end-with-start-not-held", "A tool call ended and the reader does not hold its start.", end, verified(["start_absent"]), []);

  const otherKey = wrap(recordOf("agent.tool_call.started"), { key: KEY_B });
  add("pairing", "end-names-a-start-another-key-signed", "The only record under the event_id the end names was signed by another key: it is not a candidate, and the end reads its start absent.", end, verified(["start_absent"]), [otherKey]);

  const modelStart = recordOf("agent.model_call.started");
  // At the start's position, so the chain is one an SDK can write.
  modelStart.metadata.run.seq = 6;
  modelStart.metadata.run.prev_event_id = EV["agent.model_call.ended"];
  const wrongType = wrap(modelStart, { eventId: EV["agent.tool_call.started"] });
  add("pairing", "end-names-a-start-of-another-type", "A tool call end names a model call start.", end, failed("pair_type_mismatch", "/metadata/run/started_event_id", true), [wrongType]);

  const otherRun = clone(recordOf("agent.tool_call.started"));
  otherRun.metadata.run.run_id = eid("run/another-tool-call");
  add("pairing", "end-names-a-start-of-another-run", "A tool call end names the start of a different tool call.", end, failed("pair_run_mismatch", "/metadata/run/started_event_id", true), [wrap(otherRun)]);

  const end2 = wrap(clone(recordOf("agent.tool_call.ended")), { eventId: eid("event/second-end") });
  end2.record.metadata.outcome.status = "failed";
  add("pairing", "start-ended-twice", "One tool call start and two records that end it.", start, verified(["ended_more_than_once"]), [end, end2]);

  const toolOther = clone(recordOf("agent.tool_call.started"));
  toolOther.metadata.gen_ai.tool.call.id = "call_0002";
  add("pairing", "end-names-a-start-of-another-tool-call-id", "A tool call end names a start that carries another gen_ai.tool.call.id.", end, failed("pair_call_mismatch", "/metadata/run/started_event_id", true), [wrap(toolOther)]);

  // An approval answered in a later invocation: a graph interrupt ends the first run, and the
  // resume is a new root run on the same conversation.
  const requested = recordOf("agent.approval.requested");
  requested.metadata.gen_ai = { conversation: { id: "thread-0001" } };
  const resumed = recordOf("agent.approval.resolved");
  resumed.metadata.run.run_id = eid("run/approval-resume");
  resumed.metadata.run.parent_run_id = eid("run/root-resume");
  resumed.metadata.run.root_run_id = eid("run/root-resume");
  // The resumed invocation opened with its own agent.run_opened at seq 0; the answer follows it.
  resumed.metadata.run.seq = 1;
  resumed.metadata.run.prev_event_id = eid("event/resume/agent.run_opened");
  resumed.metadata.gen_ai = { conversation: { id: "thread-0001" } };
  add("pairing", "approval-resolved-in-a-later-run", "An approval requested before an interrupt and resolved in the resumed run: two root runs, one conversation.", wrap(resumed), verified(), [wrap(requested)]);
  add("pairing", "approval-requested-resolved-in-a-later-run", "The same approval read from the request: the resolution in the resumed run ends it.", wrap(requested), verified(), [wrap(resumed)]);

  const unlinked = clone(resumed);
  delete unlinked.metadata.gen_ai;
  add("pairing", "approval-resolved-in-another-run-without-a-conversation", "An approval resolved in another run, with no conversation id to tie the two runs.", wrap(unlinked), failed("pair_run_mismatch", "/metadata/run/started_event_id", true), [wrap(requested)]);

  const bareRequest = clone(requested);
  delete bareRequest.metadata.gen_ai;
  add("pairing", "approval-in-two-runs-neither-names-a-conversation", "An approval requested and resolved in two runs, neither record naming a conversation: two absent ids do not tie two runs.", wrap(unlinked), failed("pair_run_mismatch", "/metadata/run/started_event_id", true), [wrap(bareRequest)]);

  const interrupted = recordOf("agent.run_closed");
  interrupted.metadata.closing.outcome.observed = { status: "interrupted" };
  add("rules", "run-closed-interrupted", "A run that ended on an interrupt closes as interrupted, never completed.", wrap(interrupted), verified());

  const nodeInterrupted = recordOf("agent.step.ended");
  nodeInterrupted.metadata.outcome.status = "interrupted";
  add("rules", "step-ended-interrupted", "The graph node that called interrupt ends as interrupted.", wrap(nodeInterrupted), verified());

  const step = recordOf("agent.step.started");
  step.metadata.run.plumbing = true;
  add("rules", "plumbing-marked", "A framework plumbing step, kept and marked: readers fold it by default.", wrap(step), verified(["plumbing"]));
}

// Unknown fields at every object level, and every required field missing, for every type.
function* objectNodes(schema, value, path = "") {
  const s = resolve(schema);
  if (s.type === "object" && s.additionalProperties === false && isObject(value)) {
    yield { path, schema: s, value };
    for (const [k, sub] of Object.entries(s.properties ?? {})) {
      if (Object.prototype.hasOwnProperty.call(value, k)) yield* objectNodes(sub, value[k], `${path}/${k}`);
    }
  }
}
function resolve(schema) {
  const ref = schema.$ref;
  if (ref === undefined) return schema;
  const name = ref.split("/").pop();
  return COMMON_DEFS[name];
}
function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function at(record, pointer) {
  let cur = record;
  for (const k of pointer.split("/").slice(1)) cur = cur[k];
  return cur;
}
const SHARED_NODES = new Set(["/subject", "/event", "/metadata/otel", "/metadata/otel/scope", "/extras"]);
// A missing salt is tested on every type, in the salt group.
const SKIP_REQUIRED = new Set(["/event_type", "/extras", "/extras/event_schema", "/context/salt"]);

/**
 * Whether this type tests this object node. A shared definition is one schema object, so it is
 * tested once, on the first type; each hand-off type has its own event definition.
 */
function testsNode(type, path) {
  if (path === "/event" && kindOf(type) === "handoff") return true;
  if (SHARED_NODES.has(path)) return type === AGENT_TYPES[0];
  return true;
}

// A missing required field is tested once per field path, on the first type that has it: every
// type's schema states its required list in the same compiled form.
const missingTested = new Set();

for (const type of AGENT_TYPES) {
  const schema = typeSchema(type);
  const max = recordOf(type, { all: true });
  for (const node of objectNodes(schema, max)) {
    if (!testsNode(type, node.path)) continue;
    const r = clone(max);
    at(r, node.path).zz_unknown = true;
    const where = node.path || "/";
    add("unknown-field", `${type}${node.path.replaceAll("/", ".") || ".record"}`, `${type}: an unknown field at ${where}.`, wrap(r), failed("unknown_field", `${node.path}/zz_unknown`));
    for (const req of node.schema.required ?? []) {
      const p = `${node.path}/${req}`;
      if (SKIP_REQUIRED.has(p) || missingTested.has(p)) continue;
      missingTested.add(p);
      const m = clone(max);
      delete at(m, node.path)[req];
      add("missing-field", `${type}${p.replaceAll("/", ".")}`, `${type}: the required field ${p} is missing.`, wrap(m), failed("missing_field", p));
    }
  }
}

// The closed event_type set.
{
  const r = (t) => {
    const x = recordOf("agent.tool_call.started");
    x.event_type = t;
    return x;
  };
  add("event-type", "unknown-agent-type", "agent.plan.started is in the agent namespace and is not one of the 19 types.", wrap(r("agent.plan.started")), failed("event_type_not_in_set", "/event_type"));
  add("event-type", "builder-defined-type", "A builder-defined type, myapp.tool_call, is outside the closed set.", wrap(r("myapp.tool_call")), failed("event_type_not_in_set", "/event_type"));
  add("event-type", "uppercase-agent-type", "AGENT.TOOL_CALL.STARTED is not a spelling of a type in the set: names compare exactly.", wrap(r("AGENT.TOOL_CALL.STARTED")), failed("event_type_not_in_set", "/event_type"));

  const egress = {
    payload_version: 1,
    spec_version: "sanning.events/v2",
    event_type: "runner.egress",
    subject: { type: "agent", agent_id: "agent-a" },
    previous_hash: "GENESIS",
    event: { content_hash: jcsHash({ note: "a runner.egress record" }) },
    context: {},
    metadata: {},
    extras: {},
  };
  add("event-type", "runner-record-is-not-an-agent-record", "A runner.egress record is in the closed set and outside this vocabulary: no verdict here.", wrap(egress, { eventId: eid("event/runner.egress") }), { valid: true, verdict: null, findings: ["not_an_agent_record"] });
  const misplaced = clone(egress);
  misplaced.extras = { event_schema: EVENT_SCHEMA };
  add("event-type", "event-schema-on-a-runner-record", "A runner.egress record that claims the agent vocabulary.", wrap(misplaced, { eventId: eid("event/runner.egress") }), failed("event_schema_misplaced", "/extras/event_schema"));
}

// The vocabulary version.
{
  const v = (value) => {
    const x = recordOf("agent.tool_call.started");
    if (value === undefined) x.extras = {};
    else x.extras = { event_schema: value };
    return x;
  };
  add("event-schema", "unknown-major", "sanning.agent/2, a version this reader does not know: incomplete, never verified.", wrap(v("sanning.agent/2")), { valid: false, verdict: "incomplete", reason: "event_schema_unknown", at: "/extras/event_schema", findings: [] });
  add("event-schema", "unknown-minor", "sanning.agent/1.1, a later minor this reader does not know: incomplete, never verified.", wrap(v("sanning.agent/1.1")), { valid: false, verdict: "incomplete", reason: "event_schema_unknown", at: "/extras/event_schema", findings: [] });
  add("event-schema", "missing", "An agent record with no extras.event_schema.", wrap(v(undefined)), failed("event_schema_missing", "/extras/event_schema"));
  const invalid = [
    ["major-zero", "sanning.agent/0", "Major 0 is not a version: majors start at 1."],
    ["major-leading-zero", "sanning.agent/01", "A leading zero is not a spelling of major 1."],
    ["minor-zero", "sanning.agent/1.0", "Minor 0 is written as the bare major, sanning.agent/1: 1.0 is not a spelling of it."],
    ["minor-leading-zero", "sanning.agent/1.01", "A leading zero in the minor is not a spelling."],
    ["v-prefix", "sanning.agent/v1", "A v before the major is not in the grammar."],
    ["major-too-long", "sanning.agent/1234567890", "A major of ten digits is outside the grammar."],
    ["not-a-string", 1, "The version is a string."],
  ];
  for (const [name, value, about] of invalid) {
    add("event-schema", name, about, wrap(v(value)), failed("event_schema_invalid", "/extras/event_schema"));
  }
  const unknownVersion = { valid: false, verdict: "incomplete", reason: "event_schema_unknown", at: "/extras/event_schema", findings: [] };
  const newType = (version) => {
    const x = v(version);
    x.event_type = "agent.memory.read";
    return x;
  };
  add("event-schema", "unknown-minor-new-type", "agent.memory.read under sanning.agent/1.1: a type a later minor adds reads incomplete, never failed, because the version is read before the type.", wrap(newType("sanning.agent/1.1")), unknownVersion);
  add("event-schema", "unknown-major-new-type", "agent.memory.read under sanning.agent/2: an unknown major reads incomplete whatever its type.", wrap(newType("sanning.agent/2")), unknownVersion);
  add("event-schema", "unknown-type-known-version", "agent.memory.read under sanning.agent/1, a version this reader knows: the type is outside that version's set.", wrap(newType(EVENT_SCHEMA)), failed("event_type_not_in_set", "/event_type"));
}

// The data modes: one record, three modes, one reading.
const MODES = ["private", "standard", "full"];

/** What Sanning receives for a record in its mode (agent-events.md 7): the fields, never the request. */
function sentOf(record) {
  const mode = record.context.data_mode;
  const type = record.event_type;
  const keep = (path) => MODES.indexOf(tierOf(type, path)) <= MODES.indexOf(mode);
  const walk = (value, path) => {
    if (path !== "" && (isFieldPath(type, path) || value === null || typeof value !== "object" || Array.isArray(value))) {
      return keep(path) ? value : undefined;
    }
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const sub = walk(v, path === "" ? k : `${path}.${k}`);
      if (sub !== undefined) out[k] = sub;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  };
  const sent = { record: walk(record, "") };
  if (mode === "full") sent.content = contentOf(type, record.metadata, record.context.content_scrubbed === true);
  return sent;
}

for (const mode of MODES) {
  const r = recordOf("agent.tool_call.started", { all: true, mode });
  add("data-mode", mode, `The same tool call start in ${mode} mode: the reading does not depend on the mode, and sent.json is what Sanning receives.`, wrap(r), verified(stepSixFindings(r)), undefined, sentOf(r));
}
{
  const r = recordOf("agent.tool_call.started", { mode: "public" });
  add("data-mode", "not-a-mode", "data_mode public is not a mode.", wrap(r), failed("bad_value", "/context/data_mode"));
}

// Revealed and hidden fields.
{
  const t = "agent.tool_call.started";
  const revealed = recordOf(t);
  setPath(revealed.metadata, "gen_ai.tool.call.arguments", { currency: "EUR" });
  revealed.context.revealed = ["gen_ai.tool.call.arguments"];
  add("disclosure", "revealed-field-listed", "Tool arguments revealed in clear and listed in context.revealed.", wrap(revealed), verified());

  const unlisted = clone(revealed);
  delete unlisted.context.revealed;
  add("disclosure", "revealed-field-not-listed", "Tool arguments in clear with no context.revealed entry: a reader cannot tell a reveal from a leak.", wrap(unlisted), failed("revealed_field_unlisted", "/metadata/gen_ai/tool/call/arguments"));

  const absent = recordOf(t);
  absent.context.revealed = ["gen_ai.tool.call.arguments"];
  add("disclosure", "revealed-field-absent", "context.revealed lists tool arguments the record does not carry.", wrap(absent), failed("revealed_field_absent", "/metadata/gen_ai/tool/call/arguments"));

  const notRevealable = recordOf(t);
  notRevealable.context.revealed = ["gen_ai.tool.name"];
  add("disclosure", "revealed-path-not-revealable", "gen_ai.tool.name is a clear field, not a hash-only one: it cannot be listed as revealed.", wrap(notRevealable), failed("bad_value", "/context/revealed/0"));

  const hidden = recordOf(t);
  hidden.context.hidden = { "gen_ai.tool.name": jcsHash("lookup_rate") };
  add("disclosure", "hidden-field-listed", "The tool name hidden: absent in clear, its hash listed in context.hidden.", wrap(hidden), verified());

  const both = recordOf(t);
  setPath(both.metadata, "gen_ai.tool.name", "lookup_rate");
  both.context.hidden = { "gen_ai.tool.name": jcsHash("lookup_rate") };
  add("disclosure", "hidden-field-present", "The tool name listed as hidden and still present in clear.", wrap(both), failed("hidden_field_present", "/metadata/gen_ai/tool/name"));

  const notHidable = recordOf(t);
  notHidable.context.hidden = { "gen_ai.tool.call.id": jcsHash("call_0001") };
  add("disclosure", "hidden-path-not-hidable", "gen_ai.tool.call.id is an id, never hidden.", wrap(notHidable), failed("unknown_field", "/context/hidden/gen_ai.tool.call.id"));

  const badHash = recordOf(t);
  badHash.context.hidden = { "gen_ai.tool.name": "lookup_rate" };
  add("disclosure", "hidden-value-not-a-hash", "context.hidden carries the name itself instead of its hash.", wrap(badHash), failed("bad_value", "/context/hidden/gen_ai.tool.name"));

  const approver = recordOf("agent.approval.resolved");
  setPath(approver.metadata, "approval.reviewer", { id: "reviewer-7" });
  approver.context.revealed = ["approval.reviewer"];
  add("disclosure", "approver-revealed", "The approver's identity, hash-only by default, revealed and listed.", wrap(approver), verified());
}

// Hand-offs: the unchecked-parts count.
{
  const t = "agent.handoff.received";
  const counted = recordOf(t);
  setPath(counted.metadata, "handoff.unchecked_held_parts", [1]);
  counted.context.unchecked_held_part_count = 1;
  add("handoff", "unchecked-parts-counted", "A received message with one file part held and not checked, and the count present.", wrap(counted), verified());

  const missing = clone(counted);
  delete missing.context.unchecked_held_part_count;
  add("handoff", "unchecked-parts-count-missing", "The same record with context.unchecked_held_part_count missing.", wrap(missing), failed("unchecked_held_parts_missing", "/context/unchecked_held_part_count"));

  const wrong = clone(counted);
  wrong.context.unchecked_held_part_count = 2;
  add("handoff", "unchecked-parts-count-wrong", "context.unchecked_held_part_count says 2 and the record lists one unchecked part.", wrap(wrong), failed("unchecked_held_parts_mismatch", "/context/unchecked_held_part_count"));

  const zero = recordOf(t);
  zero.context.unchecked_held_part_count = 0;
  add("handoff", "unchecked-parts-zero", "A zero count is written by leaving the key out, never as 0.", wrap(zero), failed("bad_value", "/context/unchecked_held_part_count"));

  const url = recordOf(t);
  url.metadata.handoff = { parts: 1, file_parts: 1, unchecked_held_parts: [0] };
  url.context.unchecked_held_part_count = 1;
  url.event.message_hash = jcsHash({ parts: [{ url: "https://files.example/quote.pdf", media_type: "application/pdf" }] });
  add("handoff", "url-part-held-and-counted", "A message whose one part is a url part; the receiver held the file behind it and did not check it, and counts it.", wrap(url), verified());

  const out = clone(counted);
  out.metadata.handoff.unchecked_held_parts = [5];
  add("handoff", "unchecked-part-index-out-of-range", "An unchecked part index past the end of the message's parts.", wrap(out), failed("part_index_out_of_range", "/metadata/handoff/unchecked_held_parts/0"));

  const sent = recordOf("agent.handoff.sent");
  sent.context.unchecked_held_part_count = 1;
  add("handoff", "unchecked-parts-on-a-sent-record", "Only the receiving side holds parts it did not check.", wrap(sent), failed("unknown_field", "/context/unchecked_held_part_count"));
}

// The other rules the schema cannot state.
{
  const closed = recordOf("agent.run_closed");
  closed.metadata.closing.record_count = 3;
  add("rules", "closing-count-mismatch", "closing.record_count says 3 and closing.record_ids lists 2.", wrap(closed), failed("closing_count_mismatch", "/metadata/closing/record_count"));

  const file = recordOf("agent.file");
  file.metadata.outcome.status = "failed";
  add("rules", "file-failed-without-reason", "A file record that failed and names no reason.", wrap(file), failed("artifact_reason_mismatch", "/metadata/artifact/reason"));

  const reason = recordOf("agent.file");
  setPath(reason.metadata, "artifact.reason", "too_large");
  add("rules", "file-completed-with-reason", "A file record that completed and still names a failure reason.", wrap(reason), failed("artifact_reason_mismatch", "/metadata/artifact/reason"));

  const opaque = recordOf("agent.tool_call.started");
  opaque.metadata.gen_ai.conversation = { id: "alice@example.com" };
  add("rules", "conversation-id-not-opaque", "A conversation id must be opaque: an email address is refused.", wrap(opaque), failed("bad_value", "/metadata/gen_ai/conversation/id"));

  const zeros = recordOf("agent.tool_call.started");
  zeros.metadata.otel.trace_id = "0".repeat(32);
  add("rules", "otel-trace-id-all-zero", "An all-zero trace id is OpenTelemetry's no-span value: absent, never written.", wrap(zeros), failed("bad_value", "/metadata/otel/trace_id"));

  const leak = recordOf("agent.tool_call.started");
  leak.event.secret = "rate for customer";
  add("rules", "event-section-unknown-field", "A field outside the event section's closed list.", wrap(leak), failed("unknown_field", "/event/secret"));
}

// A record wrapped as held or under test, with another envelope event_id or key.
const as = (record, opts) => wrap(clone(record), opts);
const PAIR_AT = "/metadata/run/started_event_id";
function pairFailed(reason, at = PAIR_AT, findings = []) {
  return { valid: true, verdict: "failed", reason, at, findings };
}

// Several errors in one record: which reason and pointer are reported (agent-events.md 10.1).
{
  const step = () => recordOf("agent.step.started");
  const misspelt = step();
  const { run_id: runId, ...rest } = misspelt.metadata.run;
  misspelt.metadata.run = { runid: runId, ...rest };
  add("precedence", "misspelt-required-member", "run_id written as runid: an unknown member and a missing one. unknown_field comes before missing_field.", wrap(misspelt), failed("unknown_field", "/metadata/run/runid"));

  const unknownAndBad = step();
  unknownAndBad.metadata.zz_unknown = true;
  unknownAndBad.context.data_mode = "secret";
  add("precedence", "unknown-before-bad-value", "An unknown member in metadata and a bad data_mode: unknown_field comes before bad_value, whatever the pointers.", wrap(unknownAndBad), failed("unknown_field", "/metadata/zz_unknown"));

  const twoUnknown = step();
  twoUnknown.metadata.run = { zz_unknown: true, ...twoUnknown.metadata.run, aa_unknown: true };
  add("precedence", "two-unknown-fields", "Two unknown members, written zz first: the smaller pointer is reported, not the first in the text.", wrap(twoUnknown), failed("unknown_field", "/metadata/run/aa_unknown"));

  const twoMissing = step();
  delete twoMissing.metadata.run.seq;
  delete twoMissing.metadata.run.run_id;
  add("precedence", "two-missing-fields", "run_id and seq both missing: run_id is the smaller pointer.", wrap(twoMissing), failed("missing_field", "/metadata/run/run_id"));

  const twoBad = step();
  twoBad.metadata.gen_ai = { conversation: { id: "alice@example.com" } };
  twoBad.context.data_mode = "secret";
  add("precedence", "two-bad-values", "A bad conversation id and a bad data_mode: /context comes before /metadata.", wrap(twoBad), failed("bad_value", "/context/data_mode"));

  const indexes = recordOf("agent.run_closed");
  indexes.metadata.closing.record_ids = Array.from({ length: 11 }, (_, i) => eid(`event/listed/${i}`));
  indexes.metadata.closing.record_ids[2] = "not-an-event-id-2";
  indexes.metadata.closing.record_ids[10] = "not-an-event-id-10";
  indexes.metadata.closing.record_count = 11;
  add("precedence", "array-indexes-compare-as-numbers", "Bad values at record_ids/2 and record_ids/10: an array index compares as a number, so 2 is reported.", wrap(indexes), failed("bad_value", "/metadata/closing/record_ids/2"));

  const h = jcsHash("lookup_rate");
  const twoHidden = recordOf("agent.tool_call.started", { all: true });
  twoHidden.context.hidden = { "run.name": h, "gen_ai.tool.name": h };
  add("precedence", "two-hidden-fields-present", "run.name and gen_ai.tool.name both hidden and both present: the paths are read in sorted order.", wrap(twoHidden), failed("hidden_field_present", "/metadata/gen_ai/tool/name"));
  const twoHiddenOther = clone(twoHidden);
  twoHiddenOther.context.hidden = { "gen_ai.tool.name": h, "run.name": h };
  add("precedence", "two-hidden-fields-present-other-order", "The same record with the hidden paths written in the other order: the same reading.", wrap(twoHiddenOther), failed("hidden_field_present", "/metadata/gen_ai/tool/name"));

  const hiddenAndRevealed = recordOf("agent.tool_call.started");
  setPath(hiddenAndRevealed.metadata, "gen_ai.tool.name", "lookup_rate");
  hiddenAndRevealed.context.hidden = { "gen_ai.tool.name": h };
  hiddenAndRevealed.context.revealed = ["gen_ai.tool.call.arguments"];
  add("precedence", "hidden-before-revealed", "A hidden field present and a revealed field absent: the hidden rule is read first.", wrap(hiddenAndRevealed), failed("hidden_field_present", "/metadata/gen_ai/tool/name"));

  const absentAndUnlisted = recordOf("agent.model_call.started");
  setPath(absentAndUnlisted.metadata, "gen_ai.input.messages", [{ role: "user" }]);
  absentAndUnlisted.context.revealed = ["gen_ai.system_instructions"];
  add("precedence", "revealed-absent-before-unlisted", "A listed field absent and a present field unlisted: revealed_field_absent is read first.", wrap(absentAndUnlisted), failed("revealed_field_absent", "/metadata/gen_ai/system_instructions"));

  const twoAbsent = recordOf("agent.model_call.started");
  twoAbsent.context.revealed = ["gen_ai.system_instructions", "gen_ai.input.messages"];
  add("precedence", "two-revealed-absent", "Two listed fields absent, listed out of order: the paths are read in sorted order.", wrap(twoAbsent), failed("revealed_field_absent", "/metadata/gen_ai/input/messages"));
}

// A revealed field whose value is null is present.
{
  const t = "agent.tool_call.started";
  const listed = recordOf(t);
  setPath(listed.metadata, "gen_ai.tool.call.arguments", null);
  listed.context.revealed = ["gen_ai.tool.call.arguments"];
  add("disclosure", "revealed-null-listed", "Tool arguments revealed as null and listed: a member written as null is present.", wrap(listed), verified());
  const unlisted = clone(listed);
  delete unlisted.context.revealed;
  add("disclosure", "revealed-null-unlisted", "Tool arguments revealed as null and not listed: null is present, so it is a field in clear that is not listed.", wrap(unlisted), failed("revealed_field_unlisted", "/metadata/gen_ai/tool/call/arguments"));
}

// Hand-off part counts, within a record and across the two records of one message.
{
  const t = "agent.handoff.received";
  const noList = recordOf(t);
  noList.context.unchecked_held_part_count = 1;
  add("handoff", "unchecked-parts-count-without-list", "A count of one unchecked part and no list of positions.", wrap(noList), failed("unchecked_held_parts_missing", "/metadata/handoff/unchecked_held_parts"));

  const fileExceeds = recordOf("agent.handoff.sent");
  fileExceeds.metadata.handoff = { parts: 1, file_parts: 7 };
  add("handoff", "file-parts-exceed-parts", "Seven file parts in a message of one part.", wrap(fileExceeds), failed("file_parts_exceed_parts", "/metadata/handoff/file_parts"));

  const uncheckedExceeds = recordOf(t);
  uncheckedExceeds.metadata.handoff = { parts: 3, file_parts: 1, unchecked_held_parts: [0, 2] };
  uncheckedExceeds.context.unchecked_held_part_count = 2;
  add("handoff", "unchecked-parts-exceed-file-parts", "Two unchecked parts in a message with one file part.", wrap(uncheckedExceeds), failed("unchecked_held_parts_exceed_file_parts", "/context/unchecked_held_part_count"));

  const sent = wrap(recordOf("agent.handoff.sent"));
  const received = recordOf(t);
  received.event.counterparty_public_key = KEY_A;
  const recv = wrap(received, { key: KEY_B });
  add("handoff", "pair-parts-agree", "A received record read with the sender's record of the same message: the part counts agree.", recv, verified(), [sent]);

  const hiding = clone(received);
  hiding.metadata.handoff = { parts: 0, file_parts: 0 };
  add("handoff", "pair-parts-disagree", "The receiver records no parts for a message the sender recorded with two: one message, two part counts, a finding that moves no verdict.", wrap(hiding, { key: KEY_B }), verified(["handoff_parts_mismatch"]), [sent]);
  add("handoff", "pair-parts-disagree-sender-side", "The same pair read from the sender: the sender's record shows the finding too, and still reads verified, because the receiver's key cannot move it.", sent, verified(["handoff_parts_mismatch"]), [wrap(hiding, { key: KEY_B })]);

  const fileHiding = clone(received);
  fileHiding.metadata.handoff = { parts: 2, file_parts: 0 };
  add("handoff", "pair-file-parts-disagree", "The receiver records no file part where the sender recorded one.", wrap(fileHiding, { key: KEY_B }), verified(["handoff_parts_mismatch"]), [sent]);

  const partsOnly = clone(received);
  partsOnly.metadata.handoff = { parts: 3, file_parts: 1 };
  const partsOnlyHeld = as(partsOnly, { key: KEY_B, eventId: eid("event/agent-b/second-received") });
  const fileOnlyHeld = as(fileHiding, { key: KEY_B });
  add("handoff", "pair-two-counterparts-disagree", "Two received records of the sender's message, one off on parts and one on file parts: one finding.", sent, verified(["handoff_parts_mismatch"]), [fileOnlyHeld, partsOnlyHeld]);
  add("handoff", "pair-two-counterparts-disagree-other-order", "The same two received records held in the other order: the same reading.", sent, verified(["handoff_parts_mismatch"]), [partsOnlyHeld, fileOnlyHeld]);
  add("handoff", "pair-one-of-two-counterparts-disagrees", "Two received records of the sender's message, the first held agreeing and the second not: every counterpart is compared.", sent, verified(["handoff_parts_mismatch"]), [recv, partsOnlyHeld]);

  const otherMessage = clone(hiding);
  otherMessage.event.message_hash = jcsHash({ parts: [] });
  add("handoff", "pair-other-message-not-compared", "A received record of another message from the same sender: its counts are not compared.", wrap(otherMessage, { key: KEY_B }), verified(), [sent]);
}

// Pairing: several candidates, ends that do not verify, keys spelled in upper case.
{
  const end = wrap(recordOf("agent.tool_call.ended"));
  const start = wrap(recordOf("agent.tool_call.started"));
  const foreign = as(start.record, { key: KEY_B });
  const wrongType = as(recordOf("agent.model_call.started"), { eventId: EV["agent.tool_call.started"] });
  const otherRunStart = clone(start.record);
  otherRunStart.metadata.run.run_id = eid("run/another-tool-call");
  const otherRunSameId = as(otherRunStart);
  add("pairing", "decoy-start-under-another-key", "The genuine start, and a record under another key that reuses its event_id: only the end's own key's records are candidates, so the decoy changes nothing.", end, verified(), [start, foreign]);
  add("pairing", "two-candidates-one-good", "The genuine start and a record of another type that the same key signed under its event_id: every candidate is graded and the worst reading stands.", end, pairFailed("pair_type_mismatch", PAIR_AT, ["start_ambiguous"]), [start, wrongType]);
  add("pairing", "two-candidates-one-good-other-order", "The same two candidates held in the other order: the same reading.", end, pairFailed("pair_type_mismatch", PAIR_AT, ["start_ambiguous"]), [wrongType, start]);
  add("pairing", "two-failing-candidates", "Two candidates that fail on different checks: the worse check, the type, is reported.", end, pairFailed("pair_type_mismatch", PAIR_AT, ["start_ambiguous"]), [otherRunSameId, wrongType]);
  add("pairing", "two-failing-candidates-other-order", "The same two candidates in the other order: the same reading.", end, pairFailed("pair_type_mismatch", PAIR_AT, ["start_ambiguous"]), [wrongType, otherRunSameId]);
  add("pairing", "start-held-twice", "The start held twice, byte for byte: the held records are a set, so it is one candidate and nothing is ambiguous.", end, verified(), [start, as(start.record)]);
  // A record is never one of its own held records: an end that names itself reads as one whose start
  // is not held, whether or not the verifier holds a copy of it.
  const namesItself = clone(end.record);
  namesItself.metadata.run.started_event_id = end.event_id;
  add("pairing", "end-names-itself", "A tool call end whose run.started_event_id is its own event_id, read with nothing held: it names no other record, so its start is not held.", as(namesItself), verified(["start_absent"]), []);
  add("pairing", "end-names-itself-held-beside-itself", "The same end, with a copy of itself in the held records: the record itself is not one of its held records, so the copy is set aside and the reading is the same.", as(namesItself), verified(["start_absent"]), [as(namesItself)]);
  const sameStartOtherContent = clone(start.record);
  sameStartOtherContent.event.content_hash = sha256Hex("another input");
  add("pairing", "two-good-candidates", "Two different records under the end's key and event_id that both pair: the ambiguity is named.", end, verified(["start_ambiguous"]), [start, as(sameStartOtherContent)]);
  add("pairing", "start-ended-by-an-end-with-a-second-candidate", "A start and its end, beside a record of another type under the same key and the start's event_id: the end reads failed against that record, and still ends this start, because an end is graded against each start on its own. The held record at run.seq 4 shows a gap before this start.", start, verified(["seq_gap"]), [end, wrongType]);

  const convStart = recordOf("agent.tool_call.started");
  convStart.metadata.run.run_id = eid("run/another-tool-call");
  convStart.metadata.run.root_run_id = eid("run/another-invocation");
  convStart.metadata.run.prev_event_id = eid("event/another-invocation/previous");
  convStart.metadata.gen_ai.conversation = { id: "thread-0001" };
  const convEnd = recordOf("agent.tool_call.ended");
  convEnd.metadata.run.prev_event_id = eid("event/this-invocation/previous");
  convEnd.metadata.gen_ai.conversation = { id: "thread-0001" };
  const otherInvocation = clone(start.record);
  otherInvocation.metadata.run.root_run_id = eid("run/another-invocation");
  otherInvocation.metadata.run.prev_event_id = eid("event/another-invocation/previous");
  // The start is in another invocation, so the end's previous record is not that start.
  const endHere = as(end.record);
  endHere.record.metadata.run.prev_event_id = eid("event/this-invocation/previous");
  add("pairing", "end-names-a-start-in-another-invocation", "The start carries the end's run id under another root run id: one operation is in one invocation.", endHere, pairFailed("pair_run_mismatch"), [as(otherInvocation)]);
  const notARequest = recordOf("agent.tool_call.started");
  notARequest.metadata.run.run_id = eid("run/approval");
  notARequest.metadata.run.seq = 10;
  notARequest.metadata.run.prev_event_id = EV["agent.retrieval.ended"];
  add("pairing", "approval-resolved-names-a-tool-call", "An approval answer names a tool call start in its own run: the type is checked for approvals too.", wrap(recordOf("agent.approval.resolved")), pairFailed("pair_type_mismatch"), [as(notARequest, { eventId: EV["agent.approval.requested"] })]);
  add("pairing", "tool-call-in-two-runs-same-conversation", "A tool call end names a start in another invocation of the same conversation, both ids differing: the conversation exception is for approvals only.", wrap(convEnd), pairFailed("pair_run_mismatch"), [wrap(convStart)]);

  const badStart = clone(start.record);
  badStart.metadata.zz_unknown = true;
  add("pairing", "end-whose-only-start-fails", "The record the end names does not itself verify: it is not a start, and the end reads its start absent.", end, verified(["start_absent"]), [as(badStart)]);

  const badEnd = clone(end.record);
  badEnd.metadata.zz_unknown = true;
  delete badEnd.metadata.outcome;
  add("pairing", "start-whose-only-end-fails", "The only record that names the start does not itself verify: it ends nothing.", start, verified(["unended"]), [as(badEnd)]);
  const unknownEnd = clone(end.record);
  unknownEnd.extras.event_schema = "sanning.agent/9";
  add("pairing", "start-whose-only-end-is-incomplete", "The only record that names the start is in a version the reader does not know: it ends nothing.", start, verified(["unended"]), [as(unknownEnd)]);
  const badEndBeside = as(badEnd, { eventId: eid("event/malformed-end") });
  add("pairing", "start-with-a-failing-end-beside-a-good-one", "A record that does not itself verify and a good end both name the start: one end.", start, verified(), [badEndBeside, end]);
  add("pairing", "start-with-a-good-end-beside-a-failing-one", "The same two records held in the other order.", start, verified(), [end, badEndBeside]);
  add("pairing", "start-whose-only-end-another-key-signed", "The only end is signed by another key: it ends nothing.", start, verified(["unended"]), [as(end.record, { key: KEY_B })]);
  const otherRunEnd = clone(end.record);
  otherRunEnd.metadata.run.run_id = eid("run/another-tool-call");
  add("pairing", "start-whose-only-end-is-another-run", "The only end carries another run id: it is another operation's end.", start, verified(["unended"]), [as(otherRunEnd)]);
  const otherToolEnd = clone(end.record);
  setPath(otherToolEnd.metadata, "gen_ai.tool.name", "transfer_funds");
  const namedStart = clone(start.record);
  setPath(namedStart.metadata, "gen_ai.tool.name", "read_balance");
  add("pairing", "start-whose-only-end-names-another-tool", "The only end names another tool: it is not this call's end.", as(namedStart), verified(["unended"]), [as(otherToolEnd)]);

  add("pairing", "end-key-in-upper-case", "The end's envelope key in upper case: a key compares as a key.", start, verified(), [{ ...end, public_key: KEY_A.toUpperCase() }]);
  add("pairing", "start-key-in-upper-case", "The start's envelope key in upper case, read from the end.", end, verified(), [{ ...start, public_key: KEY_A.toUpperCase() }]);

  add("pairing", "tool-call-names-another-tool", "A tool call that started as read_balance and ended as transfer_funds.", as(otherToolEnd), pairFailed("pair_field_mismatch", "/metadata/gen_ai/tool/name"), [as(namedStart)]);
  const hiddenEnd = clone(end.record);
  hiddenEnd.context.hidden = { "gen_ai.tool.name": jcsHash("read_balance") };
  add("pairing", "tool-call-hidden-name-matches", "The end hides the tool name, and its hash is the hash of the start's name.", as(hiddenEnd), verified(), [as(namedStart)]);
  // A lone surrogate has no JCS bytes. A hash of the escaped form JSON.stringify writes is what a
  // reader that does not check would compute, so the end hides exactly that.
  const unencodable = "read_\ud800balance";
  const loneStart = clone(start.record);
  setPath(loneStart.metadata, "gen_ai.tool.name", unencodable);
  const loneEnd = clone(end.record);
  loneEnd.context.hidden = { "gen_ai.tool.name": sha256Hex(JSON.stringify(unencodable)) };
  add("pairing", "tool-call-hidden-name-not-encodable", "The start names the tool with a lone surrogate, which JCS cannot encode: it commits to nothing, so no hidden hash matches it.", as(loneEnd), pairFailed("pair_field_mismatch", "/metadata/gen_ai/tool/name"), [as(loneStart)]);
  const loneClearEnd = clone(end.record);
  setPath(loneClearEnd.metadata, "gen_ai.tool.name", unencodable);
  add("pairing", "tool-call-name-not-encodable-in-both-halves", "Both halves name the tool in clear with the same lone surrogate: the values are the same, so the halves agree.", as(loneClearEnd), verified(), [as(loneStart)]);
  const hiddenOther = clone(end.record);
  hiddenOther.context.hidden = { "gen_ai.tool.name": jcsHash("transfer_funds") };
  add("pairing", "tool-call-hidden-name-differs", "The end hides a tool name whose hash is not the hash of the start's name.", as(hiddenOther), pairFailed("pair_field_mismatch", "/metadata/gen_ai/tool/name"), [as(namedStart)]);

  const mEnd = recordOf("agent.model_call.ended");
  setPath(mEnd.metadata, "gen_ai.provider.name", "openai");
  const mStartRecord = recordOf("agent.model_call.started");
  setPath(mStartRecord.metadata, "gen_ai.provider.name", "openai");
  const mStart = wrap(mStartRecord);
  const otherProvider = clone(mEnd);
  otherProvider.metadata.gen_ai.provider.name = "anthropic";
  add("pairing", "model-call-another-provider", "A model call that started at one provider and ended at another.", as(otherProvider), pairFailed("pair_field_mismatch", "/metadata/gen_ai/provider/name"), [mStart]);
  const otherOperation = clone(mEnd);
  otherOperation.metadata.gen_ai.operation.name = "embeddings";
  add("pairing", "model-call-another-operation", "A model call that started as chat and ended as embeddings.", as(otherOperation), pairFailed("pair_field_mismatch", "/metadata/gen_ai/operation/name"), [mStart]);

  const req = wrap(recordOf("agent.approval.requested", { all: true }));
  const res = recordOf("agent.approval.resolved", { all: true });
  add("pairing", "approval-halves-agree", "An approval whose two halves name one action, one decider and one policy.", wrap(res), verified(["content_scrubbed"]), [req]);
  const otherSubject = clone(res);
  otherSubject.metadata.approval.subject_event_id = eid("event/another-action");
  add("pairing", "approval-resolved-names-another-action", "The answer names another action than the request: a reader would see action Y approved when X was shown.", as(otherSubject), pairFailed("pair_field_mismatch", "/metadata/approval/subject_event_id", ["content_scrubbed"]), [req]);
  const otherActor = clone(res);
  otherActor.metadata.approval.actor = "model";
  add("pairing", "approval-resolved-by-another-decider", "A request to a human answered by a model.", as(otherActor), pairFailed("pair_field_mismatch", "/metadata/approval/actor", ["content_scrubbed"]), [req]);
  const otherPolicy = clone(res);
  otherPolicy.metadata.approval.policy_hash = sha256Hex("another policy");
  add("pairing", "approval-resolved-under-another-policy", "The two halves name two policies.", as(otherPolicy), pairFailed("pair_field_mismatch", "/metadata/approval/policy_hash", ["content_scrubbed"]), [req]);
  const both = clone(otherSubject);
  both.metadata.approval.actor = "model";
  add("pairing", "approval-two-fields-differ", "Action and decider both differ: the fields are checked in a fixed order, the action first.", as(both), pairFailed("pair_field_mismatch", "/metadata/approval/subject_event_id", ["content_scrubbed"]), [req]);
}

// An end whose start this adapter cannot observe.
{
  const t = "agent.tool_call.ended";
  const endOnly = recordOf(t);
  endOnly.metadata.run.started_event_id = null;
  const opened = recordOf("agent.run_opened");
  opened.metadata.capture = { not_captured: ["agent.tool_call.started"] };
  add("end-only", "read-alone", "An end with no start, read on its own: steps 1 to 6 verify it.", wrap(endOnly), verified());
  add("end-only", "declared-on-run-opened", "The invocation's run_opened says this adapter cannot capture a tool call start: end only, start not observed.", wrap(endOnly), verified(["start_not_captured", "seq_gap"]), [wrap(opened)]);

  const timed = clone(endOnly);
  timed.metadata.run.observed_started_at = "2026-10-27T09:30:00.125Z";
  add("end-only", "declared-with-observed-start-time", "The same end carrying the start time its source reported: shown, and still no start was signed live.", wrap(timed), verified(["start_not_captured", "seq_gap"]), [wrap(opened)]);

  const head = recordOf("agent.step.started");
  head.metadata.run.seq = 0;
  head.metadata.run.prev_event_id = null;
  head.metadata.capture = { not_captured: ["agent.tool_call.started"] };
  add("end-only", "declared-on-the-first-record", "No run_opened: the declaration is on the invocation's first record.", wrap(endOnly), verified(["start_not_captured", "seq_gap"]), [wrap(head)]);

  const single = clone(endOnly);
  single.metadata.run.seq = 0;
  single.metadata.run.prev_event_id = null;
  single.metadata.capture = { not_captured: ["agent.tool_call.started"] };
  add("end-only", "declared-on-the-end-itself", "A one-record invocation: the end is the first record and carries the declaration.", wrap(single), verified(["start_not_captured"]), []);

  add("end-only", "declared-under-another-key", "The declaration is on a run_opened another key signed.", wrap(endOnly), verified(["start_undeclared"]), [wrap(opened, { key: KEY_B })]);
  const undeclared = recordOf("agent.run_opened");
  add("end-only", "undeclared", "The run_opened declares nothing: an end with no start is a finding.", wrap(endOnly), verified(["start_undeclared", "seq_gap"]), [wrap(undeclared)]);
  const otherType = recordOf("agent.run_opened");
  otherType.metadata.capture = { not_captured: ["agent.model_call.started"] };
  add("end-only", "declared-for-another-type", "The declaration names model call starts, not tool call starts.", wrap(endOnly), verified(["start_undeclared", "seq_gap"]), [wrap(otherType)]);
  const otherRun = clone(opened);
  otherRun.metadata.run.root_run_id = eid("run/another-invocation");
  otherRun.metadata.run.run_id = eid("run/another-invocation");
  add("end-only", "declared-in-another-invocation", "The declaration is on another invocation's run_opened.", wrap(endOnly), verified(["start_undeclared"]), [wrap(otherRun)]);
}

// The other rules: the capture list, scrubbing, and the fields Sanning receives in private mode.
{
  const late = recordOf("agent.step.started");
  late.metadata.capture = { not_captured: ["agent.retrieval.started"] };
  add("rules", "capture-not-at-head", "A cannot-capture list on a record that is not the invocation's first.", wrap(late), failed("capture_not_at_head", "/metadata/capture"));
  const notHead = recordOf("agent.run_opened");
  notHead.metadata.run.seq = 3;
  add("rules", "run-opened-not-at-head", "agent.run_opened is the invocation's first record, at seq 0.", wrap(notHead), failed("bad_value", "/metadata/run/seq"));

  const scrubbed = recordOf("agent.tool_call.started");
  scrubbed.context.content_scrubbed = true;
  add("rules", "content-scrubbed", "The adapter replaced credential-shaped values before hashing, and says so: a reader shows it.", wrap(scrubbed), verified(["content_scrubbed"]));
  const scrubbedFile = recordOf("agent.file");
  scrubbedFile.context.content_scrubbed = true;
  add("rules", "content-scrubbed-on-a-file", "A file's content is its bytes, never rewritten.", wrap(scrubbedFile), failed("unknown_field", "/context/content_scrubbed"));

  const unchained = recordOf("agent.tool_call.started");
  unchained.previous_hash = sha256Hex("previous record");
  add("rules", "chain-key-without-chain", "A previous_hash with no context.chain_key: a link of a chain that names no chain, which no SDK builds.", wrap(unchained), failed("bad_value", ""));
  const dataRef = recordOf("agent.tool_call.started");
  dataRef.event.ref = "data:,Example%20Person%20Sample";
  add("rules", "event-ref-data-uri", "A data: URI carries content, not a locator.", wrap(dataRef), failed("bad_value", "/event/ref"));
  const protocol = recordOf("agent.handoff.sent");
  protocol.context.protocol = "a2a/1.0.0\nhidden";
  add("rules", "protocol-control-character", "A protocol marker with a newline.", wrap(protocol), failed("bad_value", "/context/protocol"));
  const upper = recordOf("agent.handoff.sent");
  upper.event.message_bytes_hash = "AB".repeat(32);
  add("rules", "message-bytes-hash-upper-case", "message_bytes_hash in upper case, as message_hash may be.", wrap(upper), verified());
  const notHash = recordOf("agent.handoff.sent");
  notHash.event.message_bytes_hash = "not-a-hash";
  add("rules", "message-bytes-hash-not-a-hash", "message_bytes_hash that is not a SHA-256: the schema checks its form, and nothing grades its value.", wrap(notHash), failed("bad_value", "/event/message_bytes_hash"));

  const free = "Example Person sample text 0000";
  const chain = recordOf("agent.tool_call.started", { mode: "private" });
  chain.context.chain_key = "Claim 88231 denied";
  add("rules", "chain-key-not-opaque", "A chain key is an id, sent in private mode: free text is refused.", wrap(chain), failed("bad_value", "/context/chain_key"));
  const callId = recordOf("agent.tool_call.started", { mode: "private" });
  callId.metadata.gen_ai.tool.call.id = free;
  add("rules", "tool-call-id-free-text", "A tool call id is sent in private mode: free text is refused.", wrap(callId), failed("bad_value", "/metadata/gen_ai/tool/call/id"));
  const responseId = recordOf("agent.model_call.ended", { mode: "private" });
  responseId.metadata.gen_ai.response = { id: "her member number is TEST 0000" };
  add("rules", "response-id-free-text", "A response id is sent in private mode: free text is refused.", wrap(responseId), failed("bad_value", "/metadata/gen_ai/response/id"));
  const scopeName = recordOf("agent.tool_call.started", { mode: "private" });
  scopeName.metadata.otel.scope.name = "Example Person owes 0 EUR";
  add("rules", "scope-name-free-text", "otel.scope.name is a package name: free text is refused.", wrap(scopeName), failed("bad_value", "/metadata/otel/scope/name"));
  const scopeVersion = recordOf("agent.tool_call.started", { mode: "private" });
  scopeVersion.metadata.otel.scope.version = "salary 96000 EUR";
  add("rules", "scope-version-not-semver", "otel.scope.version is a semantic version: free text is refused.", wrap(scopeVersion), failed("bad_value", "/metadata/otel/scope/version"));
  const scopes = recordOf("agent.run_opened");
  scopes.metadata.authority = { scope: Array.from({ length: 33 }, (_, i) => `scope:${i}`) };
  add("rules", "authority-scope-too-many", "authority.scope holds at most 32 labels.", wrap(scopes), failed("bad_value", "/metadata/authority/scope"));
}

// A run that closed completed while an operation it lists is open.
{
  const request = wrap(recordOf("agent.approval.requested"));
  const closed = (ids, status = "completed") => {
    const r = recordOf("agent.run_closed");
    r.metadata.closing.record_ids = ids;
    r.metadata.closing.record_count = ids.length;
    r.metadata.closing.outcome.observed.status = status;
    return wrap(r);
  };
  add("run-closed", "completed-with-an-open-request", "The run closed completed, and an approval request it lists has no answer it lists.", closed([request.event_id]), verified(["completed_with_open_operation"]), [request]);
  add("run-closed", "interrupted-with-an-open-request", "The same run closed interrupted: no finding.", closed([request.event_id], "interrupted"), verified(), [request]);
  const start = wrap(recordOf("agent.tool_call.started"));
  const end = wrap(recordOf("agent.tool_call.ended"));
  add("run-closed", "completed-with-every-start-ended", "The run closed completed, and every start it lists has an end it lists.", closed([start.event_id, end.event_id]), verified(), [start, end]);
  add("run-closed", "completed-with-an-end-not-listed", "The run closed completed and lists a start whose end it does not list.", closed([start.event_id]), verified(["completed_with_open_operation"]), [start, end]);
  // One listed_record_absent for each listed id with no held record, in list order (step 7c).
  const absent = (...indexes) => {
    const reasons = indexes.map((i) => ({ reason: "listed_record_absent", at: `/metadata/closing/record_ids/${i}` }));
    return { valid: true, verdict: "incomplete", reason: reasons[0].reason, at: reasons[0].at, reasons, findings: [] };
  };
  const badEnd = clone(end.record);
  badEnd.metadata.zz_unknown = true;
  add("run-closed", "completed-with-a-failing-end", "The run closed completed, and the record held under its listed end's event_id does not itself verify: the reader does not hold that end, so the closing record is not judged.", closed([start.event_id, end.event_id]), absent(1), [start, as(badEnd)]);
  add("run-closed", "completed-with-a-listed-end-not-held", "The run closed completed over a start and its end, and the reader holds only the start: the closing record is not judged, and no open operation is claimed.", closed([start.event_id, end.event_id]), absent(1), [start]);
  add("run-closed", "interrupted-with-a-listed-record-not-held", "A closing record of any status is judged only on every record it lists.", closed([start.event_id, end.event_id], "interrupted"), absent(1), [start]);
  add("run-closed", "listed-record-held-under-another-key", "The listed end is held only under another key: it is not this run's record.", closed([start.event_id, end.event_id]), absent(1), [start, as(end.record, { key: KEY_B })]);
  add("run-closed", "no-listed-record-held", "Neither listed record is held: step 7 reports both, in list order, and the first is the reading's reason.", closed([start.event_id, end.event_id]), absent(0, 1), []);
  const request2 = as(request.record, { eventId: eid("event/second-request") });
  add("run-closed", "first-and-last-listed-records-not-held", "Three records listed and only the middle one held: both absent records are reported, in list order.", closed([start.event_id, request2.event_id, end.event_id], "interrupted"), absent(0, 2), [request2]);
  // A closing record does not list itself, and a held copy of it is set aside: its own id is never held.
  const listsItself = closed([start.event_id, end.event_id, EV["agent.run_closed"]]);
  add("run-closed", "lists-itself", "The closing record lists its own event_id beside a start and its end, and the verifier holds the start and the end: its own id is not held, so the closing record is not judged.", listsItself, absent(2), [start, end]);
  add("run-closed", "lists-itself-held-beside-itself", "The same closing record, with a copy of itself in the held records: the record itself is not one of its held records, so the copy is set aside and the reading is the same.", listsItself, absent(2), [start, end, as(listsItself.record)]);
  const fullHead = wrap(recordOf("agent.run_opened", { mode: "full" }));
  add("run-closed", "incomplete-keeps-reading-step-7", "The closing record lists records the verifier does not hold, beside a first record in another mode: the closing record reads incomplete, and step 7 still runs every sub-step, so the mode finding of step 7f is made.", closed([start.event_id, end.event_id]), { ...absent(0, 1), findings: ["data_mode_mixed"] }, [fullHead]);
  // Eleven records listed, the ones at 2 and 10 not held: reasons in list order, so /2 before /10.
  const listed = Array.from({ length: 11 }, (_, i) => as(request.record, { eventId: eid(`event/listed-${i}`) }));
  add("run-closed", "two-absent-records-in-list-order", "Eleven records listed, and the ones at index 2 and index 10 not held: step 7 reports /2 before /10, in list order and not in string order.", closed(listed.map((h) => h.event_id), "interrupted"), absent(2, 10), listed.filter((_, i) => i !== 2 && i !== 10));
  const occurredListed = wrap(recordOf(OCCURRED));
  add("run-closed", "completed-with-a-listed-step-occurred", "The run closed completed and lists an agent.step.occurred: it is one record and no operation, so nothing is open and there is no finding.", closed([occurredListed.event_id]), verified(), [occurredListed]);
  const statedOnly = closed([request.event_id], "interrupted");
  statedOnly.record.metadata.closing.outcome.stated = { status: "completed" };
  add("run-closed", "stated-completed-over-an-open-request", "The adapter saw the run end interrupted and the caller said completed: the check reads the adapter's status only.", statedOnly, verified(), [request]);
  const foreignStart = as(recordOf("agent.tool_call.started"), { key: KEY_B });
  add("run-closed", "completed-with-a-start-under-another-key", "Every listed record is held under the run's key, the start ended; another key's record under the start's event_id has no end: it is not this run's.", closed([start.event_id, end.event_id]), verified(), [start, end, foreignStart]);
}

// One invocation, one data mode.
{
  const head = recordOf("agent.run_opened", { mode: "private" });
  const decision = recordOf("agent.decision", { mode: "full" });
  add("data-mode", "mixed-in-one-invocation", "A decision in full mode read beside its invocation's run_opened in private mode: one invocation, two modes.", wrap(decision), verified(["data_mode_mixed", "seq_gap"]), [wrap(head)]);
  add("data-mode", "two-modes-under-two-keys", "The same two records, the run_opened signed by another key: an invocation is one key's, so there is no finding.", wrap(decision), verified(), [wrap(head, { key: KEY_B })]);
  const otherChain = clone(head);
  otherChain.context.chain_key = "chain-other";
  add("data-mode", "mixed-on-two-chains", "Two modes in one invocation under one key, on two chains: still one invocation.", wrap(decision), verified(["data_mode_mixed", "seq_gap"]), [wrap(otherChain)]);
}

// The two records of one hand-off message are compared only when each is signed by the key the
// other names, and their message hashes compare case-insensitively.
{
  const sent = wrap(recordOf("agent.handoff.sent"));
  const elsewhere = recordOf("agent.handoff.received");
  elsewhere.event.counterparty_public_key = testKey("agent-c");
  elsewhere.metadata.handoff = { parts: 0, file_parts: 0 };
  const elsewhereHeld = wrap(elsewhere, { key: KEY_B });
  add("handoff", "pair-receiver-names-another-sender", "The sender's record, beside a received record signed by the key the sender names that names a third key as its sender: not candidates for each other, so their counts are not compared.", sent, verified(), [elsewhereHeld]);
  add("handoff", "pair-receiver-names-another-sender-read-from-receiver", "The same two records read from the receiver: the same reading on both sides.", elsewhereHeld, verified(), [sent]);
  const upper = recordOf("agent.handoff.received");
  upper.event.counterparty_public_key = KEY_A;
  upper.event.message_hash = upper.event.message_hash.toUpperCase();
  upper.metadata.handoff = { parts: 0, file_parts: 0 };
  const secondSent = recordOf("agent.handoff.sent");
  secondSent.event.counterparty_public_key = KEY_A;
  secondSent.metadata.handoff = { parts: 0, file_parts: 0 };
  add("handoff", "pair-two-sent-records-not-compared", "Two agent.handoff.sent records of one message under two keys that name each other, with different counts: a pair is one sent and one received record, so they are not compared.", sent, verified(), [wrap(secondSent, { key: KEY_B })]);
  add("handoff", "pair-hash-in-upper-case", "The received record writes the message hash in upper case: one message, compared case-insensitively, and its counts differ.", wrap(upper, { key: KEY_B }), verified(["handoff_parts_mismatch"]), [sent]);
}

// The approval exception: both the run id and the root run id differ.
{
  const requested = recordOf("agent.approval.requested");
  requested.metadata.gen_ai = { conversation: { id: "thread-0001" } };
  const sameRoot = recordOf("agent.approval.resolved");
  sameRoot.metadata.run.run_id = eid("run/approval-resume");
  sameRoot.metadata.gen_ai = { conversation: { id: "thread-0001" } };
  add("pairing", "approval-two-run-ids-one-invocation", "An approval answered under another run id in the same invocation: the exception needs both ids to differ.", wrap(sameRoot), pairFailed("pair_run_mismatch"), [wrap(requested)]);
  const sameRun = recordOf("agent.approval.resolved");
  sameRun.metadata.run.root_run_id = eid("run/root-resume");
  sameRun.metadata.run.parent_run_id = eid("run/root-resume");
  sameRun.metadata.run.seq = 1;
  sameRun.metadata.run.prev_event_id = eid("event/resume/agent.run_opened");
  sameRun.metadata.gen_ai = { conversation: { id: "thread-0001" } };
  add("pairing", "approval-one-run-id-two-invocations", "An approval answered in another invocation under the request's run id: the exception needs both ids to differ.", wrap(sameRun), pairFailed("pair_run_mismatch"), [wrap(requested)]);
}

// $ is the end of the string, and digits are ASCII digits.
{
  const v = (value) => {
    const x = recordOf("agent.tool_call.started");
    x.extras = { event_schema: value };
    return x;
  };
  add("event-schema", "trailing-newline", "sanning.agent/1 followed by a newline: $ is the end of the string, with no exception for a final newline.", wrap(v("sanning.agent/1\n")), failed("event_schema_invalid", "/extras/event_schema"));
  add("event-schema", "non-ascii-digit", "sanning.agent/ with ARABIC-INDIC DIGIT ONE: a digit is an ASCII digit.", wrap(v("sanning.agent/\u0661")), failed("event_schema_invalid", "/extras/event_schema"));
  const runId = recordOf("agent.tool_call.started", { mode: "private" });
  runId.metadata.run.run_id = `${runId.metadata.run.run_id}\n`;
  add("rules", "id-trailing-newline", "A run id followed by a newline, which a search for ^...$ in Python would accept: refused.", wrap(runId), failed("bad_value", "/metadata/run/run_id"));
  const seq = recordOf("agent.tool_call.started");
  seq.metadata.otel.scope.version = "\u0661.0.0";
  add("rules", "version-non-ascii-digit", "A package version whose major is ARABIC-INDIC DIGIT ONE: refused.", wrap(seq), failed("bad_value", "/metadata/otel/scope/version"));
}

// The invocation's first record: run.seq 0 and run.prev_event_id null, both.
{
  const seqZero = recordOf("agent.decision");
  seqZero.metadata.run.seq = 0;
  seqZero.metadata.capture = { not_captured: ["agent.tool_call.started"] };
  add("rules", "head-seq-zero-prev-set", "run.seq 0 with a previous record named: not the first record, and not any other.", wrap(seqZero), failed("bad_value", "/metadata/run"));
  const prevNull = recordOf("agent.decision");
  prevNull.metadata.run.prev_event_id = null;
  add("rules", "head-prev-null-seq-set", "No previous record, at run.seq 14: not the first record, and not any other.", wrap(prevNull), failed("bad_value", "/metadata/run"));
}

// One record at each position; the declaration counts only from a unique first record.
{
  const endOnly = recordOf("agent.tool_call.ended");
  endOnly.metadata.run.started_event_id = null;
  const quiet = recordOf("agent.run_opened");
  const late = recordOf("agent.decision");
  late.metadata.run.seq = 0;
  late.metadata.run.prev_event_id = null;
  late.metadata.capture = { not_captured: ["agent.tool_call.started"] };
  const lateHeld = wrap(late, { eventId: eid("event/late-head") });
  add("end-only", "declared-on-a-second-head", "The invocation's run_opened declares nothing, and a later record under the same key also sits at run.seq 0 and declares: two first records are none, so the declaration does not count.", wrap(endOnly), verified(["start_undeclared", "seq_gap"]), [wrap(quiet), lateHeld]);
  const opened = recordOf("agent.run_opened");
  opened.metadata.capture = { not_captured: ["agent.tool_call.started"] };
  add("end-only", "declared-on-a-head-held-twice", "The declaring run_opened held twice, byte for byte: one record, so one first record.", wrap(endOnly), verified(["start_not_captured", "seq_gap"]), [wrap(opened), wrap(clone(opened))]);
  add("seq", "two-records-at-seq-zero", "A record at run.seq 0 beside the invocation's run_opened, also at run.seq 0, under the same key.", lateHeld, verified(["seq_duplicate"]), [wrap(quiet)]);
  add("seq", "two-records-at-one-position", "Two different records at run.seq 6 of one invocation under one key.", wrap(recordOf("agent.tool_call.started")), verified(["unended", "seq_duplicate"]), [wrap(recordOf("agent.tool_call.started", { all: true }), { eventId: eid("event/second-at-6") })]);
  const fullDecision = recordOf("agent.decision", { mode: "full" });
  const twin = wrap(recordOf("agent.decision"), { eventId: eid("event/second-at-14") });
  add("seq", "mixed-mode-and-duplicate-in-step-order", "A decision in full mode, beside a first record in private mode and a second decision at the same position: the findings in step order, 7f, then 7g, then 7i.", wrap(fullDecision), verified(["data_mode_mixed", "seq_duplicate", "seq_gap"]), [wrap(quiet), twin]);
  const startRecord = recordOf("agent.tool_call.started");
  const sameIdOtherBytes = clone(startRecord);
  sameIdOtherBytes.context.salt = sha256Hex("salt/twin").slice(0, 32);
  add("seq", "same-event-id-other-bytes", "A held record under the same event_id, key and position with other bytes: it is another record, so the position holds two.", wrap(startRecord), verified(["unended", "seq_duplicate"]), [wrap(sameIdOtherBytes)]);
  add("seq", "same-record-held-beside-itself", "The record under test is also in the held records: one record, no duplicate. No closing record is held.", wrap(quiet), verified(["closing_not_held"]), [wrap(quiet)]);
  add("seq", "one-position-two-keys", "Two records at run.seq 0 of one root run id under two keys: not one invocation.", lateHeld, verified(), [wrap(quiet, { key: KEY_B })]);
  const otherRoot = clone(quiet);
  otherRoot.metadata.run.root_run_id = eid("run/another-invocation");
  otherRoot.metadata.run.run_id = eid("run/another-invocation");
  add("seq", "one-position-two-invocations", "Two records at run.seq 0 under one key in two invocations.", lateHeld, verified(), [wrap(otherRoot)]);
}

// Step 5 in its order across rules: each pair of rules a record can break together.
{
  const h = jcsHash("lookup_rate");
  const capturedHidden = recordOf("agent.tool_call.started");
  setPath(capturedHidden.metadata, "gen_ai.tool.name", "lookup_rate");
  capturedHidden.context.hidden = { "gen_ai.tool.name": h };
  capturedHidden.metadata.capture = { not_captured: ["agent.retrieval.started"] };
  add("precedence", "hidden-before-capture", "A hidden field present and a cannot-capture list off the first record: the hidden rule is read first.", wrap(capturedHidden), failed("hidden_field_present", "/metadata/gen_ai/tool/name"));
  const capturedUnlisted = recordOf("agent.tool_call.started");
  setPath(capturedUnlisted.metadata, "gen_ai.tool.call.arguments", { currency: "EUR" });
  capturedUnlisted.metadata.capture = { not_captured: ["agent.retrieval.started"] };
  add("precedence", "unlisted-before-capture", "A revealed field not listed and a cannot-capture list off the first record: revealed_field_unlisted is read first.", wrap(capturedUnlisted), failed("revealed_field_unlisted", "/metadata/gen_ai/tool/call/arguments"));
  const capturedParts = recordOf("agent.handoff.sent");
  capturedParts.metadata.capture = { not_captured: ["agent.retrieval.started"] };
  capturedParts.metadata.handoff = { parts: 1, file_parts: 2 };
  add("precedence", "capture-before-file-parts", "A cannot-capture list off the first record and more file parts than parts: capture_not_at_head is read first.", wrap(capturedParts), failed("capture_not_at_head", "/metadata/capture"));
  const filePartsAndMissing = recordOf("agent.handoff.received");
  filePartsAndMissing.metadata.handoff = { parts: 1, file_parts: 2, unchecked_held_parts: [0] };
  add("precedence", "file-parts-before-unchecked", "More file parts than parts, and a list of unchecked held parts with no count: file_parts_exceed_parts is read first.", wrap(filePartsAndMissing), failed("file_parts_exceed_parts", "/metadata/handoff/file_parts"));
  const mismatchAndExceed = recordOf("agent.handoff.received");
  mismatchAndExceed.metadata.handoff = { parts: 3, file_parts: 1, unchecked_held_parts: [0] };
  mismatchAndExceed.context.unchecked_held_part_count = 2;
  add("precedence", "mismatch-before-exceed", "A count that is not the list's length and more than the file parts: unchecked_held_parts_mismatch is read first.", wrap(mismatchAndExceed), failed("unchecked_held_parts_mismatch", "/context/unchecked_held_part_count"));
  const mismatchAndRange = recordOf("agent.handoff.received");
  mismatchAndRange.metadata.handoff = { parts: 2, file_parts: 2, unchecked_held_parts: [5] };
  mismatchAndRange.context.unchecked_held_part_count = 2;
  add("precedence", "mismatch-before-index", "A count that is not the list's length and an index past the parts: unchecked_held_parts_mismatch is read first.", wrap(mismatchAndRange), failed("unchecked_held_parts_mismatch", "/context/unchecked_held_part_count"));
  const exceedAndRange = recordOf("agent.handoff.received");
  exceedAndRange.metadata.handoff = { parts: 2, file_parts: 1, unchecked_held_parts: [0, 5] };
  exceedAndRange.context.unchecked_held_part_count = 2;
  add("precedence", "exceed-before-index", "More unchecked held parts than file parts, and an index past the parts: unchecked_held_parts_exceed_file_parts is read first.", wrap(exceedAndRange), failed("unchecked_held_parts_exceed_file_parts", "/context/unchecked_held_part_count"));
  const capturedClosing = recordOf("agent.run_closed");
  capturedClosing.metadata.capture = { not_captured: ["agent.retrieval.started"] };
  capturedClosing.metadata.closing.record_count = 3;
  add("precedence", "capture-before-closing-count", "A cannot-capture list off the first record and a record count that is not the list's length: capture_not_at_head is read first.", wrap(capturedClosing), failed("capture_not_at_head", "/metadata/capture"));
  const capturedFile = recordOf("agent.file");
  capturedFile.metadata.capture = { not_captured: ["agent.retrieval.started"] };
  capturedFile.metadata.outcome.status = "failed";
  add("precedence", "capture-before-artifact-reason", "A cannot-capture list off the first record and a failed file with no reason: capture_not_at_head is read first.", wrap(capturedFile), failed("capture_not_at_head", "/metadata/capture"));
  const hiddenFile = recordOf("agent.file");
  hiddenFile.metadata.outcome.status = "failed";
  setPath(hiddenFile.metadata, "artifact.path", "/work/out/quote.pdf");
  hiddenFile.context.hidden = { "artifact.path": jcsHash("/work/out/quote.pdf") };
  add("precedence", "hidden-before-artifact-reason", "A failed file with no reason and a hidden path present: the hidden rule is read first.", wrap(hiddenFile), failed("hidden_field_present", "/metadata/artifact/path"));
}

// Fixed formats: a timestamp, a hand-off content type, a package name, a closing reason.
{
  const observed = recordOf("agent.tool_call.ended", { mode: "private" });
  observed.metadata.run.observed_started_at = "9999-99-99T99:99:99.123Z";
  add("rules", "observed-start-not-a-date", "An observed start time with month 99: an RFC 3339 time has month 01 to 12.", wrap(observed), failed("bad_value", "/metadata/run/observed_started_at"));
  const contentType = recordOf("agent.handoff.sent");
  contentType.event.content_type = "application/json\u0000x";
  add("rules", "content-type-control-character", "A hand-off content type with a NUL: no control characters.", wrap(contentType), failed("bad_value", "/event/content_type"));
  const tilde = recordOf("agent.tool_call.started", { mode: "private" });
  tilde.metadata.otel.scope.name = "@sanning/anchor~langchain";
  add("rules", "scope-name-tilde", "A package name with ~, which no registry admits in a new name.", wrap(tilde), failed("bad_value", "/metadata/otel/scope/name"));
  const reason = recordOf("agent.run_closed", { mode: "private" });
  reason.metadata.closing.outcome.observed = { status: "failed", reason: "sample text declined" };
  add("rules", "closing-reason-free-text", "A closing reason is a code from a closed list: free text is refused.", wrap(reason), failed("bad_value", "/metadata/closing/outcome/observed/reason"));
}

// What Sanning receives for a file record: no locator and no length below full.
for (const mode of ["standard", "full"]) {
  const r = recordOf("agent.file", { all: true, mode });
  add("data-mode", `${mode}-file`, `A file record in ${mode} mode: the path, the source, the destination and the size reach Sanning only in full.`, wrap(r), verified(stepSixFindings(r)), undefined, sentOf(r));
}

// The record salt (agent-events.md section 4.3): exactly 32 lowercase hex characters.
{
  const upper = recordOf("agent.tool_call.started");
  upper.context.salt = upper.context.salt.toUpperCase();
  add("rules", "salt-upper-case", "A salt in upper-case hex: the salt is 32 lowercase hex characters.", wrap(upper), failed("bad_value", "/context/salt"));
  const short = recordOf("agent.tool_call.started");
  short.context.salt = short.context.salt.slice(0, 31);
  add("rules", "salt-too-short", "A salt of 31 hex characters: 128 bits are 32.", wrap(short), failed("bad_value", "/context/salt"));
  const long = recordOf("agent.tool_call.started");
  long.context.salt = sha256Hex("salt/too-long");
  add("rules", "salt-too-long", "A salt of 64 hex characters: the salt is exactly 32, never more.", wrap(long), failed("bad_value", "/context/salt"));
  const caseId = recordOf("agent.tool_call.started");
  caseId.context.case_id = "claim for Example Person";
  add("rules", "case-id-not-opaque", "A case id that fails the id grammar is refused, never left out or rewritten.", wrap(caseId), failed("bad_value", "/context/case_id"));
}

// skipped and responded (agent-events.md sections 4.7 and 5.6).
{
  for (const type of CLOSERS.filter((t) => t.endsWith(".ended"))) {
    const r = recordOf(type);
    r.metadata.outcome.status = "skipped";
    add("rules", `${type}-skipped`, `${type} with outcome.status skipped: the operation never ran because a policy, a hook or an approval stopped it.`, wrap(r), verified());
  }
  const closed = recordOf("agent.run_closed");
  closed.metadata.closing.outcome.observed = { status: "skipped" };
  add("rules", "run-closed-skipped", "skipped ends an operation, never a run: it is not a closing status.", wrap(closed), failed("bad_value", "/metadata/closing/outcome/observed/status"));
  const notRun = recordOf("agent.tool_call.ended");
  notRun.metadata.outcome.status = "not_run";
  add("rules", "tool-call-ended-not-run", "not_run is not a status: the word is skipped.", wrap(notRun), failed("bad_value", "/metadata/outcome/status"));
  const responded = recordOf("agent.approval.resolved");
  responded.metadata.approval.verdict = "responded";
  add("rules", "approval-responded", "An approval answered with the person's text in place of the tool's result: the verdict responded.", wrap(responded), verified());
  for (const status of ["skipped", "interrupted"]) {
    const file = recordOf("agent.file");
    file.metadata.outcome.status = status;
    add("rules", `file-${status}`, `A file record is completed or failed, never ${status}: the shared outcome words do not apply to it.`, wrap(file), failed("bad_value", "/metadata/outcome/status"));
  }
  const respond = recordOf("agent.approval.resolved");
  respond.metadata.approval.verdict = "respond";
  add("rules", "approval-verdict-respond", "respond, the framework's word, is not a verdict: verdicts are past tense.", wrap(respond), failed("bad_value", "/metadata/approval/verdict"));
}

// A tool call that ran after its approval refused it (step 7h).
{
  const start = wrap(recordOf("agent.tool_call.started"));
  const ended = (status) => {
    const r = recordOf("agent.tool_call.ended");
    r.metadata.outcome.status = status;
    return wrap(r);
  };
  const answer = (verdict, { key = KEY_A, subject = EV["agent.tool_call.started"], change = () => {} } = {}) => {
    const r = recordOf("agent.approval.resolved");
    r.metadata.approval.verdict = verdict;
    r.metadata.approval.subject_event_id = subject;
    change(r);
    return wrap(r, { key });
  };
  add("refusal", "completed-after-rejected", "The approval of this tool call resolved rejected, and the call ended completed: it ran after its approval refused it.", ended("completed"), verified(["ran_after_refusal"]), [start, answer("rejected")]);
  const anotherCall = clone(start.record);
  anotherCall.metadata.run.run_id = eid("run/another-tool-call");
  add("pairing", "failed-pair-keeps-reading-step-7", "The end's only candidate start is another tool call's, and an answer under this key refused the start the end names: the end reads failed at step 7a, and step 7 still runs every sub-step, so the finding of step 7h is made.", ended("completed"), pairFailed("pair_run_mismatch", PAIR_AT, ["ran_after_refusal"]), [as(anotherCall), answer("rejected")]);
  add("refusal", "failed-after-responded", "The approval resolved responded, and the call ended failed: anything but skipped is a run.", ended("failed"), verified(["ran_after_refusal"]), [start, answer("responded")]);
  add("refusal", "interrupted-after-rejected", "The approval resolved rejected, and the call ended interrupted: an interrupt ends the call before any answer, so no finding.", ended("interrupted"), verified(), [start, answer("rejected")]);
  add("refusal", "skipped-after-rejected", "The approval resolved rejected, and the call ended skipped: no finding.", ended("skipped"), verified(), [start, answer("rejected")]);
  add("refusal", "skipped-after-responded", "The approval resolved responded, and the call ended skipped: no finding.", ended("skipped"), verified(), [start, answer("responded")]);
  add("refusal", "completed-after-approved", "The approval resolved approved, and the call ended completed: no finding.", ended("completed"), verified(), [start, answer("approved")]);
  add("refusal", "completed-after-edited", "The approval resolved edited, and the call ran with the edited action: no finding.", ended("completed"), verified(), [start, answer("edited")]);
  add("refusal", "refusal-under-another-key", "A rejection signed by another key names this call: it is not this agent's approval, and no finding is made.", ended("completed"), verified(), [start, answer("rejected", { key: KEY_B })]);
  add("refusal", "refusal-of-another-call", "A rejection of another action, beside this call's end: no finding.", ended("completed"), verified(), [start, answer("rejected", { subject: eid("event/another-action") })]);
  add("refusal", "refusal-that-fails", "The only rejection does not itself verify: it refuses nothing.", ended("completed"), verified(), [start, answer("rejected", { change: (r) => { r.metadata.zz_unknown = true; } })]);
  add("refusal", "refusal-read-from-the-start", "The rejection and a completed end, read from the call's start: the finding is on the end, not the start.", start, verified(), [ended("completed"), answer("rejected")]);

  // A LangGraph resume: the call ended interrupted in its own invocation, and the answer arrived in
  // the next invocation of the same conversation. No end is written after the resume.
  const request = recordOf("agent.approval.requested");
  request.metadata.gen_ai = { conversation: { id: "thread-0001" } };
  const later = (verdict) =>
    answer(verdict, {
      change: (r) => {
        r.metadata.run.run_id = eid("run/approval-resume");
        r.metadata.run.parent_run_id = eid("run/root-resume");
        r.metadata.run.root_run_id = eid("run/root-resume");
        r.metadata.run.seq = 1;
        r.metadata.run.prev_event_id = eid("event/resume/agent.run_opened");
        r.metadata.gen_ai = { conversation: { id: "thread-0001" } };
      },
    });
  add("refusal", "rejected-in-a-later-run", "The call ended interrupted at the interrupt, and the rejection arrived in the resumed invocation: no end is written after the resume, and no finding.", ended("interrupted"), verified(), [start, wrap(request), later("rejected")]);
  add("refusal", "rejected-in-a-later-run-read-from-the-answer", "The same rejection, read from the answer: it pairs with its request across the two invocations.", later("rejected"), verified(), [start, ended("interrupted"), wrap(request)]);
  add("refusal", "completed-after-a-rejection-in-another-invocation", "The call ended completed, and a rejection of its start under the same key was written in another invocation: a refusal from any invocation counts.", ended("completed"), verified(["ran_after_refusal"]), [start, later("rejected")]);
  const escalated = answer("approved", {
    change: (r) => {
      r.metadata.run.seq = 12;
      r.metadata.run.prev_event_id = EV["agent.approval.resolved"];
    },
  });
  add("refusal", "completed-after-rejected-then-approved", "A policy rejected the call, a later answer approved it, and it ended completed: any refusal of the start counts, so an escalation still shows the finding.", ended("completed"), verified(["ran_after_refusal"]), [start, answer("rejected", { change: (r) => (r.metadata.approval.actor = "policy") }), wrap(escalated.record, { eventId: eid("event/approval-escalated") })]);
  add("refusal", "refusal-that-names-no-request", "The rejection names no request (run.started_event_id null, as after a resume with no store): it is still the agent's signed refusal, and counts.", ended("completed"), verified(["ran_after_refusal"]), [start, answer("rejected", { change: (r) => (r.metadata.run.started_event_id = null) })]);
  const opened = recordOf("agent.run_opened");
  add("refusal", "refused-with-a-gap-in-step-order", "A completed call after a rejection, its start not held, a gap before it: the findings in step order, 7a, then 7h, then 7i.", ended("completed"), verified(["start_absent", "ran_after_refusal", "seq_gap"]), [wrap(opened), answer("rejected")]);

  const listed = recordOf("agent.run_closed");
  const skippedEnd = ended("skipped");
  listed.metadata.closing.record_ids = [start.event_id, skippedEnd.event_id];
  add("run-closed", "completed-with-a-skipped-tool-call", "The run closed completed over a tool call its approval refused, which ended skipped: the call is ended, and no operation is open.", wrap(listed), verified(), [start, skippedEnd]);
}

// The run may be incomplete (steps 7i and 7j): findings, never a verdict.
{
  const at = (type, seq, change = () => {}) => {
    const r = recordOf(type);
    r.metadata.run.seq = seq;
    r.metadata.run.prev_event_id = EV[AGENT_TYPES[seq - 1]];
    change(r);
    return r;
  };
  const decision = wrap(recordOf("agent.decision"));
  const opened = recordOf("agent.run_opened");
  add("incomplete", "seq-gap-before-this-record", "A decision at run.seq 14 read beside its invocation's run_opened at 0: the positions between are not held, so the run may be incomplete.", decision, verified(["seq_gap"]), [wrap(opened)]);
  // Under the event_id the decision at run.seq 14 names as its previous record.
  const previous = wrap(at("agent.file", 13), { eventId: EV[AGENT_TYPES[13]] });
  add("incomplete", "seq-no-gap-before-this-record", "The record at run.seq 13 is held: nothing is missing directly before this one, whatever is missing further back.", decision, verified(), [wrap(opened), previous]);
  add("incomplete", "seq-nothing-earlier-held", "Only a later record is held: a slice, not a gap.", decision, verified(), [wrap(recordOf("agent.error"))]);
  add("incomplete", "seq-earlier-record-under-another-key", "The record at run.seq 0 is held under another key: it is not this invocation's.", decision, verified(), [wrap(opened, { key: KEY_B })]);
  const otherRoot = clone(opened);
  otherRoot.metadata.run.root_run_id = eid("run/another-invocation");
  otherRoot.metadata.run.run_id = eid("run/another-invocation");
  add("incomplete", "seq-earlier-record-of-another-invocation", "The record at run.seq 0 is another invocation's.", decision, verified(), [wrap(otherRoot)]);
  const badPrevious = at("agent.file", 13, (r) => (r.metadata.zz_unknown = true));
  add("incomplete", "seq-record-before-fails", "The record at run.seq 13 is held and does not itself verify: it takes no part, so the position before this record has no record that counts.", decision, verified(["seq_gap"]), [wrap(opened), wrap(badPrevious, { eventId: EV[AGENT_TYPES[13]] })]);
  const badHead = clone(opened);
  badHead.metadata.zz_unknown = true;
  add("incomplete", "seq-earlier-record-fails", "The only earlier record does not itself verify: it takes no part, so no gap is seen.", decision, verified(), [wrap(badHead)]);

  const closed = recordOf("agent.run_closed");
  const step = wrap(recordOf("agent.step.started"));
  add("incomplete", "closing-not-held", "The run_opened promises a closing record, and the verifier holds records of the invocation but no closing record: the run may be incomplete.", wrap(opened), verified(["closing_not_held"]), [step]);
  add("incomplete", "closing-held", "The run_opened read beside its invocation's closing record: no finding.", wrap(opened), verified(), [wrap(closed)]);
  add("incomplete", "closing-held-under-another-key", "The only closing record is signed by another key: not this invocation's.", wrap(opened), verified(["closing_not_held"]), [wrap(closed, { key: KEY_B })]);
  const otherClose = clone(closed);
  otherClose.metadata.run.root_run_id = eid("run/another-invocation");
  otherClose.metadata.run.run_id = eid("run/another-invocation");
  otherClose.metadata.run.prev_event_id = eid("event/another-invocation/previous");
  add("incomplete", "closing-of-another-invocation", "The only closing record is another invocation's.", wrap(opened), verified(["closing_not_held"]), [wrap(otherClose)]);
  const badClose = clone(closed);
  badClose.metadata.zz_unknown = true;
  add("incomplete", "closing-fails", "The only closing record does not itself verify: it closes nothing.", wrap(opened), verified(["closing_not_held"]), [wrap(badClose)]);
}

// agent.custom (agent-events.md section 5.11).
{
  const upper = recordOf("agent.custom");
  upper.metadata.custom.name = "CrewAI.SkillUsed";
  add("rules", "custom-name-upper-case", "A custom name in upper case: a-z, 0-9, underscore and dot only.", wrap(upper), failed("bad_value", "/metadata/custom/name"));
  const long = recordOf("agent.custom");
  long.metadata.custom.name = "a".repeat(65);
  add("rules", "custom-name-too-long", "A custom name of 65 characters: at most 64.", wrap(long), failed("bad_value", "/metadata/custom/name"));
  const longest = recordOf("agent.custom");
  longest.metadata.custom.name = "a".repeat(64);
  add("rules", "custom-name-64-characters", "A custom name of 64 characters, the most allowed.", wrap(longest), verified());
  const space = recordOf("agent.custom");
  space.metadata.custom.name = "order flagged";
  add("rules", "custom-name-free-text", "A custom name with a space: free text is refused.", wrap(space), failed("bad_value", "/metadata/custom/name"));
  // The dotted-name grammar: segments joined by a dot, each a letter then letters, digits and underscores.
  const broken = [
    ["custom-name-digit-dot-dot", "1..", "A custom name of a digit and two dots: no segment is empty or starts with a digit."],
    ["custom-name-empty", "", "An empty custom name: a name has at least one segment."],
    ["custom-name-dot-only", ".", "A custom name that is one dot: two empty segments."],
    ["custom-name-empty-segment", "order..flagged", "A custom name with two dots in a row: an empty segment."],
    ["custom-name-leading-dot", ".flagged", "A custom name that starts with a dot: an empty first segment."],
    ["custom-name-trailing-dot", "order.", "A custom name that ends with a dot: an empty last segment."],
    ["custom-name-leading-digit", "2fa.passed", "A custom name whose first segment starts with a digit."],
    ["custom-name-segment-leading-digit", "order.2fa_passed", "A custom name whose second segment starts with a digit: every segment starts with a letter."],
    ["custom-name-leading-underscore", "_order.flagged", "A custom name whose first segment starts with an underscore."],
    ["custom-name-segment-leading-underscore", "order._flagged", "A custom name whose second segment starts with an underscore: every segment starts with a letter."],
    ["custom-name-hyphen", "order.flag-raised", "A custom name with a hyphen: a-z, 0-9, underscore and dot only."],
    ["custom-name-non-ascii-letter", "order.flägged", "A custom name with a non-ASCII letter: a-z is the 26 ASCII letters."],
  ];
  for (const [name, value, readme] of broken) {
    const r = recordOf("agent.custom");
    r.metadata.custom.name = value;
    add("rules", name, readme, wrap(r), failed("bad_value", "/metadata/custom/name"));
  }
  const good = [
    ["custom-name-one-letter", "a", "A custom name of one letter, the shortest allowed."],
    ["custom-name-one-segment", "flagged", "A custom name of one segment: a dot is not required."],
    ["custom-name-many-segments", "a.b.c.d", "A custom name of four one-letter segments."],
    ["custom-name-digits-and-underscores", "openai.gpt4o_call_2__", "A custom name whose segments hold digits and underscores after the first letter, a trailing underscore included."],
    ["custom-name-64-characters-dotted", "a.".repeat(31) + "ab", "A dotted custom name of 64 characters, the most allowed."],
  ];
  for (const [name, value, readme] of good) {
    const r = recordOf("agent.custom");
    r.metadata.custom.name = value;
    add("rules", name, readme, wrap(r), verified());
  }
  const revealed = recordOf("agent.custom");
  setPath(revealed.metadata, "custom.value", { rule: "rate_above_limit" });
  revealed.context.revealed = ["custom.value"];
  add("disclosure", "custom-value-revealed", "A custom value revealed in clear and listed.", wrap(revealed), verified());
  const unlisted = clone(revealed);
  delete unlisted.context.revealed;
  add("disclosure", "custom-value-not-listed", "A custom value in clear with no context.revealed entry.", wrap(unlisted), failed("revealed_field_unlisted", "/metadata/custom/value"));
  const hidden = recordOf("agent.custom");
  hidden.context.hidden = { "custom.name": jcsHash("order.flagged") };
  add("disclosure", "custom-name-not-hidable", "A custom name, like a decision name, cannot be hidden.", wrap(hidden), failed("unknown_field", "/context/hidden"));
}

// The record salt on every type (events.md section 3): required on the agent types, optional on
// the seven outside them, and checked for its form wherever it is present.
{
  for (const type of AGENT_TYPES) {
    const r = recordOf(type);
    delete r.context.salt;
    add("salt", `missing-on-${type}`, `${type} with no context.salt: every agent record carries one.`, wrap(r), failed("missing_field", "/context/salt"));
  }
  /** A record of a type outside this vocabulary, read only at step 1. */
  const outside = (type, salt) => {
    const context = salt === undefined ? {} : { salt };
    return {
      payload_version: 1,
      spec_version: "sanning.events/v2",
      event_type: type,
      subject: { type: "agent", agent_id: "agent-a" },
      previous_hash: "GENESIS",
      event: { content_hash: jcsHash({ note: `a ${type} record` }) },
      context,
      metadata: {},
      extras: {},
    };
  };
  const at = (type) => ({ eventId: eid(`event/outside/${type}`) });
  const good = sha256Hex("salt/outside").slice(0, 32);
  const outsideFinding = { valid: true, verdict: null, findings: ["not_an_agent_record"] };
  add("salt", "present-on-event", "A plain event record with a salt of 32 lowercase hex characters: outside this vocabulary, so no verdict, and the salt is in its form.", wrap(outside("event", good), at("event")), outsideFinding);
  add("salt", "absent-on-event", "A plain event record with no salt: the salt is optional outside the agent types, so it still reads.", wrap(outside("event"), at("event")), outsideFinding);
  // One wrong form per type, so each form is read on some type.
  const wrongForm = [
    ["event", good.toUpperCase(), "in upper-case hex"],
    ["checkpoint", good.slice(0, 31), "of 31 hex characters"],
    ["declaration", sha256Hex("salt/outside"), "of 64 hex characters"],
    ["runner.run_opened", `${good}\n`, "followed by a newline"],
    ["runner.run_closed", 1234, "that is a number"],
    ["runner.egress", null, "written as null, which is present"],
    ["runner.relay", `${good.slice(0, 31)}g`, "with a character that is not hex"],
  ];
  const both = outside("runner.egress", good.toUpperCase());
  both.extras = { event_schema: EVENT_SCHEMA };
  add("precedence", "misplaced-version-before-salt", "A runner.egress record that claims the agent vocabulary and carries a salt in upper case: step 1 reads the misplaced version first.", wrap(both, at("runner.egress")), failed("event_schema_misplaced", "/extras/event_schema"));
  for (const [type, salt, how] of wrongForm) {
    const article = /^[aeiou]/.test(type) ? "An" : "A";
    add("salt", `wrong-form-on-${type}`, `${article} ${type} record with a salt ${how}: a salt present in the wrong form reads failed on any type.`, wrap(outside(type, salt), at(type)), failed("bad_value", "/context/salt"));
  }
  // Where the salt is read. On the agent types the schema reads it, at step 4, so a bad salt gives
  // way to whatever an earlier step or an earlier schema reason finds. Outside this vocabulary,
  // step 1 reads it from the record alone: no extras and no other context member are needed.
  const unknownBesideSalt = recordOf("agent.decision");
  unknownBesideSalt.context.salt = unknownBesideSalt.context.salt.toUpperCase();
  unknownBesideSalt.metadata.foo = "x";
  add("precedence", "bad-salt-after-unknown-field", "An agent.decision with a salt in upper-case hex and an unknown member metadata.foo: the salt is read at step 4 with the rest of the schema, where unknown_field comes before bad_value. It is not read at step 1.", wrap(unknownBesideSalt), failed("unknown_field", "/metadata/foo"));
  const noVersionBadSalt = recordOf("agent.tool_call.started");
  noVersionBadSalt.context.salt = noVersionBadSalt.context.salt.toUpperCase();
  noVersionBadSalt.extras = {};
  add("precedence", "bad-salt-after-missing-version", "An agent.tool_call.started with a salt in upper-case hex and no extras.event_schema: step 2 reads the version before step 4 reads the salt.", wrap(noVersionBadSalt), failed("event_schema_missing", "/extras/event_schema"));
  const noExtras = outside("event", good.toUpperCase());
  delete noExtras.extras;
  add("salt", "wrong-form-on-event-no-extras", "An event record with a salt in upper-case hex and no extras member at all: step 1 reads the salt without extras.", wrap(noExtras, at("event")), failed("bad_value", "/context/salt"));
  const chainBesideSalt = outside("event");
  chainBesideSalt.previous_hash = sha256Hex("previous record");
  chainBesideSalt.context = { chain_key: "chain-quote-agent", salt: good.toUpperCase() };
  add("salt", "wrong-form-on-event-beside-chain-key", "A chained event record whose context carries chain_key before a salt in upper-case hex: step 1 reads the salt wherever it sits among the context members, and the other members are the profile's.", wrap(chainBesideSalt, at("event")), failed("bad_value", "/context/salt"));
}

// agent.step.occurred: one record, not an operation (agent-events.md 5.2).
{
  const occurred = () => recordOf(OCCURRED);
  // The fields of an operation, which a step that occurred never carries: each is a member its
  // schema does not name.
  const forbidden = [
    ["outcome", "the outcome of an operation", (m) => (m.outcome = { status: "completed" }), "/metadata/outcome"],
    ["started-event-id", "a link to a start", (m) => (m.run.started_event_id = EV["agent.step.started"]), "/metadata/run/started_event_id"],
    ["observed-started-at", "a start time a source reported", (m) => (m.run.observed_started_at = "2026-10-27T09:30:00.125Z"), "/metadata/run/observed_started_at"],
    ["client", "the client of a model call", (m) => (m.run.client = "ChatOpenAI"), "/metadata/run/client"],
    ["tool", "the tool and its call id", (m) => (m.gen_ai = { tool: { name: "lookup_rate", call: { id: "call_0001" } } }), "/metadata/gen_ai/tool"],
    ["model", "the model a call requested", (m) => (m.gen_ai = { request: { model: "gpt-4o-mini" } }), "/metadata/gen_ai/request"],
    ["provider", "the provider of a model call", (m) => (m.gen_ai = { provider: { name: "openai" } }), "/metadata/gen_ai/provider"],
    ["response", "a model's response", (m) => (m.gen_ai = { response: { model: "gpt-4o-mini-2024-07-18" } }), "/metadata/gen_ai/response"],
    ["usage", "a model call's token counts", (m) => (m.gen_ai = { usage: { input_tokens: 812 } }), "/metadata/gen_ai/usage"],
    ["operation-name", "an OpenTelemetry operation name", (m) => (m.gen_ai = { operation: { name: "execute_tool" } }), "/metadata/gen_ai/operation"],
  ];
  for (const [name, what, change, pointer] of forbidden) {
    const r = occurred();
    change(r.metadata);
    add("rules", `step-occurred-with-${name}`, `An agent.step.occurred that carries ${what}: a step that occurred is not an operation.`, wrap(r), failed("unknown_field", pointer));
  }
  const words = occurred();
  words.metadata.run.source_type = "Agent Action";
  add("rules", "step-occurred-source-type-not-a-dotted-name", "An agent.step.occurred whose run.source_type is free text: it is a dotted name, as custom.name is.", wrap(words), failed("bad_value", "/metadata/run/source_type"));
  const long = occurred();
  long.metadata.run.source_type = `langchain.${"a".repeat(55)}`;
  add("rules", "step-occurred-source-type-too-long", "An agent.step.occurred whose run.source_type is 65 characters: a dotted name is at most 64.", wrap(long), failed("bad_value", "/metadata/run/source_type"));
  const longest = occurred();
  longest.metadata.run.source_type = `langchain.${"a".repeat(54)}`;
  add("rules", "step-occurred-source-type-64-characters", "An agent.step.occurred whose run.source_type is 64 characters: the longest dotted name.", wrap(longest), verified());
  const retry = occurred();
  retry.metadata.run.source_type = "langchain.retry";
  retry.metadata.run.name = "lookup_rate";
  retry.metadata.run.run_id = eid("run/tool_call");
  add("rules", "step-occurred-retry", "A retry between two attempts of a tool call, written as a step that occurred inside the call, with its name.", wrap(retry), verified());
  for (const [name, value, readme] of [
    ["digit-dot-dot", "1..", "no segment is empty or starts with a digit"],
    ["empty-segment", "a..b", "an empty segment"],
    ["trailing-dot", "retry.", "an empty last segment"],
    ["segment-leading-digit", "retry.1x", "a segment that starts with a digit"],
    ["hyphen", "agent-action", "a hyphen is not allowed"],
    ["upper-case-no-space", "AgentAction", "upper case is not allowed"],
  ]) {
    const r = occurred();
    r.metadata.run.source_type = value;
    add("rules", `step-occurred-source-type-${name}`, `An agent.step.occurred whose run.source_type is ${JSON.stringify(value)}: ${readme}.`, wrap(r), failed("bad_value", "/metadata/run/source_type"));
  }
  const oneSegment = occurred();
  oneSegment.metadata.run.source_type = "retry";
  add("rules", "step-occurred-source-type-one-segment", "An agent.step.occurred whose run.source_type is one segment: a dot is not required.", wrap(oneSegment), verified());
  const hiddenName = occurred();
  delete hiddenName.metadata.run.name;
  hiddenName.context.hidden = { "run.name": jcsHash(RUN_NAME.step) };
  add("disclosure", "step-occurred-name-hidden", "An agent.step.occurred with run.name hidden: absent in clear, its hash listed in context.hidden.", wrap(hiddenName), verified());
  const rootOccurred = occurred();
  rootOccurred.metadata.run.run_id = ROOT_RUN;
  rootOccurred.metadata.run.root_run_id = ROOT_RUN;
  rootOccurred.metadata.run.parent_run_id = null;
  add("rules", "step-occurred-outside-any-operation", "An agent.step.occurred outside any operation: its run_id is the root_run_id and its parent_run_id is null.", wrap(rootOccurred), verified());
  const heldOccurred = wrap(occurred());
  const child = recordOf("agent.custom");
  child.metadata.run.parent_run_id = heldOccurred.record.metadata.run.run_id;
  add("pairing", "parent-is-a-step-occurred", "A record whose run.parent_run_id is the run_id of a held agent.step.occurred: the parent is not an operation, so there is nothing to look for and no finding.", wrap(child), verified(), [heldOccurred]);
  // Held beside the step it occurs inside and the record one position before it: no start, no end,
  // so no finding.
  const step = wrap(recordOf("agent.step.started"));
  const previous = wrap(recordOf(AGENT_TYPES[AGENT_TYPES.indexOf(OCCURRED) - 1]));
  add("pairing", "step-occurred-is-not-an-operation", "An agent.step.occurred read beside the step it occurs inside: it is one record, so it has no start to find and no end to wait for.", wrap(occurred()), verified(), [step, previous]);
  const asStart = wrap(occurred(), { eventId: EV["agent.step.started"] });
  add("pairing", "end-names-a-step-occurred", "A step end names an agent.step.occurred as its start: a step that occurred begins nothing.", wrap(recordOf("agent.step.ended")), pairFailed("pair_type_mismatch"), [asStart]);
}

// --- output -----------------------------------------------------------------------------------

function pretty(v) {
  return JSON.stringify(v, null, 2) + "\n";
}

/** Every generated file, as { relative path: text }. */
export function build() {
  const files = {};
  files["schemas/sanning.agent/1/common.json"] = pretty(commonSchema());
  for (const type of AGENT_TYPES) files[`schemas/sanning.agent/1/${type}.json`] = pretty(typeSchema(type));
  const seen = new Set();
  const index = [];
  for (const c of cases) {
    const dir = `conformance/cases/${c.group}/${c.name}`;
    if (seen.has(dir)) throw new Error(`duplicate case ${dir}`);
    seen.add(dir);
    files[`${dir}/record.json`] = pretty(c.subject);
    if (c.held !== undefined) files[`${dir}/held.json`] = pretty(c.held);
    if (c.sent !== undefined) files[`${dir}/sent.json`] = pretty(c.sent);
    for (const [file, text] of Object.entries(c.extra ?? {})) files[`${dir}/${file}`] = text;
    const e = { valid: c.expected.valid, verdict: c.expected.verdict };
    if (c.expected.reason !== undefined) {
      e.reason = c.expected.reason;
      e.at = c.expected.at;
      // Every reason, in step order. Steps 1 to 6 stop at the first, so most readings have one.
      e.reasons = c.expected.reasons ?? [{ reason: c.expected.reason, at: c.expected.at }];
    }
    e.findings = c.expected.findings;
    files[`${dir}/expected.json`] = pretty(e);
    index.push({ group: c.group, name: c.name, about: c.about });
  }
  files["conformance/index.json"] = pretty(index.map(({ group, name, about }) => ({ case: `${group}/${name}`, about })));
  files["conformance/index.md"] = indexPage(index);
  return files;
}

/** The index of every case, one table per group, in the order the cases are generated. */
function indexPage(index) {
  const lines = [
    "# The cases",
    "",
    `${index.length} cases, one directory each, in ${new Set(index.map((c) => c.group)).size} groups. [\`README.md\`](README.md) gives the format of a case. The same list is in [\`index.json\`](index.json), for a program to read.`,
    "",
    "This page is generated by [`../scripts/generate.mjs`](../scripts/generate.mjs). Do not edit it by hand.",
  ];
  let group;
  for (const c of index) {
    if (c.group !== group) {
      group = c.group;
      lines.push("", `## \`${group}\``, "", "| Case | What it is about |", "|---|---|");
    }
    lines.push(`| [\`${c.name}\`](cases/${c.group}/${c.name}/) | ${c.about.replaceAll("|", "\\|")} |`);
  }
  return lines.join("\n") + "\n";
}

export { leaves, metadataFor, contextFor, KINDS };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = build();
  rmSync(join(ROOT, "schemas", "sanning.agent"), { recursive: true, force: true });
  rmSync(CASES_DIR, { recursive: true, force: true });
  for (const [rel, text] of Object.entries(files)) {
    const p = join(ROOT, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
  console.log(`wrote ${Object.keys(files).length} files, ${cases.length} cases`);
}
