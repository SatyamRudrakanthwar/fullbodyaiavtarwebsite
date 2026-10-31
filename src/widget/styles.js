// Widget styles, scoped under #ag-root so they never leak into the host page.
// Themeable via CSS variables: --ag-accent, --ag-accent-ink, --ag-surface, --ag-ink.

export const STYLES = `
#ag-root {
  --ag-accent: #6d4aff;
  --ag-accent-ink: #ffffff;
  --ag-surface: #ffffff;
  --ag-ink: #1d1b29;
  --ag-muted: #6b6880;
  --ag-line: rgba(29, 27, 41, 0.12);
  --ag-shadow: 0 10px 30px rgba(20, 16, 50, 0.18), 0 2px 6px rgba(20, 16, 50, 0.08);
  --ag-dock-w: 430px;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 15px;
  line-height: 1.4;
  color: var(--ag-ink);
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147483000;
}
#ag-root *, #ag-root *::before, #ag-root *::after { box-sizing: border-box; }
#ag-root [hidden] { display: none !important; }
#ag-root button { font: inherit; cursor: pointer; }

/* ---- avatar ---- */
#ag-root .ag-avatar {
  position: fixed;
  left: 0;
  bottom: 0;
  height: clamp(260px, 54vh, 520px);
  aspect-ratio: 0.95;
  pointer-events: none;
  transition: opacity 0.35s ease, filter 0.35s ease;
  will-change: transform;
}
#ag-root .ag-canvas { width: 100%; height: 100%; display: block; }
#ag-root .ag-avatar.ag-faded { opacity: 0.22; }
#ag-root .ag-avatar.ag-loading::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: 18%;
  width: 34px;
  height: 34px;
  margin-left: -17px;
  border-radius: 50%;
  border: 3px solid var(--ag-line);
  border-top-color: var(--ag-accent);
  animation: ag-spin 0.9s linear infinite;
}
@keyframes ag-spin { to { transform: rotate(360deg); } }

/* ---- speech bubble ---- */
#ag-root .ag-bubble {
  position: fixed;
  left: 0;
  top: 0;
  max-width: min(320px, calc(100vw - 32px));
  padding: 12px 16px;
  background: var(--ag-surface);
  color: var(--ag-ink);
  border-radius: 18px;
  box-shadow: var(--ag-shadow);
  pointer-events: auto;
  opacity: 0;
  transform: translateY(6px) scale(0.98);
  transition: opacity 0.25s ease, transform 0.25s ease;
  visibility: hidden;
}
#ag-root .ag-bubble.ag-show { opacity: 1; visibility: visible; transform: none; }
#ag-root .ag-bubble-text { margin: 0; }
#ag-root .ag-bubble-text .ag-spoken { color: var(--ag-ink); }
#ag-root .ag-bubble-text .ag-unspoken { color: var(--ag-muted); opacity: 0.55; }
#ag-root .ag-bubble.ag-thinking .ag-bubble-text::after {
  content: "";
  display: inline-block;
  width: 26px;
  height: 8px;
  background: radial-gradient(circle, var(--ag-muted) 3px, transparent 3.5px) 0 0 / 9px 8px repeat-x;
  animation: ag-dots 1s steps(4) infinite;
}
@keyframes ag-dots { from { width: 0; } to { width: 27px; } }
#ag-root .ag-bubble-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }

#ag-root .ag-btn {
  border: 0;
  border-radius: 999px;
  padding: 8px 14px;
  background: var(--ag-accent);
  color: var(--ag-accent-ink);
  font-weight: 600;
}
#ag-root .ag-btn.ag-secondary { background: transparent; color: var(--ag-ink); box-shadow: inset 0 0 0 1.5px var(--ag-line); }
#ag-root .ag-btn:focus-visible, #ag-root .ag-icon:focus-visible, #ag-root .ag-input:focus-visible {
  outline: 2px solid var(--ag-accent);
  outline-offset: 2px;
}

/* ---- dock ---- */
#ag-root .ag-dock {
  position: fixed;
  right: 16px;
  bottom: 16px;
  width: var(--ag-dock-w);
  max-width: calc(100vw - 32px);
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: opacity 0.25s ease, transform 0.25s ease;
}
#ag-root .ag-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px;
  background: var(--ag-surface);
  border-radius: 999px;
  box-shadow: var(--ag-shadow);
}
#ag-root .ag-input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  padding: 8px 10px;
  font: inherit;
  color: var(--ag-ink);
  outline: none;
}
#ag-root .ag-input::placeholder { color: var(--ag-muted); }
#ag-root .ag-icon {
  flex: none;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: transparent;
  color: var(--ag-muted);
}
#ag-root .ag-icon:hover { background: rgba(109, 74, 255, 0.08); color: var(--ag-ink); }
#ag-root .ag-icon svg { width: 20px; height: 20px; }
#ag-root .ag-mic { background: var(--ag-accent); color: var(--ag-accent-ink); width: 44px; height: 44px; }
#ag-root .ag-mic:hover { background: var(--ag-accent); color: var(--ag-accent-ink); filter: brightness(1.1); }
#ag-root .ag-mic.ag-on { animation: ag-pulse 1.2s ease-in-out infinite; background: #e5484d; }
@keyframes ag-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(229, 72, 77, 0.45); } 50% { box-shadow: 0 0 0 10px rgba(229, 72, 77, 0); } }
#ag-root .ag-icon[aria-pressed="true"] { color: var(--ag-accent); }
#ag-root .ag-sep { width: 1px; height: 22px; background: var(--ag-line); margin: 0 2px; }

#ag-root .ag-panel {
  background: var(--ag-surface);
  border-radius: 16px;
  box-shadow: var(--ag-shadow);
  max-height: 40vh;
  overflow-y: auto;
  padding: 12px;
  display: none;
}
#ag-root .ag-panel.ag-show { display: block; }
#ag-root .ag-msg { margin: 0 0 8px; padding: 8px 12px; border-radius: 14px; max-width: 88%; width: fit-content; }
#ag-root .ag-msg.ag-user { margin-left: auto; background: var(--ag-accent); color: var(--ag-accent-ink); }
#ag-root .ag-msg.ag-bot { background: rgba(109, 74, 255, 0.08); }
#ag-root .ag-msg.ag-sys { font-size: 13px; color: var(--ag-muted); background: none; padding: 2px 4px; }
#ag-root .ag-panel-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-weight: 600; }
#ag-root .ag-link { border: 0; background: none; color: var(--ag-accent); font-weight: 600; padding: 4px; }

#ag-root .ag-confirm {
  background: var(--ag-surface);
  border-radius: 16px;
  box-shadow: var(--ag-shadow);
  padding: 14px 16px;
  border-left: 4px solid var(--ag-accent);
}
#ag-root .ag-confirm p { margin: 0 0 10px; }

/* ---- minimized / hidden ---- */
#ag-root .ag-summon {
  position: fixed;
  right: 16px;
  bottom: 16px;
  height: 56px;
  padding: 0 20px 0 8px;
  border: 0;
  border-radius: 999px;
  background: var(--ag-accent);
  color: var(--ag-accent-ink);
  box-shadow: var(--ag-shadow);
  display: none;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  pointer-events: auto;
}
#ag-root .ag-summon-face { width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.2); display: grid; place-items: center; }
#ag-root .ag-summon-face svg { width: 26px; height: 26px; }
#ag-root .ag-tab {
  position: fixed;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  border: 0;
  border-radius: 10px 0 0 10px;
  padding: 12px 6px;
  background: var(--ag-accent);
  color: var(--ag-accent-ink);
  writing-mode: vertical-rl;
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.04em;
  pointer-events: auto;
  display: none;
  opacity: 0.85;
}
#ag-root[data-mode="minimized"] .ag-summon { display: flex; }
#ag-root[data-mode="hidden"] .ag-tab { display: block; }
#ag-root[data-mode="minimized"] .ag-dock,
#ag-root[data-mode="hidden"] .ag-dock,
#ag-root[data-mode="minimized"] .ag-bubble,
#ag-root[data-mode="hidden"] .ag-bubble { opacity: 0; visibility: hidden; pointer-events: none; }
#ag-root[data-mode="hidden"] .ag-avatar,
#ag-root[data-mode="minimized"] .ag-avatar.ag-away { opacity: 0; }

/* ---- highlight ---- */
#ag-root .ag-highlight {
  position: fixed;
  left: 0;
  top: 0;
  border-radius: 12px;
  pointer-events: none;
  opacity: 0;
  box-shadow: 0 0 0 3px var(--ag-accent), 0 0 0 9999px rgba(15, 12, 40, 0);
  transition: opacity 0.3s ease, box-shadow 0.4s ease;
}
#ag-root .ag-highlight.ag-hl-on {
  opacity: 1;
  box-shadow: 0 0 0 3px var(--ag-accent), 0 0 24px 6px color-mix(in srgb, var(--ag-accent) 45%, transparent), 0 0 0 9999px rgba(15, 12, 40, 0.12);
  animation: ag-glow 1.6s ease-in-out infinite;
}
@keyframes ag-glow { 50% { box-shadow: 0 0 0 4px var(--ag-accent), 0 0 34px 10px color-mix(in srgb, var(--ag-accent) 30%, transparent), 0 0 0 9999px rgba(15, 12, 40, 0.12); } }
#ag-root .ag-hl-label {
  position: absolute;
  left: 0;
  top: -30px;
  background: var(--ag-accent);
  color: var(--ag-accent-ink);
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  white-space: nowrap;
  display: none;
}
#ag-root .ag-highlight.ag-hl-has-label .ag-hl-label { display: block; }

.ag-sr-only { position: absolute !important; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

@media (max-width: 640px) {
  #ag-root .ag-dock { left: 12px; right: 12px; bottom: 12px; width: auto; max-width: none; }
  #ag-root .ag-avatar { height: clamp(180px, 30vh, 280px); }
  #ag-root .ag-log-btn, #ag-root .ag-sep { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  #ag-root * { animation: none !important; transition: none !important; }
}
`;
