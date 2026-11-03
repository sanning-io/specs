// Small helpers the generator shares: canonical JSON, SHA-256, deterministic test ids.

import { createHash } from "node:crypto";

/**
 * RFC 8785 (JCS) for the values these cases use: objects, arrays, strings, booleans, null and
 * finite numbers. Keys sort by UTF-16 code units, which is JavaScript's default string order, and
 * numbers and strings serialize as ECMAScript does, which is what RFC 8785 specifies.
 */
export function jcs(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${jcs(value[k])}`).join(",")}}`;
}

export function sha256Hex(input) {
  return createHash("sha256").update(input).digest("hex");
}

/** SHA-256 of the JCS bytes of a value: what a hidden field keeps, and what content_hash commits to. */
export function jcsHash(value) {
  return sha256Hex(Buffer.from(jcs(value), "utf8"));
}

/**
 * A lowercase UUID v4 derived from a label: SHA-256 of
 * "sanning.test-event-id/" plus the label, the first 32 hex digits, version nibble 4, variant
 * nibble folded into 8 to b.
 */
export function eid(label) {
  const h = sha256Hex("sanning.test-event-id/" + label);
  const v = "89ab"[parseInt(h[16], 16) & 3];
  const s = h.slice(0, 12) + "4" + h.slice(13, 16) + v + h.slice(17, 32);
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/** A 64-hex test key. Not a curve point: nothing at this layer checks a signature. */
export function testKey(label) {
  return sha256Hex("sanning.test-key/" + label);
}

export function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

/**
 * The credential scrub of agent-events.md 9.3: a member whose key this pattern finds has its whole
 * value, of any type, replaced with "[scrubbed]", at any depth. ASCII case folding only: /i without
 * the u flag.
 */
export const CREDENTIAL_SHAPED = /(api[_-]?key|access[_-]?token|authorization|bearer|secret|password|credential)/i;

export function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, CREDENTIAL_SHAPED.test(k) ? "[scrubbed]" : scrub(v)]));
}
