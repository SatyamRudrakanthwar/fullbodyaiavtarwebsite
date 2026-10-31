// Field-by-field form walkthrough. It watches the visitor fill the form and
// reports progress (field done, field has an error, form complete) to the
// controller, which turns those into spoken guidance. It never types into
// fields or submits the form.

import { fieldStatus, idFor, labelFor } from "./pageScanner.js";

export class FormGuide {
  constructor({ scanner, onEvent }) {
    this.scanner = scanner;
    this.onEvent = onEvent; // ({type, field, next, message}) => void
    this.form = null;
    this.current = null;
    this._handlers = null;
    this._reported = new WeakMap(); // field -> last reported error text
  }

  get active() {
    return !!this.form;
  }

  start(form) {
    this.stop();
    this.form = form;
    // `current` is the field the avatar is guiding, not merely the focused one.
    const onFocus = () => {};
    const onDone = (e) => {
      if (this._isField(e.target)) setTimeout(() => this._evaluate(e.target), 50);
    };
    const onInvalid = (e) => {
      if (this._isField(e.target)) this._reportError(e.target, true);
    };
    const onSubmit = () => {
      this.onEvent({ type: "submitted" });
      this.stop();
    };
    form.addEventListener("focusin", onFocus);
    form.addEventListener("change", onDone);
    form.addEventListener("focusout", onDone);
    form.addEventListener("invalid", onInvalid, true);
    form.addEventListener("submit", onSubmit);
    this._handlers = { onFocus, onDone, onInvalid, onSubmit };
    const first = this._nextField(null);
    this.current = first;
    return first;
  }

  stop() {
    if (!this.form || !this._handlers) {
      this.form = null;
      return;
    }
    const { onFocus, onDone, onInvalid, onSubmit } = this._handlers;
    this.form.removeEventListener("focusin", onFocus);
    this.form.removeEventListener("change", onDone);
    this.form.removeEventListener("focusout", onDone);
    this.form.removeEventListener("invalid", onInvalid, true);
    this.form.removeEventListener("submit", onSubmit);
    this.form = null;
    this.current = null;
    this._handlers = null;
  }

  fields() {
    return this.form ? this.scanner.fieldsOf(this.form) : [];
  }

  _isField(el) {
    return this.fields().includes(el);
  }

  // First field after `after` (in DOM order, wrapping) that still needs attention.
  _nextField(after) {
    const fields = this.fields();
    const needs = (f) => {
      const s = fieldStatus(f);
      return s.invalid || s.empty;
    };
    const start = after ? fields.indexOf(after) + 1 : 0;
    for (let i = 0; i < fields.length; i++) {
      const f = fields[(start + i) % fields.length];
      if (f === after) continue;
      // Optional empty checkboxes (e.g. newsletter) are skipped after the first pass.
      if (!f.required && f.type === "checkbox" && after) continue;
      if (needs(f)) return f;
    }
    return null;
  }

  _evaluate(field) {
    if (!this.form) return;
    const s = fieldStatus(field);
    // Still typing in this field, or just tabbing through an empty one: stay quiet.
    if (document.activeElement === field && field.type !== "checkbox" && field.tagName !== "SELECT") return;
    if (s.invalid) return this._reportError(field, false);
    if (s.empty) return;
    this._reported.delete(field);
    // If the visitor already tabbed into an empty field, guide that one.
    const focused = document.activeElement && this._isField(document.activeElement) ? document.activeElement : null;
    const next = focused && fieldStatus(focused).empty ? focused : this._nextField(field);
    if (!next) {
      this.current = null;
      this.onEvent({ type: "complete", field });
      return;
    }
    if (next === this.current && next !== field) return; // already guiding there
    this.current = next;
    this.onEvent({ type: "next", field, next });
  }

  _reportError(field, fromSubmit) {
    const s = fieldStatus(field);
    const message = s.error || field.validationMessage || "This field needs attention.";
    if (!fromSubmit && this._reported.get(field) === message) return;
    this._reported.set(field, message);
    this.current = field;
    this.onEvent({ type: "error", field, message });
  }

  describe(field) {
    return `#${idFor(field)} "${labelFor(field)}"`;
  }
}
