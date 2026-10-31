// Text-to-speech with lip-sync, and speech-to-text, on top of the Web Speech API.
// Lip-sync: we build a viseme timeline from the text and advance it with time,
// re-syncing on word boundary events when the voice provides them. If speech
// synthesis is unavailable or muted, the same timeline animates the mouth
// silently so captions and lips still match.

const CHARS_PER_SEC = 14.5;

function visemeFor(ch) {
  switch (ch) {
    case "a": case "h": return { aa: 1 };
    case "e": return { ee: 0.7, ih: 0.3 };
    case "i": case "y": return { ih: 0.9 };
    case "o": return { oh: 1 };
    case "u": case "w": case "q": return { ou: 1 };
    case "m": case "b": case "p": return {};
    case "f": case "v": return { ih: 0.25 };
    case " ": case ",": case ".": case "!": case "?": case ";": case ":": return {};
    default: return /[a-z]/.test(ch) ? { aa: 0.25, ih: 0.2 } : {};
  }
}

export class Speech {
  constructor({ onViseme, onStateChange } = {}) {
    this.onViseme = onViseme;
    this.onStateChange = onStateChange;
    this.synth = window.speechSynthesis || null;
    this.muted = false;
    this.voice = null;
    this.speaking = false;
    this._raf = null;
    this._token = 0;
    if (this.synth) {
      const pick = () => (this.voice = pickVoice(this.synth.getVoices()));
      pick();
      this.synth.addEventListener?.("voiceschanged", pick);
    }

    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.canListen = !!Rec;
    this.Rec = Rec;
    this.listening = false;
  }

  // Browsers block speech until the visitor has interacted with the page.
  get hasActivation() {
    return navigator.userActivation ? navigator.userActivation.hasBeenActive : true;
  }

  get canSpeak() {
    return !!this.synth && !this.muted && !this.blocked && this.hasActivation;
  }

  // Speaks `text`; resolves when finished or cancelled.
  speak(text) {
    this.cancel();
    const token = ++this._token;
    const lower = text.toLowerCase();
    const timeline = { start: performance.now(), offsetChars: 0, offsetTime: 0, rate: CHARS_PER_SEC };
    this.speaking = true;
    this.onStateChange?.(true);

    const animate = () => {
      if (token !== this._token) return (this._raf = null);
      const elapsed = (performance.now() - timeline.start) / 1000;
      const idx = Math.floor(timeline.offsetChars + (elapsed - timeline.offsetTime) * timeline.rate);
      const ch = lower[Math.min(idx, lower.length - 1)] || " ";
      const next = lower[idx + 1] || " ";
      const w = visemeFor(ch);
      const w2 = visemeFor(next);
      const mixed = {};
      for (const k of ["aa", "ih", "ou", "ee", "oh"]) mixed[k] = (w[k] || 0) * 0.75 + (w2[k] || 0) * 0.25;
      const energy = idx < lower.length ? 1 : 0;
      this.onViseme?.(mixed, energy);
      this._raf = requestAnimationFrame(animate);
    };

    return new Promise((resolve) => {
      const finish = () => {
        if (token !== this._token) return resolve();
        this._token++;
        clearTimeout(this._safety);
        cancelAnimationFrame(this._raf);
        this._raf = null;
        this.speaking = false;
        this.onViseme?.({}, 0);
        this.onStateChange?.(false);
        resolve();
      };
      this._finish = finish;

      if (!this.canSpeak) {
        // Silent mode: animate for the estimated duration.
        animate();
        this._silentTimer = setTimeout(finish, (text.length / CHARS_PER_SEC) * 1000 + 300);
        return;
      }

      // Chrome cuts off long utterances; speak sentence by sentence.
      const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
      let charBase = 0;
      let i = 0;
      const speakNext = () => {
        if (token !== this._token) return;
        if (i >= sentences.length) return finish();
        const sentence = sentences[i++];
        const u = new SpeechSynthesisUtterance(sentence);
        if (this.voice) u.voice = this.voice;
        u.rate = 1.03;
        u.pitch = 1.05;
        const base = charBase;
        charBase += sentence.length;
        u.onstart = () => {
          timeline.start = performance.now();
          timeline.offsetChars = base;
          timeline.offsetTime = 0;
          if (!this._raf) animate();
        };
        u.onboundary = (e) => {
          if (e.name && e.name !== "word") return;
          // Re-sync the timeline to the real speech position.
          const elapsed = (performance.now() - timeline.start) / 1000;
          timeline.offsetChars = base + e.charIndex;
          timeline.offsetTime = elapsed;
        };
        u.onend = speakNext;
        u.onerror = (e) => {
          if (e.error === "interrupted" || e.error === "canceled") return;
          // e.g. "not-allowed" or "synthesis-failed": fall back to silent lips.
          console.warn("[avatar-guide] speech synthesis failed:", e.error);
          if (e.error !== "not-allowed") this.blocked = true;
          clearTimeout(this._safety);
          this._silentTimer = setTimeout(finish, (text.length / CHARS_PER_SEC) * 1000);
          if (!this._raf) animate();
        };
        this.synth.speak(u);
      };
      // Safety net in case the engine never fires onend.
      this._safety = setTimeout(finish, (text.length / CHARS_PER_SEC) * 1000 * 2.5 + 4000);
      speakNext();
    });
  }

  cancel() {
    this._token++;
    clearTimeout(this._silentTimer);
    clearTimeout(this._safety);
    cancelAnimationFrame(this._raf);
    this._raf = null;
    if (this.synth && (this.synth.speaking || this.synth.pending)) this.synth.cancel();
    if (this.speaking) {
      this.speaking = false;
      this.onViseme?.({}, 0);
      this.onStateChange?.(false);
    }
    const f = this._finish;
    this._finish = null;
    f?.();
  }

  // Starts one recognition session. Callbacks: onInterim(text), onFinal(text), onEnd(error?)
  listen({ onInterim, onFinal, onEnd }) {
    if (!this.canListen) return onEnd?.("unsupported");
    this.stopListening();
    const rec = new this.Rec();
    rec.lang = document.documentElement.lang || navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = "";
    let error = null;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      onInterim?.((finalText + interim).trim());
    };
    rec.onerror = (e) => {
      error = e.error;
    };
    rec.onend = () => {
      this.listening = false;
      this.rec = null;
      if (finalText.trim()) onFinal?.(finalText.trim());
      onEnd?.(finalText.trim() ? null : error || "no-speech");
    };
    this.rec = rec;
    this.listening = true;
    try {
      rec.start();
    } catch {
      this.listening = false;
      onEnd?.("start-failed");
    }
  }

  stopListening() {
    if (this.rec) {
      try {
        this.rec.stop();
      } catch {
        /* already stopped */
      }
    }
  }
}

function pickVoice(voices) {
  if (!voices.length) return null;
  const lang = (document.documentElement.lang || navigator.language || "en").slice(0, 2);
  const local = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith(lang));
  const pool = local.length ? local : voices;
  const prefs = [/natural/i, /neural/i, /aria|jenny|samantha|google us english|zira/i, /female/i];
  for (const re of prefs) {
    const v = pool.find((v) => re.test(v.name));
    if (v) return v;
  }
  return pool[0];
}
