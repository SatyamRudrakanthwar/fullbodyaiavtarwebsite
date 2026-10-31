// Avatar Guide: a full-body AI avatar that lives on a web page, talks with the
// visitor and walks them through the page. Entry point + controller.

import { STYLES } from "./styles.js";
import { PageScanner, findById, isVisible, labelFor, idFor, fieldStatus } from "./pageScanner.js";
import { Speech } from "./speech.js";
import { Stage } from "./stage.js";
import { Brain } from "./brain.js";
import { FormGuide } from "./formGuide.js";
import { FallbackAvatar } from "./fallbackAvatar.js";

const ICONS = {
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15M13 6l6 6-6 6"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9a4 4 0 0 1 0 6"/></svg>',
  mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 10l4 4M21 10l-4 4"/></svg>',
  minimize: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 12h12"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
  face: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><circle cx="9" cy="10" r="0.8" fill="currentColor"/><circle cx="15" cy="10" r="0.8" fill="currentColor"/></svg>',
};

const DEFAULTS = {
  apiUrl: "",
  modelUrl: "/models/avatar.vrm",
  name: "Ava",
  accent: null,
  autoStart: true,
  handsFree: true, // after a spoken question, listen again once the answer ends
};

export class AvatarGuide {
  constructor(options = {}) {
    this.opts = { ...DEFAULTS, ...options };
    this.mode = "visible"; // visible | minimized | hidden
    this.busy = false;
    this._run = 0; // increments to cancel the current performance
    this._lastViaVoice = false;
    this._started = false;
    this.ready = new Promise((resolve) => (this._resolveReady = resolve));
  }

  async init() {
    this._mountDom();
    this.scanner = new PageScanner();
    this.brain = new Brain({ apiUrl: this.opts.apiUrl, scanner: this.scanner });
    this.speech = new Speech({
      onViseme: (w, e) => this.avatar?.setViseme(w, e),
    });
    this.formGuide = new FormGuide({ scanner: this.scanner, onEvent: (ev) => this._onFormEvent(ev) });

    await this._createAvatar();
    this.stage = new Stage({ avatarEl: this.ui.avatar, avatar: this.avatar, highlightEl: this.ui.highlight, dockEl: this.ui.dock });
    this._layout();
    this._bindUi();
    this._bubbleLoop();

    if (!this.speech.canListen) {
      this.ui.mic.hidden = true;
      this.ui.input.placeholder = `Type a question for ${this.opts.name}…`;
    }
    this._resolveReady();
    if (this.opts.autoStart) this._introduce();
    return this;
  }

  // ---------------------------------------------------------------- DOM

  _mountDom() {
    if (!document.getElementById("ag-styles")) {
      const style = document.createElement("style");
      style.id = "ag-styles";
      style.textContent = STYLES;
      document.head.appendChild(style);
    }
    const root = document.createElement("div");
    root.id = "ag-root";
    root.setAttribute("data-ag-ignore", "");
    root.dataset.mode = "visible";
    if (this.opts.accent) root.style.setProperty("--ag-accent", this.opts.accent);
    const name = escapeHtml(this.opts.name);
    root.innerHTML = `
      <div class="ag-highlight"><span class="ag-hl-label"></span></div>
      <div class="ag-avatar ag-loading" aria-hidden="true"></div>
      <div class="ag-bubble" role="status" aria-live="polite">
        <p class="ag-bubble-text"></p>
        <div class="ag-bubble-actions"></div>
      </div>
      <div class="ag-dock" role="region" aria-label="${name}, page guide">
        <div class="ag-confirm" hidden></div>
        <div class="ag-panel" id="ag-transcript" aria-label="Conversation">
          <div class="ag-panel-head"><span>Conversation</span><button class="ag-link ag-clear" type="button">Clear</button></div>
          <div class="ag-log"></div>
        </div>
        <form class="ag-bar" autocomplete="off">
          <button class="ag-icon ag-mic" type="button" aria-label="Talk to ${name}">${ICONS.mic}</button>
          <label class="ag-sr-only" for="ag-input">Ask ${name}</label>
          <input class="ag-input" id="ag-input" type="text" maxlength="500" placeholder="Ask ${name} or tap the mic…" />
          <button class="ag-icon ag-send" type="submit" aria-label="Send">${ICONS.send}</button>
          <button class="ag-icon ag-stop" type="button" aria-label="Stop talking" hidden>${ICONS.stop}</button>
          <span class="ag-sep"></span>
          <button class="ag-icon ag-log-btn" type="button" aria-label="Show conversation" aria-pressed="false" aria-controls="ag-transcript">${ICONS.chat}</button>
          <button class="ag-icon ag-mute" type="button" aria-label="Mute voice" aria-pressed="false">${ICONS.sound}</button>
          <button class="ag-icon ag-min" type="button" aria-label="Minimize ${name}">${ICONS.minimize}</button>
          <button class="ag-icon ag-hide" type="button" aria-label="Hide ${name}">${ICONS.close}</button>
        </form>
      </div>
      <button class="ag-summon" type="button" aria-label="Bring back ${name}"><span class="ag-summon-face">${ICONS.face}</span>Ask ${name}</button>
      <button class="ag-tab" type="button" aria-label="Show ${name}, the page guide">${name}</button>
    `;
    document.body.appendChild(root);
    const $ = (s) => root.querySelector(s);
    this.ui = {
      root,
      avatar: $(".ag-avatar"),
      bubble: $(".ag-bubble"),
      bubbleText: $(".ag-bubble-text"),
      bubbleActions: $(".ag-bubble-actions"),
      dock: $(".ag-dock"),
      form: $(".ag-bar"),
      input: $(".ag-input"),
      mic: $(".ag-mic"),
      send: $(".ag-send"),
      stop: $(".ag-stop"),
      logBtn: $(".ag-log-btn"),
      panel: $(".ag-panel"),
      log: $(".ag-log"),
      clear: $(".ag-clear"),
      mute: $(".ag-mute"),
      min: $(".ag-min"),
      hide: $(".ag-hide"),
      summon: $(".ag-summon"),
      tab: $(".ag-tab"),
      confirm: $(".ag-confirm"),
      highlight: $(".ag-highlight"),
    };
  }

  async _createAvatar() {
    const el = this.ui.avatar;
    let avatar = null;
    try {
      const { Avatar3D } = await import("./avatar3d.js");
      avatar = new Avatar3D(el, { modelUrl: this.opts.modelUrl });
      await avatar.load();
    } catch (err) {
      console.warn("[avatar-guide] 3D avatar unavailable, using 2D fallback:", err);
      avatar?.destroy?.();
      avatar = new FallbackAvatar(el);
    }
    el.classList.remove("ag-loading");
    this.avatar = avatar;
  }

  _layout() {
    const mobile = innerWidth <= 640;
    this.stage.bottomOffset = mobile ? this.ui.dock.offsetHeight + 16 : 0;
    this.ui.avatar.style.bottom = `${this.stage.bottomOffset}px`;
    this.avatar.resize();
  }

  _bindUi() {
    const ui = this.ui;
    ui.form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = ui.input.value.trim();
      if (!text) return;
      ui.input.value = "";
      this.handleUserInput(text, { viaVoice: false });
    });
    ui.mic.addEventListener("click", () => this.toggleListening());
    ui.stop.addEventListener("click", () => this.interrupt());
    ui.logBtn.addEventListener("click", () => {
      const open = !ui.panel.classList.contains("ag-show");
      ui.panel.classList.toggle("ag-show", open);
      ui.logBtn.setAttribute("aria-pressed", String(open));
      if (open) ui.panel.scrollTop = ui.panel.scrollHeight;
    });
    ui.clear.addEventListener("click", () => {
      this.brain.reset();
      ui.log.innerHTML = "";
      this._log("sys", "Conversation cleared.");
    });
    ui.mute.addEventListener("click", () => {
      this.speech.muted = !this.speech.muted;
      if (this.speech.muted) this.speech.cancel();
      ui.mute.setAttribute("aria-pressed", String(this.speech.muted));
      ui.mute.setAttribute("aria-label", this.speech.muted ? "Unmute voice" : "Mute voice");
      ui.mute.innerHTML = this.speech.muted ? ICONS.mute : ICONS.sound;
    });
    ui.min.addEventListener("click", () => this.minimize());
    ui.hide.addEventListener("click", () => this.hide());
    ui.summon.addEventListener("click", () => this.summon());
    ui.tab.addEventListener("click", () => this.summon());

    addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.mode === "visible" && (this.busy || this.speech.speaking)) this.interrupt();
    });
    addEventListener("resize", () => this._layout());
    document.addEventListener("visibilitychange", () => this._updateRunning());

    // Fade the avatar when the pointer is over it so it never hides content.
    addEventListener(
      "pointermove",
      (e) => {
        if (this.mode !== "visible") return;
        const r = ui.avatar.getBoundingClientRect();
        const half = this.stage.bodyHalf;
        const over = e.clientX > this.stage.x - half && e.clientX < this.stage.x + half && e.clientY > r.top + r.height * 0.05 && e.clientY < r.bottom;
        ui.avatar.classList.toggle("ag-faded", over && !ui.dock.contains(e.target));
      },
      { passive: true },
    );

    // Restore the transcript from this session's memory.
    for (const m of this.brain.history) {
      if (m.content.startsWith("[page event]")) continue;
      this._log(m.role === "user" ? "user" : "bot", m.content.replace(/\s*\[pointed at #[^\]]+\]/g, ""));
    }
  }

  // ------------------------------------------------------- conversation

  async _introduce() {
    this._started = true;
    await this.stage.walkTo(this.stage.homeX());
    if (this.busy || this.mode !== "visible") return; // visitor already asked something
    this.avatar.playGesture("wave", 2.4);
    const returning = this.brain.history.length > 0;
    if (!this.speech.hasActivation) {
      // Speech needs a user gesture first; offer a friendly button.
      this._showBubble(
        returning
          ? `Welcome back! I'm ${this.opts.name}. Want to pick up where we left off?`
          : `Hi! I'm ${this.opts.name}, your guide to this page. I can answer questions, show you around and help with forms.`,
        [
          { label: returning ? "Continue" : "Say hello 👋", primary: true, onClick: () => this._greet(returning) },
          { label: "Not now", onClick: () => this._hideBubble() },
        ],
      );
      return;
    }
    this._greet(returning);
  }

  _greet(returning) {
    this._hideBubble();
    this.ask(
      returning
        ? "[page event] The visitor came back to the page. Welcome them back briefly in one sentence, referring to what you discussed before if relevant."
        : "[page event] The visitor just opened the page guide. Greet them warmly, introduce yourself by name as " +
            this.opts.name +
            ", and give a short intro to what this page is about based on its content (two sentences max). Then invite them to ask anything or say 'walk me through this page'. Use gesture wave on the first step.",
      { event: true, kind: "greet" },
    );
  }

  handleUserInput(text, { viaVoice = false } = {}) {
    if (!this.stage) {
      this.ready.then(() => this.handleUserInput(text, { viaVoice }));
      return;
    }
    if (this.mode !== "visible") this.summon(true);
    this._lastViaVoice = viaVoice;
    this._log("user", text);
    this.ask(text);
  }

  async ask(content, { event = false, kind = "form" } = {}) {
    const run = this.interrupt({ keepGuide: true });
    this.busy = true;
    this._setControls();
    this.avatar.setState("thinking");
    this.avatar.setMood("thinking");
    if (!event) this._showBubble("", [], { thinking: true });
    const reply = await this.brain.ask(content);
    if (run !== this._run) return; // superseded
    if (!reply || (!reply.steps.length && !reply.offline)) {
      this._finish(run);
      return;
    }
    if (!reply.steps.length && reply.offline && event) {
      const fallback = this._eventFallback(kind);
      if (fallback) reply.steps = [fallback];
    }
    await this.perform(reply, run);
  }

  // Executes a reply: walk/point/speak each step, then run the action.
  async perform(reply, run) {
    this.avatar.setMood(reply.mood);
    if (reply.offline) this._log("sys", "AI service unreachable - using offline mode.");

    let action = reply.action;
    let startForm = null;
    if (action === "start_form_guide") {
      startForm = this._resolveForm(reply.actionTarget);
    } else if (action === "stop_form_guide") {
      this.formGuide.stop();
    }

    for (let i = 0; i < reply.steps.length; i++) {
      if (run !== this._run) return;
      await this._runStep(reply.steps[i], run, i === reply.steps.length - 1);
    }
    if (run !== this._run) return;

    if (action === "request_fill") this._requestFill(reply.actionTarget, reply.fillValue);
    if (startForm) {
      this._finish(run, { keepHighlight: true });
      const first = this.formGuide.start(startForm);
      if (first) {
        this.ask(
          `[page event] Form walkthrough started for #${idFor(startForm)}. First field to fill: ${this.formGuide.describe(first)}. Point at it and explain what to enter.`,
          { event: true },
        );
      }
      return;
    }
    this._finish(run, { keepHighlight: this.formGuide.active });
  }

  async _runStep(step, run, isLast) {
    const el = step.target ? findById(step.target) : null;
    const canPoint = el && isVisible(el);
    if (step.target && !canPoint) console.info(`[avatar-guide] target #${step.target} not found or not visible`);

    if (canPoint) {
      this.stage.stopPointTracking();
      this.avatar.setState("idle");
      this._hideBubble();
      await this.stage.scrollTo(el);
      if (run !== this._run) return;
      const spot = this.stage.spotFor(el);
      await this.stage.walkTo(spot);
      if (run !== this._run) return;
      this.stage.highlight(el, this._labelFor(el));
      if (step.gesture !== "none" && step.gesture !== "wave") this.stage.trackPoint(el);
    } else {
      this.stage.stopPointTracking();
    }
    if (step.gesture === "wave") this.avatar.playGesture("wave", 2.4);
    if (step.gesture === "present" && !canPoint) this.avatar.playGesture("present", Math.max(2, step.say.length / 14));

    this.avatar.setState("speaking");
    this._showBubble(step.say);
    this._log("bot", step.say);
    await this.speech.speak(step.say);
    if (run !== this._run) return;
    if (!isLast) await sleep(350);
  }

  _finish(run, { keepHighlight = false } = {}) {
    if (run !== this._run) return;
    this.busy = false;
    this._setControls();
    this.avatar.setState("idle");
    this.avatar.setMood("happy");
    clearTimeout(this._releaseTimer);
    this._releaseTimer = setTimeout(() => {
      if (run !== this._run) return;
      this.stage.stopPointTracking();
      if (!keepHighlight) this.stage.clearHighlight();
    }, keepHighlight ? 1800 : 3500);
    clearTimeout(this._bubbleTimer);
    this._bubbleTimer = setTimeout(() => run === this._run && !this.busy && this._hideBubble(), 6000);

    // Hands-free: keep the voice conversation going.
    if (this.opts.handsFree && this._lastViaVoice && this.speech.canListen && this.mode === "visible" && !this.formGuide.active) {
      this._lastViaVoice = false;
      setTimeout(() => run === this._run && !this.busy && this.startListening(), 400);
    }
  }

  // Stops speech, walking, pending requests. Returns the new run id.
  interrupt({ keepGuide = true } = {}) {
    this._run++;
    this.brain.cancel();
    this.speech.cancel();
    this.stage?.stopWalking();
    this.busy = false;
    clearTimeout(this._releaseTimer);
    if (!keepGuide) this.formGuide.stop();
    this.avatar?.setState("idle");
    this._setControls();
    return this._run;
  }

  // ------------------------------------------------------------- voice

  toggleListening() {
    if (this.speech.listening) return this.speech.stopListening();
    this.startListening();
  }

  startListening() {
    if (!this.speech.canListen) return;
    if (this.busy || this.speech.speaking) this.interrupt(); // barge-in
    const ui = this.ui;
    ui.mic.classList.add("ag-on");
    ui.mic.setAttribute("aria-label", "Stop listening");
    ui.input.placeholder = "Listening…";
    this.avatar.setState("listening");
    this.speech.listen({
      onInterim: (text) => (ui.input.value = text),
      onFinal: (text) => {
        ui.input.value = "";
        this.handleUserInput(text, { viaVoice: true });
      },
      onEnd: (error) => {
        ui.mic.classList.remove("ag-on");
        ui.mic.setAttribute("aria-label", `Talk to ${this.opts.name}`);
        ui.input.placeholder = `Ask ${this.opts.name} or tap the mic…`;
        if (!this.busy) this.avatar.setState("idle");
        if (error === "not-allowed" || error === "service-not-allowed") {
          this._showBubble("I can't hear you because microphone access is blocked. You can allow it in your browser, or just type your question.");
          this._log("sys", "Microphone access blocked.");
        } else if (error === "network") {
          this._showBubble("Voice recognition isn't available right now. Please type your question instead.");
        }
      },
    });
  }

  // -------------------------------------------------------------- forms

  _resolveForm(id) {
    let el = findById(id);
    if (el && el.tagName !== "FORM") el = el.closest("form") || el.querySelector("form");
    return el && el.tagName === "FORM" ? el : this.scanner.forms[0] || null;
  }

  _onFormEvent(ev) {
    const d = (f) => this.formGuide.describe(f);
    let msg = "";
    if (ev.type === "next") {
      msg = `[page event] The visitor finished ${d(ev.field)}. Next field: ${d(ev.next)}. Briefly acknowledge, point at the next field and say what goes there.`;
    } else if (ev.type === "error") {
      msg = `[page event] Field ${d(ev.field)} has a validation error: "${ev.message}". Point at it and help them fix it.`;
    } else if (ev.type === "complete") {
      const submit = this.formGuide.form?.querySelector('button[type=submit], button:not([type]), input[type=submit]');
      msg = `[page event] Every field in the form is now filled in and valid.${submit ? ` Point at the submit button #${idFor(submit)} and tell them they can press it when they're ready.` : ""} Remind them you won't submit it for them.`;
    } else if (ev.type === "submitted") {
      msg = "[page event] The visitor submitted the form themselves. Congratulate them briefly.";
    }
    this._lastEvent = ev;
    if (msg) this.ask(msg, { event: true });
  }

  // Spoken lines used when the AI service is unreachable.
  _eventFallback(kind) {
    if (kind === "greet") {
      const h1 = document.querySelector("h1")?.innerText.trim();
      const desc = document.querySelector('meta[name="description"]')?.content;
      const about = desc || (h1 ? `This page is all about: ${h1}` : "");
      return {
        say: `Hi, I'm ${this.opts.name}! ${about} Ask me anything about this page, or say "walk me through this page".`,
        target: "",
        gesture: "wave",
      };
    }
    const ev = this._lastEvent;
    if (!ev) return null;
    const hint = (f) => {
      const describedBy = f.getAttribute("aria-describedby");
      const text = describedBy ? document.getElementById(describedBy)?.innerText : "";
      return text || (f.placeholder ? `For example: ${f.placeholder}.` : "");
    };
    if (ev.type === "next") return { say: `Nice. Next up is ${labelFor(ev.next)}. ${hint(ev.next)}`, target: idFor(ev.next), gesture: "point" };
    if (ev.type === "error") return { say: `There's a problem with ${labelFor(ev.field)}: ${ev.message}`, target: idFor(ev.field), gesture: "point" };
    if (ev.type === "complete") return { say: "That's everything filled in. Press the submit button whenever you're ready. I won't submit it for you.", target: "", gesture: "present" };
    if (ev.type === "submitted") return { say: "Submitted. Nicely done!", target: "", gesture: "none" };
    return null;
  }

  // Asks the visitor before typing anything on their behalf.
  _requestFill(fieldId, value) {
    const field = findById(fieldId);
    const ui = this.ui;
    if (!field || !/^(INPUT|TEXTAREA|SELECT)$/.test(field.tagName) || field.type === "password" || !value) {
      return;
    }
    ui.confirm.hidden = false;
    ui.confirm.innerHTML = `<p>Allow ${escapeHtml(this.opts.name)} to type <strong></strong> into <strong></strong>?</p>
      <div class="ag-bubble-actions"><button type="button" class="ag-btn ag-allow">Allow</button><button type="button" class="ag-btn ag-secondary ag-deny">No thanks</button></div>`;
    const [v, l] = ui.confirm.querySelectorAll("strong");
    v.textContent = `“${value}”`;
    l.textContent = labelFor(field);
    const close = () => {
      ui.confirm.hidden = true;
      ui.confirm.innerHTML = "";
    };
    ui.confirm.querySelector(".ag-allow").addEventListener("click", () => {
      close();
      setNativeValue(field, value);
      this._log("sys", `Filled “${labelFor(field)}” with your permission.`);
      if (!this.formGuide.active) {
        const s = fieldStatus(field);
        this.ask(`[page event] With the visitor's permission you typed their value into ${this.formGuide.describe(field)}. It is ${s.invalid ? `invalid: ${s.error}` : "valid"}. Confirm briefly.`, { event: true });
      }
    });
    ui.confirm.querySelector(".ag-deny").addEventListener("click", () => {
      close();
      this._log("sys", "Okay, nothing was filled in.");
    });
    ui.confirm.querySelector(".ag-allow").focus();
  }

  // ------------------------------------------------------ minimize/hide

  async minimize() {
    this.interrupt({ keepGuide: false });
    this.stage.clearHighlight();
    this.stage.stopPointTracking();
    this._hideBubble();
    this.mode = "minimized";
    this.ui.root.dataset.mode = "minimized";
    await this.stage.walkTo(innerWidth + this.stage.width, { clamp: false });
    if (this.mode === "minimized") this.ui.avatar.classList.add("ag-away");
    this._updateRunning();
    this.ui.summon.focus();
  }

  hide() {
    this.interrupt({ keepGuide: false });
    this.stage.clearHighlight();
    this.stage.stopPointTracking();
    this._hideBubble();
    this.mode = "hidden";
    this.ui.root.dataset.mode = "hidden";
    this.stage.x = innerWidth + this.stage.width;
    this.stage._apply();
    this._updateRunning();
  }

  async summon(silent = false) {
    if (this.mode === "visible") return;
    this.mode = "visible";
    this.ui.root.dataset.mode = "visible";
    this.ui.avatar.classList.remove("ag-away");
    this._updateRunning();
    this.stage.x = innerWidth + this.stage.width;
    this.stage._apply();
    await this.stage.walkTo(this.stage.homeX());
    if (this.mode !== "visible") return;
    this.ui.input.focus();
    if (!silent && !this.busy) {
      this.avatar.playGesture("wave", 1.6);
      this._showBubble("I'm back! What can I help you with?");
      this._bubbleTimer = setTimeout(() => !this.busy && this._hideBubble(), 4000);
    }
  }

  _updateRunning() {
    this.avatar.setRunning(this.mode !== "hidden" && !document.hidden && !this.ui.avatar.classList.contains("ag-away"));
  }

  // -------------------------------------------------------------- bubble

  _showBubble(text, actions = [], { thinking = false } = {}) {
    const ui = this.ui;
    clearTimeout(this._bubbleTimer);
    ui.bubbleText.textContent = text;
    ui.bubble.classList.toggle("ag-thinking", thinking);
    ui.bubbleActions.innerHTML = "";
    for (const a of actions) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `ag-btn${a.primary ? "" : " ag-secondary"}`;
      b.textContent = a.label;
      b.addEventListener("click", a.onClick);
      ui.bubbleActions.appendChild(b);
    }
    ui.bubbleActions.hidden = !actions.length;
    ui.bubble.classList.add("ag-show");
  }

  _hideBubble() {
    this.ui.bubble.classList.remove("ag-show");
  }

  // Keeps the speech bubble above the avatar's head as it moves.
  _bubbleLoop() {
    const tick = () => {
      requestAnimationFrame(tick);
      const b = this.ui.bubble;
      if (!b.classList.contains("ag-show")) return;
      const a = this.ui.avatar.getBoundingClientRect();
      const bw = b.offsetWidth;
      const bh = b.offsetHeight;
      const headTop = a.top + a.height * 0.04;
      const sideY = Math.max(8, a.top + a.height * 0.05);
      const clampX = (x) => Math.max(8, Math.min(innerWidth - bw - 8, x));
      const half = this.stage.bodyHalf;
      // Above the head first, then beside it; skip spots covering the highlighted target.
      const spots = [
        [clampX(this.stage.x - bw / 2), headTop - bh - 8],
        [clampX(this.stage.x - half - bw - 8), sideY],
        [clampX(this.stage.x + half + 8), sideY],
      ].filter(([, y]) => y >= 8);
      const hl = this.ui.highlight.classList.contains("ag-hl-on") ? this.ui.highlight.getBoundingClientRect() : null;
      const covers = ([x, y]) => hl && x < hl.right && x + bw > hl.left && y < hl.bottom && y + bh > hl.top;
      const [x, y] = spots.find((s) => !covers(s)) || spots[0] || [clampX(this.stage.x - bw / 2), sideY];
      b.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    };
    requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------- helpers

  _setControls() {
    const talking = this.busy || this.speech.speaking;
    this.ui.stop.hidden = !talking;
    this.ui.send.hidden = talking;
  }

  _labelFor(el) {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return labelFor(el);
    return "";
  }

  _log(kind, text) {
    const p = document.createElement("p");
    p.className = `ag-msg ag-${kind}`;
    p.textContent = text;
    this.ui.log.appendChild(p);
    this.ui.panel.scrollTop = this.ui.panel.scrollHeight;
  }
}

function setNativeValue(field, value) {
  if (field.tagName === "SELECT") {
    const opt = [...field.options].find((o) => o.value === value || o.text.trim().toLowerCase() === value.toLowerCase());
    if (opt) field.value = opt.value;
  } else if (field.type === "checkbox" || field.type === "radio") {
    field.checked = /^(true|yes|on|1|checked)$/i.test(value);
  } else {
    const proto = field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(field, value);
  }
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- embed API

let instance = null;

export function init(options = {}) {
  if (instance) return instance;
  instance = new AvatarGuide(options);
  const start = () => instance.init().catch((err) => console.error("[avatar-guide] failed to start:", err));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
  return instance;
}
