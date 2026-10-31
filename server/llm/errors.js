// Provider-neutral error so the route can map failures to HTTP statuses.
// kind: "auth" | "rate_limited" | "upstream" | "unavailable"
export class LlmError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}
