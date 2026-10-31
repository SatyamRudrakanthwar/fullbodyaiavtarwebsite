# Avatar Guide: technical details

Back to the [README](../README.md).

## Demo script (for the 2-3 minute recording)

The demo page has "Try asking the guide" chips under the hero. Typing or speaking works too.

| # | Scenario | What to do | What happens |
|---|---|---|---|
| 1 | Greeting + intro | Load the page, click **Say hello 👋** | Avatar walks in, waves, introduces itself and summarises the page from its content |
| 2 | "What does this company do?" | Mic button, then say it | Answer composed only from page text, with a natural voice and lip-sync |
| 3 | "Where can I sign up?" | Ask it | Scrolls, walks beside the signup button/form, points with its index finger, highlights it and explains |
| 4 | Guided tour | "Walk me through this page" | Visits hero, features, how it works, pricing, FAQ, signup in order, pointing at each |
| 5 | Form walkthrough | "Help me fill in the signup form" | Points at each field and explains it; reacts when you finish a field. Type `x@gmail.com` in Work email to see it notice the error and explain the fix. At the end it points to **Create account** and says it won't submit for you |
| 6 | Unanswerable question | "Do you integrate with SAP?" | Says honestly that the page doesn't mention SAP, and offers the contact form |
| + | Memory | "How much is it?" then "And the yearly price?" | Follow-ups resolve against the earlier turn |
| + | Live page changes | Click **Yearly** on pricing, then ask "How much is Team?" | The answer uses the updated $9.60 price |
| + | Permission | "Put my name in as Sam Rivera" | Shows an Allow / No thanks card; nothing is typed until you allow it |
| + | Presence | Minimize (–), summon ("Ask Ava"), hide (×), side tab | Avatar walks off and back on; never blocks the page |

---

## How it works

```
 host page ──► PageScanner ──► snapshot (sections, headings, text, buttons, links, fields)
                    ▲ MutationObserver: re-scans on DOM changes (no manual rework)
                    │
 visitor ──voice/text──► AvatarGuide (controller) ──POST /api/chat──► server ──► Claude
                                │   history + snapshot + live state     (structured JSON reply:
                                │                                         steps[{say,target,gesture}],
                                ▼                                         mood, action)
          for each step: Stage.scrollTo ─► Stage.walkTo ─► highlight + point ─► Speech.speak (lip-sync)
                                │
                     FormGuide watches field focus/blur/change/invalid ─► "[page event]" turns
```

| File | Responsibility |
|---|---|
| `server/index.js` | Express API: provider selection, rate limit, CORS, response sanitizing, error mapping |
| `server/llm/` | Providers: Claude (`anthropic.js`, JSON-schema output, cached snapshot) and any OpenAI-compatible API (`openaiCompat.js`: Groq, Gemini, OpenRouter, Ollama) |
| `server/prompt.js` | Persona, honesty rules, pointing/tour/form rules, response schema |
| `src/widget/index.js` | Controller: UI, conversation flow, step execution, minimize/hide/summon, permission card |
| `src/widget/pageScanner.js` | Builds the LLM-readable page map, live form state, and offline keyword matching |
| `src/widget/avatar3d.js` | VRM loading + procedural animation: layered poses, direction-based arm IK, pointing, walk cycle, blink, moods, visemes |
| `src/widget/stage.js` | Walking across the viewport with easing, choosing a spot that doesn't cover the target, smooth scrolling, live highlight and pointing |
| `src/widget/speech.js` | TTS with a text-driven viseme timeline re-synced on word boundaries; speech recognition |
| `src/widget/formGuide.js` | Field-by-field walkthrough: detects completed fields, validation errors, completion, submit |
| `src/widget/fallbackAvatar.js` | 2D full-body avatar used if WebGL or the model fails |
| `src/embed.js` | `<script>`-tag entry; builds to `dist/avatar-guide.js` |

### Design decisions and edge cases

- **Grounded answers.** The model only sees the page snapshot (marked as data, not instructions) and is told to admit when the page doesn't say something. The snapshot is rebuilt on every DOM change, so updated content is used automatically.
- **Safety with forms.** The widget has no submit capability at all. Typing a value requires the model to *request* it, and the visitor must click **Allow**. Password fields are refused outright. Field values are never sent to the server: only filled/empty/error status.
- **Movement never teleports.** Walking uses eased velocity with a matching walk-cycle intensity. Bone poses ease toward their targets every frame, so state changes blend. Scrolling is smooth (instant under `prefers-reduced-motion`).
- **Not blocking content.** The avatar picks a standing spot that avoids the target *and* its surrounding form or card. The canvas ignores clicks, and the avatar fades when the pointer passes over it. It can be minimized or hidden at any time (Esc stops it talking).
- **Pointing that stays on target.** The arm re-aims every frame at the element's current position, so it keeps up with scrolling and resizes. The avatar uses the arm on the target's side, turns slightly toward it, and looks at it.
- **Failures.** API down or no key: an apologetic offline mode that still points at local keyword matches, plus template lines for form guidance. No WebGL or model failure: 2D avatar. No speech recognition (e.g. Firefox): text input only. Speech blocked before the first click: a "Say hello" button. Mic denied: an explanation in the bubble. Missing or hidden targets: the avatar just speaks. Superseded requests are aborted. 30 s timeout.
- **Latency.** Low effort setting, a short reply format, a cached system prompt plus snapshot, and an immediate "thinking" pose and bubble while waiting.
- **Memory.** The conversation (including what was pointed at) is kept for the browser session in `sessionStorage` and sent with each turn. The server is stateless.

### Configuration (`.env`)

| Variable | Default | |
|---|---|---|
| `LLM_PROVIDER` | auto | `anthropic`, `groq`, `gemini`, `openrouter` or `ollama` (auto = first key found) |
| `GROQ_API_KEY` / `GEMINI_API_KEY` / `OPENROUTER_API_KEY` | | Free-tier keys |
| `LLM_MODEL` / `LLM_BASE_URL` / `LLM_API_KEY` | preset | Override model or point at any OpenAI-compatible endpoint |
| `ANTHROPIC_API_KEY` | | Claude key |
| `AVATAR_MODEL` | `claude-opus-5-5` | Claude model id |
| `AVATAR_EFFORT` | `low` | Claude effort: `low`/`medium`/`high`; higher = more thorough but slower |
| `PORT` | `8787` | |
| `ALLOWED_ORIGINS` | `*` | Comma-separated origins for cross-site embeds |

### Browser support

Chrome and Edge get the full experience (voice in and out). Safari: voice output, with input depending on version. Firefox: voice output and text input. The 3D avatar needs WebGL; otherwise the 2D fallback is used.

---
