// Talks to the avatar's server, keeps the session's conversation memory, and
// falls back to local keyword matching when the AI service can't be reached.

const STORAGE_KEY = "ag-history-v1";
const MAX_HISTORY = 40;

export class Brain {
  constructor({ apiUrl, scanner }) {
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.scanner = scanner;
    this.history = load();
    this._controller = null;
  }

  // Sends a user message (or "[page event] ..." notification). Returns a reply object.
  async ask(content) {
    this.cancel();
    this.history.push({ role: "user", content });
    const controller = new AbortController();
    this._controller = controller;
    const timer = setTimeout(() => controller.abort("timeout"), 30_000);
    try {
      const res = await fetch(`${this.apiUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          history: this.history.slice(-MAX_HISTORY),
          snapshot: this.scanner.snapshot,
          state: this.scanner.liveState(),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reply = normalize(await res.json());
      this.remember(reply);
      return reply;
    } catch (err) {
      if (controller.signal.aborted && controller.signal.reason !== "timeout") {
        // Superseded by a newer message: drop this turn.
        this.history.pop();
        return null;
      }
      console.warn("[avatar-guide] AI service unavailable:", err);
      const reply = this.offlineReply(content);
      if (reply.steps.length) this.remember(reply);
      else this.history.pop();
      return reply;
    } finally {
      clearTimeout(timer);
      if (this._controller === controller) this._controller = null;
    }
  }

  cancel() {
    this._controller?.abort("superseded");
  }

  remember(reply) {
    const said = reply.steps
      .map((s) => (s.target ? `${s.say} [pointed at #${s.target}]` : s.say))
      .join(" ");
    this.history.push({ role: "assistant", content: said || "(no reply)" });
    this.history = this.history.slice(-MAX_HISTORY);
    save(this.history);
  }

  reset() {
    this.history = [];
    save(this.history);
  }

  offlineReply(content) {
    const isEvent = content.startsWith("[page event]");
    // The caller substitutes a local template for page events.
    if (isEvent) return { steps: [], mood: "neutral", action: "none", offline: true };
    const match = this.scanner.bestMatch(content);
    if (match) {
      const id = match.getAttribute("data-ag-id") || match.id;
      return {
        steps: [
          {
            say: "I'm having trouble reaching my brain right now, but I think this is the spot you're looking for.",
            target: id,
            gesture: "point",
          },
        ],
        mood: "apologetic",
        action: "none",
        offline: true,
      };
    }
    return {
      steps: [
        {
          say: "Sorry, I can't reach my AI service at the moment, so I can't answer that properly. Please try again in a little while.",
          target: "",
          gesture: "none",
        },
      ],
      mood: "apologetic",
      action: "none",
      offline: true,
    };
  }
}

function normalize(data) {
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  return {
    steps: steps
      .filter((s) => s && typeof s.say === "string" && s.say.trim())
      .slice(0, 10)
      .map((s) => ({
        say: s.say.trim(),
        target: typeof s.target === "string" ? s.target.replace(/^#/, "") : "",
        gesture: s.gesture || "none",
      })),
    mood: data?.mood || "happy",
    action: data?.action || "none",
    actionTarget: (data?.action_target || "").replace(/^#/, ""),
    fillValue: data?.fill_value || "",
  };
}

function load() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(history) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    /* storage unavailable: memory still works for this page view */
  }
}
