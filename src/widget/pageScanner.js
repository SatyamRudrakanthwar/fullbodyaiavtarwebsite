// Builds a compact, LLM-readable map of the page (sections, headings, text,
// buttons, links, form fields) and keeps it fresh with a MutationObserver.

const IGNORE_ATTR = "data-ag-ignore";
const ID_ATTR = "data-ag-id";
const SECTION_SELECTOR = "header, nav, main > *, section, article, aside, footer, form, [data-ag-section]";
const INTERACTIVE_SELECTOR = "a[href], button, input, select, textarea, [role=button], [role=link]";
const FIELD_TYPES_SKIPPED = new Set(["hidden", "submit", "button", "reset", "image"]);

let autoId = 0;

export function idFor(el) {
  if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) return el.id;
  let id = el.getAttribute(ID_ATTR);
  if (!id) {
    id = `ag-${++autoId}`;
    el.setAttribute(ID_ATTR, id);
  }
  return id;
}

export function findById(id) {
  if (!id) return null;
  const clean = String(id).replace(/^#/, "");
  return (
    document.querySelector(`[${ID_ATTR}="${CSS.escape(clean)}"]`) ||
    document.getElementById(clean)
  );
}

function isIgnored(el) {
  return !!el.closest(`[${IGNORE_ATTR}]`);
}

export function isVisible(el) {
  if (!el || !el.isConnected) return false;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function clean(text, max = 160) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function labelFor(field) {
  if (field.labels && field.labels.length) return clean(field.labels[0].innerText, 80);
  const aria = field.getAttribute("aria-label");
  if (aria) return clean(aria, 80);
  const labelledBy = field.getAttribute("aria-labelledby");
  if (labelledBy) {
    const el = document.getElementById(labelledBy);
    if (el) return clean(el.innerText, 80);
  }
  return clean(field.placeholder || field.name || field.type, 80);
}

function hintFor(field) {
  const describedBy = field.getAttribute("aria-describedby");
  if (!describedBy) return "";
  return describedBy
    .split(/\s+/)
    .map((id) => document.getElementById(id))
    .filter((el) => el && el.innerText.trim())
    .map((el) => clean(el.innerText, 140))
    .join(" ");
}

export function fieldStatus(field) {
  const empty = field.type === "checkbox" || field.type === "radio" ? !field.checked : !String(field.value || "").trim();
  // validity.valid, not checkValidity(): the latter fires "invalid" events.
  const invalid = !field.validity.valid || field.getAttribute("aria-invalid") === "true";
  let error = "";
  if (invalid && !empty) {
    error = field.validationMessage || "";
    const describedBy = field.getAttribute("aria-errormessage");
    if (describedBy) {
      const el = document.getElementById(describedBy);
      if (el && el.innerText.trim()) error = clean(el.innerText, 140);
    }
  }
  return { empty, invalid: invalid && !empty, missing: empty && field.required, error };
}

function describeField(field) {
  const parts = [field.tagName === "SELECT" ? "select" : field.tagName === "TEXTAREA" ? "textarea" : field.type || "text"];
  if (field.required) parts.push("required");
  if (field.minLength > 0) parts.push(`min ${field.minLength} chars`);
  if (field.pattern) parts.push(`pattern ${field.pattern}`);
  let line = `field #${idFor(field)} [${parts.join(", ")}] label "${labelFor(field)}"`;
  if (field.placeholder) line += ` placeholder "${clean(field.placeholder, 60)}"`;
  const hint = hintFor(field);
  if (hint) line += ` hint "${hint}"`;
  if (field.tagName === "SELECT") {
    const opts = [...field.options].map((o) => clean(o.text, 30)).filter(Boolean).slice(0, 12);
    line += ` options [${opts.join(" | ")}]`;
  }
  return line;
}

function describeInteractive(el) {
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
    if (FIELD_TYPES_SKIPPED.has(el.type)) {
      if (el.type === "submit" || el.type === "button") return `button #${idFor(el)} "${clean(el.value || "Submit", 60)}"${el.type === "submit" ? " (submits form)" : ""}`;
      return null;
    }
    return describeField(el);
  }
  const text = clean(el.innerText || el.getAttribute("aria-label") || el.title, 70);
  if (!text) return null;
  if (tag === "A") {
    const href = el.getAttribute("href") || "";
    return `link #${idFor(el)} "${text}"${href.startsWith("#") ? ` -> ${href}` : ""}`;
  }
  const submits = tag === "BUTTON" && (el.type === "submit" || !el.getAttribute("type")) && el.form;
  return `button #${idFor(el)} "${text}"${submits ? " (submits form)" : ""}`;
}

// Text of a section that isn't inside nested sections or interactive elements.
function sectionText(section, nestedSections) {
  const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || isIgnored(parent)) return NodeFilter.FILTER_REJECT;
      if (parent.closest("script, style, noscript, template, button, select, label, a")) return NodeFilter.FILTER_REJECT;
      if (nestedSections.some((s) => s !== section && s.contains(parent) && section.contains(s))) return NodeFilter.FILTER_REJECT;
      return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const chunks = [];
  let total = 0;
  while (walker.nextNode() && total < 900) {
    const t = clean(walker.currentNode.textContent, 400);
    chunks.push(t);
    total += t.length;
  }
  return clean(chunks.join(" "), 900);
}

function sectionTitle(section) {
  const heading = section.querySelector("h1, h2, h3, h4, legend");
  if (heading && !isIgnored(heading)) return clean(heading.innerText, 80);
  return clean(section.getAttribute("aria-label") || section.id || section.tagName.toLowerCase(), 80);
}

export class PageScanner {
  constructor({ onChange } = {}) {
    this.onChange = onChange;
    this.version = 0;
    this.snapshot = "";
    this.sections = [];
    this.forms = [];
    this._timer = null;
    this.scan();
    this.observer = new MutationObserver((mutations) => {
      if (mutations.every((m) => isIgnored(m.target.nodeType === 1 ? m.target : m.target.parentElement || document.body))) return;
      if (mutations.every((m) => m.type === "attributes" && m.attributeName === ID_ATTR)) return;
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this.scan(), 600);
    });
    this.observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["hidden", "style", "class", "aria-hidden", "disabled", "required"],
    });
  }

  scan() {
    const sections = [...document.querySelectorAll(SECTION_SELECTOR)].filter(
      (el) => !isIgnored(el) && isVisible(el) && el !== document.body,
    );
    // Keep top-level-ish sections: drop a section whose parent section has the same content.
    const lines = [`PAGE "${clean(document.title, 80)}"`];
    const meta = document.querySelector('meta[name="description"]');
    if (meta?.content) lines.push(`description: ${clean(meta.content, 200)}`);
    const claimed = new Set();
    const forms = [];
    const sectionInfo = [];

    const depthOf = (el) => {
      let d = 0;
      let p = el.parentElement;
      while (p) {
        if (sections.includes(p)) d++;
        p = p.parentElement;
      }
      return d;
    };

    for (const section of sections) {
      const depth = depthOf(section);
      const indent = "  ".repeat(depth);
      const id = idFor(section);
      const kind = section.tagName === "FORM" ? "FORM" : "SECTION";
      lines.push(`${indent}${kind} #${id} "${sectionTitle(section)}"`);
      sectionInfo.push({ id, title: sectionTitle(section), depth, el: section });
      if (section.tagName === "FORM") forms.push(section);

      const text = sectionText(section, sections);
      if (text) lines.push(`${indent}  text: ${text}`);

      for (const h of section.querySelectorAll("h1, h2, h3, h4")) {
        if (claimed.has(h) || isIgnored(h) || !isVisible(h)) continue;
        if (sections.some((s) => s !== section && section.contains(s) && s.contains(h))) continue;
        claimed.add(h);
        lines.push(`${indent}  heading #${idFor(h)} "${clean(h.innerText, 90)}"`);
      }
      for (const el of section.querySelectorAll(INTERACTIVE_SELECTOR)) {
        if (claimed.has(el) || isIgnored(el) || (!isVisible(el) && el.type !== "checkbox")) continue;
        if (sections.some((s) => s !== section && section.contains(s) && s.contains(el))) continue;
        claimed.add(el);
        const line = describeInteractive(el);
        if (line) lines.push(`${indent}  - ${line}`);
      }
    }

    const snapshot = lines.join("\n");
    this.sections = sectionInfo;
    this.forms = forms;
    if (snapshot !== this.snapshot) {
      this.snapshot = snapshot;
      this.version++;
      this.onChange?.(this);
    }
    return snapshot;
  }

  fieldsOf(form) {
    return [...form.querySelectorAll("input, select, textarea")].filter(
      (f) => !FIELD_TYPES_SKIPPED.has(f.type) && !f.disabled && !isIgnored(f) && (isVisible(f) || f.type === "checkbox"),
    );
  }

  // Live state that changes between turns (kept out of the cached snapshot).
  liveState() {
    const lines = [];
    const viewportMid = innerHeight / 2;
    const current = this.sections.find((s) => {
      const r = s.el.getBoundingClientRect();
      return s.depth === 0 && r.top <= viewportMid && r.bottom >= viewportMid;
    });
    if (current) lines.push(`Visitor is currently looking at: #${current.id} "${current.title}"`);
    for (const form of this.forms) {
      const status = this.fieldsOf(form).map((f) => {
        const s = fieldStatus(f);
        const state = s.invalid ? `error: ${s.error || "invalid"}` : s.empty ? "empty" : "filled";
        return `#${idFor(f)} ${state}`;
      });
      if (status.length) lines.push(`Form #${idFor(form)} fields: ${status.join("; ")}`);
    }
    return lines.join("\n");
  }

  // Local keyword search used when the AI service is unreachable.
  bestMatch(query) {
    const STOP = new Set(["where", "what", "how", "can", "the", "this", "that", "show", "find", "does", "you", "your", "for", "and", "with", "about", "page", "please", "tell"]);
    const words = (query.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((w) => !STOP.has(w));
    if (!words.length) return null;
    let best = null;
    let bestScore = 0;
    const candidates = document.querySelectorAll(`h1, h2, h3, label, button, a[href], input, select, textarea, ${SECTION_SELECTOR}`);
    for (const el of candidates) {
      if (isIgnored(el) || !isVisible(el)) continue;
      const own = `${el.id} ${el.getAttribute("aria-label") || ""} ${el.placeholder || ""} ${el.name || ""}`;
      const text = (el.innerText || "").slice(0, 300);
      const hay = `${text} ${own}`.toLowerCase().replace(/[-_]/g, " ");
      let score = 0;
      for (const w of words) {
        if (new RegExp(`\\b${w}`).test(hay)) score += w.length;
        else if (hay.includes(w.slice(0, 4))) score += 1; // "signup" ~ "sign up"
      }
      if (!score) continue;
      // Prefer specific, actionable elements over large containers.
      if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA|H1|H2|H3)$/.test(el.tagName)) score += 2;
      if (el.tagName === "FORM") score += 2;
      score -= Math.min(6, (el.innerText || "").length / 150);
      if (score > bestScore) {
        bestScore = score;
        best = el.tagName === "LABEL" && el.control ? el.control : el;
      }
    }
    return bestScore >= 4 ? best : null;
  }

  destroy() {
    this.observer.disconnect();
    clearTimeout(this._timer);
  }
}
