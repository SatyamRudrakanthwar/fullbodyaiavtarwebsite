// Claude provider (Anthropic SDK) with schema-constrained JSON output.
import Anthropic from "@anthropic-ai/sdk";
import { LlmError } from "./errors.js";

export function createAnthropicProvider({ model, effort }) {
  // Created lazily so a missing key surfaces as a request error, not a crash.
  let client = null;

  return {
    name: "anthropic",
    model,
    async generate({ systemPrompt, snapshotBlock, messages, schema }) {
      client ??= new Anthropic();
      let response;
      try {
        response = await client.beta.messages.create({
          model,
          max_tokens: 4000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort, format: { type: "json_schema", schema } },
          system: [
            { type: "text", text: systemPrompt },
            { type: "text", text: snapshotBlock, cache_control: { type: "ephemeral" } },
          ],
          messages,
        });
      } catch (err) {
        if (err instanceof Anthropic.AuthenticationError) throw new LlmError("auth", "Anthropic auth failed - check ANTHROPIC_API_KEY");
        if (err instanceof Anthropic.RateLimitError) throw new LlmError("rate_limited", "Anthropic rate limit");
        if (err instanceof Anthropic.APIError) throw new LlmError("upstream", `Anthropic API error ${err.status}: ${err.message}`);
        throw new LlmError("unavailable", err?.message || String(err));
      }

      if (response.stop_reason === "refusal") return { refused: true };
      const text = response.content.find((b) => b.type === "text")?.text;
      if (!text || response.stop_reason === "max_tokens") throw new LlmError("upstream", "Incomplete response");
      return { text };
    },
  };
}
