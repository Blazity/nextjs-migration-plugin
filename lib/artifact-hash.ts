import { createHash } from "node:crypto";

export function hashArtifact(value: unknown): string {
  const canonical = stableStringify(value);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value)) ?? "undefined";
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => canonicalize(item));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonicalize(value[key])]),
    );
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
