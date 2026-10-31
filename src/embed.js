// Drop-in embed entry. Usage on any page:
//
//   <script src="https://your-host/avatar-guide.js"
//           data-api="https://your-host"
//           data-name="Ava" data-accent="#6d4aff" defer></script>
//
// or, for full control: <script src=".../avatar-guide.js" data-manual></script>
// followed by AvatarGuide.init({ apiUrl, modelUrl, name, accent }).

import { init as initGuide, AvatarGuide } from "./widget/index.js";

const script = document.currentScript;
const base = script?.src ? new URL(".", script.src).href : `${location.origin}/`;

function initFromScript(overrides = {}) {
  const d = script?.dataset ?? {};
  return initGuide({
    apiUrl: d.api ?? new URL(base).origin,
    modelUrl: d.model ?? new URL("models/avatar.vrm", base).href,
    name: d.name ?? "Ava",
    accent: d.accent ?? null,
    autoStart: d.autoStart !== "false",
    ...overrides,
  });
}

if (script && !("manual" in script.dataset)) initFromScript();

// Manual init uses the same script-relative defaults (e.g. model URL).
export { initFromScript as init, AvatarGuide };
