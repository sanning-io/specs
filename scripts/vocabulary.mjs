// The sanning.agent/1 vocabulary as data: the one source the schemas are compiled from.
//
// agent-events.md is the normative text. This file restates its tables in a form a script can
// compile, and scripts/check.mjs fails when a field named here is missing from the spec.

export const EVENT_SCHEMA = "sanning.agent/1";
// sanning.agent/<major> or sanning.agent/<major>.<minor>, each a decimal with no leading zero and
// at least 1. Minor 0 is written as the bare major, so sanning.agent/1.0 is not a spelling.
export const EVENT_SCHEMA_RE = /^sanning\.agent\/[1-9][0-9]{0,8}(\.[1-9][0-9]{0,8})?$/;
export const SCHEMA_BASE = "https://sanning.io/specs/schemas/sanning.agent/1/";
export const OTEL_SCHEMA_URL = "https://opentelemetry.io/schemas/1.41.0";
export const MAX_SAFE = 9007199254740991;
export const MAX_RECORD_IDS = 65536;
export const MAX_UNCHECKED_PARTS = 1024;

// The 19 agent type names, by kind.
export const KINDS = {
  run: ["agent.run_opened", "agent.run_closed"],
  step: ["agent.step.started", "agent.step.ended", "agent.step.occurred"],
  model_call: ["agent.model_call.started", "agent.model_call.ended"],
  tool_call: ["agent.tool_call.started", "agent.tool_call.ended"],
  retrieval: ["agent.retrieval.started", "agent.retrieval.ended"],
  approval: ["agent.approval.requested", "agent.approval.resolved"],
  handoff: ["agent.handoff.sent", "agent.handoff.received"],
  decision: ["agent.decision"],
  custom: ["agent.custom"],
  file: ["agent.file"],
  error: ["agent.error"],
};
// A step that occurred is not an operation: no start, no end, no outcome (agent-events.md 5.2).
export const OCCURRED = "agent.step.occurred";
// The type order. agent.step.occurred is last: the generator places each sample record at its
// type's position, and the cases name positions.
export const AGENT_TYPES = [...Object.values(KINDS).flat().filter((t) => t !== OCCURRED), OCCURRED];

// A closer names the record that opened its operation in run.started_event_id.
export const OPENER_OF = {
  "agent.step.ended": "agent.step.started",
  "agent.model_call.ended": "agent.model_call.started",
  "agent.tool_call.ended": "agent.tool_call.started",
  "agent.retrieval.ended": "agent.retrieval.started",
  "agent.approval.resolved": "agent.approval.requested",
};
export const CLOSERS = Object.keys(OPENER_OF);
const ENDED = new Set(CLOSERS.filter((t) => t.endsWith(".ended")));

export function kindOf(type) {
  for (const [k, names] of Object.entries(KINDS)) if (names.includes(type)) return k;
  return undefined;
}

// --- leaf schemas, shared through common.json -------------------------------------------------

const CONTROL_FREE = "^[^\\u0000-\\u001f\\u007f]+$";
export const OPAQUE_ID = "^[A-Za-z0-9_.:-]+$";
// The name of an agent.custom record: one or more segments joined by a dot, each a lower-case
// letter followed by lower-case letters, digits and underscores. At most 64 characters, by maxLength.
export const CUSTOM_NAME = "^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)*$";
export const UUID_V4 = "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";
// A published package name: an npm name with an optional scope, or a PyPI name. No `~`, which npm
// refuses in a new package name and PyPI never admits.
export const PACKAGE_NAME = "^(@[a-z0-9][a-z0-9._-]*/)?[A-Za-z0-9][A-Za-z0-9._-]*$";
// Semantic Versioning 2.0.0, the regular expression semver.org publishes.
export const SEMVER =
  "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-((0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(\\.(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(\\+([0-9A-Za-z-]+(\\.[0-9A-Za-z-]+)*))?$";
// RFC 3339 in UTC: month 01 to 12, day 01 to 31, hour 00 to 23, minute and second 00 to 59, a fraction
// of 1 to 9 digits. At most 30 characters.
export const RFC3339_UTC =
  "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\\.[0-9]{1,9})?Z$";

export const COMMON_DEFS = {
  id: {
    description: "An opaque identifier: a framework run id, a case id, a conversation id. Never hashed.",
    type: "string",
    minLength: 1,
    maxLength: 128,
    pattern: OPAQUE_ID,
  },
  id_or_null: {
    description: "An opaque identifier, or null where null is the fact (a root run has no parent).",
    type: ["string", "null"],
    minLength: 1,
    maxLength: 128,
    pattern: OPAQUE_ID,
  },
  event_id: {
    description: "An envelope event_id: a lowercase UUID v4.",
    type: "string",
    pattern: UUID_V4,
  },
  event_id_or_null: {
    description: "An envelope event_id, or null at the head of a chain.",
    type: ["string", "null"],
    pattern: UUID_V4,
  },
  provider_id: {
    description: "An identifier a model provider minted, or an adapter assigned: the opaque grammar, at most 256 characters.",
    type: "string",
    minLength: 1,
    maxLength: 256,
    pattern: OPAQUE_ID,
  },
  sha256: { description: "SHA-256, 64 lowercase hex characters.", type: "string", pattern: "^[0-9a-f]{64}$" },
  sha256_either_case: {
    description: "SHA-256, 64 hex characters in either case (agent-events.md section 4.2).",
    type: "string",
    pattern: "^[0-9a-fA-F]{64}$",
  },
  public_key: {
    description: "An Ed25519 public key, 64 lowercase hex characters.",
    type: "string",
    pattern: "^[0-9a-f]{64}$",
  },
  uint: { description: "An integer from 0 to 2^53 - 1.", type: "integer", minimum: 0, maximum: MAX_SAFE },
  pos_int: { description: "An integer from 1 to 2^53 - 1.", type: "integer", minimum: 1, maximum: MAX_SAFE },
  safe_int: {
    description: "An integer from -(2^53 - 1) to 2^53 - 1.",
    type: "integer",
    minimum: -MAX_SAFE,
    maximum: MAX_SAFE,
  },
  number: { description: "A finite JSON number.", type: "number" },
  label: {
    description: "A short name or code: 1 to 128 characters, no control characters.",
    type: "string",
    minLength: 1,
    maxLength: 128,
    pattern: CONTROL_FREE,
  },
  text: {
    description: "A name: 1 to 256 characters, no control characters.",
    type: "string",
    minLength: 1,
    maxLength: 256,
    pattern: CONTROL_FREE,
  },
  string: { description: "Any string: used only for hash-only fields, which carry content when revealed.", type: "string" },
  locator: {
    description: "Where a file was or went, in the tool's words: 1 to 2048 characters, no control characters.",
    type: "string",
    minLength: 1,
    maxLength: 2048,
    pattern: CONTROL_FREE,
  },
  any: { description: "Any JSON value: a revealed field carries what the content held." },
  rfc3339_utc: {
    description: "An RFC 3339 UTC timestamp ending in Z, a fraction of at most 9 digits: at most 30 characters.",
    type: "string",
    maxLength: 30,
    pattern: RFC3339_UTC,
  },
  ref: {
    description: "A locator URI: an ASCII scheme other than data, a colon and RFC 3986 characters, at most 2048 in all.",
    type: "string",
    maxLength: 2048,
    pattern: "^[A-Za-z][A-Za-z0-9+.-]*:[A-Za-z0-9._~:/?#\\[\\]@!$&'()*+,;=%-]+$",
    not: { pattern: "^[Dd][Aa][Tt][Aa]:" },
  },
  data_mode: { description: "What Sanning receives.", enum: ["private", "standard", "full"] },
  salt: {
    description: "A random 128-bit value, 32 lowercase hex characters, fresh for each record. Sanning receives it only in full.",
    type: "string",
    pattern: "^[0-9a-f]{32}$",
  },
  custom_name: {
    description: "A dotted name, for custom.name and for run.source_type on agent.step.occurred: dot-separated segments, each a-z then a-z 0-9 _, at most 64 characters.",
    type: "string",
    maxLength: 64,
    pattern: CUSTOM_NAME,
  },
  outcome_status: { description: "How an operation ended.", enum: ["completed", "failed", "interrupted", "skipped"] },
  file_status: { description: "Whether the adapter hashed the file: completed, or failed with artifact.reason.", enum: ["completed", "failed"] },
  closing_status: { description: "How a run ended, as the closing record states it.", enum: ["completed", "failed", "interrupted", "unknown"] },
  closing_reason: {
    description: "Why a run ended other than completed, as a code. Any text is in the content of the record that carries the failure.",
    enum: ["error", "timeout", "cancelled", "interrupted", "policy"],
  },
  provider_name: {
    description: "OpenTelemetry GenAI 1.41.0 well-known provider names, plus openrouter.",
    enum: [
      "anthropic",
      "aws.bedrock",
      "azure.ai.inference",
      "azure.ai.openai",
      "cohere",
      "deepseek",
      "gcp.gemini",
      "gcp.gen_ai",
      "gcp.vertex_ai",
      "groq",
      "ibm.watsonx.ai",
      "mistral_ai",
      "openai",
      "perplexity",
      "x_ai",
      "openrouter",
    ],
  },
  model_operation: {
    description: "gen_ai.operation.name values for a model call (OpenTelemetry GenAI 1.41.0).",
    enum: ["chat", "text_completion", "generate_content", "embeddings"],
  },
  agent_type: { description: "One of the 19 sanning.agent/1 type names.", enum: AGENT_TYPES },
  approval_actor: { enum: ["human", "policy", "model"] },
  approval_verdict: { enum: ["approved", "rejected", "edited", "responded"] },
  artifact_role: { enum: ["input", "output"] },
  artifact_reason: {
    description: "Why a file could not be hashed.",
    enum: ["outside_root", "not_found", "not_a_regular_file", "too_large", "read_failed", "path_reading_disabled"],
  },
  handoff_outcome: { enum: ["accepted", "rejected", "failed"] },
  previous_hash: {
    description: "The previous record's payload_hash on this chain, or GENESIS.",
    type: "string",
    pattern: "^(GENESIS|[0-9a-f]{64})$",
  },
  subject: {
    description: "The agent that signed the record (events.md section 5).",
    type: "object",
    additionalProperties: false,
    required: ["type"],
    properties: {
      type: { const: "agent" },
      agent_id: { type: "string", minLength: 1, maxLength: 128, pattern: OPAQUE_ID },
      name: { type: "string", minLength: 1, maxLength: 128, pattern: OPAQUE_ID },
    },
  },
  otel: {
    description: "The recorder that wrote the record, and real OpenTelemetry ids where a span exists.",
    type: "object",
    additionalProperties: false,
    required: ["scope"],
    properties: {
      scope: {
        type: "object",
        additionalProperties: false,
        required: ["name", "version", "schema_url"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 214, pattern: PACKAGE_NAME },
          version: { type: "string", minLength: 1, maxLength: 64, pattern: SEMVER },
          schema_url: { const: OTEL_SCHEMA_URL },
        },
      },
      trace_id: { type: "string", pattern: "^[0-9a-f]{32}$", not: { const: "0".repeat(32) } },
      span_id: { type: "string", pattern: "^[0-9a-f]{16}$", not: { const: "0".repeat(16) } },
    },
  },
  extras: {
    type: "object",
    additionalProperties: false,
    required: ["event_schema"],
    properties: { event_schema: { const: EVENT_SCHEMA } },
  },
  content_event: {
    description: "The event section of every agent record except the two hand-off types.",
    type: "object",
    additionalProperties: false,
    required: ["content_hash"],
    properties: {
      content_hash: { $ref: "#/$defs/sha256" },
      content_length: { $ref: "#/$defs/uint" },
      ref: { $ref: "#/$defs/ref" },
    },
  },
  handoff_event_sent: {
    description: "The event section of agent.handoff.sent, closed (agent-events.md section 4.2).",
    type: "object",
    additionalProperties: false,
    required: ["message_hash", "content_type", "counterparty_public_key", "sequence"],
    properties: {
      message_hash: { $ref: "#/$defs/sha256_either_case" },
      message_bytes_hash: { $ref: "#/$defs/sha256_either_case" },
      content_type: { $ref: "#/$defs/label" },
      counterparty_public_key: { $ref: "#/$defs/public_key" },
      sequence: { $ref: "#/$defs/pos_int" },
    },
  },
  handoff_event_received: {
    description: "The event section of agent.handoff.received, closed (agent-events.md section 4.2).",
    type: "object",
    additionalProperties: false,
    required: ["message_hash", "content_type", "counterparty_public_key", "sequence", "outcome"],
    properties: {
      message_hash: { $ref: "#/$defs/sha256_either_case" },
      message_bytes_hash: { $ref: "#/$defs/sha256_either_case" },
      content_type: { $ref: "#/$defs/label" },
      counterparty_public_key: { $ref: "#/$defs/public_key" },
      sequence: { $ref: "#/$defs/pos_int" },
      outcome: { $ref: "#/$defs/handoff_outcome" },
    },
  },
};

// --- the field tree ---------------------------------------------------------------------------

const C = (name) => ({ $ref: `common.json#/$defs/${name}` });

/** A leaf field. `hide`: may be hidden (context.hidden). `reveal`: hash-only unless revealed. */
function leaf(schema, { req = false, hide = false, reveal = false } = {}) {
  return { kind: "leaf", schema, req, hide, reveal };
}
/**
 * An object of fields. An optional object with no required member must not be empty. `extra`: more
 * keywords on the compiled object schema.
 */
function obj(children, { req = false, extra } = {}) {
  return { kind: "obj", children, req, extra };
}
const REQ = { req: true };

// The invocation's first record is the one at run.seq 0, and it alone has run.prev_event_id null: a
// record with one and not the other reads bad_value at /metadata/run. One `not`, so a validator
// reports exactly one error for it.
const HEAD_RULE = {
  not: {
    anyOf: [
      {
        type: "object",
        required: ["seq", "prev_event_id"],
        properties: { seq: { const: 0 }, prev_event_id: { type: "string" } },
      },
      {
        type: "object",
        required: ["seq", "prev_event_id"],
        properties: { seq: { not: { const: 0 } }, prev_event_id: { const: null } },
      },
    ],
  },
};

// A record with a previous hash is a link of a chain, and a chained record names its chain in
// context.chain_key; an unchained record is GENESIS (events.md section 5). The two members are in
// different sections, so the rule is on the record: one `not`, one bad_value at the record.
const CHAIN_RULE = {
  not: {
    required: ["previous_hash", "context"],
    properties: {
      previous_hash: { type: "string", pattern: "^[0-9a-f]{64}$" },
      context: { type: "object", not: { properties: { chain_key: true }, required: ["chain_key"] } },
    },
  },
};

const NAMED = new Set([
  "agent.run_opened",
  ...KINDS.step,
  ...KINDS.model_call,
  ...KINDS.tool_call,
  ...KINDS.retrieval,
]);

function runTree(type) {
  const kind = kindOf(type);
  const c = {
    run_id: leaf(C("id"), REQ),
    parent_run_id: leaf(C("id_or_null"), REQ),
    root_run_id: leaf(C("id"), REQ),
    // agent.run_opened is the first record of its invocation.
    seq: leaf(type === "agent.run_opened" ? { const: 0 } : C("uint"), REQ),
    prev_event_id: leaf(type === "agent.run_opened" ? { const: null } : C("event_id_or_null"), REQ),
  };
  // On a step that occurred, the framework's name for the event is required and a dotted name.
  if (type === OCCURRED) c.source_type = leaf(C("custom_name"), REQ);
  else if (type !== "agent.run_closed") c.source_type = leaf(C("label"));
  if (NAMED.has(type)) c.name = leaf(C("text"), { hide: true });
  if (kind === "model_call") c.client = leaf(C("label"));
  // null only for an end whose start this adapter cannot observe (agent-events.md 9.1).
  if (CLOSERS.includes(type)) c.started_event_id = leaf(C("event_id_or_null"), REQ);
  if (ENDED.has(type)) c.observed_started_at = leaf(C("rfc3339_utc"));
  if (kind === "step") c.plumbing = leaf({ const: true });
  if (type === "agent.run_opened") {
    c.runner_event_id = leaf(C("event_id"));
    c.handoff_event_id = leaf(C("event_id"));
  }
  // agent.run_opened states both by const, so the rule would only repeat the error there.
  return obj(c, { req: true, extra: type === "agent.run_opened" ? undefined : HEAD_RULE });
}

function genAiTree(type) {
  const kind = kindOf(type);
  const c = {};
  if (kind === "run") c.operation = obj({ name: leaf({ const: "invoke_agent" }, REQ) }, REQ);
  if (kind === "model_call") c.operation = obj({ name: leaf(C("model_operation"), REQ) }, REQ);
  if (kind === "tool_call") c.operation = obj({ name: leaf({ const: "execute_tool" }, REQ) }, REQ);
  if (kind === "retrieval") c.operation = obj({ name: leaf({ const: "retrieval" }, REQ) }, REQ);
  c.agent = obj({ version: leaf(C("label"), REQ) });
  c.conversation = obj({ id: leaf(C("id"), REQ) });

  if (type === "agent.model_call.started") {
    c.request = obj({
      model: leaf(C("text")),
      temperature: leaf(C("number")),
      max_tokens: leaf(C("uint")),
      seed: leaf(C("safe_int")),
      top_p: leaf(C("number")),
    });
    c.provider = obj({ name: leaf(C("provider_name"), REQ) });
    c.prompt = obj({ name: leaf(C("text"), { hide: true }) });
    c.input = obj({ messages: leaf(C("any"), { reveal: true }) });
    c.system_instructions = leaf(C("any"), { reveal: true });
  }
  if (type === "agent.model_call.ended") {
    c.provider = obj({ name: leaf(C("provider_name"), REQ) });
    c.response = obj({
      model: leaf(C("text")),
      id: leaf(C("provider_id")),
      finish_reasons: leaf({ type: "array", minItems: 1, maxItems: 16, items: C("label") }),
    });
    c.usage = obj({
      input_tokens: leaf(C("uint")),
      output_tokens: leaf(C("uint")),
      reasoning: obj({ output_tokens: leaf(C("uint"), REQ) }),
    });
    c.output = obj({ messages: leaf(C("any"), { reveal: true }) });
  }
  if (kind === "tool_call") {
    // The call id pairs a start with its end: the model's id, or one the adapter assigns where the
    // framework has none.
    const call = { id: leaf(C("provider_id"), REQ) };
    if (type.endsWith(".started")) call.arguments = leaf(C("any"), { reveal: true });
    else call.result = leaf(C("any"), { reveal: true });
    c.tool = obj({ name: leaf(C("text"), { hide: true }), call: obj(call, REQ) }, REQ);
  }
  if (type === "agent.retrieval.started") {
    c.retrieval = obj({ query: obj({ text: leaf(C("string"), { reveal: true }) }) });
  }
  if (type === "agent.retrieval.ended") {
    c.retrieval = obj({ documents: leaf(C("any"), { reveal: true }) });
  }
  const required = ["run", "model_call", "tool_call", "retrieval"].includes(kind);
  return obj(c, { req: required });
}

function metadataTree(type) {
  const kind = kindOf(type);
  const m = { run: runTree(type), otel: leaf(C("otel"), REQ), gen_ai: genAiTree(type) };

  if (ENDED.has(type)) {
    m.outcome = obj({ status: leaf(C("outcome_status"), REQ) }, REQ);
    m.error = obj({ type: leaf(C("label"), REQ) });
    m.exception = obj({ message: leaf(C("string"), { reveal: true }) });
  }
  // What this adapter cannot write for this invocation: allowed on every type, and read only on the
  // invocation's first record (run.seq 0), which is agent.run_opened where the adapter writes one.
  m.capture = obj({
    not_captured: leaf(
      { type: "array", minItems: 1, maxItems: AGENT_TYPES.length, uniqueItems: true, items: C("agent_type") },
      REQ,
    ),
  });
  if (type === "agent.run_opened") {
    m.closing = obj({ promised: leaf({ const: true }, REQ) }, REQ);
    m.authority = obj({
      scope: leaf({ type: "array", minItems: 1, maxItems: 32, uniqueItems: true, items: C("label") }),
      expires_at: leaf(C("rfc3339_utc")),
      principal: leaf(C("any"), { reveal: true }),
    });
  }
  if (type === "agent.run_closed") {
    const statement = () => obj({ status: leaf(C("closing_status"), REQ), reason: leaf(C("closing_reason")) });
    m.closing = obj(
      {
        record_count: leaf(C("uint"), REQ),
        record_ids: leaf({ type: "array", maxItems: MAX_RECORD_IDS, uniqueItems: true, items: C("event_id") }, REQ),
        outcome: obj({ observed: { ...statement(), req: true }, stated: statement() }, REQ),
      },
      REQ,
    );
  }
  if (type === "agent.model_call.ended") {
    m.openai = obj({ response: obj({ system_fingerprint: leaf(C("label"), REQ) }, REQ) });
  }
  if (type === "agent.retrieval.ended") {
    m.retrieval = obj({ document_count: leaf(C("uint"), REQ) });
  }
  if (kind === "approval") {
    const a = {
      actor: leaf(C("approval_actor"), REQ),
      policy_hash: leaf(C("sha256")),
      subject_event_id: leaf(C("event_id"), REQ),
    };
    if (type === "agent.approval.requested") {
      a.action = leaf(C("any"), { reveal: true });
    } else {
      a.verdict = leaf(C("approval_verdict"), REQ);
      a.reviewer = leaf(C("any"), { reveal: true });
      a.notes = leaf(C("any"), { reveal: true });
      a.edited_action = leaf(C("any"), { reveal: true });
    }
    m.approval = obj(a, REQ);
  }
  if (kind === "handoff") {
    const h = { parts: leaf(C("uint"), REQ), file_parts: leaf(C("uint"), REQ) };
    if (type === "agent.handoff.received") {
      h.sent_event_id = leaf(C("event_id"));
      h.unchecked_held_parts = leaf({
        type: "array",
        minItems: 1,
        maxItems: MAX_UNCHECKED_PARTS,
        uniqueItems: true,
        items: C("uint"),
      });
    }
    m.handoff = obj(h, REQ);
  }
  if (type === "agent.decision") {
    m.decision = obj({ name: leaf(C("label"), REQ), value: leaf(C("any"), { reveal: true }) }, REQ);
  }
  if (type === "agent.custom") {
    m.custom = obj({ name: leaf(C("custom_name"), REQ), value: leaf(C("any"), { reveal: true }) }, REQ);
  }
  if (type === "agent.file") {
    m.outcome = obj({ status: leaf(C("file_status"), REQ) }, REQ);
    m.artifact = obj(
      {
        name: leaf(C("text"), { hide: true }),
        tool_call_event_id: leaf(C("event_id")),
        byte_length: leaf(C("uint")),
        content_type: leaf(C("label")),
        role: leaf(C("artifact_role")),
        reason: leaf(C("artifact_reason")),
        // A file's content is its bytes, so these cannot be committed by the content hash: they are
        // clear fields, and hiding one keeps its hash in context.hidden.
        path: leaf(C("locator"), { hide: true }),
        source: leaf(C("locator"), { hide: true }),
        destination: leaf(C("locator"), { hide: true }),
      },
    );
  }
  if (type === "agent.error") {
    m.error = obj({ type: leaf(C("label"), REQ) }, REQ);
    m.exception = obj({ message: leaf(C("string"), { reveal: true }) });
  }
  return obj(m, REQ);
}

/** Every leaf path in a tree, with its node: [["gen_ai.tool.name", node], ...]. */
export function leaves(tree, prefix = []) {
  const out = [];
  for (const [k, node] of Object.entries(tree.children)) {
    const path = [...prefix, k];
    if (node.kind === "obj") out.push(...leaves(node, path));
    else out.push([path.join("."), node]);
  }
  return out;
}

export function metadataFor(type) {
  return metadataTree(type);
}
export function hidableOf(type) {
  return leaves(metadataTree(type)).filter(([, n]) => n.hide).map(([p]) => p);
}
export function revealableOf(type) {
  return leaves(metadataTree(type)).filter(([, n]) => n.reveal).map(([p]) => p);
}

// The types whose content is a JSON object, which an adapter can scrub of credentials (9.3). A
// hand-off commits to the message as sent, and a file to its own bytes: neither is rewritten.
export const SCRUBBABLE = new Set(AGENT_TYPES.filter((t) => kindOf(t) !== "handoff" && t !== "agent.file"));

function contextTree(type) {
  const c = {
    data_mode: leaf(C("data_mode"), REQ),
    salt: leaf(C("salt"), REQ),
    case_id: leaf(C("id")),
    chain_key: leaf(C("id")),
  };
  if (SCRUBBABLE.has(type)) c.content_scrubbed = leaf({ const: true });
  const revealable = revealableOf(type);
  const hidable = hidableOf(type);
  if (revealable.length > 0) {
    c.revealed = leaf({
      type: "array",
      minItems: 1,
      maxItems: revealable.length,
      uniqueItems: true,
      items: { enum: revealable },
    });
  }
  if (hidable.length > 0) {
    c.hidden = leaf({
      type: "object",
      minProperties: 1,
      additionalProperties: false,
      properties: Object.fromEntries(hidable.map((p) => [p, C("sha256")])),
    });
  }
  if (kindOf(type) === "handoff") {
    c.in_reply_to = leaf(C("sha256_either_case"));
    c.protocol = leaf({ type: "string", minLength: 1, maxLength: 64, pattern: CONTROL_FREE });
  }
  if (type === "agent.handoff.received") c.unchecked_held_part_count = leaf(C("pos_int"));
  return obj(c, REQ);
}

export function contextFor(type) {
  return contextTree(type);
}

// --- compile -----------------------------------------------------------------------------------

function compile(node) {
  if (node.kind === "leaf") return node.schema;
  const properties = {};
  const required = [];
  for (const [k, child] of Object.entries(node.children)) {
    properties[k] = compile(child);
    if (child.req) required.push(k);
  }
  const s = { type: "object", additionalProperties: false };
  if (required.length > 0) s.required = required;
  else s.minProperties = 1;
  s.properties = properties;
  if (node.extra !== undefined) Object.assign(s, node.extra);
  return s;
}

export function typeSchema(type) {
  const event =
    kindOf(type) === "handoff"
      ? C(type === "agent.handoff.sent" ? "handoff_event_sent" : "handoff_event_received")
      : C("content_event");
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${SCHEMA_BASE}${type}.json`,
    title: type,
    description: `The event record of one ${type} record under sanning.agent/1. Normative text: agent-events.md.`,
    type: "object",
    additionalProperties: false,
    required: [
      "payload_version",
      "spec_version",
      "event_type",
      "subject",
      "previous_hash",
      "event",
      "context",
      "metadata",
      "extras",
    ],
    properties: {
      payload_version: { const: 1 },
      spec_version: { const: "sanning.events/v2" },
      event_type: { const: type },
      subject: C("subject"),
      previous_hash: C("previous_hash"),
      event,
      context: compile(contextTree(type)),
      metadata: compile(metadataTree(type)),
      extras: C("extras"),
    },
    ...CHAIN_RULE,
  };
}

export function commonSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${SCHEMA_BASE}common.json`,
    title: "sanning.agent/1 shared definitions",
    description: "Definitions every sanning.agent/1 type schema refers to. Normative text: agent-events.md.",
    $defs: COMMON_DEFS,
  };
}

// --- what Sanning receives (agent-events.md section 7) ------------------------------------------------

// The paths Sanning receives in every mode, private included: ids, fixed formats and the outcome.
// scripts/check.mjs fails when one of them has a schema that admits free text.
export const PRIVATE_PATHS = new Set([
  "payload_version",
  "spec_version",
  "event_type",
  "subject.type",
  "subject.agent_id",
  "previous_hash",
  "event.outcome",
  "context.data_mode",
  "context.case_id",
  "context.chain_key",
  "context.content_scrubbed",
  "metadata.run.run_id",
  "metadata.run.parent_run_id",
  "metadata.run.root_run_id",
  "metadata.run.seq",
  "metadata.run.prev_event_id",
  "metadata.run.started_event_id",
  "metadata.run.observed_started_at",
  "metadata.run.runner_event_id",
  "metadata.run.handoff_event_id",
  "metadata.otel",
  "metadata.gen_ai.conversation.id",
  "metadata.gen_ai.tool.call.id",
  "metadata.gen_ai.response.id",
  "metadata.approval.subject_event_id",
  "metadata.handoff.sent_event_id",
  "metadata.artifact.tool_call_event_id",
  "metadata.outcome.status",
  "metadata.closing.promised",
  "metadata.closing.record_count",
  "metadata.closing.record_ids",
  "metadata.closing.outcome.observed.status",
  "metadata.closing.outcome.stated.status",
  "metadata.closing.outcome.observed.reason",
  "metadata.closing.outcome.stated.reason",
  "metadata.capture.not_captured",
  "extras.event_schema",
]);

// The paths Sanning receives only in full mode: every hash and every length of customer content,
// the locators, and the revealed fields. A length is here because it can tell two values apart:
// {"value":true} and {"value":false} differ by one byte. artifact.byte_length is a file record's
// content length under another name.
export const FULL_ONLY_PATHS = new Set([
  "event.content_hash",
  "event.content_length",
  "event.ref",
  "event.message_hash",
  "event.message_bytes_hash",
  "context.in_reply_to",
  "context.hidden",
  "context.salt",
  "metadata.artifact.byte_length",
  "metadata.artifact.path",
  "metadata.artifact.source",
  "metadata.artifact.destination",
]);

// The fields check.mjs refuses in the private and standard rows whatever their schema: the content,
// a hash of it or its length, and the salt. Below full, Sanning holds each record's payload_hash and
// not the salt, so it cannot rebuild the record from a guess and compare.
export const CONTENT_DERIVED = new Set([
  "context.salt",
  "event.content_hash",
  "event.content_length",
  "event.message_hash",
  "event.message_bytes_hash",
  "context.in_reply_to",
  "context.hidden",
  "metadata.artifact.byte_length",
]);

/** The least mode in which Sanning receives a leaf at `path` (a dotted path into the record). */
export function tierOf(type, path) {
  if (PRIVATE_PATHS.has(path)) return "private";
  if (FULL_ONLY_PATHS.has(path)) return "full";
  if (path.startsWith("metadata.") && revealableOf(type).includes(path.slice("metadata.".length))) return "full";
  return "standard";
}

/** Whether `path` is one field for the mode table: an object value that is one field, not a section. */
export function isFieldPath(type, path) {
  if (PRIVATE_PATHS.has(path) || FULL_ONLY_PATHS.has(path)) return true;
  return path.startsWith("metadata.") && revealableOf(type).includes(path.slice("metadata.".length));
}
