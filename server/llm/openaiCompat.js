// Any OpenAI-compatible chat completions API: Groq, Google Gemini, OpenRouter,
// Ollama (local) and others. Several of these have free tiers.
import { LlmError } from "./errors.js";

export const PRESETS = {
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    model: "openai/gpt-oss-120b",
    fallbackModels: ["openai/gpt-oss-20b"],
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyEnv: "GEMINI_API_KEY",
    model: "gemini-2.5-flash",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    model: "meta-llama/llama-3.3-70b-instruct:free",
  },
  ollama: {
    baseUrl: "http://localhost:11434/v1",
    keyEnv: null, // runs locally, no key
    model: "llama3.1",
  },
};

export function createOpenAiCompatProvider(name, { model, baseUrl, apiKey } = {}) {
  const preset = PRESETS[name] || {};
  const url = `${(baseUrl || preset.baseUrl || "").replace(/\/$/, "")}/chat/completions`;
  const key = apiKey ?? (preset.keyEnv ? process.env[preset.keyEnv] : "");
  const modelId = model || preset.model;
  const fallbacks = (process.env.LLM_FALLBACK_MODELS ?? (preset.fallbackModels || []).join(","))
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== modelId);
  const modelChain = [modelId, ...fallbacks];

  return {
    name,
    model: modelId,
    async generate({ systemPrompt, snapshotBlock, messages, schema }) {
      if (preset.keyEnv && !key) throw new LlmError("auth", `Missing ${preset.keyEnv} in .env`);

      // These models don't all support strict JSON schemas, so the schema is
      // spelled out in the prompt and JSON mode keeps the output parseable.
      const system = `${systemPrompt}

Reply with ONLY a JSON object (no prose, no code fences) matching this JSON schema:
${JSON.stringify(schema)}
Example: {"steps":[{"say":"Here's the pricing section.","target":"pricing","gesture":"point"}],"mood":"happy","action":"none","action_target":"","fill_value":""}

${snapshotBlock}`;

      const fullMessages = [{ role: "system", content: system }, ...messages];
      const started = Date.now();
      // Free tiers rate-limit per model: on a 429 try the next model, and as a
      // last resort wait (briefly) for the primary model's limit to reset.
      let lastWait = 0;
      for (const m of modelChain) {
        const result = await callModel(m, fullMessages);
        if (result.text) return result;
        lastWait = Math.max(lastWait, result.retryAfter);
        console.warn(`[${name}] ${m} rate-limited, trying next model`);
      }
      if (lastWait <= 12 && Date.now() - started + lastWait * 1000 < 20_000) {
        await new Promise((r) => setTimeout(r, lastWait * 1000 + 250));
        const result = await callModel(modelId, fullMessages);
        if (result.text) return result;
      }
      throw new LlmError("rate_limited", `${name}: every model is rate-limited, try again shortly`);
    },
  };

  // Returns {text} on success, {retryAfter} on 429; throws on other failures.
  async function callModel(m, fullMessages) {
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify({
          model: m,
          temperature: 0.5,
          max_tokens: 2000,
          response_format: { type: "json_object" },
          // Reasoning models (gpt-oss) think before answering; keep it short for voice.
          ...(/gpt-oss/.test(m) ? { reasoning_effort: "low" } : {}),
          messages: fullMessages,
        }),
        signal: AbortSignal.timeout(25_000),
      });
    } catch (err) {
      const hint = name === "ollama" ? " (is Ollama running? `ollama serve`)" : "";
      throw new LlmError("unavailable", `${name} unreachable: ${err.message}${hint}`);
    }

    if (res.status === 429) {
      const body = await res.text().catch(() => "");
      const hinted = Number(body.match(/try again in ([\d.]+)s/)?.[1]);
      const header = Number(res.headers.get("retry-after"));
      return { retryAfter: hinted || header || 10 };
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      if (res.status === 401 || res.status === 403) throw new LlmError("auth", `${name} rejected the API key: ${detail}`);
      throw new LlmError("upstream", `${name} error ${res.status} (${m}): ${detail}`);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new LlmError("upstream", `${name} returned an empty reply`);
    return { text: stripFences(text) };
  }
}

function stripFences(text) {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1] : text).trim();
}
