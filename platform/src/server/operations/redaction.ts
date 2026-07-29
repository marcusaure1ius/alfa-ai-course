import "server-only";

const SENSITIVE_KEY =
  /token|secret|password|private.?key|api.?key|authorization|cloud.?init/i;
const MAX_STRING = 500;

export function redactBounded(value: unknown, depth = 0): unknown {
  if (depth > 5) {
    return "[truncated]";
  }
  if (typeof value === "string") {
    const redacted = value
      .replace(/(bearer\s+)[^\s]+/gi, "$1[redacted]")
      .replace(
        /((?:token|secret|password|private[_ -]?key|api[_ -]?key)\s*[=:]\s*)[^\s,;]+/gi,
        "$1[redacted]",
      );
    return redacted.length > MAX_STRING
      ? `${redacted.slice(0, MAX_STRING)}…`
      : redacted;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redactBounded(item, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 50)
        .map(([key, item]) => [
          key,
          SENSITIVE_KEY.test(key) ? "[redacted]" : redactBounded(item, depth + 1),
        ]),
    );
  }
  return value;
}
