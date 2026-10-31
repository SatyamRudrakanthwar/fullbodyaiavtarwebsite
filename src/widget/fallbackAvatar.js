// Lightweight 2D full-body avatar used when WebGL is unavailable or the 3D
// model can't load. Same interface as Avatar3D, so the rest of the widget
// doesn't care which one is running.

const SVG = `
<svg viewBox="0 0 200 420" class="ag-fb" aria-hidden="true">
  <ellipse cx="100" cy="412" rx="46" ry="7" fill="rgba(0,0,0,.18)"/>
  <g class="ag-fb-body">
    <g class="ag-fb-leg-l"><rect x="80" y="250" width="18" height="150" rx="9" fill="#2d2a48"/><rect x="74" y="392" width="28" height="12" rx="6" fill="#1d1b29"/></g>
    <g class="ag-fb-leg-r"><rect x="102" y="250" width="18" height="150" rx="9" fill="#2d2a48"/><rect x="98" y="392" width="28" height="12" rx="6" fill="#1d1b29"/></g>
    <path d="M66 150 Q100 132 134 150 L128 262 Q100 272 72 262 Z" fill="var(--ag-accent,#6d4aff)"/>
    <g class="ag-fb-arm-r" style="transform-origin:70px 156px"><rect x="62" y="152" width="16" height="104" rx="8" fill="#f2c9a8"/></g>
    <g class="ag-fb-arm-l" style="transform-origin:130px 156px"><rect x="122" y="152" width="16" height="104" rx="8" fill="#f2c9a8"/></g>
    <rect x="92" y="118" width="16" height="20" fill="#f2c9a8"/>
    <g class="ag-fb-head" style="transform-origin:100px 120px">
      <circle cx="100" cy="88" r="38" fill="#f2c9a8"/>
      <path d="M62 86 Q64 44 100 44 Q138 44 138 86 Q126 62 100 64 Q76 62 62 86 Z" fill="#3b2a26"/>
      <circle class="ag-fb-eye" cx="86" cy="90" r="4" fill="#1d1b29"/>
      <circle class="ag-fb-eye" cx="114" cy="90" r="4" fill="#1d1b29"/>
      <ellipse class="ag-fb-mouth" cx="100" cy="108" rx="8" ry="2" fill="#a0453f"/>
    </g>
  </g>
</svg>`;

export class FallbackAvatar {
  constructor(container) {
    this.container = container;
    container.insertAdjacentHTML("beforeend", SVG);
    this.svg = container.querySelector(".ag-fb");
    this.svg.style.cssText = "width:100%;height:100%;display:block";
    this.parts = {
      body: this.svg.querySelector(".ag-fb-body"),
      armL: this.svg.querySelector(".ag-fb-arm-l"),
      armR: this.svg.querySelector(".ag-fb-arm-r"),
      legL: this.svg.querySelector(".ag-fb-leg-l"),
      legR: this.svg.querySelector(".ag-fb-leg-r"),
      head: this.svg.querySelector(".ag-fb-head"),
      mouth: this.svg.querySelector(".ag-fb-mouth"),
    };
    this.walk = 0;
    this.point = null;
    this.open = 0;
    this.gesture = null;
    this.state = "idle";
    this.running = true;
    this.t = 0;
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  async load() {}
  resize() {}
  setState(s) {
    this.state = s;
  }
  setMood() {}
  setWalk(s) {
    this.walk = s;
  }
  pointAt(x, y) {
    this.point = { x, y };
  }
  stopPointing() {
    this.point = null;
  }
  playGesture(name, duration = 2) {
    this.gesture = name;
    clearTimeout(this._g);
    this._g = setTimeout(() => (this.gesture = null), duration * 1000);
  }
  setViseme(w) {
    this.open = Math.min(1, (w.aa || 0) + (w.oh || 0) * 0.8 + (w.ou || 0) * 0.5 + (w.ih || 0) * 0.4 + (w.ee || 0) * 0.4);
  }
  setRunning(on) {
    const wasRunning = this.running;
    this.running = on;
    if (on && !wasRunning) requestAnimationFrame(this._loop);
  }
  destroy() {
    this.running = false;
    this.svg.remove();
  }

  _loop() {
    if (!this.running) return;
    requestAnimationFrame(this._loop);
    this.t += 1 / 60;
    const p = this.parts;
    const walking = Math.abs(this.walk) > 0.05;
    const s = Math.sin(this.t * 9);
    p.legL.style.transform = walking ? `rotate(${s * 14}deg)` : "";
    p.legR.style.transform = walking ? `rotate(${-s * 14}deg)` : "";
    p.legL.style.transformOrigin = "89px 252px";
    p.legR.style.transformOrigin = "111px 252px";
    p.body.style.transform = `translateY(${walking ? Math.abs(s) * -4 : Math.sin(this.t * 1.6) * 1.2}px)`;
    let armL = walking ? -s * 16 : 6;
    let armR = walking ? s * 16 : -6;
    if (this.gesture === "wave") armR = 150 + Math.sin(this.t * 9) * 18;
    if (this.point && !walking) {
      const r = this.svg.getBoundingClientRect();
      const shoulderY = r.top + (156 / 420) * r.height;
      const toRight = this.point.x > r.left + r.width / 2;
      const sx = r.left + ((toRight ? 130 : 70) / 200) * r.width;
      const ang = (Math.atan2(this.point.y - shoulderY, this.point.x - sx) * 180) / Math.PI;
      if (toRight) armL = ang - 90;
      else armR = ang - 90;
    }
    p.armL.style.transform = `rotate(${armL}deg)`;
    p.armR.style.transform = `rotate(${armR}deg)`;
    const tilt = this.state === "listening" ? 6 : this.state === "thinking" ? -8 : Math.sin(this.t * 0.7) * 2;
    p.head.style.transform = `rotate(${tilt}deg)`;
    p.mouth.setAttribute("ry", String(2 + this.open * 7));
  }
}
