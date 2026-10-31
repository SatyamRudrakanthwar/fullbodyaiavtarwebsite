// Full-body VRM avatar rendered with Three.js and animated procedurally.
// Every frame we compute a target pose from layered behaviours (idle, walk,
// talk, think, listen, wave, point) and ease each bone toward it, so switching
// between states never snaps.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

const VISEMES = ["aa", "ih", "ou", "ee", "oh"];
const MOODS = {
  happy: { happy: 0.35 },
  excited: { happy: 0.6, surprised: 0.1 },
  thinking: { relaxed: 0.25 },
  apologetic: { sad: 0.45 },
  neutral: {},
};
const MOOD_EXPRESSIONS = ["happy", "surprised", "relaxed", "sad"];

const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpE = new THREE.Euler();
const X_POS = new THREE.Vector3(1, 0, 0);
const X_NEG = new THREE.Vector3(-1, 0, 0);

const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));
const lerp3 = (a, b, w) => [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];

export class Avatar3D {
  constructor(container, { modelUrl }) {
    this.container = container;
    this.modelUrl = modelUrl;
    this.vrm = null;
    this.state = "idle"; // idle | listening | thinking | speaking
    this.mood = "happy";
    this.walkSpeed = 0; // -1..1, signed horizontal velocity factor
    this.pointTarget = null; // {x, y} in client (viewport) pixels, or null
    this.pointWeight = 0;
    this.gesture = null; // "wave" | "present" | null
    this.gestureUntil = 0;
    this.speechEnergy = 0;
    this.mouth = Object.fromEntries(VISEMES.map((v) => [v, 0]));
    this.mouthTarget = { ...this.mouth };
    this.yaw = 0;
    this.time = 0;
    this.walkPhase = 0;
    this.blinkTimer = 2;
    this.blinkValue = 0;
    this.moodWeights = Object.fromEntries(MOOD_EXPRESSIONS.map((e) => [e, 0]));
    this.running = true;

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.canvas = this.renderer.domElement;
    this.canvas.className = "ag-canvas";
    container.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
    this.camera.position.set(0, 0.9, 5);
    this.camera.lookAt(0, 0.9, 0);

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1.5, 2.5, 3);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbcd4ff, 1.2);
    rim.position.set(-2, 2, -2);
    this.scene.add(rim);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));

    // Soft contact shadow under the feet.
    const shadowTex = makeShadowTexture();
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.9),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.002;
    this.scene.add(this.shadow);

    this.lookTarget = new THREE.Object3D();
    this.scene.add(this.lookTarget);

    this._last = performance.now();
    this.resize();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  async load(onProgress) {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(this.modelUrl, (e) => {
      if (e.total) onProgress?.(e.loaded / e.total);
    });
    const vrm = gltf.userData.vrm;
    if (!vrm) throw new Error("File is not a VRM model");
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.rotateVRM0(vrm);
    vrm.scene.traverse((o) => (o.frustumCulled = false));
    this.scene.add(vrm.scene);
    this.vrm = vrm;
    if (vrm.lookAt) vrm.lookAt.target = this.lookTarget;

    this.bones = {};
    for (const name of Object.keys(vrm.humanoid.humanBones)) {
      const node = vrm.humanoid.getNormalizedBoneNode(name);
      if (node) this.bones[name] = node;
    }
    vrm.update(0);
    const head = vrm.humanoid.getRawBoneNode("head");
    head.getWorldPosition(tmpV);
    this.headHeight = tmpV.y;
    this.modelHeight = tmpV.y + 0.16;
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    const worldH = (this.modelHeight || 1.6) * 1.12;
    const worldW = (worldH * w) / h;
    this.worldW = worldW;
    this.worldH = worldH;
    this.camera.left = -worldW / 2;
    this.camera.right = worldW / 2;
    this.camera.top = worldH - 0.04;
    this.camera.bottom = -0.04;
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }

  // ---- public controls -------------------------------------------------

  setState(state) {
    this.state = state;
  }

  setMood(mood) {
    this.mood = MOODS[mood] ? mood : "neutral";
  }

  setWalk(speed) {
    this.walkSpeed = speed;
  }

  pointAt(clientX, clientY) {
    this.pointTarget = { x: clientX, y: clientY };
  }

  stopPointing() {
    this.pointTarget = null;
  }

  playGesture(name, duration = 2.2) {
    this.gesture = name;
    this.gestureUntil = this.time + duration;
  }

  setViseme(weights, energy) {
    for (const v of VISEMES) this.mouthTarget[v] = weights[v] || 0;
    this.speechEnergy = energy ?? 0;
  }

  setRunning(on) {
    const wasRunning = this.running;
    this.running = on;
    if (on && !wasRunning) {
      this._last = performance.now();
      requestAnimationFrame(this._loop);
    }
  }

  // Where (in client px) the avatar's pointing shoulder is, for choosing a side.
  screenFromWorld(v) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + ((v.x - this.camera.left) / this.worldW) * rect.width,
      y: rect.top + ((this.camera.top - v.y) / this.worldH) * rect.height,
    };
  }

  worldFromScreen(x, y, out) {
    const rect = this.canvas.getBoundingClientRect();
    return out.set(
      this.camera.left + ((x - rect.left) / rect.width) * this.worldW,
      this.camera.top - ((y - rect.top) / rect.height) * this.worldH,
      0,
    );
  }

  // ---- animation -------------------------------------------------------

  _loop() {
    if (!this.running) return;
    requestAnimationFrame(this._loop);
    const now = performance.now();
    const dt = Math.min((now - this._last) / 1000, 0.1);
    this._last = now;
    this.time += dt;
    if (this.vrm) this._animate(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _animate(dt) {
    const t = this.time;
    const b = this.bones;
    const pose = {}; // bone -> [x, y, z] euler (torso, legs, hands, fingers)
    const set = (name, x = 0, y = 0, z = 0) => (pose[name] = [x, y, z]);
    const add = (name, x = 0, y = 0, z = 0) => {
      const p = pose[name] || [0, 0, 0];
      pose[name] = [p[0] + x, p[1] + y, p[2] + z];
    };
    // Arms are posed by direction instead of angles: [outward, up, forward] in
    // the avatar's own space for the upper arm and the forearm.
    const arms = {};
    const arm = (side, upper, lower) => (arms[side] = { upper, lower });

    const walking = Math.abs(this.walkSpeed) > 0.05;
    const walkAmt = Math.min(1, Math.abs(this.walkSpeed));
    if (walking) this.walkPhase += dt * 7.5 * (0.6 + 0.4 * walkAmt);
    const gestureActive = this.gesture && t < this.gestureUntil;
    if (!gestureActive) this.gesture = null;

    // Point with the arm on the target's side (avatar's left arm = screen right).
    let pointSide = null;
    if (this.pointTarget && !walking) {
      const hips = this.screenFromWorld(b.hips.getWorldPosition(tmpV));
      pointSide = this.pointTarget.x >= hips.x ? "left" : "right";
    }
    if (pointSide) this._lastPointSide = pointSide;
    this.pointWeight = damp(this.pointWeight, pointSide ? 1 : 0, 6, dt);

    // --- base idle: breathing, weight shift, relaxed arms
    const breathe = Math.sin(t * 1.6);
    const sway = Math.sin(t * 0.55);
    set("hips", 0, 0, sway * 0.015);
    set("spine", 0.03 + breathe * 0.012, sway * 0.03, -sway * 0.01);
    set("chest", breathe * 0.015, 0, 0);
    set("upperChest", breathe * 0.01, 0, 0);
    set("neck", 0, 0, 0);
    set("head", Math.sin(t * 0.7) * 0.03, Math.sin(t * 0.43) * 0.06, Math.sin(t * 0.31) * 0.02);
    set("leftHand", 0, 0, 0);
    set("rightHand", 0, 0, 0);
    set("leftUpperLeg", 0, 0, -sway * 0.015);
    set("rightUpperLeg", 0, 0, -sway * 0.015);
    set("leftLowerLeg", 0, 0, 0);
    set("rightLowerLeg", 0, 0, 0);
    set("leftFoot", 0, 0, 0);
    set("rightFoot", 0, 0, 0);
    this._fingers(pose, "left", 0.25);
    this._fingers(pose, "right", 0.25);
    const restUpper = [0.3, -0.95, 0.05 + breathe * 0.01];
    const restLower = [0.1, -0.93, 0.32];
    arm("left", restUpper, restLower);
    arm("right", restUpper, restLower);

    // --- state layers
    if (this.state === "listening") {
      add("head", 0.06 + Math.max(0, Math.sin(t * 2.2)) * 0.05, 0, 0.12);
      add("spine", 0.04, 0, 0);
      // Hands loosely together in front.
      arm("left", [0.12, -0.92, 0.35], [-0.55, -0.35, 0.75]);
      arm("right", [0.12, -0.92, 0.35], [-0.55, -0.4, 0.73]);
    } else if (this.state === "thinking") {
      add("head", -0.12, 0.18, 0.1);
      add("spine", -0.02, 0.05, 0);
      // Right hand to chin, left arm folded under it.
      arm("right", [-0.22, -0.66, 0.7], [-0.4, 0.9, -0.1]);
      arm("left", [0.12, -0.82, 0.55], [-0.95, 0.12, 0.3]);
      this._fingers(pose, "right", 0.6);
    } else if (this.state === "speaking") {
      const e = this.speechEnergy;
      const beat = Math.sin(t * 3.1) * 0.5 + 0.5;
      add("head", Math.sin(t * 4.2) * 0.03 * e, Math.sin(t * 1.3) * 0.05, 0);
      add("spine", Math.sin(t * 2.0) * 0.015, Math.sin(t * 0.9) * 0.04, 0);
      // Small conversational beat gestures, hands alternating.
      arm("right", [0.3, -0.88, 0.4], [0.25, -0.15 + beat * 0.35 * e, 1]);
      arm("left", [0.3, -0.88, 0.4], [0.25, -0.15 + (1 - beat) * 0.3 * e, 1]);
      this._fingers(pose, "left", 0.1);
      this._fingers(pose, "right", 0.1);
    }

    // --- gestures
    if (this.gesture === "wave") {
      arm("right", [0.82, 0.42, 0.18], [0.12 + Math.sin(t * 9) * 0.35, 1, 0.12]);
      this._fingers(pose, "right", 0);
      add("head", 0, 0, -0.08);
    } else if (this.gesture === "present" && pointSide !== "right") {
      arm("right", [0.6, -0.62, 0.5], [0.55, -0.05, 0.85]);
      this._fingers(pose, "right", 0.05);
    }

    // --- walking
    const walkW = damp(this._walkW || 0, walking ? 1 : 0, 8, dt);
    this._walkW = walkW;
    if (walkW > 0.01) {
      const p = this.walkPhase;
      const s = Math.sin(p);
      const c = Math.cos(p);
      const mix = (name, x, y, z) => {
        const cur = pose[name] || [0, 0, 0];
        pose[name] = [cur[0] * (1 - walkW) + x * walkW, cur[1] * (1 - walkW) + y * walkW, cur[2] * (1 - walkW) + z * walkW];
      };
      mix("leftUpperLeg", -s * 0.55, 0, 0);
      mix("rightUpperLeg", s * 0.55, 0, 0);
      mix("leftLowerLeg", Math.max(0, -c) * 0.9 + 0.1, 0, 0);
      mix("rightLowerLeg", Math.max(0, c) * 0.9 + 0.1, 0, 0);
      mix("leftFoot", s * 0.2, 0, 0);
      mix("rightFoot", -s * 0.2, 0, 0);
      mix("spine", 0.06, -s * 0.08, 0);
      mix("hips", 0, s * 0.1, 0);
      // Arms swing opposite to the legs.
      const swing = (side, k) => {
        const a = arms[side];
        const walkU = [0.2, -0.97, k * 0.5];
        const walkL = [0.1, -0.85, 0.45 + k * 0.3];
        arms[side] = { upper: lerp3(a.upper, walkU, walkW), lower: lerp3(a.lower, walkL, walkW) };
      };
      swing("left", -s);
      swing("right", s);
    }
    this.vrm.scene.position.y = walkW * Math.abs(Math.cos(this.walkPhase)) * 0.025;

    // --- pointing: index finger out, other fingers curled
    if (this.pointWeight > 0.5 && this._lastPointSide) this._pointFingers(pose, this._lastPointSide);

    // --- facing: turn toward travel direction, or slightly toward pointing target
    let yawTarget = 0;
    if (walking) yawTarget = Math.sign(this.walkSpeed) * 1.15;
    else if (pointSide) yawTarget = pointSide === "left" ? 0.3 : -0.3;
    this.yaw = damp(this.yaw, yawTarget, walking ? 7 : 4, dt);
    this.vrm.scene.rotation.y = this.yaw;
    this.vrm.scene.updateMatrixWorld();

    // --- apply euler pose with easing
    const k = 1 - Math.exp(-9 * dt);
    for (const [name, [x, y, z]] of Object.entries(pose)) {
      const bone = b[name];
      if (!bone) continue;
      tmpQ.setFromEuler(tmpE.set(x, y, z));
      bone.quaternion.slerp(tmpQ, k);
    }

    // --- arms (direction IK), blended with the pointing direction
    if (this.pointTarget && pointSide) this._updateAimDir(pointSide, this.pointTarget);
    for (const side of ["left", "right"]) {
      const a = arms[side];
      const sx = side === "left" ? 1 : -1;
      const up = new THREE.Vector3(a.upper[0] * sx, a.upper[1], a.upper[2]).normalize().applyQuaternion(this.vrm.scene.quaternion);
      const lo = new THREE.Vector3(a.lower[0] * sx, a.lower[1], a.lower[2]).normalize().applyQuaternion(this.vrm.scene.quaternion);
      if (side === this._lastPointSide && this.pointWeight > 0.01 && this._aimDir) {
        up.lerp(this._aimDir, this.pointWeight).normalize();
        lo.lerp(this._aimDir, this.pointWeight).normalize();
      }
      this._poseArm(side, up, lo, side === this._lastPointSide ? 1 - Math.exp(-11 * dt) : k);
    }
    if (this.pointWeight < 0.01 && !pointSide) this._lastPointSide = null;

    // --- look-at: target when pointing, else the viewer
    if (this.pointTarget && this.pointWeight > 0.3) {
      this.worldFromScreen(this.pointTarget.x, this.pointTarget.y, tmpV);
      tmpV.z = 1.2;
    } else if (this.state === "thinking") {
      tmpV.set(0.6, this.headHeight + 0.5, 3);
    } else {
      tmpV.set(Math.sin(t * 0.3) * 0.15, this.headHeight + 0.05, 5);
    }
    this.lookTarget.position.lerp(tmpV, 1 - Math.exp(-6 * dt));

    this._face(dt);
    this.vrm.update(dt);
  }

  _fingers(pose, side, curl) {
    const sign = side === "left" ? -1 : 1;
    for (const f of ["Index", "Middle", "Ring", "Little"]) {
      const extra = f === "Index" ? 0 : f === "Little" ? 0.15 : 0.08;
      for (const seg of ["Proximal", "Intermediate", "Distal"]) {
        pose[`${side}${f}${seg}`] = [0, 0, sign * (curl + extra * (curl > 0.05 ? 1 : 0)) * (seg === "Proximal" ? 1 : 1.3)];
      }
    }
    pose[`${side}ThumbProximal`] = [0, sign * -0.25 * (curl > 0.05 ? 1 : 0.4), 0];
  }

  _pointFingers(pose, side) {
    const sign = side === "left" ? -1 : 1;
    for (const f of ["Index", "Middle", "Ring", "Little"]) {
      for (const seg of ["Proximal", "Intermediate", "Distal"]) {
        pose[`${side}${f}${seg}`] = [0, 0, f === "Index" ? 0 : sign * (seg === "Proximal" ? 1.25 : 1.4)];
      }
    }
    pose[`${side}ThumbProximal`] = [0, sign * -0.5, 0];
  }

  // World-space direction from the shoulder to the target, slightly toward the viewer.
  _updateAimDir(side, target) {
    const upper = this.bones[`${side}UpperArm`];
    if (!upper) return;
    const shoulder = upper.getWorldPosition(new THREE.Vector3());
    const dir = this.worldFromScreen(target.x, target.y, new THREE.Vector3()).sub(shoulder);
    dir.z = 0;
    if (dir.lengthSq() < 1e-6) dir.set(side === "left" ? 1 : -1, 0, 0);
    dir.normalize();
    // Don't let the arm cross the body or point into the floor.
    if (side === "left" && dir.x < 0.2) dir.x = 0.2;
    if (side === "right" && dir.x > -0.2) dir.x = -0.2;
    dir.y = Math.max(dir.y, -0.7);
    dir.z = 0.3;
    this._aimDir = dir.normalize();
  }

  // Rotates upper arm and forearm so they point along the given world directions.
  _poseArm(side, upperDir, lowerDir, k) {
    const upper = this.bones[`${side}UpperArm`];
    const lower = this.bones[`${side}LowerArm`];
    if (!upper || !lower) return;
    const rest = side === "left" ? X_POS : X_NEG;
    const parentQ = upper.parent.getWorldQuaternion(new THREE.Quaternion());
    const qUpper = new THREE.Quaternion().setFromUnitVectors(rest, upperDir.clone().applyQuaternion(parentQ.clone().invert()));
    upper.quaternion.slerp(qUpper, k);
    // Forearm is solved relative to the *target* upper-arm orientation so the
    // two easings don't fight each other.
    const upperWorld = parentQ.multiply(qUpper);
    const qLower = new THREE.Quaternion().setFromUnitVectors(rest, lowerDir.clone().applyQuaternion(upperWorld.invert()));
    lower.quaternion.slerp(qLower, k);
  }

  _face(dt) {
    const em = this.vrm.expressionManager;
    if (!em) return;
    // Blinking
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkValue = 1;
      this.blinkTimer = 2 + Math.random() * 3.5;
    }
    this.blinkValue = Math.max(0, this.blinkValue - dt * 7);
    const blink = this.blinkValue > 0 ? Math.sin(this.blinkValue * Math.PI) : 0;

    // Mood (softened while talking so it doesn't fight the mouth shapes)
    const speaking = this.state === "speaking";
    const mood = MOODS[this.state === "thinking" ? "thinking" : this.mood] || {};
    for (const e of MOOD_EXPRESSIONS) {
      const target = (mood[e] || 0) * (speaking ? 0.45 : 1);
      this.moodWeights[e] = damp(this.moodWeights[e], target, 5, dt);
      em.setValue(e, this.moodWeights[e]);
    }
    em.setValue("blink", Math.min(1, blink * (1 - this.moodWeights.happy * 0.5)));

    // Lip sync
    let total = 0;
    for (const v of VISEMES) {
      this.mouth[v] = damp(this.mouth[v], this.mouthTarget[v], 22, dt);
      total += this.mouth[v];
    }
    const scale = total > 1 ? 1 / total : 1;
    for (const v of VISEMES) em.setValue(v, this.mouth[v] * scale);
  }

  destroy() {
    this.running = false;
    this.renderer.dispose();
    this.canvas.remove();
  }
}

function makeShadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, "rgba(0,0,0,0.35)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
