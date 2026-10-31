// Moves the avatar around the viewport, scrolls the page, and highlights
// elements. The avatar stands on the bottom edge of the viewport and walks
// horizontally to stand beside whatever it is explaining.

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export class Stage {
  constructor({ avatarEl, avatar, highlightEl, dockEl }) {
    this.el = avatarEl;
    this.dockEl = dockEl;
    this.avatar = avatar; // Avatar3D or fallback with setWalk/pointAt
    this.highlightEl = highlightEl;
    this.x = innerWidth + 200; // avatar centre, client px (starts off-screen right)
    this._walkToken = 0;
    this._track = null;
    this.bottomOffset = 0;
    this._apply();
    addEventListener("resize", () => {
      this.x = this._clampX(this.x);
      this._apply();
    });
  }

  get width() {
    return this.el.offsetWidth;
  }

  get height() {
    return this.el.offsetHeight;
  }

  // Half-width of the visible body (the canvas is wider to fit the pointing arm).
  get bodyHalf() {
    return this.height * 0.13;
  }

  // Resting spot: bottom-right, just left of the dock on wide screens.
  homeX() {
    const dock = this.dockEl?.getBoundingClientRect();
    if (dock && innerWidth > 900) return this._clampX(dock.left - this.bodyHalf - 12);
    return this._clampX(innerWidth - this.bodyHalf - Math.min(140, innerWidth * 0.08));
  }

  _clampX(x) {
    const m = this.bodyHalf + 8;
    return Math.max(m, Math.min(innerWidth - m, x));
  }

  _apply() {
    this.el.style.transform = `translate3d(${Math.round(this.x - this.width / 2)}px, 0, 0)`;
  }

  // Walks to x with acceleration/deceleration. Resolves when arrived or cancelled.
  walkTo(x, { clamp = true } = {}) {
    const token = ++this._walkToken;
    const target = clamp ? this._clampX(x) : x;
    const start = this.x;
    const dist = target - start;
    if (Math.abs(dist) < 4) return Promise.resolve();
    if (reducedMotion()) {
      this.x = target;
      this._apply();
      return Promise.resolve();
    }
    const speed = Math.max(260, Math.min(520, Math.abs(dist) * 0.9)); // px/s
    const duration = Math.abs(dist) / speed + 0.35;
    const dir = Math.sign(dist);
    // Turn first, then step.
    this.avatar.setWalk(dir * 0.3);
    return new Promise((resolve) => {
      const t0 = performance.now() + 120;
      const tick = (now) => {
        if (token !== this._walkToken) return resolve();
        const p = Math.max(0, Math.min(1, (now - t0) / 1000 / duration));
        // easeInOutSine for position; walk intensity follows velocity.
        const eased = 0.5 - Math.cos(Math.PI * p) / 2;
        const velocity = Math.sin(Math.PI * p);
        this.x = start + dist * eased;
        this._apply();
        this.avatar.setWalk(dir * Math.max(0.3, velocity));
        if (p < 1) requestAnimationFrame(tick);
        else {
          this.avatar.setWalk(0);
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }

  stopWalking() {
    this._walkToken++;
    this.avatar.setWalk(0);
  }

  // Picks a standing spot beside the target that covers as little of it (and of
  // its surrounding form/card) as possible.
  spotFor(el) {
    const rect = el.getBoundingClientRect();
    const container = el.closest("form, .card, article, fieldset") || el;
    const c = container.getBoundingClientRect();
    const zone = {
      left: Math.min(rect.left, c.left),
      right: Math.max(rect.right, c.right),
      top: Math.min(rect.top, c.top),
      bottom: Math.max(rect.bottom, c.bottom),
    };
    const half = this.bodyHalf;
    const gap = 24;
    const avatarTop = innerHeight - this.height - this.bottomOffset;
    const overlapWith = (r, x) => {
      const ox = Math.max(0, Math.min(r.right, x + half) - Math.max(r.left, x - half));
      const oy = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, avatarTop));
      return ox * oy;
    };
    const candidates = [
      zone.right + gap + half,
      zone.left - gap - half,
      rect.right + gap + half,
      rect.left - gap - half,
      rect.right - half, // inside the edges (for full-width targets)
      rect.left + half,
    ].map((x) => this._clampX(x));
    let best = candidates[0];
    let bestScore = Infinity;
    for (const x of candidates) {
      const overlap = overlapWith(rect, x) * 3 + overlapWith(zone, x);
      const reach = Math.abs(x - (rect.left + rect.right) / 2) * 0.05; // prefer nearby
      const travel = Math.abs(x - this.x) * 0.02;
      const score = overlap + reach + travel;
      if (score < bestScore) {
        bestScore = score;
        best = x;
      }
    }
    return best;
  }

  // Scrolls so the element sits in the upper-middle of the viewport.
  async scrollTo(el) {
    const r = el.getBoundingClientRect();
    const avail = innerHeight - this.bottomOffset;
    let top;
    if (r.height > avail * 0.6) top = scrollY + r.top - 80;
    else top = scrollY + r.top + r.height / 2 - avail * 0.42;
    top = Math.max(0, Math.min(top, document.documentElement.scrollHeight - innerHeight));
    if (Math.abs(top - scrollY) < 8) return;
    window.scrollTo({ top, behavior: reducedMotion() ? "auto" : "smooth" });
    await waitForScrollEnd();
  }

  highlight(el, label) {
    this.clearHighlight();
    const hl = this.highlightEl;
    hl.querySelector(".ag-hl-label").textContent = label || "";
    hl.classList.toggle("ag-hl-has-label", !!label);
    hl.classList.add("ag-hl-on");
    const update = () => {
      if (!el.isConnected) return this.clearHighlight();
      const r = el.getBoundingClientRect();
      const pad = 6;
      hl.style.transform = `translate3d(${r.left - pad}px, ${r.top - pad}px, 0)`;
      hl.style.width = `${r.width + pad * 2}px`;
      hl.style.height = `${r.height + pad * 2}px`;
      this._track = requestAnimationFrame(update);
    };
    update();
  }

  clearHighlight() {
    cancelAnimationFrame(this._track);
    this._track = null;
    this.highlightEl.classList.remove("ag-hl-on");
  }

  // Keeps the arm aimed at the element as the page scrolls or resizes.
  trackPoint(el) {
    this.stopPointTracking();
    const point = () => {
      if (!el.isConnected) return this.stopPointTracking();
      // Only the visible part of the element counts.
      const b = el.getBoundingClientRect();
      const r = {
        left: Math.max(0, b.left),
        right: Math.min(innerWidth, b.right),
        top: Math.max(0, b.top),
        bottom: Math.min(innerHeight, b.bottom),
      };
      const w = Math.max(1, r.right - r.left);
      const h = Math.max(1, r.bottom - r.top);
      let x;
      if (this.x < r.left) x = r.left + Math.min(30, w / 3); // near edge, finger doesn't cross it
      else if (this.x > r.right) x = r.right - Math.min(30, w / 3);
      else {
        // Standing in front of a wide element: point into it, away from the body.
        const toward = (r.left + r.right) / 2 < this.x ? -1 : 1;
        x = this.x + toward * Math.min(220, w / 3);
      }
      const y = Math.max(8, Math.min(innerHeight - 8, r.top + Math.min(h / 2, 50)));
      this.avatar.pointAt(x, y);
      this._pointRaf = requestAnimationFrame(point);
    };
    point();
  }

  stopPointTracking() {
    cancelAnimationFrame(this._pointRaf);
    this._pointRaf = null;
    this.avatar.stopPointing();
  }
}

function waitForScrollEnd(timeout = 2000) {
  return new Promise((resolve) => {
    let last = scrollY;
    let still = 0;
    const t0 = performance.now();
    const check = () => {
      if (Math.abs(scrollY - last) < 0.5) still++;
      else still = 0;
      last = scrollY;
      if (still >= 6 || performance.now() - t0 > timeout) resolve();
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}
