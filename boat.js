// aBeam — boat.js
// Interactive 3D sloop, built procedurally with Three.js (no model files, no fetches).
// Exposes: initBoat({ stageEl, panelEl, chipsEl, hotspots, reducedMotion, ui }) → { selectZone, destroy } | null

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ hull maths */
const L = 10.4;          // length overall, metres (~34 ft)
const BEAM = 1.72;       // max half-beam
const STAGE_BG = 0x0b1f3a;

const tx = (t) => -L / 2 + t * L;                       // station → x (bow at +x)
function halfBeam(t) {
  const c = 0.55;
  const d = t < c ? (c - t) / 0.62 : (t - c) / 0.4525;
  return BEAM * Math.sqrt(Math.max(0.006, 1 - d * d));
}
function sheer(t) {
  return 0.78 + (t > 0.35 ? 0.24 * ((t - 0.35) / 0.65) ** 2 : 0.06 * ((0.35 - t) / 0.35) ** 2);
}
function depth(t) { return 0.18 + 0.55 * Math.sin(Math.PI * t) ** 0.8; }
function widthAt(t, y) {
  const u = Math.min(1, Math.max(0, (y + depth(t)) / (sheer(t) + depth(t))));
  return halfBeam(t) * Math.sin((Math.PI / 2) * u) ** 0.72;
}

function loftBand(yLo, yHi, rows, stations) {
  const parts = [];
  for (const side of [1, -1]) {
    const pos = [];
    const idx = [];
    for (let i = 0; i <= stations; i++) {
      const t = i / stations;
      const lo = yLo(t), hi = yHi(t);
      for (let j = 0; j <= rows; j++) {
        const y = lo + (hi - lo) * (j / rows);
        pos.push(tx(t), y, side * widthAt(t, y));
      }
    }
    const cols = rows + 1;
    for (let i = 0; i < stations; i++) {
      for (let j = 0; j < rows; j++) {
        const a = i * cols + j, b = a + cols, c = a + 1, d = b + 1;
        if (side === 1) idx.push(a, b, c, c, b, d); else idx.push(a, c, b, c, d, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g);
  }
  return mergeGeometries(parts, false);
}

function transomGeometry() {
  const t = 0, pts = [];
  const rows = 10;
  for (let j = rows; j >= 0; j--) { const y = -depth(t) + (sheer(t) + depth(t)) * (j / rows); pts.push(new THREE.Vector2(-widthAt(t, y), y)); }
  for (let j = 1; j <= rows; j++) { const y = -depth(t) + (sheer(t) + depth(t)) * (j / rows); pts.push(new THREE.Vector2(widthAt(t, y), y)); }
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts));
  g.rotateY(-Math.PI / 2);
  g.translate(tx(0) + 0.002, 0, 0);
  return g;
}

const COCKPIT = { x0: -3.55, x1: -1.25, z: 0.72, floorY: 0.44 };

function deckGeometry() {
  const N = 40;
  const shape = new THREE.Shape();
  for (let i = 0; i <= N; i++) { const t = i / N; const p = new THREE.Vector2(tx(t), halfBeam(t) - 0.005); i === 0 ? shape.moveTo(p.x, p.y) : shape.lineTo(p.x, p.y); }
  for (let i = N; i >= 0; i--) { const t = i / N; shape.lineTo(tx(t), -(halfBeam(t) - 0.005)); }
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(COCKPIT.x0, -COCKPIT.z); hole.lineTo(COCKPIT.x1, -COCKPIT.z); hole.lineTo(COCKPIT.x1, COCKPIT.z); hole.lineTo(COCKPIT.x0, COCKPIT.z); hole.closePath();
  shape.holes.push(hole);
  const g = new THREE.ShapeGeometry(shape, 1);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const t = Math.min(1, Math.max(0, (x + L / 2) / L));
    const hb = Math.max(0.05, halfBeam(t));
    const camber = 0.05 * (1 - Math.min(1, (z / hb) ** 2));
    p.setY(i, sheer(t) - 0.01 + camber);
  }
  g.computeVertexNormals();
  return g;
}

function railCurve(side, yOffset, inset, t0 = 0.015, t1 = 0.985) {
  const pts = [];
  const n = 36;
  for (let i = 0; i <= n; i++) {
    const t = t0 + (t1 - t0) * (i / n);
    const y = sheer(t) + yOffset;
    const w = Math.max(0.02, widthAt(t, Math.min(y, sheer(t))) - inset);
    pts.push(new THREE.Vector3(tx(t), y, side * w));
  }
  return new THREE.CatmullRomCurve3(pts);
}

function canvasRadial(size, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------------ boat */
function buildBoat() {
  const group = new THREE.Group();
  const occluders = [];

  const gelcoat = new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.42, metalness: 0.04 });
  const deckPaint = new THREE.MeshStandardMaterial({ color: 0xece7dc, roughness: 0.62, metalness: 0.02 });
  const navy = new THREE.MeshStandardMaterial({ color: 0x12305a, roughness: 0.55, metalness: 0.05 });
  const canvasNavy = new THREE.MeshStandardMaterial({ color: 0x14345f, roughness: 0.85, metalness: 0 });
  const under = new THREE.MeshStandardMaterial({ color: 0x0d1d33, roughness: 0.7 });
  const teak = new THREE.MeshStandardMaterial({ color: 0xb9814b, roughness: 0.58, metalness: 0.02 });
  const teakDeep = new THREE.MeshStandardMaterial({ color: 0x9a6636, roughness: 0.62 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xd6dbe2, roughness: 0.32, metalness: 0.75 });
  const smoked = new THREE.MeshStandardMaterial({ color: 0x0f1620, roughness: 0.18, metalness: 0.35 });
  const charcoal = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.5, metalness: 0.3 });

  // hull bands
  const topsides = new THREE.Mesh(loftBand(() => 0.14, sheer, 8, 40), gelcoat);
  const stripe = new THREE.Mesh(loftBand(() => -0.03, () => 0.14, 2, 40), navy);
  const underwater = new THREE.Mesh(loftBand((t) => -depth(t), () => -0.03, 5, 40), under);
  const transom = new THREE.Mesh(transomGeometry(), gelcoat);
  group.add(topsides, stripe, underwater, transom);
  occluders.push(topsides, transom);

  // deck with cockpit well
  const deck = new THREE.Mesh(deckGeometry(), deckPaint);
  group.add(deck);
  occluders.push(deck);
  const cl = COCKPIT.x1 - COCKPIT.x0, cw = COCKPIT.z * 2, cd = 0.8 - COCKPIT.floorY;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(cl, 0.03, cw), teak);
  floor.position.set((COCKPIT.x0 + COCKPIT.x1) / 2, COCKPIT.floorY, 0);
  const wallF = new THREE.Mesh(new THREE.BoxGeometry(0.04, cd, cw), deckPaint); wallF.position.set(COCKPIT.x1 - 0.02, COCKPIT.floorY + cd / 2, 0);
  const wallA = new THREE.Mesh(new THREE.BoxGeometry(0.04, cd, cw), deckPaint); wallA.position.set(COCKPIT.x0 + 0.02, COCKPIT.floorY + cd / 2, 0);
  const wallP = new THREE.Mesh(new THREE.BoxGeometry(cl, cd, 0.04), deckPaint); wallP.position.set((COCKPIT.x0 + COCKPIT.x1) / 2, COCKPIT.floorY + cd / 2, -COCKPIT.z + 0.02);
  const wallS = wallP.clone(); wallS.position.z = COCKPIT.z - 0.02;
  group.add(floor, wallF, wallA, wallP, wallS);
  for (const s of [1, -1]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(cl - 0.3, 0.05, 0.34), teak);
    seat.position.set((COCKPIT.x0 + COCKPIT.x1) / 2 + 0.05, COCKPIT.floorY + 0.24, s * (COCKPIT.z - 0.19));
    group.add(seat);
    const coam = new THREE.Mesh(new THREE.BoxGeometry(cl + 0.1, 0.16, 0.06), gelcoat);
    coam.position.set((COCKPIT.x0 + COCKPIT.x1) / 2, 0.87, s * (COCKPIT.z + 0.03));
    group.add(coam);
  }
  const coamF = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, cw + 0.12), gelcoat); coamF.position.set(COCKPIT.x1 + 0.03, 0.87, 0); group.add(coamF);
  // wheel + pedestal
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.62, 12), charcoal); ped.position.set(-2.85, COCKPIT.floorY + 0.31, 0); group.add(ped);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.026, 10, 40), charcoal); wheel.rotation.y = Math.PI / 2; wheel.position.set(-2.85, COCKPIT.floorY + 0.62 + 0.36, 0); group.add(wheel);
  for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.78, 6), charcoal); sp.rotation.x = (i / 4) * Math.PI; sp.position.copy(wheel.position); group.add(sp); }

  // trunk cabin
  const trunk = new THREE.Shape();
  const ax = -1.0, fx = 2.75, aw = 1.06, fw = 0.72, r = 0.28;
  trunk.moveTo(ax, -aw); trunk.lineTo(fx - r, -fw); trunk.quadraticCurveTo(fx, -fw, fx, -fw + r); trunk.lineTo(fx, fw - r); trunk.quadraticCurveTo(fx, fw, fx - r, fw); trunk.lineTo(ax, aw); trunk.closePath();
  const trunkGeo = new THREE.ExtrudeGeometry(trunk, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 8 });
  trunkGeo.rotateX(-Math.PI / 2);
  const cabin = new THREE.Mesh(trunkGeo, gelcoat);
  cabin.position.y = 0.83;
  group.add(cabin);
  occluders.push(cabin);
  // port lights, handrails, companionway
  for (const s of [1, -1]) {
    [0.0, 0.85, 1.7].forEach((x) => {
      const w = aw - ((x - ax) / (fx - ax)) * (aw - fw);
      const pl = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.15, 0.02), smoked);
      pl.position.set(x, 1.1, s * (w + 0.045));
      pl.rotation.y = s * Math.atan2(aw - fw, fx - ax);
      group.add(pl);
    });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 0.05), teak);
    rail.position.set(0.85, 1.42, s * 0.55);
    group.add(rail);
  }
  const compOpen = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.44, 0.6), smoked); compOpen.position.set(ax - 0.015, 1.07, 0); group.add(compOpen);
  const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.68), teakDeep); hatch.position.set(ax + 0.42, 1.41, 0); group.add(hatch);
  const steps = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.5), teakDeep); steps.position.set(ax - 0.18, COCKPIT.floorY + 0.2, 0); group.add(steps);

  // toe rails, rub rails
  for (const s of [1, -1]) {
    group.add(new THREE.Mesh(new THREE.TubeGeometry(railCurve(s, 0.03, 0.03), 80, 0.045, 8, false), teak));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(railCurve(s, -0.15, -0.015, 0.03, 0.985), 80, 0.03, 8, false), teak));
  }

  // stanchions + lifelines + pulpits
  const lineMat = new THREE.LineBasicMaterial({ color: 0xaab3bf });
  for (const s of [1, -1]) {
    const tops = [], mids = [];
    [0.12, 0.28, 0.45, 0.62, 0.79].forEach((t) => {
      const x = tx(t), y = sheer(t), z = s * (halfBeam(t) - 0.07);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.62, 6), steel);
      st.position.set(x, y + 0.31, z);
      group.add(st);
      tops.push(new THREE.Vector3(x, y + 0.62, z));
      mids.push(new THREE.Vector3(x, y + 0.34, z));
    });
    const bowT = 0.92, sternT = 0.04;
    const bowPt = new THREE.Vector3(tx(bowT), sheer(bowT) + 0.62, s * (halfBeam(bowT) - 0.07));
    const sternPt = new THREE.Vector3(tx(sternT), sheer(sternT) + 0.62, s * (halfBeam(sternT) - 0.07));
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([sternPt, ...tops, bowPt]), lineMat));
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([sternPt.clone().setY(sheer(sternT) + 0.34), ...mids, bowPt.clone().setY(sheer(bowT) + 0.34)]), lineMat));
  }
  const pulpitPts = [];
  for (const s of [1, -1]) {
    const t = 0.92; pulpitPts.push(new THREE.Vector3(tx(t), sheer(t) + 0.62, s * (halfBeam(t) - 0.07)));
    pulpitPts.push(new THREE.Vector3(tx(0.985), sheer(0.985) + 0.62, s * 0.16));
    if (s === 1) pulpitPts.push(new THREE.Vector3(tx(1) + 0.08, sheer(1) + 0.62, 0));
  }
  group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pulpitPts, false, 'catmullrom', 0.2), 40, 0.017, 6, false), steel));
  const sternPts = [];
  for (const s of [1, -1]) {
    const t = 0.04; sternPts.push(new THREE.Vector3(tx(t), sheer(t) + 0.62, s * (halfBeam(t) - 0.07)));
    sternPts.push(new THREE.Vector3(tx(0) + 0.06, sheer(0) + 0.62, s * 0.55));
  }
  group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sternPts, false, 'catmullrom', 0.2), 30, 0.017, 6, false), steel));
  [[tx(0.985), 0.16], [tx(0.985), -0.16], [tx(0) + 0.06, 0.55], [tx(0) + 0.06, -0.55]].forEach(([x, z]) => {
    const t = (x + L / 2) / L; const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.62, 6), steel);
    leg.position.set(x, sheer(Math.min(1, Math.max(0, t))) + 0.31, z); group.add(leg);
  });

  // rig
  const mastX = 1.0, mastBase = 1.33, mastH = 14.4;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.09, mastH, 14), steel);
  mast.position.set(mastX, mastBase + mastH / 2, 0);
  group.add(mast);
  const mastTop = new THREE.Vector3(mastX, mastBase + mastH, 0);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 3.9, 10), steel);
  boom.rotation.z = Math.PI / 2; boom.position.set(mastX - 1.95 - 0.05, 2.15, 0); group.add(boom);
  const cover = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.5, 0.34), canvasNavy);
  cover.position.set(mastX - 1.85 - 0.1, 2.15 + 0.17, 0); group.add(cover);
  const spreader = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 2.6), steel); spreader.position.set(mastX, mastBase + 6.6, 0); group.add(spreader);
  const bowPt = new THREE.Vector3(tx(1) + 0.05, sheer(1) + 0.08, 0);
  const sternPt = new THREE.Vector3(tx(0) + 0.05, sheer(0) + 0.05, 0);
  const stayPts = [
    [mastTop, bowPt], [mastTop, sternPt],
    [mastTop, new THREE.Vector3(mastX, mastBase + 6.6, 1.3)], [mastTop, new THREE.Vector3(mastX, mastBase + 6.6, -1.3)],
    [new THREE.Vector3(mastX, mastBase + 6.6, 1.3), new THREE.Vector3(mastX, sheer(0.6) + 0.05, halfBeam(0.6) - 0.1)],
    [new THREE.Vector3(mastX, mastBase + 6.6, -1.3), new THREE.Vector3(mastX, sheer(0.6) + 0.05, -(halfBeam(0.6) - 0.1))],
  ];
  stayPts.forEach(([a, b]) => group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), lineMat)));
  // furled headsail on the forestay
  const dir = new THREE.Vector3().subVectors(mastTop, bowPt);
  const len = dir.length();
  const sail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.11, len - 0.6, 10), canvasNavy);
  sail.position.copy(bowPt).addScaledVector(dir, 0.5);
  sail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  group.add(sail);
  // cleats
  [[4.55, 0.32], [4.55, -0.32], [-4.75, 0.5], [-4.75, -0.5]].forEach(([x, z]) => {
    const t = (x + L / 2) / L; const c = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.06), steel);
    c.position.set(x, sheer(t) + 0.06, z); group.add(c);
  });

  return { group, occluders };
}

/* ------------------------------------------------------------------ framing */
const FRAMES = {
  whole: { pos: [9.6, 3.4, 10.8], target: [0.2, 1.5, 0] },
  hull: { pos: [3.2, 1.2, 7.6], target: [0.4, 0.5, 0.6] },
  deck: { pos: [8.4, 4.6, 4.8], target: [3.0, 1.1, 0] },
  cabin: { pos: [-2.2, 3.0, 6.4], target: [0.3, 1.35, 0.2] },
  engine: { pos: [-8.2, 3.0, 5.2], target: [-2.9, 0.9, 0] },
};
const MARKERS = {
  hull: [0.6, 0.45, halfBeam(0.56) + 0.05],
  deck: [3.7, sheer(0.86) + 0.1, 0],
  cabin: [-0.55, 1.5, 0.2],
  engine: [-2.3, 0.95, 0],
};

/* ------------------------------------------------------------------ init */
export function initBoat({ stageEl, panelEl, chipsEl, hotspots, reducedMotion, ui }) {
  // WebGL check
  try {
    const test = document.createElement('canvas');
    if (!(test.getContext('webgl2') || test.getContext('webgl'))) return null;
  } catch (err) { return null; }

  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const byZone = new Map(hotspots.map((h) => [h.zone, h]));
  let disposed = false;

  // veil
  const veil = document.createElement('div');
  veil.className = 'boat-veil';
  veil.innerHTML = '<span>Preparing your boat…</span>';
  stageEl.appendChild(veil);

  // renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(STAGE_BG, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stageEl.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'boat-labels';
  stageEl.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(STAGE_BG, 0.028);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 220);
  camera.position.set(...FRAMES.whole.pos);

  // lights
  scene.add(new THREE.HemisphereLight(0xcfe3f5, 0x0b1f3a, 0.95));
  const key = new THREE.DirectionalLight(0xfff1dc, 1.7); key.position.set(6, 10, 5); scene.add(key);
  const fill = new THREE.DirectionalLight(0xbfd5e6, 0.55); fill.position.set(-7, 4, -6); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.35); rim.position.set(-3, 6, 9); scene.add(rim);

  // water + contact shadow
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(70, 72),
    new THREE.MeshStandardMaterial({ color: 0x10294b, roughness: 0.5, metalness: 0.08, transparent: true, alphaMap: canvasRadial(512, [[0, '#fff'], [0.42, '#fff'], [1, '#000']]) }),
  );
  water.rotation.x = -Math.PI / 2;
  scene.add(water);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 5.4),
    new THREE.MeshBasicMaterial({ map: canvasRadial(256, [[0, 'rgba(0,0,0,.62)'], [0.55, 'rgba(0,0,0,.28)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.012; scene.add(shadow);

  // boat
  const { group: boat, occluders } = buildBoat();
  scene.add(boat);

  // controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...FRAMES.whole.target);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 5;
  controls.maxDistance = 26;
  controls.minPolarAngle = 0.22;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 0.3;
  controls.enableZoom = false;
  controls.enableRotate = !isTouch;
  renderer.domElement.style.touchAction = 'pan-y';
  controls.update();

  // activation pill (scroll-hijack guard)
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'boat-activate';
  pill.textContent = isTouch ? ui.activateTouch : ui.activateDesktop;
  stageEl.appendChild(pill);
  let active = false;
  function setActive(on) {
    active = on;
    stageEl.classList.toggle('is-active', on);
    controls.enableZoom = on;
    if (isTouch) {
      controls.enableRotate = on;
      renderer.domElement.style.touchAction = on ? 'none' : 'pan-y';
      pill.textContent = on ? ui.activateDone : ui.activateTouch;
    } else {
      pill.hidden = on;
    }
  }
  pill.addEventListener('click', (ev) => { ev.stopPropagation(); setActive(!active); });
  if (!isTouch) {
    renderer.domElement.addEventListener('pointerdown', () => { if (!active) setActive(true); });
    stageEl.addEventListener('mouseleave', () => { if (active) setActive(false); });
  }

  // idle auto-rotate
  let idleTimer = null;
  function pauseAutoRotate() {
    controls.autoRotate = false;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => { if (!reducedMotion && !flying) controls.autoRotate = true; }, 6000);
  }
  controls.addEventListener('start', () => { pauseAutoRotate(); stageEl.classList.add('is-dragging'); });
  controls.addEventListener('end', () => { stageEl.classList.remove('is-dragging'); });

  // hotspot markers
  const markers = new Map();
  Object.entries(MARKERS).forEach(([zone, p]) => {
    const h = byZone.get(zone);
    if (!h) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hotspot';
    btn.dataset.zone = zone;
    btn.setAttribute('aria-label', `${h.label}: ${h.service}`);
    btn.innerHTML = `<span class="hotspot-dot" aria-hidden="true"></span><span class="hotspot-tip" role="tooltip">${h.tooltip}</span>`;
    btn.addEventListener('click', (ev) => { ev.stopPropagation(); selectZone(zone); });
    const obj = new CSS2DObject(btn);
    obj.position.set(p[0], p[1], p[2]);
    boat.add(obj);
    markers.set(zone, { btn, obj, world: new THREE.Vector3() });
  });

  // chips
  const chips = Array.from(chipsEl.querySelectorAll('[data-zone]'));
  chips.forEach((c) => c.addEventListener('click', () => selectZone(c.dataset.zone)));

  // fly-to
  let flying = null;
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  function flyTo(zone) {
    const f = FRAMES[zone] || FRAMES.whole;
    const fromPos = camera.position.clone(), fromT = controls.target.clone();
    const toPos = new THREE.Vector3(...f.pos), toT = new THREE.Vector3(...f.target);
    if (reducedMotion) { camera.position.copy(toPos); controls.target.copy(toT); controls.update(); return; }
    flying = { t0: performance.now(), dur: 720, fromPos, fromT, toPos, toT };
    controls.autoRotate = false;
    controls.enabled = false;
  }

  let current = 'whole';
  function selectZone(zone) {
    const h = byZone.get(zone);
    if (!h) return;
    current = zone;
    panelEl.querySelector('.panel-eyebrow').textContent = h.eyebrow;
    panelEl.querySelector('.panel-title').textContent = h.title;
    panelEl.querySelector('.panel-body').textContent = h.body;
    const cta = panelEl.querySelector('.panel-cta');
    cta.textContent = h.cta.label;
    cta.href = h.cta.href;
    chips.forEach((c) => c.setAttribute('aria-pressed', c.dataset.zone === zone ? 'true' : 'false'));
    markers.forEach((m, z) => m.btn.classList.toggle('is-selected', z === zone));
    flyTo(zone);
    pauseAutoRotate();
  }

  // sizing
  let W = 1, H = 1;
  function resize() {
    W = Math.max(1, stageEl.clientWidth);
    H = Math.max(1, stageEl.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, W < 768 ? 1.5 : 2));
    renderer.setSize(W, H, false);
    labelRenderer.setSize(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stageEl);
  resize();

  // visibility gating
  let visible = true, pageVisible = document.visibilityState === 'visible', raf = 0;
  const io = new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; if (visible) loop(); }, { rootMargin: '120px' });
  io.observe(stageEl);
  const onVis = () => { pageVisible = document.visibilityState === 'visible'; if (pageVisible) loop(); };
  document.addEventListener('visibilitychange', onVis);

  // render loop
  const raycaster = new THREE.Raycaster();
  const tmp = new THREE.Vector3();
  let frame = 0, firstFrame = true;
  const clock = new THREE.Clock();
  function loop() {
    if (disposed) return;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (!visible || !pageVisible) return;
    const t = clock.getElapsedTime();
    frame++;

    if (flying) {
      const k = Math.min(1, (performance.now() - flying.t0) / flying.dur);
      const e = easeInOut(k);
      camera.position.lerpVectors(flying.fromPos, flying.toPos, e);
      controls.target.lerpVectors(flying.fromT, flying.toT, e);
      if (k >= 1) { flying = null; controls.enabled = true; }
    }
    if (!reducedMotion) {
      boat.position.y = Math.sin(t * 0.8) * 0.018;
      boat.rotation.z = Math.sin(t * 0.6) * 0.007;
      boat.rotation.x = Math.sin(t * 0.47) * 0.004;
    }
    controls.update();

    if (frame % 3 === 0) {
      markers.forEach((m) => {
        m.obj.getWorldPosition(m.world);
        tmp.copy(m.world).sub(camera.position);
        const dist = tmp.length();
        raycaster.set(camera.position, tmp.normalize());
        raycaster.far = dist;
        const hit = raycaster.intersectObjects(occluders, false);
        m.btn.classList.toggle('is-behind', hit.length > 0 && hit[0].distance < dist - 0.25);
        const ndc = m.world.clone().project(camera);
        const sx = (ndc.x + 1) / 2 * W, sy = (1 - ndc.y) / 2 * H;
        m.btn.classList.toggle('tip-below', sy < 110);
        m.btn.classList.toggle('tip-left', sx < 130);
        m.btn.classList.toggle('tip-right', sx > W - 130);
      });
    }

    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    if (firstFrame) {
      firstFrame = false;
      veil.classList.add('is-gone');
      window.setTimeout(() => veil.remove(), 600);
    }
    raf = requestAnimationFrame(loop);
  }
  loop();

  function destroy() {
    disposed = true;
    if (raf) cancelAnimationFrame(raf);
    ro.disconnect(); io.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    controls.dispose();
    renderer.dispose();
    stageEl.innerHTML = '';
  }

  return { selectZone, destroy };
}
