// aBeam — boat.js
// Interactive 3D motor yacht (~24 m LOA), built procedurally with Three.js.
// No model files, no image files, no fetches: the hull and superstructure are lofted /
// extruded in code, the teak and water textures are drawn on a <canvas>, and the
// environment map is a shader sky run through PMREMGenerator. She lies in a harbour cove
// built the same way (§ 6b): hills, a pastel village, woods, a lighthouse, moored boats.
// Exposes: initBoat({ stageEl, panelEl, chipsEl, hotspots, reducedMotion, ui, onNavigate })
//   → { stops, showZone, selectZone, setVoyageProgress, getTriangleInfo, destroy } | null
// The camera is not orbit-controlled: it rides a spline through the voyage stops (see § 7),
// driven by page scroll from voyage.js. Dragging only adds a free-look offset on top.

import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries, mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const STAGE_BG = 0x0b1f3a;
const clamp = THREE.MathUtils.clamp;
const smooth = (s) => s * s * (3 - 2 * s);

/* ==================================================================== 1. hull maths
   Station parameter t: 0 = transom, 1 = stem. x runs aft(-) → forward(+).
   LOA 24 m  =  23 m of hull  +  1.0 m of teak swim platform aft.
   Beam 6 m (half-beam 3.0). Freeboard 1.95 aft → 2.70 at the bow.          */

const X_STERN = -11;
const HULL_L = 23;
const BMAX = 3.0;            // max half-beam at the chine
const BMAX_D = 3.05;         // max half-beam at the deck edge (topsides flare out)
const TP = 0.45;             // station of maximum beam

const tx = (t) => X_STERN + HULL_L * t;
const tOf = (x) => clamp((x - X_STERN) / HULL_L, 0, 1);

// half-beam at the chine — full aft (planing transom), fine entry forward
function chineHalf(t) {
  if (t <= TP) return BMAX * (0.905 + 0.095 * Math.pow(t / TP, 1.25));
  const u = (t - TP) / (1 - TP);
  return Math.max(0.035, BMAX * Math.pow(Math.max(0, 1 - Math.pow(u, 1.7)), 0.75));
}
// half-beam at the deck edge — fuller than the chine, which is what gives the bow its flare
function sheerHalf(t) {
  if (t <= TP) return BMAX_D * (0.93 + 0.07 * Math.pow(t / TP, 1.25));
  const u = (t - TP) / (1 - TP);
  return Math.max(0.055, BMAX_D * Math.pow(Math.max(0, 1 - Math.pow(u, 2.15)), 0.60));
}
// deck edge height above the water: 1.95 aft, 2.70 at the stem
function deckEdgeY(t) { return 1.90 + 0.05 * Math.pow(1 - t, 2.5) + 0.80 * Math.pow(t, 2.9); }
// the hard chine: low at the transom, sweeping up to the stem
function chineY(t) { return 0.30 + 1.46 * Math.pow(t, 2.7); }
// keel line: flat-ish run aft, forefoot sweeping up to meet the chine at the stem
function keelY(t) {
  const fwd = Math.max(0, (t - 0.40) / 0.60);
  return -1.20 + 0.12 * Math.pow(Math.max(0, (0.20 - t) / 0.20), 2) + 2.96 * Math.pow(fwd, 2.65);
}
function keelHalf(t) { return 0.052 * (1 - 0.8 * Math.max(0, (t - 0.55) / 0.45)); }

// topsides half-width at station t, row w (0 = chine, 1 = deck edge)
function sideHalfAt(t, w) {
  const c = chineHalf(t);
  return c + (sheerHalf(t) - c) * Math.pow(w, 1.35);
}

// a point on the topsides, optionally pushed out along the surface normal
function sidePoint(t, w, s, off = 0) {
  const y = chineY(t) + (deckEdgeY(t) - chineY(t)) * w;
  const zc = sideHalfAt(t, w);
  if (!off) return new THREE.Vector3(tx(t), y, s * zc);
  const dt = 0.006;
  const t0 = Math.max(0, t - dt), t1 = Math.min(1, t + dt);
  const dh = sideHalfAt(t1, w) - sideHalfAt(t0, w);
  const dx = tx(t1) - tx(t0);
  const len = Math.hypot(dh, dx) || 1;
  return new THREE.Vector3(tx(t) - (dh / len) * off, y, s * (zc + (dx / len) * off));
}

// raised bulwark forward: nothing aft, rising to ~0.46 m at the stem
function bulwarkH(t) { return 0.34 * smooth(clamp((t - 0.58) / 0.34, 0, 1)); }
function bulwarkIn(t) { return 0.09 * (bulwarkH(t) / 0.34); }
// the top of the bulwark / caprail line at station t
function capPoint(t, s, inset = 0) {
  const p = sidePoint(t, 1, s, -bulwarkIn(t) - inset);
  return new THREE.Vector3(p.x, deckEdgeY(t) + bulwarkH(t), p.z);
}

// yaw that aligns a mesh's local +Z with the outward hull normal
function hullYaw(t, w, s) {
  const dt = 0.006;
  const t0 = Math.max(0, t - dt), t1 = Math.min(1, t + dt);
  const dh = sideHalfAt(t1, w) - sideHalfAt(t0, w);
  const dx = tx(t1) - tx(t0);
  return Math.atan2(-dh, s * dx);
}

// waterline paint: antifoul below BOOT_LO, a navy boot top up to BOOT_HI, gelcoat above
const BOOT_LO = 0.035;
const BOOT_HI = 0.175;

// the bottom-loft row v at which the section reaches height y
function vAtY(t, y) {
  const ky = keelY(t), cy = chineY(t);
  if (cy - ky < 1e-4) return 1;
  return clamp(Math.pow(clamp((y - ky) / (cy - ky), 0, 1), 1 / 1.14), 0, 1);
}

// a point on the V-bottom, v = 0 at the keel → 1 at the chine
function bottomPoint(t, v, s) {
  const kz = keelHalf(t), cz = chineHalf(t);
  const ky = keelY(t), cy = chineY(t);
  return new THREE.Vector3(
    tx(t),
    ky + (cy - ky) * Math.pow(v, 1.14),
    s * (kz + (cz - kz) * Math.pow(v, 0.86)),
  );
}

// half-beam of the transom section at height y
function transomHalfAtY(y) {
  const cy = chineY(0);
  if (y <= cy) {
    const v = vAtY(0, y);
    return keelHalf(0) + (chineHalf(0) - keelHalf(0)) * Math.pow(v, 0.86);
  }
  return sideHalfAt(0, clamp((y - cy) / (deckEdgeY(0) - cy), 0, 1));
}

/* ==================================================================== 2. geometry helpers */

// Quad grid loft. fn(u, v) → Vector3. flip reverses the winding.
function gridGeometry(nu, nv, fn, flip) {
  const count = (nu + 1) * (nv + 1);
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const idx = [];
  let p = 0, q = 0;
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const v = fn(i / nu, j / nv);
      pos[p++] = v.x; pos[p++] = v.y; pos[p++] = v.z;
      uv[q++] = i / nu; uv[q++] = j / nv;
    }
  }
  const cols = nv + 1;
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * cols + j, b = a + cols, c = a + 1, d = b + 1;
      if (flip) idx.push(a, c, b, c, d, b); else idx.push(a, b, c, c, b, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// mirror-pair loft: builds both sides and merges them into one buffer
function bothSides(build) {
  return mergeGeometries([build(1), build(-1)], false);
}

// planar UVs from world X/Z, so canvas plank textures land at a real-world scale
function planarUV(g, k = 1.2) {
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / k; uv[i * 2 + 1] = p.getZ(i) / k; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// Bake every mesh that shares a material (and shadow flags) into a single buffer.
// `keep` is the set of meshes that must stay addressable — the raycast occluders.
const BATCH_ATTRS = ['position', 'normal', 'uv'];
function batchByMaterial(group, keep) {
  group.updateMatrixWorld(true);
  const meshes = [];
  group.traverse((o) => { if (o.isMesh && !keep.has(o) && !Array.isArray(o.material)) meshes.push(o); });
  const buckets = new Map();
  for (const m of meshes) {
    const key = `${m.material.uuid}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}`;
    const list = buckets.get(key);
    if (list) list.push(m); else buckets.set(key, [m]);
  }
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const parts = [];
    for (const m of list) {
      let g = m.geometry.clone().applyMatrix4(m.matrixWorld);
      if (g.index) { const n = g.toNonIndexed(); g.dispose(); g = n; }
      for (const name of Object.keys(g.attributes)) {
        if (!BATCH_ATTRS.includes(name)) g.deleteAttribute(name);
      }
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) {
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      }
      g.clearGroups();
      parts.push(g);
    }
    const merged = mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    if (!merged) continue;
    const batch = new THREE.Mesh(merged, list[0].material);
    batch.castShadow = list[0].castShadow;
    batch.receiveShadow = list[0].receiveShadow;
    group.add(batch);
    for (const m of list) {
      if (m.parent) m.parent.remove(m);
      m.geometry.dispose();
    }
  }
  // drop the now-empty helper groups
  for (const child of [...group.children]) {
    if (child.isGroup && child.children.length === 0) group.remove(child);
  }
}

function roundedRectShape(w, d, r) {
  const hw = w / 2, hd = d / 2, rr = Math.min(r, hw - 0.001, hd - 0.001);
  const s = new THREE.Shape();
  s.moveTo(-hw + rr, -hd);
  s.lineTo(hw - rr, -hd); s.quadraticCurveTo(hw, -hd, hw, -hd + rr);
  s.lineTo(hw, hd - rr); s.quadraticCurveTo(hw, hd, hw - rr, hd);
  s.lineTo(-hw + rr, hd); s.quadraticCurveTo(-hw, hd, -hw, hd - rr);
  s.lineTo(-hw, -hd + rr); s.quadraticCurveTo(-hw, -hd, -hw + rr, -hd);
  return s;
}

// soft slab (cushion, table top, platform) spanning y = 0 → h, centred on the origin in x/z
function padGeo(w, d, h, r = 0.1, bev) {
  const b = Math.min(bev || h * 0.4, 0.09, h / 2 - 0.002);
  const g = new THREE.ExtrudeGeometry(roundedRectShape(w, d, r), {
    depth: Math.max(0.005, h - b * 2), bevelEnabled: true,
    bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 4, steps: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, b, 0);
  return g;
}

/* ---- superstructure prisms ----------------------------------------------------
   A deck box is described by stations [x, halfWidth] plus an elliptical nose.
   The same description, offset outwards, gives the glass band and the roof.     */

function boxStations(cfg, off = 0) {
  const out = [];
  const n = cfg.segs || 24;
  for (let i = 0; i <= n; i++) {
    const x = cfg.x0 + (cfg.xF - cfg.x0) * (i / n);
    out.push([x, Math.max(0.02, cfg.half(x) + off)]);
  }
  const m = cfg.nose === false ? 0 : 9;
  const wF = Math.max(0.02, cfg.half(cfg.xF) + off);
  const dF = cfg.x1 - cfg.xF + off;
  for (let i = 1; i <= m; i++) {
    const th = (i / m) * Math.PI / 2;
    out.push([cfg.xF + dF * Math.sin(th), wF * Math.cos(th)]);
  }
  if (m === 0) out.push([cfg.x1 + off, Math.max(0.02, cfg.half(cfg.x1) + off)]);
  return out;
}

function shapeFromStations(st) {
  const pts = [];
  for (let i = 0; i < st.length; i++) pts.push(new THREE.Vector2(st[i][0], st[i][1]));
  for (let i = st.length - 1; i >= 0; i--) if (st[i][1] > 0.004) pts.push(new THREE.Vector2(st[i][0], -st[i][1]));
  return new THREE.Shape(pts);
}

// Extrude a deck box between two heights. tumble leans the sides in, rake sweeps the
// forward face aft — that is what turns a slab into a deckhouse with a raked windscreen.
function prism(cfg, yLo, yHi, opts = {}) {
  const { off = 0, bevel = 0, tumble = 0, rake = 0, rakeX0 = 0, rakeX1 = 1, crease = 0.5 } = opts;
  const shape = shapeFromStations(boxStations(cfg, off));
  const b = bevel;
  let g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, (yHi - yLo) - b * 2), bevelEnabled: b > 0,
    bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 3, steps: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, yLo + b, 0);
  const p = g.attributes.position;
  if (tumble || rake) {
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const u = clamp((y - yLo) / (yHi - yLo), 0, 1);
      if (tumble) p.setZ(i, z * (1 - tumble * u));
      if (rake) p.setX(i, x - rake * u * smooth(clamp((x - rakeX0) / (rakeX1 - rakeX0), 0, 1)));
    }
  }
  g.computeVertexNormals();
  if (crease) g = toCreasedNormals(g, crease);
  return g;
}

/* ==================================================================== 3. canvas textures */

function makeTeakTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  let seed = 20260917;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  ctx.fillStyle = '#7d5530';
  ctx.fillRect(0, 0, S, S);
  const planks = 8, ph = S / planks;
  for (let i = 0; i < planks; i++) {
    const y0 = i * ph;
    const l = 0.88 + rnd() * 0.24;
    ctx.fillStyle = `rgb(${Math.round(136 * l)},${Math.round(93 * l)},${Math.round(52 * l)})`;
    ctx.fillRect(0, y0 + 2, S, ph - 3);
    for (let k = 0; k < 110; k++) {
      const y = y0 + 3 + rnd() * (ph - 7);
      const x = rnd() * S, w = 40 + rnd() * 300;
      ctx.strokeStyle = rnd() < 0.5
        ? `rgba(84,54,26,${0.05 + rnd() * 0.13})`
        : `rgba(206,164,112,${0.04 + rnd() * 0.11})`;
      ctx.lineWidth = 0.6 + rnd() * 1.3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + w * 0.3, y + 1.1, x + w * 0.7, y - 1.1, x + w, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#1e2228';
    ctx.fillRect(0, y0 - 1, S, 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// tileable value-noise field, summed over the octaves given
function noiseField(S, octaves, seed0) {
  const h = new Float32Array(S * S);
  let seed = seed0;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const sm = (a) => a * a * (3 - 2 * a);
  for (const [n, amp] of octaves) {
    const grid = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) grid[i] = rnd();
    for (let y = 0; y < S; y++) {
      const fy = y / S * n, y0 = Math.floor(fy), fv = sm(fy - y0);
      const ra = (y0 % n) * n, rb = ((y0 + 1) % n) * n;
      for (let x = 0; x < S; x++) {
        const fx = x / S * n, x0 = Math.floor(fx), fu = sm(fx - x0);
        const ca = x0 % n, cb = (x0 + 1) % n;
        const a = grid[ra + ca] + (grid[ra + cb] - grid[ra + ca]) * fu;
        const b = grid[rb + ca] + (grid[rb + cb] - grid[rb + ca]) * fu;
        h[y * S + x] += (a + (b - a) * fv) * amp;
      }
    }
  }
  return h;
}

// Water normal map: two noise scales blended — a long low swell carrying a finer chop.
// One tile drifts across the whole disc, so both scales move together at real-world scale.
function makeWaterNormal() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const swell = noiseField(S, [[2, 1], [4, 0.55]], 77771);
  const chop = noiseField(S, [[11, 1], [23, 0.5], [46, 0.22]], 31337);
  const h = new Float32Array(S * S);
  for (let i = 0; i < h.length; i++) h[i] = swell[i] * 0.86 + chop[i] * 0.30;
  const STR = 3.1;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const l = h[y * S + ((x - 1 + S) % S)], r = h[y * S + ((x + 1) % S)];
      const u = h[((y - 1 + S) % S) * S + x], d = h[((y + 1) % S) * S + x];
      const nx = -(r - l) * STR, ny = -(d - u) * STR;
      const len = Math.hypot(nx, ny, 1);
      const o = (y * S + x) * 4;
      img.data[o] = (nx / len * 0.5 + 0.5) * 255;
      img.data[o + 1] = (ny / len * 0.5 + 0.5) * 255;
      img.data[o + 2] = (1 / len * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(15, 15);
  return tex;
}

// fine canvas-grain, used as a roughnessMap so the gelcoat is never perfectly uniform
function makeGrainTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const h = noiseField(S, [[8, 1], [16, 0.5], [32, 0.3], [64, 0.18]], 4242);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < h.length; i++) { if (h[i] < lo) lo = h[i]; if (h[i] > hi) hi = h[i]; }
  const span = (hi - lo) || 1;
  for (let i = 0; i < h.length; i++) {
    // a narrow band around white: roughnessMap multiplies, so this only ever dulls slightly
    const v = 214 + ((h[i] - lo) / span) * 41;
    const o = i * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3.5, 3.5);
  return tex;
}

// a soft ring, used for the ripple that travels out from the waterline
function makeRingTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.74, 'rgba(255,255,255,0)');
  g.addColorStop(0.86, 'rgba(255,255,255,.5)');
  g.addColorStop(0.93, 'rgba(255,255,255,.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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

/* ==================================================================== 4. environment (IBL)
   The cove's own sky (§ 6b), rendered into a PMREM cubemap: what the gelcoat, the smoked glass,
   the stainless and the water reflect is the sky in the frame, with the wooded hills round the
   harbour as a dark band low down on every bearing but the mouth, and the sea below. That is
   what makes the yacht sit in the cove rather than in front of it.                         */

const SUN = new THREE.Vector3(17, 6.8, -3.6).normalize();

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// (COVE_SKY_GLSL, from § 6b, is prepended when the bake runs)
const ENV_FRAG = /* glsl */`
uniform vec3 envLand;
uniform vec3 envTown;
uniform vec3 envSea;
uniform vec3 envGlow;
uniform float envGain;
varying vec3 vDir;
float envBump(float a, float c, float w) {   // raised cosine in azimuth (radians)
  float d = abs(mod(a - c + 3.14159265, 6.2831853) - 3.14159265);
  return d >= w ? 0.0 : 0.5 + 0.5 * cos(3.14159265 * d / w);
}
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 c = coveSky(d);
  float facing;
  vec3 horizon = coveHorizon(d.xz / max(length(d.xz), 1e-4), facing);
  // the sun itself (the frame never shows it, but the glass and the steel catch it), and the warm
  // haze it leaves all round the horizon at this hour
  float s = max(dot(d, cvSunDir), 0.0);
  c += cvSunColor * (smoothstep(0.9968, 0.9992, s) * 12.0 + pow(s, 44.0) * 0.8);
  c += envGlow * pow(1.0 - abs(y), 6.0) * step(-0.02, y);
  // the hills: every bearing but the harbour mouth (-48..+8 deg), their ridge 6-16 deg up
  float az = atan(d.z, d.x);
  float land = 1.0 - envBump(az, -0.35, 0.62);
  float ridge = 0.19 + 0.09 * envBump(az, -2.51, 0.85) - 0.1 * envBump(az, -0.94, 0.3);
  float band = land * (1.0 - smoothstep(ridge - 0.02, ridge + 0.02, y));
  vec3 hills = mix(envLand, envTown, envBump(az, -2.44, 0.45) * (1.0 - smoothstep(0.02, 0.09, y)));
  c = mix(c, mix(hills, horizon, 0.35), band);
  // below the horizon, the sea: the bright sky it mirrors at a graze, its own teal further down
  if (y < 0.0) c = mix(mix(horizon * 0.5, c, band * 0.6), envSea, smoothstep(0.0, -0.16, y));
  gl_FragColor = vec4(c * envGain, 1.0);
}`;

// U: the cove's sky uniforms. The bake keeps their shape (the gradient, the sun's bearing, the warm
// side and the cool side, the hills, the sea) but is lit brighter than the frame: the visible sky is
// held down so the stage stays one band with the navy header, while the yacht's starboard side,
// which every stop looks at and the low sun never reaches, is lit by this sky alone.
function buildEnvironment(renderer, U) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 32, 20);
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: COVE_SKY_GLSL + ENV_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      ...U,
      cvZenith: { value: new THREE.Color(0x3d6eae) },
      cvMid: { value: new THREE.Color(0xb9b3b4) },
      cvHorizonCool: { value: new THREE.Color(0xe6d3bd) },
      cvHorizonWarm: { value: new THREE.Color(0xffd6a6) },
      envLand: { value: new THREE.Color(0xa08e68) },
      envTown: { value: new THREE.Color(0xd49a6a) },
      envSea: { value: new THREE.Color(0x12232b) },
      envGlow: { value: new THREE.Color(0xffb870).multiplyScalar(0.32) },
      envGain: { value: 1.5 },
    },
  });
  const sky = new THREE.Mesh(geo, mat);
  skyScene.add(sky);
  const rt = pmrem.fromScene(skyScene, 0.015, 0.5, 90);
  geo.dispose();
  mat.dispose();
  pmrem.dispose();
  return rt.texture;
}

/* ==================================================================== 5. deck-box layout */

const HOUSE = { x0: -6.55, x1: 4.35, xF: 3.45, base: 1.46, winLo: 2.36, winHi: 3.34, top: 3.50, segs: 30 };
const COCKPIT = { xA: -10.55, xF: -6.5, sole: 1.18 };
const PLATFORM = { xA: -12.0, xF: -10.8, top: 0.74, half: 2.62 };
const FLY = { x0: -4.2, x1: 2.6, xF: 1.85, deck: 3.58, coam: 4.44, glass: 5.24, hardLo: 5.26, hardHi: 5.42, segs: 20 };
const ROOF = { lo: 3.38, hi: FLY.deck, xAft: -9.3 };

// deckhouse plan: full beam at the aft bulkhead, shouldering in for the side decks,
// then an elliptical nose carrying the curved windscreen
function houseHalf(x) {
  if (x >= HOUSE.xF) {
    const u = Math.min(1, (x - HOUSE.xF) / (HOUSE.x1 - HOUSE.xF));
    return HOUSE.wF * Math.sqrt(Math.max(0, 1 - u * u));
  }
  const sh = sheerHalf(tOf(x));
  const wide = sh - 0.80;
  const narrow = sh - 1.06;
  const h = wide + (narrow - wide) * smooth(clamp((x - HOUSE.x0) / 1.5, 0, 1));
  return h * (1 - 0.30 * Math.pow(clamp((x - 1.3) / (HOUSE.xF - 1.3), 0, 1), 2));
}
HOUSE.wF = (sheerHalf(tOf(HOUSE.xF)) - 1.06) * 0.70;
HOUSE.half = houseHalf;

// flybridge / cockpit hardtop = the flybridge deck, carried aft over the cockpit
function roofHalf(x) {
  const base = sheerHalf(tOf(clamp(x, HOUSE.x0, HOUSE.x1))) - 0.62;
  const front = 1 - 0.30 * Math.pow(clamp((x - 1.3) / (HOUSE.xF - 1.3), 0, 1), 2);
  const aft = 1 - 0.15 * smooth(clamp((HOUSE.x0 - x) / (HOUSE.x0 - ROOF.xAft), 0, 1));
  return base * front * aft;
}
const ROOF_CFG = { x0: ROOF.xAft, x1: HOUSE.x1 + 0.16, xF: HOUSE.xF + 0.12, half: roofHalf, segs: 30 };
ROOF_CFG.wF = roofHalf(ROOF_CFG.xF);

function flyHalf(x) {
  if (x >= FLY.xF) {
    const u = Math.min(1, (x - FLY.xF) / (FLY.x1 - FLY.xF));
    return FLY.wF * Math.sqrt(Math.max(0, 1 - u * u));
  }
  return Math.min(1.88, houseHalf(Math.max(x, HOUSE.x0)) - 0.30);
}
FLY.wF = Math.min(1.88, houseHalf(FLY.xF) - 0.30) * 0.80;
FLY.half = flyHalf;
const FLY_CFG = { x0: FLY.x0, x1: FLY.x1, xF: FLY.xF, half: flyHalf, segs: FLY.segs, wF: FLY.wF };
const HARD_CFG = { x0: FLY.x0 - 0.1, x1: FLY.x1 - 0.5, xF: FLY.xF - 0.45, half: (x) => flyHalf(x) + 0.12, segs: 20 };
HARD_CFG.wF = HARD_CFG.half(HARD_CFG.xF);
const FLYGLASS_CFG = { x0: -2.9, x1: FLY.x1, xF: FLY.xF, half: (x) => flyHalf(x), segs: 16, wF: FLY.wF };

/* ==================================================================== 6. the yacht */

function buildYacht(env, isSmall) {
  const group = new THREE.Group();
  const occluders = [];
  const mats = [];
  const texs = [];
  const M = (m) => { mats.push(m); return m; };

  const teakTex = makeTeakTexture();
  const grainTex = makeGrainTexture();
  texs.push(teakTex, grainTex);

  /* ---- materials ---- */
  // roughnessMap = the canvas grain: gelcoat is hand-laid, never perfectly even. It only
  // ever dulls the surface slightly (the map is a narrow band just under white).
  const gelcoat = M(new THREE.MeshPhysicalMaterial({
    color: 0xe9e5da, roughness: 0.34, metalness: 0.0, roughnessMap: grainTex,
    clearcoat: 1, clearcoatRoughness: 0.07, envMapIntensity: 1.05,
  }));
  const gelcoatSoft = M(new THREE.MeshStandardMaterial({
    color: 0xdcd8cd, roughness: 0.50, metalness: 0.0, roughnessMap: grainTex, envMapIntensity: 0.85,
  }));
  // the cheap ambient-occlusion pass: the same surfaces, tinted down, used anywhere the sky
  // is blocked — cockpit sole, hardtop liners, inboard faces, under the rubrail and platform
  const gelcoatShade = M(new THREE.MeshStandardMaterial({
    color: 0xa9a69d, roughness: 0.58, metalness: 0.0, roughnessMap: grainTex, envMapIntensity: 0.42,
  }));
  const frameAlu = M(new THREE.MeshStandardMaterial({
    color: 0x2f343b, roughness: 0.36, metalness: 0.82, envMapIntensity: 0.85,
  }));
  const navy = M(new THREE.MeshPhysicalMaterial({
    color: 0x0f2340, roughness: 0.26, metalness: 0.0,
    clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.1,
  }));
  const antifoul = M(new THREE.MeshStandardMaterial({ color: 0x0a1526, roughness: 0.66, metalness: 0.0, envMapIntensity: 0.5 }));
  const glass = M(new THREE.MeshPhysicalMaterial({
    color: 0x0b1420, roughness: 0.04, metalness: 0.0,
    transparent: true, opacity: 0.70, envMapIntensity: 2.6,
    clearcoat: 1, clearcoatRoughness: 0.02, side: THREE.FrontSide, depthWrite: false,
  }));
  const glassOpen = M(new THREE.MeshPhysicalMaterial({
    color: 0x101a26, roughness: 0.05, metalness: 0.0,
    transparent: true, opacity: 0.50, envMapIntensity: 2.6,
    clearcoat: 1, clearcoatRoughness: 0.03, side: THREE.DoubleSide, depthWrite: false,
  }));
  const steel = M(new THREE.MeshStandardMaterial({ color: 0xdde2e9, roughness: 0.22, metalness: 1.0, envMapIntensity: 1.0 }));
  const teak = M(new THREE.MeshStandardMaterial({ color: 0xffffff, map: teakTex, roughness: 0.48, metalness: 0.0, envMapIntensity: 0.7 }));
  const teakShade = M(new THREE.MeshStandardMaterial({ color: 0x9c9890, map: teakTex, roughness: 0.55, metalness: 0.0, envMapIntensity: 0.34 }));
  const teakGloss = M(new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: teakTex, roughness: 0.2, metalness: 0.0,
    clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.95,
  }));
  const cushion = M(new THREE.MeshStandardMaterial({ color: 0xded7c6, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.4 }));
  const rubber = M(new THREE.MeshStandardMaterial({ color: 0x15191f, roughness: 0.78, metalness: 0.0, envMapIntensity: 0.4 }));
  const fenderMat = M(new THREE.MeshStandardMaterial({ color: 0xe6e3da, roughness: 0.66, metalness: 0.0, envMapIntensity: 0.5 }));
  const ropeMat = M(new THREE.MeshStandardMaterial({ color: 0xc9bda4, roughness: 0.92, metalness: 0.0, envMapIntensity: 0.3 }));
  const interior = M(new THREE.MeshStandardMaterial({ color: 0x10161f, roughness: 0.82, metalness: 0.0, envMapIntensity: 0.25 }));
  const dash = M(new THREE.MeshStandardMaterial({ color: 0x1b2028, roughness: 0.45, metalness: 0.1, envMapIntensity: 0.6 }));
  const lampR = M(new THREE.MeshStandardMaterial({ color: 0x3a0a10, emissive: 0xd8343f, emissiveIntensity: 1.1, roughness: 0.3 }));
  const lampG = M(new THREE.MeshStandardMaterial({ color: 0x062615, emissive: 0x2fc07a, emissiveIntensity: 1.1, roughness: 0.3 }));
  const lampW = M(new THREE.MeshStandardMaterial({ color: 0x2a2c2e, emissive: 0xfff2d8, emissiveIntensity: 0.9, roughness: 0.3 }));
  for (const m of mats) m.envMap = env;
  grainTex.anisotropy = 8;

  const add = (geo, mat, cast = false, recv = false) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast; m.receiveShadow = recv;
    group.add(m);
    return m;
  };

  /* ---------------------------------------------------------------- hull */
  const NT = 52;
  // three paint bands on the V-bottom, split along the real waterline
  const bandGeo = (vLo, vHi, rows) => bothSides((s) => gridGeometry(NT, rows, (a, b) => {
    const lo = vLo(a), hi = vHi(a);
    return bottomPoint(a, lo + (hi - lo) * b, s);
  }, s < 0));
  const vLoBoot = (t) => vAtY(t, BOOT_LO);
  const vHiBoot = (t) => vAtY(t, BOOT_HI);
  const bottom = add(bandGeo(() => 0, vLoBoot, 5), antifoul, true, true);
  add(bandGeo(vLoBoot, vHiBoot, 1), navy, false, true);
  add(bandGeo(vHiBoot, () => 1, 4), gelcoat, true, true);

  const sideGeo = bothSides((s) => gridGeometry(NT, 9, (a, b) => sidePoint(a, b, s), s < 0));
  const topsides = add(sideGeo, gelcoat, true, true);

  // spray rail: a small lip standing proud of the chine, fading out at bow and stern
  const RAIL_OUT = 0.105;
  const railFade = (t) => Math.min(1, t / 0.07) * Math.min(1, (0.97 - t) / 0.09);
  add(bothSides((s) => gridGeometry(NT, 2, (a, b) => {
    const base = sidePoint(a, 0, s, 0);
    const out = sidePoint(a, 0, s, 1).sub(base);
    const f = Math.max(0, railFade(a));
    const k = b < 0.25 ? 0 : (b < 0.75 ? 1 : 0.5);
    const dy = b < 0.25 ? 0 : (b < 0.75 ? -0.022 : -0.085);
    return base.clone().addScaledVector(out, RAIL_OUT * k * f).setY(base.y + dy * f);
  }, s > 0)), gelcoat, false, true);

  // transom
  const tPts = [];
  for (let j = 0; j <= 7; j++) { const p = bottomPoint(0, j / 7, 1); tPts.push(new THREE.Vector2(p.z, p.y)); }
  for (let j = 1; j <= 9; j++) { const p = sidePoint(0, j / 9, 1); tPts.push(new THREE.Vector2(p.z, p.y)); }
  for (let j = 9; j >= 1; j--) { const p = sidePoint(0, j / 9, -1); tPts.push(new THREE.Vector2(p.z, p.y)); }
  for (let j = 7; j >= 0; j--) { const p = bottomPoint(0, j / 7, -1); tPts.push(new THREE.Vector2(p.z, p.y)); }
  const transomGeo = new THREE.ShapeGeometry(new THREE.Shape(tPts));
  transomGeo.rotateY(-Math.PI / 2);
  transomGeo.translate(X_STERN, 0, 0);
  const transom = add(transomGeo, gelcoat, true, false);

  // navy boot top across the transom, matched to the hull band
  add(gridGeometry(1, 6, (a, b) => {
    const y = BOOT_LO - 0.16 + (BOOT_HI - BOOT_LO + 0.16) * b;
    return new THREE.Vector3(X_STERN - 0.022, y, (a < 0.5 ? -1 : 1) * transomHalfAtY(y));
  }, false), navy);

  // carry the navy sheer stripe across the transom
  add(gridGeometry(1, 1, (a2, b2) => {
    const y = chineY(0) + (deckEdgeY(0) - chineY(0)) * (0.781 + 0.048 * b2);
    return new THREE.Vector3(X_STERN - 0.022, y, (a2 < 0.5 ? -1 : 1) * transomHalfAtY(y));
  }, false), navy);

  // beach-club door, set into the transom with a stainless surround
  const doorW = 2.8, doorH = 0.9, doorY = 1.26;
  const garage = add(new THREE.BoxGeometry(0.04, doorH, doorW), dash, false, false);
  garage.position.set(X_STERN - 0.03, doorY, 0);
  for (const dy of [doorH / 2 + 0.03, -doorH / 2 - 0.03]) {
    const bar = add(new THREE.BoxGeometry(0.05, 0.055, doorW + 0.14), steel);
    bar.position.set(X_STERN - 0.02, doorY + dy, 0);
  }
  for (const dz of [doorW / 2 + 0.04, -doorW / 2 - 0.04]) {
    const bar = add(new THREE.BoxGeometry(0.05, doorH + 0.1, 0.055), steel);
    bar.position.set(X_STERN - 0.02, doorY, dz);
  }

  /* ---- hull graphics: a sheer stripe, hull windows, engine vents, exhausts ---- */
  function hullPatch(s, t0, t1, wMid, wHalf, off, taper, nu = 16, nv = 3) {
    return gridGeometry(nu, nv, (a, b) => {
      const t = t0 + (t1 - t0) * a;
      const hh = taper ? wHalf * Math.min(1, Math.min(a, 1 - a) / taper) : wHalf;
      return sidePoint(t, wMid(t) - hh + 2 * hh * b, s, off);
    }, s < 0);
  }

  // slim navy sheer stripe just under the caprail
  const stripeMid = (t) => 0.805 + 0.03 * t;
  add(bothSides((s) => hullPatch(s, 0.02, 0.975, stripeMid, 0.024, 0.012, 0.03, 44, 1)), navy);

  // three hull windows a side (master, guest, VIP) — dark surround + smoked glass
  const WINDOWS = [[0.385, 0.525], [0.565, 0.665], [0.705, 0.790]];
  const winMid = () => 0.55;
  const winFrames = [], winGlass = [];
  for (const s of [1, -1]) {
    for (const [a, b] of WINDOWS) {
      winFrames.push(hullPatch(s, a, b, winMid, 0.082, 0.014, 0.13, 16, 3));
      winGlass.push(hullPatch(s, a + 0.005, b - 0.005, winMid, 0.066, 0.026, 0.12, 16, 3));
    }
  }
  add(mergeGeometries(winFrames, false), interior);
  add(mergeGeometries(winGlass, false), glass);

  // engine-room vents on the aft hull sides + louvre bars
  const VENTS = [[0.043, 0.098], [0.108, 0.163]];
  const ventMid = () => 0.665;
  const ventPanels = [];
  for (const s of [1, -1]) {
    for (const [a, b] of VENTS) {
      ventPanels.push(hullPatch(s, a, b, ventMid, 0.125, 0.012, 0.16, 12, 3));
      const tc = (a + b) / 2;
      const hub = new THREE.Group();
      const anchor = sidePoint(tc, ventMid(tc), s, 0.035);
      hub.position.copy(anchor);
      hub.rotation.y = hullYaw(tc, ventMid(tc), s);
      const len = (b - a) * HULL_L - 0.16;
      for (let k = -2; k <= 2; k++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.026, 0.05), steel);
        bar.position.set(0, k * 0.082, 0);
        hub.add(bar);
      }
      group.add(hub);
    }
  }
  const ventMesh = add(mergeGeometries(ventPanels, false), interior);

  // exhaust ports just above the chine, aft
  for (const s of [1, -1]) {
    for (const t of [0.042, 0.076]) {
      const p = sidePoint(t, 0.155, s, 0.01);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.07, 14, 1, true), steel);
      ring.rotation.set(Math.PI / 2, 0, 0);
      ring.rotation.y = hullYaw(t, 0.155, s);
      ring.position.copy(p);
      group.add(ring);
      const cap = new THREE.Mesh(new THREE.CircleGeometry(0.125, 14), rubber);
      cap.position.copy(sidePoint(t, 0.155, s, 0.004));
      cap.rotation.y = hullYaw(t, 0.155, s);
      group.add(cap);
    }
  }

  // rub rail along the deck edge
  function sheerCurve(s, dy, inset, t0 = 0.012, t1 = 0.988) {
    const pts = [];
    for (let i = 0; i <= 44; i++) {
      const t = t0 + (t1 - t0) * (i / 44);
      const p = sidePoint(t, 1, s, -inset);
      pts.push(new THREE.Vector3(p.x, p.y + dy, p.z));
    }
    return new THREE.CatmullRomCurve3(pts);
  }
  for (const s of [1, -1]) {
    add(new THREE.TubeGeometry(sheerCurve(s, -0.125, -0.015), 64, 0.058, 7, false), rubber);
  }
  // the shadow the rubrail throws down the topsides: a thin tinted band just beneath it
  add(bothSides((s) => hullPatch(s, 0.015, 0.985, () => 0.90, 0.042, 0.006, 0.04, 44, 1)), gelcoatShade);

  /* ---------------------------------------------------------------- decks */
  // main deck, cambered, from the saloon bulkhead forward to the stem
  const tD0 = tOf(HOUSE.x0 - 0.2), tD1 = 0.985;
  const deckGeo = planarUV(gridGeometry(46, 6, (a, b) => {
    const t = tD0 + (tD1 - tD0) * a;
    const hw = Math.max(0.03, sheerHalf(t) - 0.19);
    const z = -hw + 2 * hw * b;
    const camber = 0.055 * (1 - Math.pow(z / hw, 2));
    return new THREE.Vector3(tx(t), deckEdgeY(t) - 0.02 + camber, z);
  }, true));
  const deck = add(deckGeo, teak, false, true);

  // bulwark: the topsides carried up above the deck, forward
  add(bothSides((s) => gridGeometry(NT, 1, (a, b) => {
    const t = 0.012 + 0.976 * a;
    const p = sidePoint(t, 1, s, -bulwarkIn(t) * b);
    return new THREE.Vector3(p.x, deckEdgeY(t) + bulwarkH(t) * b, p.z);
  }, s < 0)), gelcoat, true, true);
  // inner face of the bulwark
  add(bothSides((s) => gridGeometry(NT, 1, (a, b) => {
    const t = 0.012 + 0.976 * a;
    const p = sidePoint(t, 1, s, -bulwarkIn(t) - 0.19 * (1 - b) - 0.19 * b);
    return new THREE.Vector3(p.x, deckEdgeY(t) - 0.03 + (bulwarkH(t) + 0.03) * b, p.z);
  }, s < 0 ? false : true)), gelcoatSoft, false, true);
  // caprail: a varnished teak cap over the top of the topsides / bulwark
  const capGeo = bothSides((s) => gridGeometry(46, 1, (a, b) => {
    const t = 0.012 + 0.976 * a;
    const p = capPoint(t, s, 0.19 * b);
    return new THREE.Vector3(p.x, p.y + 0.055 - 0.02 * b, p.z);
  }, s < 0));
  add(planarUV(capGeo, 1.2), teakGloss, false, true);
  // outer fillet so the top edge is not a paper edge
  add(bothSides((s) => gridGeometry(46, 1, (a, b) => {
    const t = 0.012 + 0.976 * a;
    const p = capPoint(t, s, -0.004);
    return new THREE.Vector3(p.x, p.y + 0.055 * b, p.z);
  }, s < 0)), gelcoat);

  // cockpit sole and its inner bulwark faces
  const tC0 = 0.012, tC1 = tOf(COCKPIT.xF);
  const soleGeo = planarUV(gridGeometry(14, 4, (a, b) => {
    const t = tC0 + (tC1 - tC0) * a;
    const hw = sheerHalf(t) - 0.30;
    return new THREE.Vector3(tx(t), COCKPIT.sole, -hw + 2 * hw * b);
  }, true));
  add(soleGeo, teakShade, false, true);   // under the hardtop: never sees the sky
  add(bothSides((s) => gridGeometry(14, 2, (a, b) => {
    const t = tC0 + (tC1 - tC0) * a;
    const hw = sheerHalf(t) - 0.30 + 0.11 * b;
    return new THREE.Vector3(tx(t), COCKPIT.sole + (deckEdgeY(t) - 0.02 - COCKPIT.sole) * b, s * hw);
  }, s < 0 ? false : true)), gelcoatShade, false, true);
  // aft face of the cockpit (the transom locker) and the riser under the side decks
  const lockerW = (sheerHalf(tC0) - 0.30) * 2;
  const locker = add(new THREE.BoxGeometry(0.16, deckEdgeY(0) - COCKPIT.sole, lockerW), gelcoatShade, false, true);
  locker.position.set(tx(tC0) + 0.08, (COCKPIT.sole + deckEdgeY(0) - 0.02) / 2, 0);
  const riser = add(new THREE.BoxGeometry(0.16, 0.86, houseHalf(HOUSE.x0) * 2), gelcoatShade, true, false);
  riser.position.set(HOUSE.x0 - 0.12, COCKPIT.sole + 0.43, 0);

  // swim platform + boarding ladder
  const platGeo = padGeo(PLATFORM.xF - PLATFORM.xA, PLATFORM.half * 2, 0.16, 0.24, 0.05);
  planarUV(platGeo, 1.2);
  const platform = add(platGeo, teak, true, true);
  platform.position.set((PLATFORM.xA + PLATFORM.xF) / 2, PLATFORM.top - 0.16, 0);
  // fairing under the platform, tapering away from the transom
  const platFair = add(gridGeometry(10, 3, (a, b) => {
    const x = PLATFORM.xA + 0.12 + (PLATFORM.xF - PLATFORM.xA - 0.12) * a;
    const hw = (PLATFORM.half - 0.34) * (0.72 + 0.28 * a);
    const drop = 0.32 * (0.35 + 0.65 * a);
    const th = b * Math.PI;
    return new THREE.Vector3(x, PLATFORM.top - 0.17 - drop * Math.sin(th), Math.cos(th) * hw);
  }, true), gelcoatShade, true, false);
  // boarding step on the platform, under the beach-club door
  const step1 = add(planarUV(padGeo(0.5, 1.6, 0.14, 0.07, 0.04), 1.2), teakGloss, true, true);
  step1.position.set(-11.15, PLATFORM.top, 0);
  // ladder, starboard quarter
  const ladder = new THREE.Group();
  ladder.position.set(-11.7, PLATFORM.top, 1.6);
  for (const s of [1, -1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 7), steel);
    rail.position.set(0, -0.55, s * 0.24);
    ladder.add(rail);
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.72, 7), steel);
    up.position.set(0.05, 0.36, s * 0.24);
    ladder.add(up);
  }
  for (let k = 0; k < 3; k++) {
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.48, 7), steel);
    rung.rotation.x = Math.PI / 2;
    rung.position.set(0, -0.22 - k * 0.38, 0);
    ladder.add(rung);
  }
  const grab = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.032, 6, 14, Math.PI), steel);
  grab.rotation.y = Math.PI / 2;
  grab.position.set(0.05, 0.72, 0);
  ladder.add(grab);
  group.add(ladder);

  /* ---------------------------------------------------------------- deckhouse */
  const houseLower = add(prism(HOUSE, HOUSE.base, HOUSE.winLo, { bevel: 0.05, tumble: 0.03, crease: 0.42 }), gelcoat, true, true);
  const houseBand = add(prism(HOUSE, HOUSE.winLo - 0.01, HOUSE.winHi + 0.01, {
    off: -0.03, tumble: 0.05, rake: 0.42, rakeX0: 1.4, rakeX1: HOUSE.x1, crease: 0.42,
  }), interior);
  houseBand.receiveShadow = false;
  const houseUpper = add(prism(HOUSE, HOUSE.winHi, HOUSE.top - 0.09, { bevel: 0.035, tumble: 0.07, rake: 0.46, rakeX0: 1.4, rakeX1: HOUSE.x1, crease: 0.42 }), gelcoat, true, true);
  add(prism(HOUSE, HOUSE.top - 0.1, HOUSE.top + 0.02, { off: -0.05, tumble: 0.08, rake: 0.46, rakeX0: 1.4, rakeX1: HOUSE.x1, crease: 0.42 }), interior);
  // the wraparound glass: one band, offset just outside the dark interior prism
  const houseGlassGeo = prism(HOUSE, HOUSE.winLo + 0.035, HOUSE.winHi - 0.035, {
    off: 0.012, tumble: 0.05, rake: 0.42, rakeX0: 1.4, rakeX1: HOUSE.x1, crease: 0.42,
  });
  add(houseGlassGeo, glass);
  // thin alloy frames along the top and bottom edges of the glass band. The band is a raked,
  // tumbled prism, so the frames repeat the same two transforms at their own height.
  const GLO = HOUSE.winLo + 0.035, GHI = HOUSE.winHi - 0.035;
  function glassBand(yA, yB, off) {
    const st = boxStations(HOUSE, off);
    const n = st.length - 1;
    const at = (u) => {
      const f = u * n, i = Math.min(n - 1, Math.floor(f)), k = f - i;
      return [st[i][0] + (st[i + 1][0] - st[i][0]) * k, st[i][1] + (st[i + 1][1] - st[i][1]) * k];
    };
    return bothSides((s) => gridGeometry(n, 1, (u, v) => {
      const y = yA + (yB - yA) * v;
      const uH = clamp((y - GLO) / (GHI - GLO), 0, 1);
      const [x0, hw] = at(u);
      const x = x0 - 0.42 * uH * smooth(clamp((x0 - 1.4) / (HOUSE.x1 - 1.4), 0, 1));
      return new THREE.Vector3(x, y, s * hw * (1 - 0.05 * uH));
    }, s < 0));
  }
  add(glassBand(GLO - 0.015, GLO + 0.032, 0.028), frameAlu);
  add(glassBand(GHI - 0.032, GHI + 0.015, 0.028), frameAlu);
  // mullions
  for (const s of [1, -1]) {
    for (const x of [-4.2, -2.4, -0.6, 1.2, 2.5]) {
      const hh = houseHalf(x);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.075, HOUSE.winHi - HOUSE.winLo, 0.07), gelcoat);
      post.position.set(x - 0.14, (HOUSE.winLo + HOUSE.winHi) / 2, s * (hh * 0.965 + 0.015));
      group.add(post);
    }
  }
  // saloon door in the aft bulkhead
  const doorGlass = add(new THREE.BoxGeometry(0.05, 1.5, 2.3), glassOpen);
  doorGlass.position.set(HOUSE.x0 - 0.04, 2.1, 0);
  const doorSill = add(new THREE.BoxGeometry(0.1, 0.1, 2.5), steel);
  doorSill.position.set(HOUSE.x0 - 0.04, 1.34, 0);

  /* ---------------------------------------------------------------- roof / flybridge deck */
  const roof = add(prism(ROOF_CFG, ROOF.lo, ROOF.hi, { bevel: 0.055, crease: 0.42 }), gelcoat, true, true);
  const roofTeakGeo = planarUV(gridGeometry(26, 6, (a, b) => {
    const x = (FLY.x0 - 0.05) + ((FLY.x1 - 0.1) - (FLY.x0 - 0.05)) * a;
    const hw = Math.max(0.05, flyHalf(x) - 0.14);
    return new THREE.Vector3(x, FLY.deck + 0.012, -hw + 2 * hw * b);
  }, true), 1.2);
  add(roofTeakGeo, teak, false, true);
  // aft hardtop posts
  for (const s of [1, -1]) {
    const z = roofHalf(ROOF.xAft) - 0.12;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, ROOF.lo - deckEdgeY(tOf(ROOF.xAft)) + 0.1, 8), steel);
    post.position.set(ROOF.xAft + 0.18, (ROOF.lo + deckEdgeY(tOf(ROOF.xAft))) / 2, s * z);
    post.castShadow = true;
    group.add(post);
  }

  const flyCoam = add(prism(FLY_CFG, FLY.deck - 0.06, FLY.coam, { bevel: 0.05, tumble: 0.05, rake: 0.16, rakeX0: 0.4, rakeX1: FLY.x1, crease: 0.42 }), gelcoat, true, true);
  const flyGlass = add(prism(FLYGLASS_CFG, FLY.coam - 0.05, FLY.glass, {
    off: 0.01, tumble: 0.05, rake: 0.42, rakeX0: -0.4, rakeX1: FLY.x1, crease: 0.42,
  }), glassOpen);
  const hardtop = add(prism(HARD_CFG, FLY.hardLo, FLY.hardHi, { bevel: 0.05, crease: 0.42 }), gelcoat, true, false);
  const hardtopLiner = add(prism(HARD_CFG, FLY.hardLo - 0.03, FLY.hardLo + 0.01, { off: -0.07, crease: 0.42 }), gelcoatShade);
  add(prism(HARD_CFG, FLY.hardLo + 0.005, FLY.hardLo + 0.055, { off: 0.008, crease: 0.42 }), navy);
  // forward hardtop posts
  for (const s of [1, -1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, FLY.hardLo - FLY.glass + 0.12, 8), steel);
    post.position.set(1.15, (FLY.hardLo + FLY.glass) / 2, s * (flyHalf(1.15) - 0.06));
    group.add(post);
  }

  // flybridge helm + seating
  const console3 = add(padGeo(1.5, 2.0, 0.78, 0.2, 0.07), dash, true, false);
  console3.position.set(1.15, FLY.deck, 0);
  const screens = add(new THREE.BoxGeometry(0.06, 0.34, 1.35), interior);
  screens.position.set(0.44, FLY.deck + 0.62, 0);
  screens.rotation.z = -0.22;
  const wheel = add(new THREE.TorusGeometry(0.21, 0.026, 8, 22), interior);
  wheel.rotation.set(0, Math.PI / 2, 0.38);
  wheel.position.set(0.36, FLY.deck + 0.44, -0.42);
  for (const s of [1, -1]) {
    const seatBase = add(new THREE.CylinderGeometry(0.16, 0.2, 0.42, 10), steel);
    seatBase.position.set(0.0, FLY.deck + 0.21, s * 0.62);
    const seat = add(padGeo(0.62, 0.6, 0.18, 0.1, 0.06), cushion, true);
    seat.position.set(0.0, FLY.deck + 0.42, s * 0.62);
    const back = add(padGeo(0.16, 0.58, 0.5, 0.07, 0.05), cushion, true);
    back.position.set(0.28, FLY.deck + 0.58, s * 0.62);
  }
  // flybridge aft settee + sun pad
  const fbSetteeBase = add(new THREE.BoxGeometry(0.72, 0.4, 2.5), gelcoatShade);
  fbSetteeBase.position.set(-3.5, FLY.deck + 0.2, 0);
  const fbSeat = add(padGeo(0.8, 2.5, 0.16, 0.1, 0.05), cushion, true);
  fbSeat.position.set(-3.5, FLY.deck + 0.4, 0);
  const fbBack = add(padGeo(0.2, 2.4, 0.46, 0.08, 0.05), cushion, true);
  fbBack.position.set(-3.95, FLY.deck + 0.5, 0);
  const fbTable = add(planarUV(padGeo(0.85, 1.5, 0.07, 0.12, 0.03), 1.2), teakGloss, true);
  fbTable.position.set(-2.5, FLY.deck + 0.68, 0);
  const fbTableLeg = add(new THREE.CylinderGeometry(0.07, 0.11, 0.68, 10), steel);
  fbTableLeg.position.set(-2.5, FLY.deck + 0.34, 0);

  /* ---------------------------------------------------------------- radar arch */
  const archPts = [];
  const archHalf = [
    [-4.02, FLY.deck - 0.05, 1.60], [-4.22, 4.38, 1.58], [-4.32, 5.06, 1.44],
    [-4.34, 5.48, 1.02], [-4.32, 5.64, 0.42], [-4.32, 5.66, 0],
  ];
  for (let i = 0; i < archHalf.length; i++) archPts.push(new THREE.Vector3(...archHalf[i]));
  for (let i = archHalf.length - 2; i >= 0; i--) {
    const a = archHalf[i];
    archPts.push(new THREE.Vector3(a[0], a[1], -a[2]));
  }
  const arch = add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(archPts), 56, 0.105, 8, false), steel, true, false);
  const archBar = add(new THREE.BoxGeometry(0.2, 0.1, 2.4), steel, true);
  archBar.position.set(-4.3, 5.18, 0);
  // radar dome, sitting on a plinth on the arch
  const dome = add(new THREE.SphereGeometry(0.44, isSmall ? 14 : 20, isSmall ? 10 : 14), gelcoat, true);
  dome.scale.set(1, 0.58, 1);
  dome.position.set(-4.3, 5.94, 0);
  const domePost = add(new THREE.CylinderGeometry(0.11, 0.14, 0.34, 10), gelcoat, true);
  domePost.position.set(-4.3, 5.78, 0);
  // satcom dome
  const sat = add(new THREE.SphereGeometry(0.27, 14, 10), gelcoat, true);
  sat.scale.set(1, 0.92, 1);
  sat.position.set(-4.3, 5.62, 1.0);
  // whip antennas + an all-round white
  for (const s of [1, -1]) {
    const whip = add(new THREE.CylinderGeometry(0.014, 0.022, 1.5, 6), rubber);
    whip.position.set(-4.3, 6.32, s * 0.72);
  }
  const anchorLight = add(new THREE.CylinderGeometry(0.06, 0.06, 0.13, 10), lampW);
  anchorLight.position.set(-4.3, 5.78, 0.3);

  /* ---------------------------------------------------------------- cockpit furniture */
  // L-settee: athwartships aft + down the port side
  const aftBaseW = 0.78;
  const setteeAft = add(new THREE.BoxGeometry(aftBaseW, 0.46, 4.4), gelcoatShade, true, true);
  setteeAft.position.set(-10.0, COCKPIT.sole + 0.23, 0);
  const setteeAftPad = add(padGeo(0.86, 4.4, 0.17, 0.1, 0.05), cushion, true);
  setteeAftPad.position.set(-10.0, COCKPIT.sole + 0.46, 0);
  const setteeAftBack = add(padGeo(0.2, 4.4, 0.5, 0.08, 0.05), cushion, true);
  setteeAftBack.position.set(-10.42, COCKPIT.sole + 0.6, 0);
  const setteeSide = add(new THREE.BoxGeometry(2.1, 0.46, 0.76), gelcoatShade, true, true);
  setteeSide.position.set(-8.6, COCKPIT.sole + 0.23, -1.9);
  const setteeSidePad = add(padGeo(2.1, 0.84, 0.17, 0.1, 0.05), cushion, true);
  setteeSidePad.position.set(-8.6, COCKPIT.sole + 0.46, -1.9);
  const setteeSideBack = add(padGeo(2.1, 0.2, 0.5, 0.08, 0.05), cushion, true);
  setteeSideBack.position.set(-8.6, COCKPIT.sole + 0.6, -2.3);
  // teak table
  const tableGeo = planarUV(padGeo(1.9, 1.05, 0.08, 0.16, 0.035), 1.2);
  const table = add(tableGeo, teakGloss, true, false);
  table.position.set(-8.9, COCKPIT.sole + 0.68, -0.55);
  const tableLeg = add(new THREE.CylinderGeometry(0.075, 0.13, 0.68, 12), steel);
  tableLeg.position.set(-8.9, COCKPIT.sole + 0.34, -0.55);
  // two loose chairs to starboard
  for (const dz of [-0.35, 0.55]) {
    const ch = add(padGeo(0.56, 0.56, 0.14, 0.08, 0.05), cushion, true);
    ch.position.set(-8.4 + dz * 0.2, COCKPIT.sole + 0.43, 1.35 + dz * 0.1);
    const chb = add(padGeo(0.14, 0.52, 0.48, 0.07, 0.05), cushion, true);
    chb.position.set(-8.12 + dz * 0.2, COCKPIT.sole + 0.56, 1.35 + dz * 0.1);
    const chl = add(new THREE.CylinderGeometry(0.05, 0.07, 0.42, 8), steel);
    chl.position.set(-8.4 + dz * 0.2, COCKPIT.sole + 0.22, 1.35 + dz * 0.1);
  }
  // steps up to the side decks
  for (const s of [1, -1]) {
    const st = add(planarUV(padGeo(0.55, 0.85, 0.1, 0.06, 0.03), 1.2), teak, false, true);
    st.position.set(-6.85, 1.55, s * 2.0);
  }

  /* ---------------------------------------------------------------- foredeck */
  // sun pad
  const padBase = add(new THREE.BoxGeometry(3.3, 0.34, 3.0), gelcoatSoft, true, true);
  padBase.position.set(7.2, deckEdgeY(tOf(7.2)) + 0.13, 0);
  const sunPad = add(padGeo(3.3, 3.1, 0.24, 0.24, 0.09), cushion, true, false);
  sunPad.position.set(7.2, deckEdgeY(tOf(7.2)) + 0.29, 0);
  const sunBack = add(padGeo(0.28, 2.6, 0.58, 0.14, 0.08), cushion, true);
  sunBack.position.set(5.62, deckEdgeY(tOf(5.6)) + 0.4, 0);
  // windlass + anchor
  const windlassBox = add(padGeo(0.72, 0.62, 0.26, 0.1, 0.06), gelcoat, true);
  windlassBox.position.set(10.45, deckEdgeY(tOf(10.45)) + 0.02, 0);
  const drum = add(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 12), steel, true);
  drum.rotation.z = Math.PI / 2;
  drum.position.set(10.45, deckEdgeY(tOf(10.45)) + 0.3, 0);
  const roller = add(new THREE.BoxGeometry(0.85, 0.16, 0.36), steel, true);
  roller.position.set(11.62, deckEdgeY(tOf(11.5)) + 0.04, 0);
  const anchorShank = add(new THREE.BoxGeometry(0.1, 0.72, 0.12), steel, true);
  anchorShank.position.set(11.95, deckEdgeY(1) - 0.32, 0);
  anchorShank.rotation.z = 0.12;
  const anchorFluke = add(new THREE.BoxGeometry(0.42, 0.14, 0.5), steel, true);
  anchorFluke.position.set(11.86, deckEdgeY(1) - 0.66, 0);
  anchorFluke.rotation.z = 0.5;
  // foredeck hatches
  for (const x of [9.1, 4.9]) {
    const hatch = add(new THREE.BoxGeometry(0.8, 0.07, 0.8), glassOpen);
    hatch.position.set(x, deckEdgeY(tOf(x)) + 0.05, 0);
    const frame = add(new THREE.BoxGeometry(0.92, 0.06, 0.92), gelcoat);
    frame.position.set(x, deckEdgeY(tOf(x)) + 0.02, 0);
  }

  /* ---------------------------------------------------------------- stainless rails */
  const STANCH = [-6.0, -4.3, -2.4, -0.5, 1.4, 3.3, 5.1, 6.8, 8.4, 9.8, 10.8];
  const railTopY = 1.02, railMidY = 0.52;
  for (const s of [1, -1]) {
    const tops = [], mids = [];
    for (const x of STANCH) {
      const t = tOf(x);
      const p = capPoint(t, s, 0.06);
      const h = Math.max(0.42, railTopY - bulwarkH(t));
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, h, 6), steel);
      st.position.set(p.x, p.y + h / 2 + 0.05, p.z);
      st.castShadow = true;
      group.add(st);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.06, 8), steel);
      base.position.set(p.x, p.y + 0.07, p.z);
      group.add(base);
      tops.push(new THREE.Vector3(p.x, p.y + h + 0.05, p.z));
      mids.push(new THREE.Vector3(p.x, p.y + h * 0.5 + 0.05, p.z));
    }
    // carry the rails forward to the stem
    const stemTop = capPoint(0.993, s, 0.0);
    tops.push(new THREE.Vector3(stemTop.x, stemTop.y + 0.44, stemTop.z));
    mids.push(new THREE.Vector3(stemTop.x, stemTop.y + 0.22, stemTop.z));
    const aft = capPoint(tOf(-6.6), s, 0.06);
    tops.unshift(new THREE.Vector3(aft.x, aft.y + railTopY + 0.05, aft.z));
    mids.unshift(new THREE.Vector3(aft.x, aft.y + railMidY + 0.05, aft.z));
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tops, false, 'catmullrom', 0.25), 60, 0.026, 6, false), steel, true);
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(mids, false, 'catmullrom', 0.25), 60, 0.022, 6, false), steel);
    // aft stanchion for the cockpit coaming
    const c = capPoint(0.03, s, 0.06);
    const cst = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.72, 6), steel);
    cst.position.set(c.x, c.y + 0.39, c.z);
    group.add(cst);
  }
  // bow pulpit rail across the stem
  const pulpit = [];
  const bowTopY = deckEdgeY(1) + bulwarkH(1);
  for (const s of [1, -1]) {
    const a = capPoint(0.978, s, 0.02);
    pulpit.push(new THREE.Vector3(a.x, a.y + 0.5, a.z));
    pulpit.push(new THREE.Vector3(11.95, bowTopY + 0.38, s * 0.14));
  }
  pulpit.splice(2, 0, new THREE.Vector3(12.15, bowTopY + 0.34, 0));
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pulpit, false, 'catmullrom', 0.2), 36, 0.026, 6, false), steel);
  // stern rail across the transom corners
  const stern = [];
  for (const s of [1, -1]) {
    const a = capPoint(0.03, s, 0.06);
    stern.push(new THREE.Vector3(a.x, a.y + 0.72, a.z));
    stern.push(new THREE.Vector3(X_STERN + 0.1, deckEdgeY(0) + 0.72, s * 1.7));
  }
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stern, false, 'catmullrom', 0.2), 26, 0.026, 6, false), steel);

  // roof handrails
  for (const s of [1, -1]) {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const x = -3.6 + (3.0 - -3.6) * (i / 12);
      pts.push(new THREE.Vector3(x, ROOF.hi + 0.14, s * (roofHalf(x) + 0.07)));
    }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 26, 0.024, 6, false), steel);
    for (const x of [-3.4, -1.2, 1.0, 2.8]) {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.16, 6), steel);
      foot.position.set(x, ROOF.hi + 0.07, s * (roofHalf(x) + 0.07));
      group.add(foot);
    }
  }

  // cleats
  function cleatAt(x, s) {
    const t = tOf(x);
    const p = capPoint(t, s, 0.3);
    const g = new THREE.Group();
    g.position.set(p.x, p.y + 0.055, p.z);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.46, 8), steel);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = 0.11;
    g.add(bar);
    for (const d of [-0.12, 0.12]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.12, 8), steel);
      leg.position.set(d, 0.05, 0);
      g.add(leg);
    }
    group.add(g);
  }
  for (const s of [1, -1]) for (const x of [-10.1, -6.9, 0.4, 10.0]) cleatAt(x, s);

  // fenders hung over the starboard rail, the way she sits at the dock
  for (const t of [tOf(-7.6), tOf(-5.4)]) {
    const anchor = sidePoint(t, 0.52, 1, 0.20);
    const body = add(new THREE.CylinderGeometry(0.175, 0.175, 0.52, 12), fenderMat, true, false);
    body.position.copy(anchor);
    for (const dy of [0.26, -0.26]) {
      const cap = add(new THREE.SphereGeometry(0.175, 12, 8), fenderMat, true, false);
      cap.scale.set(1, 0.62, 1);
      cap.position.set(anchor.x, anchor.y + dy, anchor.z);
    }
    const cap = capPoint(t, 1, 0.02);
    const lineTop = anchor.y + 0.4;
    const lanyard = add(new THREE.CylinderGeometry(0.013, 0.013, Math.max(0.08, cap.y - lineTop), 5), ropeMat);
    lanyard.position.set((anchor.x + cap.x) / 2, (cap.y + lineTop) / 2, (anchor.z + cap.z) / 2);
    lanyard.rotation.x = -Math.atan2(anchor.z - cap.z, cap.y - lineTop);
  }
  // a mooring line coiled down on the foredeck
  for (let k = 0; k < 3; k++) {
    const coil = add(new THREE.TorusGeometry(0.20 + k * 0.075, 0.026, 6, 18), ropeMat, true, false);
    coil.rotation.x = Math.PI / 2;
    coil.position.set(8.35 - k * 0.012, deckEdgeY(tOf(8.35)) + 0.028 + k * 0.004, 1.05);
  }

  // nav lights at the bow
  for (const [s, mat] of [[1, lampG], [-1, lampR]]) {
    const p = sidePoint(tOf(10.1), 0.985, s, 0.035);
    const l = add(new THREE.BoxGeometry(0.16, 0.12, 0.1), mat);
    l.position.set(p.x, p.y + bulwarkH(tOf(10.1)) * 0.6, p.z);
    l.rotation.y = hullYaw(tOf(10.1), 0.985, s);
  }

  /* ---------------------------------------------------------------- batching
     The fittings (stanchions, rails, cleats, louvres, seating) are hundreds of tiny
     meshes sharing a handful of materials. Baking each bucket into one buffer takes
     the draw call count from ~240 to ~30, which is what makes this affordable on a
     phone — the shadow pass walks the same list. Occluders stay separate because the
     marker raycast holds references to them.                                        */
  occluders.push(topsides, bottom, transom, houseLower, houseBand, houseUpper, roof, flyCoam, hardtop, deck, ventMesh);
  batchByMaterial(group, new Set(occluders));

  /* ---------------------------------------------------------------- zone overlays
     Each is its own shell standing a couple of centimetres proud of the surface it
     highlights — a coincident clone would z-fight instead of tinting.              */
  const overlayGeos = {
    hull: bothSides((s) => gridGeometry(NT, 6, (a, b) => sidePoint(a, b, s, 0.03), s < 0)),
    cabin: prism(HOUSE, HOUSE.winLo + 0.02, HOUSE.winHi - 0.02, {
      off: 0.055, tumble: 0.05, rake: 0.42, rakeX0: 1.4, rakeX1: HOUSE.x1, crease: 0.42,
    }),
    deck: mergeGeometries([
      gridGeometry(12, 3, (a, b) => {
        const t = tC0 + (tC1 - tC0) * a;
        const hw = sheerHalf(t) - 0.30;
        return new THREE.Vector3(tx(t), COCKPIT.sole + 0.04, -hw + 2 * hw * b);
      }, true),
      (() => {
        const g = new THREE.PlaneGeometry(PLATFORM.xF - PLATFORM.xA, PLATFORM.half * 2 - 0.2);
        g.rotateX(-Math.PI / 2);
        g.translate((PLATFORM.xA + PLATFORM.xF) / 2, PLATFORM.top + 0.05, 0);
        return g;
      })(),
    ].map((g) => { g.deleteAttribute('uv'); return g; }), false),
    engine: bothSides((s) => mergeGeometries(VENTS.map(([a, b]) => {
      const g = hullPatch(s, a - 0.012, b + 0.012, () => 0.665, 0.165, 0.09, 0.16, 12, 3);
      g.deleteAttribute('uv');
      return g;
    }), false)),
  };
  overlayGeos.hull.deleteAttribute('uv');
  overlayGeos.cabin.deleteAttribute('uv');

  const overlays = {};
  for (const zone of Object.keys(overlayGeos)) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xc4884f, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    const mesh = new THREE.Mesh(overlayGeos[zone], mat);
    mesh.visible = false;
    mesh.renderOrder = 4;
    group.add(mesh);
    overlays[zone] = { mesh, mat, hover: false, selected: false, flash: 0 };
    mats.push(mat);
  }

  return { group, occluders, overlays, mats, texs };
}


/* ==================================================================== 6b. the harbour cove
   A Ligurian cove wrapped round the yacht: wooded hills, a pastel village climbing from a
   curved quay, a church on its point, a fort and a lighthouse on the headland, the harbour
   full of small boats. All of it is procedural and all of it is backdrop: it never casts or
   receives shadows, never joins the marker occluders, and every material shares one haze
   model (the sky colour along the view ray), so distant ridges dissolve into the sky behind
   them instead of popping against it.

   Layout, as azimuth a = atan2(z, x) round the yacht (bow = +x, the low sun at a ≈ -12°).
   Every voyage stop looks toward -z, so the cove is composed for that half:
     the harbour mouth   a ∈ (-48°, +8°)    open sea dead ahead of the bow, into the sun
     the headland        a ∈ (-102°, -48°)  wooded point, fort, lighthouse on its tip
     the village         a ∈ (-166°, -114°) quay, piazza, pastel houses climbing the slope
     the west arm        a ∈ (+150°, -166°) villas and stone pines
     behind the cameras  a ∈ (+8°, +150°)   hills only, closing the ring                    */

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
const SUN_AZ = Math.atan2(SUN.z, SUN.x);
const COVE = {
  a0: 8 * D2R,       // the land arc starts on the far side of the mouth...
  span: 304 * D2R,   // ...and runs anticlockwise round to the headland tip at -48°
  rOut: 440,         // outer edge of the terrain grid
  quay: 170,         // the quay face: the village's waterline
  quayTop: 1.4,      // quay and piazza level
  front: 185,        // the waterfront row's facade line
  mask: 1200,        // world span of the shore-distance field, centred on the yacht
};

const BEHIND = [40 * Math.PI / 180, 150 * Math.PI / 180];   // azimuths no camera ever looks toward
const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
// raised-cosine bump in azimuth (degrees): 1 at c, 0 beyond ±w
function bumpDeg(ad, c, w) {
  let d = Math.abs(ad - c) % 360;
  if (d > 180) d = 360 - d;
  return d >= w ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * d / w);
}
// 1 inside [lo, hi] degrees (no wrap), feathered ±f
const bandDeg = (ad, lo, hi, f) => sstep(lo - f, lo + f, ad) * (1 - sstep(hi - f, hi + f, ad));

function hash2(ix, iy, s) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct, s) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { sum += amp * vnoise(x * f, y * f, s + i * 31); norm += amp; f *= 2.07; amp *= 0.5; }
  return sum / norm;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// the waterline radius at azimuth ad (degrees)
function shoreR(ad) {
  let s = 176;
  s -= 26 * bumpDeg(ad, -52, 15);     // the headland's rocky tip reaches into the mouth
  s += 13 * bumpDeg(ad, -80, 11);     // a pocket beach under the fort
  s -= 20 * bumpDeg(ad, -107, 7);     // the church point
  s -= 18 * bumpDeg(ad, 162, 26);     // the west arm's point
  s += 10 * Math.sin(ad * D2R * 5 + 0.7) * bumpDeg(ad, 80, 70);
  const q = bandDeg(ad, -165, -117, 4);
  return s + (COVE.quay - s) * q;
}
// height of the first range of hills, and of the higher ground behind it
function hillH(ad) {
  return 50 + 64 * bumpDeg(ad, -144, 46) + 22 * bumpDeg(ad, -100, 16) - 25 * bumpDeg(ad, -52, 17)
    + 46 * bumpDeg(ad, 168, 42) + 30 * bumpDeg(ad, 80, 70);
}
function backH(ad) {
  return 34 + 58 * bumpDeg(ad, -150, 62) + 30 * bumpDeg(ad, 150, 50) - 22 * bumpDeg(ad, -58, 24);
}

// terrain height at (x, z); negative under the water
function coveHeight(x, z) {
  const r = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  let u = (a - COVE.a0) % TAU;
  if (u < 0) u += TAU;
  // the two tips: beyond them the coast falls away, so the mouth opens wider with distance
  const u1 = COVE.span - Math.max(0, r - 150) * 0.0009;
  const u0 = Math.max(0, r - 190) * 0.0007;
  const edge = Math.min(sstep(u0, u0 + 0.13, u), sstep(u1, u1 - 0.075, u));
  if (edge <= 0) return -16;
  const ad = a / D2R;
  const d = r - shoreR(ad);
  let h;
  if (d < 0) {
    h = Math.max(-16, d * 0.8);
  } else {
    const arc = a * 180;
    const vil = bandDeg(ad, -166, -114, 6);
    const beach = bumpDeg(ad, -80, 7);
    h = hillH(ad) * (1 - Math.exp(-d / (42 + 34 * vil)));
    h += backH(ad) * sstep(110, 280, d);
    h *= 0.64 + 0.7 * fbm(arc / 64 + 17, d / 170, 3, 7);      // spurs and gullies down the fall line
    h += (fbm(arc / 34, d / 60, 2, 19) - 0.5) * 12 * sstep(4, 40, d);
    h += (1 - vil) * (1 - beach) * 4.2 * sstep(0, 6, d);        // a rocky lip at the waterline
    if (beach > 0) h *= 1 - 0.7 * beach * (1 - sstep(8, 30, d));
    if (vil > 0) {
      // the village bowl: the quay shelf, a steady climb of garden terraces (soft 5 m risers),
      // then the wooded hills rising steeply behind the top row
      const shelf = COVE.quayTop + 0.25 * sstep(2, 16, d);
      const q = Math.max(0, d - 26) * 0.4 / 5, fq = q - Math.floor(q);
      const ramp = (Math.floor(q) + sstep(0.7, 1.0, fq)) * 5;
      const cap = shelf + ramp + Math.max(0, d - 125) * 0.9 + (fbm(arc / 30, d / 30, 2, 23) - 0.5) * 3 * sstep(26, 60, d);
      h += (Math.min(Math.max(h, shelf), cap) - h) * vil;
    }
  }
  return -16 + (h + 16) * edge;
}

/* ---- shared sky + haze shader code ------------------------------------------------
   The haze is evaluated per vertex (the sky is smooth, so the varying carries it well) and
   mixed in linear light before tone mapping, so a fully hazed ridge maps to exactly the sky
   behind it. The cove's materials are Lambert with a cheap analytic sky ambient standing in
   for the IBL: the backdrop is matte and far away, and full PBR on it cost ~8 fps at 2x DPR. */

const COVE_SKY_GLSL = /* glsl */`
uniform vec3 cvZenith;
uniform vec3 cvMid;
uniform vec3 cvHorizonCool;
uniform vec3 cvHorizonWarm;
uniform vec3 cvSunDir;
uniform vec2 cvSunH;
uniform vec3 cvSunColor;
vec3 coveHorizon(vec2 hz, out float facing) {
  facing = dot(hz, cvSunH) * 0.5 + 0.5;
  return mix(cvHorizonCool, cvHorizonWarm, facing * facing * sqrt(facing));
}
vec3 coveSky(vec3 d) {
  float facing;
  vec3 horizon = coveHorizon(d.xz / max(length(d.xz), 1e-4), facing);
  float y = d.y;
  vec3 c = mix(horizon, cvMid, smoothstep(0.0, 0.30, y));
  c = mix(c, cvZenith, smoothstep(0.20, 0.90, y));
  if (y < 0.0) c = horizon * (1.0 - 0.18 * smoothstep(0.0, -0.3, y));
  float s = max(dot(d, cvSunDir), 0.0), s2 = s * s, s4 = s2 * s2, f2 = facing * facing;
  // (the sun itself sits above every framing: only its glow is drawn)
  c += cvSunColor * (0.55 * s4 * s4 + 0.22 * f2 * f2 * facing * exp(-abs(y) * 10.0));
  return c;
}`;

// vertex: world position (instanced or not), the haze amount, and the sky colour behind it
const COVE_HAZE_VERT = /* glsl */`
{
  vec4 cvW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  cvW = instanceMatrix * cvW;
  #endif
  cvW = modelMatrix * cvW;
  vec3 cvV = cvW.xyz - cameraPosition;
  float cvD = length(cvV);
  float cvK = max(cvD - 80.0, 0.0);
  vCoveF = clamp(max(1.0 - exp(-cvK * cvHaze.x), cvHaze.y * smoothstep(420.0, 780.0, cvD))
    * (1.0 - cvHaze.z * smoothstep(10.0, 220.0, cvW.y)), 0.0, 0.95);
  vCoveHaze = coveSky(cvV / max(cvD, 1e-3));
  // the reveal: the cove rises out of the stage navy the moment it is built, instead of popping
  vCoveHaze = mix(cvBelow, vCoveHaze, cvReveal);
  vCoveF = mix(1.0, vCoveF, cvReveal);
}`;

// fragment, after <lights_fragment_maps>: the sky's diffuse light, in place of the IBL
const COVE_AMBIENT_FRAG = /* glsl */`
#if defined( RE_IndirectDiffuse )
{
  vec3 cvN = inverseTransformDirection(normal, viewMatrix);
  vec2 cvNh = cvN.xz + vec2(1e-4);
  vec3 cvAmb = mix(cvAmbGround, cvAmbSky, cvN.y * 0.5 + 0.5)
    + cvAmbSun * max(dot(cvNh, cvSunH), 0.0);
  irradiance += PI * cvAmb;
}
#endif`;

// moored boats and buoys: heave, roll and pitch from the shared clock, phased by position
const COVE_BOB_VERT = /* glsl */`
#ifdef USE_INSTANCING
{
  float ph = instanceMatrix[3].x * 0.071 + instanceMatrix[3].z * 0.113;
  float roll = sin(cvTime * 0.83 + ph) * 0.035;
  float pitch = sin(cvTime * 0.61 + ph * 1.7) * 0.016;
  transformed.y += sin(cvTime * 0.57 + ph * 2.3) * 0.07 + transformed.z * roll + transformed.x * pitch;
}
#endif`;

// houses. Per instance, aHouse = (facade column + 16 × roof column, top of the ground floor in
// metres above the base, roof pitch factor, eave overhang factor). The roof's ridge is raised or
// lowered and its eaves pushed out per house, so no two roofs share a pitch; the wall's facade is
// worked out per fragment (see COVE_BUILDING_MAP) from how high up the wall it is, in metres.
const COVE_BUILDING_VERT = /* glsl */`
#ifdef USE_INSTANCING
{
  float cvH = length(instanceMatrix[1].xyz);
  float cvRc = floor(aHouse.x / 16.0 + 0.01);
  if (position.y > 1.001) transformed.y = 1.0 + (position.y - 1.0) * aHouse.z;   // ridge (and gable apex)
  if (aPart > 0.5) {
    transformed.xz *= aHouse.w;
    #ifdef USE_MAP
    vMapUv = vec2((cvRc + 0.03 + 0.94 * uv.x) / 16.0, 0.008 + 0.234 * uv.y);
    #endif
  }
  vFac = vec4(uv.x, transformed.y * cvH, aHouse.x - cvRc * 16.0, aPart);
  vFacG = vec3(aHouse.y, cvH, cvRc);
}
#endif`;

// fragment, in place of <map_fragment>: the ground floor (shopfronts, arcades, doors, the plinth
// below it) then the upper floors repeating to the eaves, sampled with the gradients of the
// unwrapped coordinate so the wrap never shows as a seam; then the cheap occlusion a street and an
// eave give a wall: darker along its foot and in the band under the roof
const COVE_BUILDING_MAP = /* glsl */`
#ifdef USE_MAP
{
  vec4 cvTex;
  if (vFac.w > 0.5) {
    cvTex = texture2D(map, vMapUv);
  } else {
    float y = vFac.y, g = vFacG.x, u = (vFac.z + 0.035 + 0.93 * vFac.x) / 16.0;
    vec2 cd = vec2(u, y * 0.078);
    vec2 cvUv = y < g
      ? vec2(u, 0.25 + 0.245 * clamp(1.0 - (g - y) / 4.2, 0.0, 1.0))
      : vec2(u, 0.502 + 0.496 * fract((y - g) / 6.4));
    cvTex = textureGrad(map, cvUv, dFdx(cd), dFdy(cd));
    float cvFlat = 1.0 - step(0.5, abs(vFacG.z - 2.0));   // roof column 2: a flat terrace
    float cvFoot = smoothstep(0.0, 1.6, y - (g - 4.2));
    float cvEave = y > vFacG.y ? 1.0 : smoothstep(0.0, mix(1.1, 0.35, cvFlat), vFacG.y - y);
    cvTex.rgb *= mix(0.6, 1.0, cvFoot) * mix(0.66, 1.0, cvEave);
    // on a terrace roof the parapet shows as a pale coping band along the top of the wall
    cvTex.rgb = mix(cvTex.rgb, vec3(0.86, 0.8, 0.7), step(vFacG.y - 0.45, y) * 0.8 * cvFlat);
  }
  diffuseColor *= cvTex;
}
#endif`;

// terrain: the crown mottling only where something grows, not on rock, sand or paving. Sampled
// twice, at two scales and turned against each other, so the tile never shows as a repeat.
const COVE_VEG_MAP = /* glsl */`
#ifdef USE_MAP
{
  vec3 cvA = texture2D(map, vMapUv).rgb;
  vec3 cvB = texture2D(map, mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.41 + vec2(0.37, 0.71)).rgb;
  diffuseColor.rgb *= mix(vec3(0.8), cvA * cvB * 2.1, vVeg);
}
#endif`;

/* water: Ligurian green-turquoise. Seen steeply (most of the high stops) the harbour shows its own
   body colour, deep teal out in the basin and turquoise over the shallows; seen at a graze it turns
   to mirror — the hills, the village's facades along the quay, the sky — as real water does
   (Schlick's fresnel weighs the two). The water fills most of the frame from the high stops, so
   everything smooth (the shallows, the haze, the gold pooling toward the low sun) is worked out per
   vertex on a ring mesh that is dense near the shore; only the fresnel, the mirror and the sun's
   glitter, which the ripples break up, run per pixel. */
const WATER_VERT_PARS = COVE_SKY_GLSL + /* glsl */`
attribute float aShore;
uniform float cvWaterHaze;
uniform float cvWarm;
uniform vec3 cvBelow;
uniform float cvReveal;
varying vec3 vCoveW;
varying float vShore;
varying vec4 vWHaze;
varying float vWarmF;`;

// after <project_vertex>
const WATER_VERT = /* glsl */`
vCoveW = (modelMatrix * vec4(transformed, 1.0)).xyz;
vShore = aShore * cvReveal;
{
  vec3 cvV = vCoveW - cameraPosition;
  float cvD = max(length(cvV), 1e-3);
  vec2 cvDh = cvV.xz / max(length(cvV.xz), 1e-3);
  float cvFace;
  vec3 cvHzc = coveHorizon(cvDh, cvFace) * 0.94;
  float cvS = max(dot(cvV / cvD, cvSunDir), 0.0), cvS2 = cvS * cvS, cvS4 = cvS2 * cvS2, cvF2 = cvFace * cvFace;
  cvHzc += cvSunColor * (0.55 * cvS4 * cvS4 + 0.2 * cvF2 * cvF2 * cvFace);
  // (until the cove is revealed the far water fades to the stage navy, as it always did)
  vWHaze = vec4(mix(cvBelow, cvHzc, cvReveal), 1.0 - exp(-cvWaterHaze * cvWaterHaze * cvD * cvD));
  // the low sun's gold, pooling on the open water along its own bearing only
  float cvToSun = max(dot(cvDh, cvSunH), 0.0);
  cvToSun *= cvToSun; cvToSun *= cvToSun;
  vWarmF = cvWarm * cvToSun * cvToSun * smoothstep(90.0, 460.0, cvD) * (1.0 - aShore) * cvReveal;
}`;

const WATER_PARS = COVE_SKY_GLSL + /* glsl */`
varying vec3 vCoveW;
varying float vShore;
varying vec4 vWHaze;
varying float vWarmF;
uniform sampler2D cvSilTex;
uniform vec3 cvDeep;
uniform vec3 cvShallow;
uniform vec3 cvGold;
uniform vec3 cvHillDark;
uniform vec3 cvHillLit;
uniform vec3 cvTown;
uniform vec2 cvTownDir;
uniform float cvHillAmt;
uniform float cvReveal;
float cvHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cvNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cvHash(i), cvHash(i + vec2(1.0, 0.0)), f.x), mix(cvHash(i + vec2(0.0, 1.0)), cvHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

// after <emissivemap_fragment> (the perturbed normal is known by then): the water's own colour,
// the light scattered back up out of it, which is what the steep views see instead of the sky.
// The seabed shows through it in patches: darker meadows of seagrass, paler sand between.
const WATER_BODY_FRAG = /* glsl */`
{
  float cvNV = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  float cvFr = 0.02 + 0.98 * pow(1.0 - cvNV, 5.0);
  float cvBed = cvNoise(vCoveW.xz / 38.0) * 0.62 + cvNoise(vCoveW.xz / 13.0 + 7.3) * 0.38;
  vec3 cvBody = mix(cvDeep, cvShallow, vShore) * mix(vec3(0.62, 0.7, 0.72), vec3(1.12, 1.2, 1.08), smoothstep(0.25, 0.75, cvBed));
  // (held up even at a graze: low over the water the harbour still reads green, not as sky)
  totalEmissiveRadiance += cvBody * (1.0 - 0.7 * cvFr) * mix(0.35, 1.0, cvReveal);
}`;

// after <lights_fragment_maps>: where the reflected ray would meet the ridge, mirror the hill.
// The harbour is flat, so the reflected ray is the view ray with its climb flipped: its bearing is
// the view's, its elevation the angle we look down at. The ripples only shimmer the edge (the
// sideways tilt of the normal map, which is all the camera's roll-free view space shows of it).
// Along the quay the lowest band of the mirror is the village's facades rather than the woods.
const WATER_REFL_FRAG = /* glsl */`
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
{
// the sky it mirrors is graded toward the sea's own green and held down, and warms back to gold
// only along the sun's bearing: turquoise water under a warm sky, not a milky sheet of the sky
{
  vec3 cvVn = normalize(vCoveW - cameraPosition);
  vec2 cvVd = cvVn.xz / max(length(cvVn.xz), 1e-3);
  float cvSunw = max(dot(cvVd, cvSunH), 0.0);
  cvSunw *= cvSunw; cvSunw *= cvSunw; cvSunw *= cvSunw;
  float cvLum = dot(radiance, vec3(0.3, 0.55, 0.15));
  vec3 cvGrade = mix(vec3(0.36, 0.9, 0.86), vec3(1.05, 0.8, 0.52), cvSunw);
  radiance = mix(radiance, cvLum * cvGrade, 0.72) * mix(0.5, 0.75, cvSunw);
}
vec3 cvV = vCoveW - cameraPosition;
float cvVh = max(length(cvV.xz), 1e-3);
float cvGraze = -cvV.y / cvVh;   // tan of how steeply this water is seen
if (cvGraze < 0.5) {   // steeper water can only mirror sky (and it is most of the high stops)
  vec2 cvDh = cvV.xz / cvVh;
  vec4 cvSil = texture2D(cvSilTex, cvDh * 0.5 + 0.5);   // indexed by direction: no atan
  float cvDist = max(14.0, cvSil.g * 600.0 - dot(vCoveW.xz, cvDh));
  float cvHill = cvSil.r * 255.0 / cvDist;
  float cvRay = cvGraze * (1.0 + 9.0 * geometryNormal.x);
  float cvM = cvSil.a * cvReveal * (1.0 - smoothstep(cvHill * 0.8, cvHill * 1.05 + 0.004, cvRay));
  float cvFace;
  vec3 cvCol = mix(cvHillDark, cvHillLit, cvSil.b);
  float cvTownW = smoothstep(0.82, 0.93, dot(cvDh, cvTownDir)) * (1.0 - smoothstep(18.0 / cvDist, 26.0 / cvDist, cvRay));
  cvCol = mix(cvCol, cvTown, cvTownW);
  cvCol = mix(cvCol, coveHorizon(cvDh, cvFace) * 0.55, 1.0 - exp(-cvDist * 0.0032));
  radiance = mix(radiance, cvCol * cvHillAmt, cvM);
}
}
radiance *= 1.0 - 0.3 * vShore;
#endif`;

// before <opaque_fragment>: the sun's own glitter on the ripples (the water takes no highlight from
// the scene's lights: the fill light would lay a cold streak toward the camera that no sun made),
// the gold pooling toward it, then the cove's haze
const WATER_OUT_FRAG = /* glsl */`
{
  vec3 cvL = normalize((viewMatrix * vec4(cvSunDir, 0.0)).xyz);
  float cvSg = max(dot(reflect(-normalize(vViewPosition), normal), cvL), 0.0);
  float cvSg2 = cvSg * cvSg, cvSg8 = cvSg2 * cvSg2; cvSg8 *= cvSg8;
  outgoingLight += cvGold * (pow(cvSg, 700.0) * 5.0 + cvSg8 * cvSg8 * cvSg8 * 0.12) * cvReveal;
  outgoingLight = mix(outgoingLight, cvGold * 0.8, vWarmF);
  outgoingLight = mix(outgoingLight, vWHaze.rgb, vWHaze.a);
}`;

function makeCoveUniforms(blank) {
  return {
    cvZenith: { value: new THREE.Color(0x0c1d39) },
    cvMid: { value: new THREE.Color(0x34507a) },
    cvHorizonCool: { value: new THREE.Color(0x959aab) },
    cvHorizonWarm: { value: new THREE.Color(0xf2b889) },
    cvSunDir: { value: SUN.clone() },
    cvSunH: { value: new THREE.Vector2(SUN.x, SUN.z).normalize() },
    cvSunColor: { value: new THREE.Color(0xffc184) },
    cvBelow: { value: new THREE.Color(STAGE_BG) },
    cvReveal: { value: 0 },   // 0 → 1 as the cove comes in (see stageHarbor)
    // haze: rate past 80 m, how deep the far range sinks into it, how much thinner it is up high
    cvHaze: { value: new THREE.Vector3(0.00085, 0.86, 0.3) },
    // the sky's diffuse light on the cove (radiance, linear): overhead, from below, sunward
    cvAmbSky: { value: new THREE.Color(0.3, 0.34, 0.4) },
    cvAmbGround: { value: new THREE.Color(0.07, 0.065, 0.06) },
    cvAmbSun: { value: new THREE.Color(0.16, 0.1, 0.05) },
    cvTime: { value: 0 },
    // water: the silhouette is filled in when the cove is built; blank until then
    cvSilTex: { value: blank },
    cvDeep: { value: new THREE.Color(0x0e4f55).multiplyScalar(1.0) },     // the basin's body colour
    cvShallow: { value: new THREE.Color(0x2aa39a).multiplyScalar(0.62) }, // over the shallows
    cvGold: { value: new THREE.Color(1.0, 0.72, 0.38) },                  // the low sun on the water
    cvHillDark: { value: new THREE.Color(0x1a3a22) },
    cvHillLit: { value: new THREE.Color(0x66753a) },
    cvTown: { value: new THREE.Color(0xb9825a) },                          // the quay's facades, mirrored
    cvTownDir: { value: new THREE.Vector2(Math.cos(-140 * D2R), Math.sin(-140 * D2R)) },
    cvHillAmt: { value: 0.7 },
    cvWaterHaze: { value: 0.0021 },
    cvWarm: { value: 0.55 },
  };
}

// a MeshLambertMaterial wearing the cove light and haze (and optionally the bob, the facade
// atlas, or the terrain's vegetation weighting)
function coveMaterial(params, U, mods = {}) {
  const mat = new THREE.MeshLambertMaterial(params);
  mat.fog = false;
  const key = `cove-${mods.building ? 'b' : ''}${mods.bob ? 'o' : ''}${mods.terrain ? 't' : ''}`;
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    let vs = sh.vertexShader.replace('#include <common>', `#include <common>
${COVE_SKY_GLSL}
uniform vec3 cvHaze;
uniform vec3 cvBelow;
uniform float cvReveal;
varying vec3 vCoveHaze;
varying float vCoveF;
${mods.bob ? 'uniform float cvTime;' : ''}
${mods.building ? 'attribute vec4 aHouse;\nattribute float aPart;\nvarying vec4 vFac;\nvarying vec3 vFacG;' : ''}
${mods.terrain ? 'attribute float aVeg;\nvarying float vVeg;' : ''}`);
    if (mods.terrain) vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\nvVeg = aVeg;');
    if (mods.bob) vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>\n${COVE_BOB_VERT}`);
    if (mods.building) vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>\n${COVE_BUILDING_VERT}`);
    sh.vertexShader = vs.replace('#include <project_vertex>', `#include <project_vertex>\n${COVE_HAZE_VERT}`);
    let fs = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 cvAmbSky;
uniform vec3 cvAmbGround;
uniform vec3 cvAmbSun;
uniform vec2 cvSunH;
varying vec3 vCoveHaze;
varying float vCoveF;
${mods.terrain ? 'varying float vVeg;' : ''}
${mods.building ? 'varying vec4 vFac;\nvarying vec3 vFacG;' : ''}`)
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>\n${COVE_AMBIENT_FRAG}`)
      .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, vCoveHaze, vCoveF);\n#include <opaque_fragment>');
    if (mods.terrain) fs = fs.replace('#include <map_fragment>', COVE_VEG_MAP);
    if (mods.building) fs = fs.replace('#include <map_fragment>', COVE_BUILDING_MAP);
    sh.fragmentShader = fs;
  };
  return mat;
}

/* ---- canvas textures ---------------------------------------------------------------- */

// grey canopy mottling, multiplied over the terrain's vertex colours: crown-sized lumps with dark
// gaps between them, gathered into clumps and thinner clearings (noise, so there is no regular
// scale pattern of round crowns to pick out)
function makeCanopyTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const norm = (h) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < h.length; i++) { if (h[i] < lo) lo = h[i]; if (h[i] > hi) hi = h[i]; }
    for (let i = 0; i < h.length; i++) h[i] = (h[i] - lo) / ((hi - lo) || 1);
    return h;
  };
  const crowns = norm(noiseField(S, [[22, 1], [44, 0.5], [88, 0.28]], 4711));
  const clumps = norm(noiseField(S, [[5, 1], [9, 0.6]], 1717));
  for (let i = 0; i < S * S; i++) {
    const k = crowns[i], m = clumps[i];
    let v = 0.3 + 0.7 * sstep(0.3, 0.72, k);         // a crown top, or the shade between crowns
    v *= 0.7 + 0.3 * sstep(0.22, 0.68, m);           // the thick of the wood, or a clearing
    const l = Math.round(clamp(v, 0, 1) * 250);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = l;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* The facade atlas: 16 columns of 128 px, one per facade. Each column is three bands, top to
   bottom: two upper floors (256 px, repeating up the wall), the ground floor and its plinth
   (128 px: arcades, shopfronts or a plain door), and a roof texture (128 px; only the first four
   columns are used: terracotta, Ligurian slate, terrace paving, faded tile).                  */
const FACADE_N = 16;
const FACADE_WALLS = ['#d9a441', '#e9c878', '#b9553a', '#dc8661', '#e8d8ba', '#dc9e8f', '#d97d40', '#e3b36a',
  '#c96f4a', '#f0d9a8', '#d4a07a', '#b8664a', '#e8c0a0', '#cfa36b', '#e6c79a', '#c4553f'];
const FACADE_SHUT = ['#4a6a4c', '#4d6e50', '#3f5c45', '#557a5a', '#5b4636', '#6a7b6e', '#44624a', '#3e5a4a', '#6b5a3e'];
const FACADE_TRIM = ['#f1e3c4', '#fbf1dc', '#ebd2b2', '#f3dcc0', '#ffffff', '#f6e6da', '#efdcb8'];

function makeFacadeAtlas() {
  const CW = 128, H = 512;
  const c = document.createElement('canvas');
  c.width = CW * FACADE_N; c.height = H;
  const ctx = c.getContext('2d');
  const shade = (hex, k) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.round(clamp(v * k, 0, 255));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  };
  for (let col = 0; col < FACADE_N; col++) {
    const R = rng(1906 + col * 7919);
    const x0 = col * CW;
    const wall = FACADE_WALLS[col];
    const shut = FACADE_SHUT[Math.floor(R() * FACADE_SHUT.length)];
    const trim = FACADE_TRIM[Math.floor(R() * FACADE_TRIM.length)];
    const nWin = 2 + Math.floor(R() * 4);               // 2 to 5 windows a floor
    const style = Math.floor(R() * 3);                   // 0 plain, 1 balconies, 2 arched heads
    const string = R() < 0.6, quoins = R() < 0.45;
    const ground = Math.floor(R() * 3);                  // 0 arcade, 1 shopfronts, 2 door + windows
    // wall and weathering, over the whole column (the stains run down across the floors)
    ctx.fillStyle = wall;
    ctx.fillRect(x0, 0, CW, 384);
    for (let k = 0; k < 260; k++) {
      ctx.fillStyle = R() < 0.5 ? 'rgba(40,20,0,.06)' : 'rgba(255,255,255,.07)';
      const s = 2 + R() * 7;
      ctx.fillRect(x0 + R() * CW, R() * 384, s, s);
    }
    for (let k = 0; k < 5; k++) {
      const sx = x0 + R() * CW, sy = R() * 300;
      const g = ctx.createLinearGradient(0, sy, 0, sy + 60 + R() * 80);
      g.addColorStop(0, 'rgba(60,40,20,.13)'); g.addColorStop(1, 'rgba(60,40,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx, sy, 3 + R() * 6, 140);
    }
    // window centres: uneven, a pair sometimes pulled together
    const mX = 12 + R() * 6, span = CW - mX * 2;
    const cx = [];
    for (let w = 0; w < nWin; w++) cx.push(x0 + mX + span * (w + 0.5) / nWin + (R() - 0.5) * span / nWin * 0.34);
    if (nWin >= 4 && R() < 0.5) { cx[1] -= 3; cx[2] += 3; }
    const ww = [0, 0, 17, 13, 11, 9][nWin];
    // upper floors
    for (let f = 0; f < 2; f++) {
      const y0 = f * 128;
      const g = ctx.createLinearGradient(0, y0, 0, y0 + 128);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(70,40,20,.1)');
      ctx.fillStyle = g;
      ctx.fillRect(x0, y0, CW, 128);
      if (string) {   // a painted stringcourse at each floor line
        ctx.fillStyle = trim;
        ctx.fillRect(x0, y0 + 122, CW, 6);
        ctx.fillStyle = 'rgba(0,0,0,.18)';
        ctx.fillRect(x0, y0 + 121, CW, 1);
      }
      const wh = 52, wy = y0 + 34;
      for (const c0 of cx) {
        const wx = c0 - ww / 2;
        ctx.fillStyle = trim;   // painted trompe-l'oeil surround
        ctx.fillRect(wx - 3, wy - 5, ww + 6, wh + 8);
        if (style === 2) { ctx.beginPath(); ctx.arc(c0, wy - 3, ww / 2 + 3, Math.PI, 0); ctx.fill(); }
        ctx.fillStyle = '#221e1b';
        ctx.fillRect(wx, wy, ww, wh);
        ctx.fillStyle = 'rgba(170,180,190,.16)';
        ctx.fillRect(wx, wy, ww, wh * 0.3);
        const sw = ww * 0.5;
        const leaves = R() < 0.3 ? [[wx, ww]] : [[wx - sw - 1, sw], [wx + ww + 1, sw]];
        for (const [sx, sW] of leaves) {
          ctx.fillStyle = shut;
          ctx.fillRect(sx, wy, sW, wh);
          ctx.fillStyle = 'rgba(0,0,0,.25)';
          for (let s = wy + 3; s < wy + wh; s += 4) ctx.fillRect(sx, s, sW, 1);
        }
        ctx.fillStyle = trim;
        ctx.fillRect(wx - 5, wy + wh + 2, ww + 10, 3);
        if (style === 1 && (f === 1 || R() < 0.3)) {   // wrought-iron balconies
          ctx.fillStyle = 'rgba(30,28,26,.85)';
          ctx.fillRect(wx - 7, wy + wh - 12, ww + 14, 2);
          for (let b = wx - 7; b <= wx + ww + 7; b += 3) ctx.fillRect(b, wy + wh - 12, 1, 12);
        }
      }
      if (quoins) {   // painted corner stones, alternating long and short
        for (let q = 0; q < 8; q++) {
          const long = q % 2 === 0;
          ctx.fillStyle = shade(trim.length === 7 ? trim : '#f1e3c4', 0.94);
          ctx.fillRect(x0, y0 + q * 16 + 1, long ? 11 : 7, 14);
          ctx.fillRect(x0 + CW - (long ? 11 : 7), y0 + q * 16 + 1, long ? 11 : 7, 14);
        }
      }
    }
    // ground floor, 256..384 (4.2 m); its top meets the first upper floor
    const G0 = 256;
    ctx.fillStyle = shade(wall, 0.92);
    ctx.fillRect(x0, G0, CW, 128);
    ctx.fillStyle = trim;
    ctx.fillRect(x0, G0, CW, 7);                         // the cornice over the ground floor
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.fillRect(x0, G0 + 7, CW, 2);
    ctx.fillStyle = shade(wall, 0.62);                   // rendered plinth
    ctx.fillRect(x0, G0 + 112, CW, 16);
    if (ground === 0) {            // arcade: deep arches, a lit café behind
      const n = 2 + Math.floor(R() * 2);
      for (let k = 0; k < n; k++) {
        const ax = x0 + 8 + (CW - 16) * (k + 0.5) / n, aw = (CW - 16) / n - 8;
        ctx.fillStyle = '#1c1714';
        ctx.fillRect(ax - aw / 2, G0 + 34, aw, 82);
        ctx.beginPath(); ctx.arc(ax, G0 + 34, aw / 2, Math.PI, 0); ctx.fill();
        ctx.fillStyle = 'rgba(255,190,110,.2)';
        ctx.fillRect(ax - aw / 2 + 3, G0 + 70, aw - 6, 40);
      }
    } else if (ground === 1) {     // shopfronts: glazed openings under a fascia
      const n = 2 + Math.floor(R() * 2);
      for (let k = 0; k < n; k++) {
        const sx = x0 + 6 + (CW - 12) * k / n + 3, sW = (CW - 12) / n - 6;
        ctx.fillStyle = shade(shut, 0.8);
        ctx.fillRect(sx - 2, G0 + 26, sW + 4, 10);
        ctx.fillStyle = '#231d18';
        ctx.fillRect(sx, G0 + 38, sW, 74);
        ctx.fillStyle = 'rgba(255,205,140,.22)';
        ctx.fillRect(sx + 2, G0 + 50, sW - 4, 58);
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        ctx.fillRect(sx + sW / 2 - 1, G0 + 38, 2, 74);
      }
    } else {                        // a green door and two small barred windows
      const dx = x0 + CW * (0.3 + R() * 0.4);
      ctx.fillStyle = trim;
      ctx.fillRect(dx - 11, G0 + 44, 22, 70);
      ctx.fillStyle = shade(shut, 0.85);
      ctx.fillRect(dx - 8, G0 + 48, 16, 66);
      for (const wx of [x0 + 18, x0 + CW - 30]) {
        if (Math.abs(wx + 6 - dx) < 22) continue;
        ctx.fillStyle = trim;
        ctx.fillRect(wx - 3, G0 + 46, 18, 34);
        ctx.fillStyle = '#221e1b';
        ctx.fillRect(wx, G0 + 49, 12, 28);
        ctx.fillStyle = 'rgba(30,28,26,.8)';
        for (let b = wx + 2; b < wx + 12; b += 3) ctx.fillRect(b, G0 + 49, 1, 28);
      }
    }
  }
  // roofs, 384..512: terracotta, grey slate, terrace paving, faded tile
  const ROOFS = [['#a4502f', 'rgba(232,142,92,.2)', 'rgba(66,22,10,.5)'],
    ['#5f5d5a', 'rgba(200,200,205,.14)', 'rgba(20,20,24,.45)'],
    ['#c7b08c', 'rgba(255,240,210,.18)', 'rgba(90,70,50,.3)'],
    ['#b8745a', 'rgba(250,190,150,.2)', 'rgba(80,36,20,.4)']];
  ROOFS.forEach(([base, lit, dark], k) => {
    const R = rng(777 + k);
    const x0 = k * CW, Y0 = 384;
    ctx.fillStyle = base;
    ctx.fillRect(x0, Y0, CW, 128);
    const step = k === 2 ? 16 : 8;
    for (let y = Y0; y < Y0 + 128; y += step) {
      ctx.fillStyle = lit;
      ctx.fillRect(x0, y, CW, 2);
      ctx.fillStyle = dark;
      ctx.fillRect(x0, y + step - 2, CW, 2);
      const off = ((y - Y0) / step) % 2 ? 0 : step * 0.6;
      for (let x = off; x < CW; x += step + 2) {
        ctx.fillStyle = dark;
        ctx.fillRect(x0 + x, y, 1, step - 2);
        if (R() < 0.14) { ctx.fillStyle = R() < 0.5 ? 'rgba(40,16,8,.22)' : 'rgba(255,220,180,.12)'; ctx.fillRect(x0 + x + 1, y + 1, step + 1, step - 3); }
      }
    }
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// how far each point of the harbour is from the shore, as a 0..1 turquoise weight: a distance
// field over the harbour, sampled into the water mesh's vertices (no texture on the GPU)
function makeShoreField(N) {
  const S = COVE.mask / N;
  const land = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) {
    const z = -COVE.mask / 2 + (j + 0.5) * S;
    for (let i = 0; i < N; i++) {
      const x = -COVE.mask / 2 + (i + 0.5) * S;
      if (x * x + z * z > 120 * 120 && coveHeight(x, z) > 0) land[j * N + i] = 1;
    }
  }
  // two-pass chamfer distance, in texels, to the nearest land
  const dist = new Float32Array(N * N);
  for (let k = 0; k < dist.length; k++) dist[k] = land[k] ? 0 : 1e9;
  const D2 = Math.SQRT2;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      let d = dist[k];
      if (i > 0) d = Math.min(d, dist[k - 1] + 1);
      if (j > 0) {
        d = Math.min(d, dist[k - N] + 1);
        if (i > 0) d = Math.min(d, dist[k - N - 1] + D2);
        if (i < N - 1) d = Math.min(d, dist[k - N + 1] + D2);
      }
      dist[k] = d;
    }
  }
  for (let j = N - 1; j >= 0; j--) {
    for (let i = N - 1; i >= 0; i--) {
      const k = j * N + i;
      let d = dist[k];
      if (i < N - 1) d = Math.min(d, dist[k + 1] + 1);
      if (j < N - 1) {
        d = Math.min(d, dist[k + N] + 1);
        if (i < N - 1) d = Math.min(d, dist[k + N + 1] + D2);
        if (i > 0) d = Math.min(d, dist[k + N - 1] + D2);
      }
      dist[k] = d;
    }
  }
  const field = new Float32Array(N * N);
  for (let k = 0; k < dist.length; k++) field[k] = Math.pow(clamp(1 - (dist[k] * S) / 140, 0, 1), 1.25);
  // bilinear lookup at world (x, z)
  return (x, z) => {
    const fx = clamp((x + COVE.mask / 2) / S - 0.5, 0, N - 1.001), fz = clamp((z + COVE.mask / 2) / S - 0.5, 0, N - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * N + i;
    const a = field[k] + (field[k + 1] - field[k]) * u, b = field[k + N] + (field[k + N + 1] - field[k + N]) * u;
    return a + (b - a) * v;
  };
}

// The sea: a ring mesh, dense across the harbour and toward the shore, sparse out in the haze.
// UVs match the CircleGeometry it replaces, so the swell tiles exactly as it did.
function makeWaterGeometry(R) {
  const RINGS = [22, 44, 64, 84, 100, 115, 130, 144, 157, 170, 183, 197, 212, 230, 250, 275, 305, 340, 385, 440, 520, 620, 750, R];
  const SEG = 128;
  const n = 1 + RINGS.length * SEG;
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), nor = new Float32Array(n * 3);
  const idx = [];
  uv[0] = uv[1] = 0.5; nor[2] = 1;
  for (let k = 0; k < RINGS.length; k++) {
    for (let i = 0; i < SEG; i++) {
      const v = 1 + k * SEG + i, a = (i / SEG) * TAU;
      const x = RINGS[k] * Math.cos(a), y = RINGS[k] * Math.sin(a);
      pos[v * 3] = x; pos[v * 3 + 1] = y;
      uv[v * 2] = x / R * 0.5 + 0.5; uv[v * 2 + 1] = y / R * 0.5 + 0.5;
      nor[v * 3 + 2] = 1;
    }
  }
  for (let i = 0; i < SEG; i++) idx.push(0, 1 + i, 1 + (i + 1) % SEG);
  for (let k = 0; k < RINGS.length - 1; k++) {
    const b0 = 1 + k * SEG, b1 = b0 + SEG;
    for (let i = 0; i < SEG; i++) {
      const i1 = (i + 1) % SEG;
      idx.push(b0 + i, b1 + i, b1 + i1, b0 + i, b1 + i1, b0 + i1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aShore', new THREE.BufferAttribute(new Float32Array(n), 1));   // filled by the cove
  g.setIndex(idx);
  return g;
}

// The ridge line seen from the harbour, per azimuth: what the water reflects near the shore.
// Stored as a small 2D map indexed by the horizontal direction itself (dir * 0.5 + 0.5), so the
// water shader looks it up without an atan per pixel; every texel carries its own bearing.
function makeSilhouetteTexture(N) {
  const A = 360;
  const rawH = new Float32Array(A), rawR = new Float32Array(A).fill(300), rawAny = new Float32Array(A);
  for (let i = 0; i < A; i++) {
    const a = ((i + 0.5) / A - 0.5) * TAU;
    const ca = Math.cos(a), sa = Math.sin(a);
    let best = 0;
    for (let r = 112; r <= COVE.rOut; r += 8) {
      const h = coveHeight(r * ca, r * sa);
      if (h > 0.5) {
        rawAny[i] = 1;
        if (h / r > best) { best = h / r; rawH[i] = h; rawR[i] = r; }
      }
    }
  }
  // Feathered over ±6° of bearing: at the two tips the land stops within a degree, and a mirror
  // that switched off there drew a hard straight line out across the harbour. The ridge now tapers
  // to nothing past each tip and the mirror fades with it.
  const table = new Uint8Array(A * 4);
  const F = 6;
  // inside the land, the last few degrees before a tip come down first...
  const hT = new Float32Array(A);
  for (let i = 0; i < A; i++) {
    if (!rawAny[i]) continue;
    let edge = F + 1;
    for (let k = 1; k <= F; k++) {
      if (!rawAny[(i + k) % A] || !rawAny[(i - k + A) % A]) { edge = k; break; }
    }
    hT[i] = rawH[i] * (0.35 + 0.65 * sstep(0, F + 1, edge));
  }
  for (let i = 0; i < A; i++) {
    // ...then the ridge and the land flag run on past the tip, tapering away
    let h = hT[i], r = rawR[i], any = rawAny[i];
    if (!rawAny[i]) {
      for (let k = -F; k <= F; k++) {
        const j = (i + k + A) % A;
        const w = 1 - Math.abs(k) / (F + 1);
        if (hT[j] * w > h) { h = hT[j] * w; r = rawR[j]; }
        any = Math.max(any, rawAny[j] * w);
      }
    }
    const a = ((i + 0.5) / A - 0.5) * TAU;
    const lit = clamp(Math.cos(a + Math.PI - SUN_AZ) * 0.5 + 0.5, 0, 1);
    table[i * 4] = clamp(Math.round(h), 0, 255);
    table[i * 4 + 1] = clamp(Math.round(r / 600 * 255), 0, 255);
    table[i * 4 + 2] = Math.round(lit * 255);
    table[i * 4 + 3] = Math.round(sstep(0, 1, any) * 255);
  }
  const data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = Math.atan2((j + 0.5) / N * 2 - 1, (i + 0.5) / N * 2 - 1);
      const k = Math.min(A - 1, Math.floor((a / TAU + 0.5) * A));
      data.set(table.subarray(k * 4, k * 4 + 4), (j * N + i) * 4);
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/* ---- geometry helpers ----------------------------------------------------------------- */

// icosphere with smooth (radial) normals: reads as a soft lump, not a faceted gem
// (corners are pushed in and out a little, hashed on position so every copy of a shared
// corner moves together, which is what stops a crown looking like a cut gem)
function blobGeo(detail, lump = 0.2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), l = Math.hypot(x, y, z) || 1;
    n.setXYZ(i, x / l, y / l, z / l);
    const k = 1 + lump * (hash2(Math.round(x * 997), Math.round(y * 991) * 31 + Math.round(z * 983), 77) * 2 - 1);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  return g;
}

// non-indexed, uv-less, with a per-vertex colour from fn(color, y, normalY)
const _pc = new THREE.Color(), _pc2 = new THREE.Color();
function paint(g, fn) {
  if (g.index) { const n = g.toNonIndexed(); g.dispose(); g = n; }
  if (g.attributes.uv) g.deleteAttribute('uv');
  const p = g.attributes.position, nr = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    fn(_pc, p.getY(i), nr.getY(i));
    col[i * 3] = _pc.r; col[i * 3 + 1] = _pc.g; col[i * 3 + 2] = _pc.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const flat = (hex) => { const c = new THREE.Color(hex); return (o) => o.copy(c); };
const shaded = (lo, mid, hi) => {
  const a = new THREE.Color(lo), b = new THREE.Color(mid), c = new THREE.Color(hi);
  return (o, y, ny) => (ny >= 0 ? o.copy(b).lerp(c, ny) : o.copy(b).lerp(a, -ny));
};

// local +x along the arc, local +z facing the harbour
const yawAt = (a) => Math.atan2(-Math.cos(a), -Math.sin(a));

// a single house, 1 × 1 × 1 walls; the instance matrix sizes it. kind: 0 a hip roof, 1 a gable
// roof (ridge along the facade, gable ends in the side walls), 2 a flat terrace roof. The roof's
// ridge sits at 1.15: COVE_BUILDING_VERT rescales that rise and the eaves per house.
function houseGeometry(kind) {
  const P = [], N = [], U = [], PART = [];
  const tri = (v, n, t, part) => { for (let k = 0; k < 3; k++) { P.push(...v[k]); N.push(...n); U.push(...t[k]); PART.push(part); } };
  const quad = (a, b, c, d, n, part, uvs) => { tri([a, b, c], n, [uvs[0], uvs[1], uvs[2]], part); tri([a, c, d], n, [uvs[0], uvs[2], uvs[3]], part); };
  const W = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const h = 0.5;
  quad([-h, 0, h], [h, 0, h], [h, 1, h], [-h, 1, h], [0, 0, 1], 0, W);
  quad([h, 0, -h], [-h, 0, -h], [-h, 1, -h], [h, 1, -h], [0, 0, -1], 0, W);
  quad([h, 0, h], [h, 0, -h], [h, 1, -h], [h, 1, h], [1, 0, 0], 0, W);
  quad([-h, 0, -h], [-h, 0, h], [-h, 1, h], [-h, 1, -h], [-1, 0, 0], 0, W);
  const o = 0.54, rise = 0.15, top = 1 + rise;
  const RU = [[0, 0.03], [1, 0.03], [0.7, 0.97], [0.3, 0.97]];
  if (kind === 2) {
    // terrace: a slab with the parapet's coping drawn along the wall top (COVE_BUILDING_MAP)
    quad([-h, 1, h], [h, 1, h], [h, 1, -h], [-h, 1, -h], [0, 1, 0], 1, W);
  } else if (kind === 1) {
    const e1 = [-o, 1, o], e2 = [o, 1, o], e3 = [o, 1, -o], e4 = [-o, 1, -o], r1 = [-o, top, 0], r2 = [o, top, 0];
    const nS = new THREE.Vector3(0, o, rise).normalize().toArray();
    const nB = new THREE.Vector3(0, o, -rise).normalize().toArray();
    const GU = [[0, 0.03], [1, 0.03], [1, 0.97], [0, 0.97]];
    quad(e1, e2, r2, r1, nS, 1, GU);
    quad(e3, e4, r1, r2, nB, 1, GU);
    // the gable ends are wall (part 0, sampled by height like the rest of it)
    tri([[h, 1, h], [h, 1, -h], [h, top, 0]], [1, 0, 0], [[0, 1], [1, 1], [0.5, 1]], 0);
    tri([[-h, 1, -h], [-h, 1, h], [-h, top, 0]], [-1, 0, 0], [[0, 1], [1, 1], [0.5, 1]], 0);
  } else {
    const q = 0.2;
    const e1 = [-o, 1, o], e2 = [o, 1, o], e3 = [o, 1, -o], e4 = [-o, 1, -o], r1 = [-q, top, 0], r2 = [q, top, 0];
    const nS = new THREE.Vector3(0, o, rise).normalize().toArray();
    const nB = new THREE.Vector3(0, o, -rise).normalize().toArray();
    const nE = new THREE.Vector3(rise, o - q, 0).normalize().toArray();
    const nW = new THREE.Vector3(-rise, o - q, 0).normalize().toArray();
    quad(e1, e2, r2, r1, nS, 1, RU);
    quad(e3, e4, r1, r2, nB, 1, RU);
    tri([e2, e3, r2], nE, [[0, 0.03], [1, 0.03], [0.5, 0.97]], 1);
    tri([e4, e1, r1], nW, [[0, 0.03], [1, 0.03], [0.5, 0.97]], 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(PART, 1));
  return g;
}

// a small lofted hull: L long, B half-beam, freeboard fb; waterline at y = 0, bow toward +x
function hullGeo(L, B, fb, hullHex, deckHex) {
  const half = (t) => B * (t < 0.55 ? 0.86 + 0.14 * Math.sin((t / 0.55) * Math.PI / 2)
    : Math.pow(Math.max(0, 1 - Math.pow((t - 0.55) / 0.45, 2)), 0.62));
  const sheer = (t) => fb * (0.78 + 0.34 * t * t);
  // three rows: keel, a soft chine just above the waterline, the sheer
  const pt = (t, w, s) => {
    const x = -L / 2 + L * t, hw = Math.max(0.02, half(t));
    if (w < 0.25) return new THREE.Vector3(x, -0.35 * (1 - t * t * t), s * 0.06 * hw);
    if (w < 0.75) return new THREE.Vector3(x, 0.08, s * 0.88 * hw);
    return new THREE.Vector3(x, sheer(t), s * hw);
  };
  const side = bothSides((s) => gridGeometry(10, 2, (a, b) => pt(a, b, s), s < 0));
  const deck = gridGeometry(10, 1, (a, b) => {
    const t = a, hw = Math.max(0.02, half(t)) - 0.04;
    return new THREE.Vector3(-L / 2 + L * t, sheer(t) - 0.03, -hw + 2 * hw * b);
  }, true);
  const transom = gridGeometry(1, 2, (a, b) => pt(0, b, a < 0.5 ? 1 : -1), true);
  return [paint(side, flat(hullHex)), paint(deck, flat(deckHex)), paint(transom, flat(hullHex))];
}

function boxAt(w, h, d, x, y, z, hex, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return paint(g, flat(hex));
}

/* ---- the cove ------------------------------------------------------------------------ */

function buildHarbor(U, isSmall) {
  const group = new THREE.Group();
  group.name = 'harbour';
  const geos = [], mats = [], texs = [], inst = [];
  const R = rng(20260930);
  const col = new THREE.Color();
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  const eul = new THREE.Euler();
  const add = (mesh) => {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
    return mesh;
  };

  // state the stages share: the houses (the trees keep out of them, the awnings hang off the
  // waterfront row) and the facade atlas (its anisotropy is set once the renderer is known)
  let atlas = null;
  const houses = [];   // [x, z, yaw, w, depth, H, base, variant]
  const occupied = []; // [x, z, radius] for keeping trees out of the houses
  const front = [];    // the waterfront row, for the awnings
  const api = { group, shoreAt: null };

  // Built in three short tasks (the staged init runs one per step) rather than one ~80 ms block
  // (~250 ms on a throttled phone). The order is fixed, so the seeded layout is too.
  const stages = [];
  // 1 · the sky, the land and the far range
  stages.push(() => {
    /* sky dome: drawn at the far plane, after everything opaque, so it only fills what is left */
    const skyGeo = new THREE.SphereGeometry(1, 40, 20);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * vec4((viewMatrix * vec4(position, 0.0)).xyz, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: COVE_SKY_GLSL + /* glsl */`
        uniform vec3 cvBelow;
        uniform float cvReveal;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          // well below the horizon (only ever seen from a camera at the waterline) it is the
          // stage navy, as before the cove; the water's rim, 1 to 2 degrees down, is untouched
          gl_FragColor = vec4(mix(cvBelow, mix(coveSky(d), cvBelow, smoothstep(-0.04, -0.12, d.y)), cvReveal), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false,
    });
    const sky = add(new THREE.Mesh(skyGeo, skyMat));
    sky.frustumCulled = false;
    sky.renderOrder = 3;   // last of the opaque pass: it only shades what nothing else covered
    geos.push(skyGeo); mats.push(skyMat);

    /* terrain: a polar grid over the land arc, plus a far hazy range behind it */
    const canopy = makeCanopyTexture();
    texs.push(canopy);
    const terrainMat = coveMaterial({ vertexColors: true, map: canopy }, U, { terrain: true });
    mats.push(terrainMat);
    const NA = isSmall ? 200 : 256, NL = isSmall ? 34 : 40;
    const UNDER = [-30, -10, -2.5];
    const rows = UNDER.length + NL + 1, cols = NA + 1;
    const tPos = new Float32Array(cols * rows * 3), tUv = new Float32Array(cols * rows * 2), tD = new Float32Array(cols * rows);
    let tp = 0;
    for (let i = 0; i <= NA; i++) {
      const a = COVE.a0 + COVE.span * (i / NA);
      const ca = Math.cos(a), sa = Math.sin(a);
      const S = shoreR(((a / D2R + 540) % 360) - 180);
      for (let j = 0; j < rows; j++) {
        const d = j < UNDER.length ? UNDER[j] : (COVE.rOut - S) * Math.pow((j - UNDER.length) / NL, 1.7);
        const r = S + d, x = r * ca, z = r * sa;
        const h = coveHeight(x, z);
        tPos[tp * 3] = x; tPos[tp * 3 + 1] = h; tPos[tp * 3 + 2] = z;
        tUv[tp * 2] = (a * 200) / 64; tUv[tp * 2 + 1] = (h + d * 0.35) / 64;   // arc length at a fixed radius: u must not run up the slope
        tD[tp] = d;
        tp++;
      }
    }
    // no stop, transition or free-look ever faces the arc behind the cameras (a ≈ 40°..150°):
    // its quads are left out of the index (the vertices stay, unreferenced, so nothing shifts)
    const behind = (a0, a1) => a0 > BEHIND[0] && a1 < BEHIND[1];
    const tIdx = [];
    for (let i = 0; i < NA; i++) {
      if (behind(COVE.a0 + COVE.span * (i / NA), COVE.a0 + COVE.span * ((i + 1) / NA))) continue;
      for (let j = 0; j < rows - 1; j++) {
        const A = i * rows + j, B = A + rows, C = A + 1, D = B + 1;
        tIdx.push(A, B, C, B, D, C);
      }
    }
    const terrain = new THREE.BufferGeometry();
    terrain.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
    terrain.setAttribute('uv', new THREE.BufferAttribute(tUv, 2));
    terrain.setIndex(tIdx);
    terrain.computeVertexNormals();
    {
      const n = terrain.attributes.normal;
      const tc = new Float32Array(cols * rows * 3), tv = new Float32Array(cols * rows);
      const C = (hex) => new THREE.Color(hex);
      const P = {
        dark: C(0x1b3818), oak: C(0x2a5021), olive: C(0x56703a), bright: C(0x5f8634), blue: C(0x1f4034),
        rock: C(0x76705f), rockDk: C(0x4a473b), sand: C(0xbba680), pave: C(0xb4a58b), terrace: C(0x5d6a36), earth: C(0x77683f),
        scrub: C(0x5a6446),
        seabed: C(0x0d1c26),
      };
      const t1 = new THREE.Color(), t2 = new THREE.Color();
      for (let k = 0; k < tp; k++) {
        const x = tPos[k * 3], h = tPos[k * 3 + 1], z = tPos[k * 3 + 2], d = tD[k];
        const ad = Math.atan2(z, x) / D2R;
        const slope = 1 - n.getY(k);
        // sampled with height folded in: on a steep face x/z barely move, and x/z-only noise streaks
        const n1 = fbm((x + h * 0.8) / 95, (z - h * 0.6) / 95, 3, 5);
        const n2 = vnoise((x - h) / 24, (z + h * 0.7) / 24, 9);
        const n3 = vnoise((x + h * 1.1) / 9, (z - h * 0.9) / 9, 13);
        // woodland: holm oak and pine, olive groves lower down, bluer conifers high up
        t1.copy(P.oak).lerp(P.dark, sstep(0.35, 0.7, n1));
        t1.lerp(P.olive, sstep(0.62, 0.82, n2) * (1 - sstep(60, 110, h)) * 0.8);
        t1.lerp(P.bright, sstep(0.72, 0.9, n3) * 0.35);
        t1.lerp(P.blue, sstep(70, 190, h) * 0.45);
        // terraces and gardens round the village
        const vil = bandDeg(ad, -168, -108, 5);
        const quayB = bandDeg(ad, -165, -117, 2);   // the paving stops where the quay does
        if (vil > 0) {
          const terr = vil * sstep(20, 32, d) * (1 - sstep(90, 150, d)) * sstep(0.45, 0.6, n2);
          t2.copy(P.terrace).lerp(P.earth, sstep(0.55, 0.8, n3));
          t1.lerp(t2, terr * 0.55);
          t1.lerp(P.pave, quayB * (1 - sstep(12, 22, d)));
        }
        // rock: cliffs, the waterline, the steepest gullies
        // (only the steepest faces go bare, and even they carry grey-green scrub and some canopy)
        const rocky = Math.max(sstep(0.72, 0.9, slope) * 0.7, (1 - sstep(2.5, 8, d)) * (1 - sstep(2.5, 6, h)) * (1 - vil)) * (h > -0.2 ? 1 : 0);
        t2.copy(P.rock).lerp(P.rockDk, n3).lerp(P.scrub, 0.4 * sstep(8, 20, d));
        t1.lerp(t2, rocky);
        const beach = bumpDeg(ad, -80, 8) * (1 - sstep(6, 14, d));
        t1.lerp(P.sand, beach);
        if (h < -0.4) t1.copy(P.seabed);   // hidden under the water in every normal view
        tc[k * 3] = t1.r; tc[k * 3 + 1] = t1.g; tc[k * 3 + 2] = t1.b;
        tv[k] = (1 - rocky * 0.75) * (1 - beach) * (1 - quayB * (1 - sstep(12, 22, d))) * (h > -0.4 ? 1 : 0);
      }
      terrain.setAttribute('color', new THREE.BufferAttribute(tc, 3));
      terrain.setAttribute('aVeg', new THREE.BufferAttribute(tv, 1));
    }
    // the far range: a hazy silhouette ~700 m out, open over the mouth
    const far = (() => {
      const FA = isSmall ? 120 : 180;
      const aS = 20 * D2R, aE = 280 * D2R;
      const fp = [], fu = [], fc = [], fi = [];
      const fcol = new THREE.Color(0x4d6258);
      for (let i = 0; i <= FA; i++) {
        const a = COVE.a0 + aS + (aE - aS) * (i / FA);
        const ca = Math.cos(a), sa = Math.sin(a);
        const edge = sstep(0, 0.12, (a - COVE.a0 - aS)) * sstep(0, 0.12, (COVE.a0 + aE - a));
        const hf = (60 + 150 * fbm(a * 5.2, 3.1, 4, 71) + 60 * bumpDeg(a / D2R, -160, 50)) * edge - 12 * (1 - edge);
        const ring = [[680, -24], [705, hf * 0.62], [730, hf]];   // rising away from the harbour
        for (const [r, y] of ring) { fp.push(r * ca, y, r * sa); fu.push(a * 700 / 48, y / 48); fc.push(fcol.r, fcol.g, fcol.b); }
      }
      for (let i = 0; i < FA; i++) {
        if (behind(COVE.a0 + aS + (aE - aS) * (i / FA), COVE.a0 + aS + (aE - aS) * ((i + 1) / FA))) continue;
        for (let j = 0; j < 2; j++) {
          const A = i * 3 + j, B = A + 3, C = A + 1, D = B + 1;
          fi.push(A, B, C, B, D, C);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3));
      g.setAttribute('aVeg', new THREE.Float32BufferAttribute(new Float32Array(fp.length / 3).fill(1), 1));
      g.setIndex(fi);
      g.computeVertexNormals();
      return g;
    })();
    const landGeo = mergeGeometries([terrain, far], false);
    terrain.dispose(); far.dispose();
    geos.push(landGeo);
    // drawn after the houses, trees and boats standing on it, so early-z skips what they hide
    add(new THREE.Mesh(landGeo, terrainMat)).renderOrder = 1;
  });

  // 2 · the village, its gardens and the woods, the shoreline rocks
  stages.push(() => {
    /* houses: the waterfront row on the quay, rows stepping up behind, villas on the hills */
    const groundSpan = (x, z, yaw, w, dp) => {
      const cx = Math.cos(yaw), sx = Math.sin(yaw);
      let lo = Infinity, hi = -Infinity;
      for (const [u, v] of [[0, 0], [-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
        const px = x + u * w * cx + v * dp * sx, pz = z - u * w * sx + v * dp * cx;
        const h = coveHeight(px, pz);
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
      return [lo, hi];
    };
    // a wall of n floors: a 4.2 m ground floor, 3.2 m floors over it, a little cornice above
    const wallH = (n) => 4.2 + 3.2 * (n - 1) + 0.5;
    // roof: [kind (0 hip, 1 gable, 2 terrace), atlas roof column (0 tile, 1 slate, 2 paving, 3 faded)]
    const pickRoof = (pHip = 0.5, pGable = 0.32) => {
      const k = R();
      if (k < pHip) return [0, R() < 0.2 ? 1 : (R() < 0.25 ? 3 : 0)];
      if (k < pHip + pGable) return [1, R() < 0.25 ? 1 : (R() < 0.3 ? 3 : 0)];
      return [2, 2];
    };
    const pushHouse = (x, z, yaw, w, dp, H, variant, maxStep = 7, check = true, roof = pickRoof(), pitch = 0.3 + R() * 0.26) => {
      const [lo, hi] = groundSpan(x, z, yaw, w, dp);
      if (lo < 0.6 || hi - lo > maxStep) return false;
      if (check) for (const o of occupied) {
        const dx = x - o[0], dz = z - o[1], rr = o[2] + Math.max(w, dp) * 0.45;
        if (dx * dx + dz * dz < rr * rr) return false;
      }
      // [x, z, yaw, w, depth, H, base, variant, roof kind, roof column, ridge rise (m), eaves]
      houses.push([x, z, yaw, w, dp, H + (hi - lo) + 1.2, lo - 1.2, variant, roof[0], roof[1],
        dp * 0.5 * pitch, roof[0] === 2 ? 1 : 0.97 + R() * 0.12]);
      occupied.push([x, z, Math.max(w, dp) * 0.5]);
      return true;
    };
    // the waterfront: one continuous facade of tall houses, stepping in and out along the quay,
    // three to seven floors, the odd one set back behind a little piazza
    for (let ad = -163.5; ad < -118;) {
      const w = 6.4 + R() * 4.8, dp = 10 + R() * 3;
      const back = R() < 0.12 ? 2.6 + R() * 1.5 : (R() - 0.5) * 3.2;
      const rc = COVE.front + dp / 2 + back;
      const a = (ad + (w / 2) / rc / D2R) * D2R;
      const k = R(), floors = k < 0.12 ? 3 : (k < 0.45 ? 4 : (k < 0.78 ? 5 : (k < 0.94 ? 6 : 7)));
      const [x, z] = [rc * Math.cos(a), rc * Math.sin(a)];
      if (pushHouse(x, z, yawAt(a), w, dp, wallH(floors), Math.floor(R() * FACADE_N), 3, false, pickRoof(0.46, 0.36))) {
        front.push([a, w, rc - dp / 2]);
      }
      ad += (w + 0.25) / rc / D2R;
    }
    // the rows climbing behind it: lower, looser and staggered, gardens in the gaps
    const gaps = [];
    for (let k = 1; k <= 4; k++) {
      const lo = -163 + k * 2.2 + (k % 2) * 1.6, hi = -117 - k * 2.2;
      for (let ad = lo; ad < hi;) {
        const w = 6.5 + R() * 4.5, dp = 8 + R() * 3;
        const rc = COVE.front + 12 + k * 16 + (R() - 0.5) * 6;
        const a = (ad + (w / 2) / rc / D2R) * D2R;
        if (R() < [0, 0.7, 0.5, 0.38, 0.28][k]) {
          const n = k === 1 ? 3 + Math.floor(R() * 3) : 2 + Math.floor(R() * 3);
          pushHouse(rc * Math.cos(a), rc * Math.sin(a), yawAt(a) + (R() - 0.5) * 0.14, w, dp, wallH(n), Math.floor(R() * FACADE_N), 7, false);
        } else {
          gaps.push([rc * Math.cos(a), rc * Math.sin(a)]);
        }
        const gap = 2 + R() * (3 + k * 2.5);
        if (gap > 5) { const ag = (ad + (w + gap / 2) / rc / D2R) * D2R; gaps.push([rc * Math.cos(ag), rc * Math.sin(ag)]); }
        ad += (w + gap) / rc / D2R;
      }
    }
    // two old towers standing over the roofs: one mid-village, one above the church
    for (const [ad, dd] of [[-139.5, 44], [-110.5, 36]]) {
      const a = ad * D2R, r = shoreR(ad) + dd;
      pushHouse(r * Math.cos(a), r * Math.sin(a), yawAt(a) + 0.08, 5.4, 5.4, wallH(8), [0, 2, 6, 13][Math.floor(R() * 4)], 9, true, [0, R() < 0.5 ? 1 : 0], 0.95);
    }
    // the church, on its point between the village and the headland (the campanile is a prop)
    const churchA = -107.5 * D2R;
    const churchR = shoreR(-107.5) + 17;
    pushHouse(churchR * Math.cos(churchA), churchR * Math.sin(churchA), yawAt(churchA) + Math.PI / 2, 17, 11, 11, 4, 12, true, [1, 0], 0.5);
    // villas scattered up the hills, on the headland and along the west arm
    const VILLA_V = [1, 4, 5, 0, 9, 12, 3, 5, 14, 7];
    for (let tries = 0, n = 0; tries < 1400 && n < (isSmall ? 44 : 62); tries++) {
      const ad = -212 + R() * 158;
      const d = 26 + Math.pow(R(), 1.35) * 190;
      const a = ad * D2R, r = shoreR(ad) + d;
      const x = r * Math.cos(a), z = r * Math.sin(a);
      const h = coveHeight(x, z);
      if (h < 6 || h > 118) continue;
      if (vnoise(x / 60, z / 60, 3) < 0.38 && bandDeg(ad, -170, -110, 6) < 0.5) continue;
      const w = 8 + R() * 6, dp = 8 + R() * 4;
      if (pushHouse(x, z, yawAt(a) + (R() - 0.5) * 0.5, w, dp, wallH(2 + Math.floor(R() * 2)), VILLA_V[Math.floor(R() * VILLA_V.length)], 5, true, pickRoof(0.45, 0.25))) n++;
    }
    // a few cottages round the church
    for (let k = 0; k < 7; k++) {
      const ad = -113 + R() * 12, a = ad * D2R, r = shoreR(ad) + 8 + R() * 30;
      pushHouse(r * Math.cos(a), r * Math.sin(a), yawAt(a) + (R() - 0.5) * 0.4, 6 + R() * 4, 7 + R() * 3, wallH(2 + Math.floor(R() * 2)), Math.floor(R() * FACADE_N), 6);
    }

    atlas = makeFacadeAtlas();
    texs.push(atlas);
    const houseMat = coveMaterial({ map: atlas }, U, { building: true });
    mats.push(houseMat);
    // one instanced mesh per roof kind (the walls are the same; the atlas does the rest)
    for (let kind = 0; kind < 3; kind++) {
      const list = houses.filter((hs) => hs[8] === kind);
      if (!list.length) continue;
      const geo = houseGeometry(kind);
      const data = new Float32Array(list.length * 4);
      geo.setAttribute('aHouse', new THREE.InstancedBufferAttribute(data, 4));
      geos.push(geo);
      const mesh = new THREE.InstancedMesh(geo, houseMat, list.length);
      list.forEach(([x, z, yaw, w, dp, H, base, v, , rc, rise, eave], i) => {
        m4.compose(ps.set(x, base, z), qt.setFromEuler(eul.set(0, yaw, 0)), sc.set(w, H, dp));
        mesh.setMatrixAt(i, m4);
        data.set([v + 16 * rc, 5.4, rise / (0.15 * H), eave], i * 4);
        const l = 0.9 + R() * 0.16, tint = (R() - 0.5) * 0.06;
        mesh.setColorAt(i, col.setRGB(l * (1 + tint), l, l * (1 - tint)));
      });
      inst.push(add(mesh));
    }

    /* trees: stone pines, cypresses and the broadleaf mass (holm oak, olive).
       The broadleaf crowns come in four shapes, each a cluster of 3-5 jittered lumps with soft
       normals and shaded undersides, at two levels of detail: the near slopes the stops look at
       get round (detail-1) lumps, the far upper slopes the same shapes in coarse (detail-0) ones.
       Every shape x detail is one instanced draw.                                              */
    const treeMat = coveMaterial({ vertexColors: true }, U);
    mats.push(treeMat);
    const bark = flat(0x4a3a2b);
    const crownPaint = (lo, mid, hi) => {
      const a = new THREE.Color(lo), b = new THREE.Color(mid), c = new THREE.Color(hi);
      return (o, y, ny) => {
        if (ny >= 0) o.copy(b).lerp(c, ny * 0.85); else o.copy(b).lerp(a, Math.min(1, -ny * 1.2));
        o.multiplyScalar(0.62 + 0.38 * clamp((y - 1.6) / 4.2, 0, 1));   // darker low in the crown
      };
    };
    const indexed = (g) => { const m = mergeVertices(g); g.dispose(); return m; };
    const crownShapes = [];
    for (let k = 0; k < 4; k++) {
      const RS = rng(5150 + k * 31);
      const blobs = [[0, 3.0 + RS() * 0.5, 0, 2.6 + RS() * 0.8, 1.9 + RS() * 0.7, 2.4 + RS() * 0.8]];
      const n = 2 + Math.floor(RS() * 3);
      for (let j = 0; j < n; j++) {
        const ang = (j / n) * TAU + RS() * 0.9, dist = 1.2 + RS() * 1.2, s = 1.2 + RS() * 0.9;
        blobs.push([Math.cos(ang) * dist, 2.4 + RS() * 2.2, Math.sin(ang) * dist, s * (1 + RS() * 0.25), s * (0.72 + RS() * 0.25), s]);
      }
      crownShapes.push(blobs);
    }
    const leafPaint = crownPaint(0x0c180a, 0x284620, 0x557838);
    // (near: the main lump round, the smaller ones coarse; far: all coarse)
    const crownGeo = (blobs, detail) => indexed(mergeGeometries([
      paint(new THREE.CylinderGeometry(0.15, 0.24, 2.6, 4, 1, true).translate(0, 1.3, 0), bark),
      ...blobs.map(([x, y, z, sx, sy, sz], j) => paint(blobGeo(j === 0 ? detail : 0, 0.16 + 0.04 * j).scale(sx, sy, sz).translate(x, y, z), leafPaint)),
    ], false));
    const leafNear = crownShapes.map((b) => crownGeo(b, 1));
    const leafFar = crownShapes.map((b) => crownGeo(b, 0));
    const pinePaint = crownPaint(0x101c0d, 0x29441f, 0x4e6d33);
    const pineGeo = indexed(mergeGeometries([
      paint(new THREE.CylinderGeometry(0.2, 0.34, 7.8, 5, 1, true).translate(0, 3.9, 0), bark),
      paint(blobGeo(1).scale(4.4, 1.3, 4.4).translate(0, 8.4, 0), pinePaint),
      paint(blobGeo(1).scale(2.6, 0.95, 2.6).translate(2.1, 7.6, 1.2), pinePaint),
      paint(blobGeo(0).scale(2.0, 0.8, 2.0).translate(-1.9, 7.9, -1.0), pinePaint),
    ], false));
    const cyp = new THREE.LatheGeometry([[0.5, 0.2], [0.84, 2.0], [0.8, 4.6], [0.5, 7.6], [0.18, 9.6], [0, 10.3]]
      .map(([px, py]) => new THREE.Vector2(px, py)), 7);
    const cypGeo = paint(cyp, (o, y, ny) => o.set(0x142817).lerp(_pc2.set(0x34502e), clamp(y / 10.3, 0, 1) * 0.55 + Math.max(0, ny) * 0.3));
    geos.push(pineGeo, cypGeo, ...leafNear, ...leafFar);
    const inHouse = (x, z, pad) => {
      for (const o of occupied) {
        const dx = x - o[0], dz = z - o[1], rr = o[2] + pad;
        if (dx * dx + dz * dz < rr * rr) return true;
      }
      return false;
    };
    const trees = { pine: [], cyp: [], near: [], far: [] };
    const NEAR_R = 285;   // past this (from the yacht) a crown is a few pixels: coarse lumps do
    const plant = (list, x, z, s, sy = s) => {
      const h = coveHeight(x, z);
      list.push([x, h - 0.8, z, R() * TAU, s, sy, Math.floor(R() * 4)]);
    };
    const plantLeaf = (x, z, s) => plant(Math.hypot(x, z) < NEAR_R ? trees.near : trees.far, x, z, s);
    const want = isSmall ? { near: 900, far: 700, pine: 90, cyp: 100 } : { near: 1800, far: 1300, pine: 150, cyp: 160 };
    const full = () => trees.near.length >= want.near && trees.far.length >= want.far;
    // gardens: a tree or two beside the houses above the waterfront, and in the gaps between them
    for (const hs of houses) {
      const rr = Math.hypot(hs[0], hs[1]);
      if (rr < COVE.front + 14 || R() < 0.3) continue;
      const off = Math.max(hs[3], hs[4]) * 0.5 + 2.5 + R() * 3, ang = R() * TAU;
      const x = hs[0] + Math.cos(ang) * off, z = hs[1] + Math.sin(ang) * off;
      if (coveHeight(x, z) < 2.2 || inHouse(x, z, 1.5)) continue;
      if (R() < 0.25) plant(trees.pine, x, z, 0.7 + R() * 0.35);
      else plantLeaf(x, z, 0.5 + R() * 0.5);
    }
    for (const [gx, gz] of gaps) {
      for (let k = 1 + Math.floor(R() * 3); k > 0; k--) {
        const x = gx + (R() - 0.5) * 6, z = gz + (R() - 0.5) * 6;
        if (coveHeight(x, z) < 2.2 || inHouse(x, z, 1.2)) continue;
        if (R() < 0.3) plant(trees.cyp, x, z, 0.8 + R() * 0.25, 0.8 + R() * 0.5);
        else plantLeaf(x, z, 0.45 + R() * 0.4);
      }
    }
    // the broadleaf mass, planted in clumps, thickest on the lower slopes the cameras see
    for (let tries = 0; tries < 14000 && !full(); tries++) {
      const ad = -214 + R() * 172, a = ad * D2R;
      const d = 2 + Math.pow(R(), 1.8) * 228;
      const r = shoreR(ad) + d, cx = r * Math.cos(a), cz = r * Math.sin(a);
      if (fbm(cx / 70, cz / 70, 2, 41) < 0.3) continue;
      const list = r < NEAR_R ? trees.near : trees.far;
      if (list.length >= (r < NEAR_R ? want.near : want.far)) continue;
      for (let k = 3 + Math.floor(R() * 6); k > 0; k--) {
        const x = cx + (R() - 0.5) * 16, z = cz + (R() - 0.5) * 16;
        if (coveHeight(x, z) < 1.6 || inHouse(x, z, 2.5)) continue;
        plantLeaf(x, z, 0.46 + Math.pow(R(), 1.6) * 0.7);
      }
    }
    // stone pines: along the ridgelines and the headland, a few in the village gardens
    for (let tries = 0; tries < 6000 && trees.pine.length < want.pine; tries++) {
      const ad = -214 + R() * 172, a = ad * D2R;
      const d = 6 + R() * 170;
      const r = shoreR(ad) + d, x = r * Math.cos(a), z = r * Math.sin(a);
      const h = coveHeight(x, z);
      if (h < 4 || inHouse(x, z, 4)) continue;
      const ridge = sstep(20, 60, h) + bumpDeg(ad, -65, 20) * 0.8 + bandDeg(ad, -166, -114, 6) * 0.3;
      if (R() > ridge * 0.6) continue;
      plant(trees.pine, x, z, 0.8 + R() * 0.5);
    }
    // cypresses: standing beside the villas and the church, in twos and threes
    for (const hs of houses) {
      if (trees.cyp.length >= want.cyp) break;
      if (R() < 0.45) continue;
      const n = 1 + Math.floor(R() * 3);
      const off = (Math.max(hs[3], hs[4]) * 0.5 + 3 + R() * 4);
      const ang = R() * TAU;
      for (let k = 0; k < n; k++) {
        const x = hs[0] + Math.cos(ang) * off + k * 2.4 * Math.cos(ang + 1.3), z = hs[1] + Math.sin(ang) * off + k * 2.4 * Math.sin(ang + 1.3);
        if (coveHeight(x, z) < 2 || inHouse(x, z, 1)) continue;
        plant(trees.cyp, x, z, 0.8 + R() * 0.25, 0.8 + R() * 0.6);
      }
    }
    // per-tree tint: dark holm oak, the usual green, silver olive, bright young growth
    const LEAF_TINT = [[0.62, 0.76, 0.6], [0.8, 0.9, 0.74], [1, 1, 1], [1.5, 1.32, 1.45], [1.2, 1.42, 0.8], [0.95, 1.02, 0.78]];
    const PINE_TINT = [[0.9, 1.0, 0.85], [1.03, 1.04, 0.86], [0.84, 0.92, 0.95], [1.0, 1.0, 1.0]];
    const instTrees = (list, geo, tints) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, treeMat, list.length);
      list.forEach(([x, y, z, rot, s, sy], i) => {
        m4.compose(ps.set(x, y, z), qt.setFromEuler(eul.set(0, rot, 0)), sc.set(s, sy, s));
        mesh.setMatrixAt(i, m4);
        const t = tints[Math.floor(R() * tints.length)], l = 0.84 + R() * 0.26;
        mesh.setColorAt(i, col.setRGB(t[0] * l, t[1] * l, t[2] * l));
      });
      inst.push(add(mesh));
    };
    for (let k = 0; k < 4; k++) {
      instTrees(trees.near.filter((t) => t[6] === k), leafNear[k], LEAF_TINT);
      instTrees(trees.far.filter((t) => t[6] === k), leafFar[k], LEAF_TINT);
    }
    instTrees(trees.pine, pineGeo, PINE_TINT);
    instTrees(trees.cyp, cypGeo, PINE_TINT);

    /* the rocky shore: one continuous, smooth band of weathered rock along the waterline wherever
       there is no quay or beach, running down under the water; a few rocks awash off the points */
    const rockMat = coveMaterial({ vertexColors: true }, U);
    mats.push(rockMat);
    const ROCK_AD0 = -214, ROCK_AD1 = -41, NU = isSmall ? 260 : 380;
    const OFF = [-5, -1.6, 0.6, 2.8, 5.2, 8.5];
    const LIFT = [0, 0.7, 1.35, 1.25, 0.6, -0.35];
    const rp = [], rc2 = [], ri = [];
    const rkA = new THREE.Color(0x8b8070), rkB = new THREE.Color(0x5a5349), rkC = new THREE.Color(0xa69478), rkWet = new THREE.Color(0x2f2c27);
    for (let i = 0; i <= NU; i++) {
      const ad = ROCK_AD0 + (ROCK_AD1 - ROCK_AD0) * (i / NU), a = ad * D2R;
      const S = shoreR(ad);
      // none along the quay or on the beach; lumpy and broken everywhere else
      const keep = (1 - bandDeg(ad, -166, -114, 2.5)) * (1 - bumpDeg(ad, -80, 10));
      const amp = keep * (0.55 + 1.6 * fbm(ad / 3.1, 1.7, 3, 61));
      for (let j = 0; j < OFF.length; j++) {
        const jit = (vnoise(ad * 1.7, j * 3.1, 67) - 0.5) * 1.6;
        const r = S + OFF[j] + jit, x = r * Math.cos(a), z = r * Math.sin(a);
        const g = coveHeight(x, z);
        const y = j === 0 ? Math.min(g, -2.5) : g + LIFT[j] * amp * (0.7 + 0.6 * vnoise(ad * 2.3, j, 71)) - (amp < 0.05 ? 0.6 : 0);
        rp.push(x, y, z);
        const n1 = vnoise(x / 6, z / 6, 73);
        _pc.copy(rkA).lerp(rkB, n1).lerp(rkC, sstep(0.6, 0.9, vnoise(x / 17, z / 17, 79)) * 0.6);
        _pc.lerp(rkWet, 1 - sstep(0.1, 0.9, y));   // the dark wet band at the waterline
        rc2.push(_pc.r, _pc.g, _pc.b);
      }
    }
    const RJ = OFF.length;
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < RJ - 1; j++) {
        const A = i * RJ + j, B = A + RJ, C = A + 1, D = B + 1;
        ri.push(A, B, C, C, B, D);
      }
    }
    const bandGeo = new THREE.BufferGeometry();
    bandGeo.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    bandGeo.setAttribute('color', new THREE.Float32BufferAttribute(rc2, 3));
    bandGeo.setIndex(ri);
    bandGeo.computeVertexNormals();
    geos.push(bandGeo);
    add(new THREE.Mesh(bandGeo, rockMat));
    // rocks awash off the headland tip, the church point and the west arm
    const awashGeo = indexed(paint(blobGeo(1, 0.3), flat(0xffffff)));
    geos.push(awashGeo);
    const awash = [];
    for (const [c, w, n] of [[-53, 7, isSmall ? 7 : 11], [-107, 4, 4], [162, 9, isSmall ? 5 : 8]]) {
      for (let k = 0; k < n; k++) {
        const ad = c + (R() - 0.5) * 2 * w, a = ad * D2R, r = shoreR(ad) - 2 - R() * 9;
        awash.push([r * Math.cos(a), r * Math.sin(a), 0.8 + Math.pow(R(), 1.5) * 2.2]);
      }
    }
    const awashMesh = new THREE.InstancedMesh(awashGeo, rockMat, awash.length);
    awash.forEach(([x, z, s], i) => {
      m4.compose(ps.set(x, -0.35 * s, z), qt.setFromEuler(eul.set(R() * 0.4, R() * TAU, R() * 0.4)), sc.set(s * (1.1 + R() * 0.6), s * (0.55 + R() * 0.3), s * (0.9 + R() * 0.5)));
      awashMesh.setMatrixAt(i, m4);
      const l = 0.36 + R() * 0.16;
      awashMesh.setColorAt(i, col.setRGB(l * 1.06, l, l * 0.9));
    });
    inst.push(add(awashMesh));
  });

  // 3 · the quay and the landmarks, the harbour's boats, what the water needs from the cove
  stages.push(() => {
    /* the quay, the mole, the campanile, the fort, the lighthouse, awnings and parasols */
    const parts = [];
    const QA0 = -165 * D2R, QA1 = -117 * D2R;
    parts.push(paint(gridGeometry(48, 1, (u, v) => {
      const a = QA0 + (QA1 - QA0) * u, r = COVE.quay - 0.4 + (COVE.front - 1 - COVE.quay) * v;
      return new THREE.Vector3(r * Math.cos(a), COVE.quayTop + 0.04, r * Math.sin(a));
    }, false), flat(0xc3b59b)));
    parts.push(paint(gridGeometry(48, 1, (u, v) => {
      const a = QA0 + (QA1 - QA0) * u, r = COVE.quay - 0.4;
      return new THREE.Vector3(r * Math.cos(a), -1.6 + (COVE.quayTop + 1.64) * v, r * Math.sin(a));
    }, false), flat(0x7f7565)));
    // the mole: a stone pier reaching into the harbour, a green light on its end
    {
      const a = -161.5 * D2R, yaw = yawAt(a), r0 = COVE.quay - 44, r1 = COVE.quay;
      const rc = (r0 + r1) / 2;
      const g = new THREE.BoxGeometry(6, 3.5, r1 - r0).rotateY(yaw).translate(rc * Math.cos(a), 0.15, rc * Math.sin(a));
      parts.push(paint(g, flat(0xab9f88)));
      const ex = (r0 + 1.5) * Math.cos(a), ez = (r0 + 1.5) * Math.sin(a);
      parts.push(paint(new THREE.CylinderGeometry(0.55, 0.7, 4.2, 8).translate(ex, 1.9 + 2.1, ez), flat(0x3d8a5c)));
      parts.push(paint(new THREE.CylinderGeometry(0.4, 0.4, 0.7, 8).translate(ex, 1.9 + 4.55, ez), flat(0xf4f0e2)));
    }
    // the campanile beside the church
    {
      const a = -103.6 * D2R, r = shoreR(-103.6) + 16;
      const x = r * Math.cos(a), z = r * Math.sin(a);
      const g0 = coveHeight(x, z) - 2;
      const yaw = yawAt(a);
      const tw = 4.6, th = 27;
      parts.push(boxAt(tw, th, tw, x, g0 + th / 2, z, 0xc98b55, yaw));
      for (const f of [0.34, 0.62, 0.86]) parts.push(boxAt(tw + 0.3, 0.4, tw + 0.3, x, g0 + th * f, z, 0xf1e4cc, yaw));
      parts.push(boxAt(tw + 0.04, 3.4, 2.0, x, g0 + th - 3.2, z, 0x2a211c, yaw));
      parts.push(boxAt(2.0, 3.4, tw + 0.04, x, g0 + th - 3.2, z, 0x2a211c, yaw));
      parts.push(boxAt(tw + 0.7, 0.55, tw + 0.7, x, g0 + th + 0.2, z, 0xf1e4cc, yaw));
      parts.push(boxAt(tw + 0.5, 0.45, tw + 0.5, x, g0 + th - 5.2, z, 0xf1e4cc, yaw));
      {
        const fx = Math.sin(yaw), fz = Math.cos(yaw), o = tw / 2 + 0.06, cy0 = g0 + th * 0.74;
        parts.push(paint(new THREE.CylinderGeometry(1.25, 1.25, 0.1, 18).rotateX(Math.PI / 2).rotateY(yaw).translate(x + fx * o, cy0, z + fz * o), flat(0xf6f1e4)));
        parts.push(boxAt(0.14, 0.95, 0.06, x + fx * (o + 0.06), cy0 + 0.3, z + fz * (o + 0.06), 0x2a2420, yaw));
        parts.push(paint(new THREE.BoxGeometry(0.7, 0.12, 0.06).rotateZ(0.5).rotateY(yaw).translate(x + fx * (o + 0.07), cy0 + 0.12, z + fz * (o + 0.07)), flat(0x2a2420)));
      }
      parts.push(paint(new THREE.ConeGeometry(3.3, 6.2, 4).rotateY(Math.PI / 4 + yaw).translate(x, g0 + th + 3.5, z), flat(0x8d4a30)));
    }
    // the fort on the headland ridge
    {
      const ad = -73, a = ad * D2R, r = shoreR(ad) + 50;
      const x = r * Math.cos(a), z = r * Math.sin(a);
      const g0 = coveHeight(x, z) - 5;
      const yaw = yawAt(a);
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const at = (u, v) => [x + u * cy + v * sy, z - u * sy + v * cy];
      parts.push(boxAt(22, 13, 15, x, g0 + 6.5, z, 0xc08858, yaw));
      parts.push(boxAt(22.3, 3.2, 15.3, x, g0 + 4.2, z, 0x93684a, yaw));   // the weathered base course
      parts.push(boxAt(22.9, 0.75, 15.9, x, g0 + 12.9, z, 0xe0bd8e, yaw));  // the cornice under the battlements
      parts.push(boxAt(22.5, 0.4, 15.5, x, g0 + 7.6, z, 0xd8b084, yaw));    // a stone cordon
      for (let k = -8.5; k <= 8.5; k += 3.4) {   // arrow slits on the harbour face
        const [wx, wz] = at(k, 7.55);
        parts.push(boxAt(0.5, 2.4, 0.2, wx, g0 + 9.6, wz, 0x2a1d17, yaw));
      }
      const [tx0, tz0] = at(-8, -2);
      parts.push(boxAt(7.5, 20, 7.5, tx0, g0 + 10, tz0, 0xcd9a68, yaw));
      parts.push(boxAt(8.3, 0.7, 8.3, tx0, g0 + 19.8, tz0, 0xe0bd8e, yaw));
      parts.push(boxAt(7.8, 0.35, 7.8, tx0, g0 + 14.6, tz0, 0xd8b084, yaw));
      for (let k = -10; k <= 10; k += 2.5) {
        for (const v of [-7.4, 7.4]) { const [mx, mz] = at(k, v); parts.push(boxAt(1.3, 1.3, 0.7, mx, g0 + 13.9, mz, 0xc99662, yaw)); }
      }
      for (const u of [-10.9, 10.9]) {
        for (let v = -5; v <= 5; v += 2.5) { const [mx, mz] = at(u, v); parts.push(boxAt(0.7, 1.3, 1.3, mx, g0 + 13.9, mz, 0xc99662, yaw)); }
      }
      for (let k = -3; k <= 3; k += 2) {
        for (const v of [-3.8, 3.8]) {
          const [mx, mz] = at(-8 + k, -2 + v); parts.push(boxAt(1, 1.1, 0.6, mx, g0 + 20.7, mz, 0xd4a472, yaw));
          const [nx, nz] = at(-8 + v, -2 + k); parts.push(boxAt(0.6, 1.1, 1, nx, g0 + 20.7, nz, 0xd4a472, yaw));
        }
      }
    }
    // the lighthouse on the headland tip
    {
      const ad = -55.5, a = ad * D2R, r = shoreR(ad) + 7;
      const x = r * Math.cos(a), z = r * Math.sin(a);
      const g0 = coveHeight(x, z) - 1;
      // the keeper's house stands behind the tower, landward and lower, end-on to the harbour
      const kx = x + 6.2 * Math.cos(a), kz = z + 6.2 * Math.sin(a);
      parts.push(boxAt(3.3, 3.4, 6.4, kx, g0 + 1.2, kz, 0xefe9dc, yawAt(a)));
      parts.push(boxAt(3.7, 0.35, 6.8, kx, g0 + 3.05, kz, 0xa9553a, yawAt(a)));
      parts.push(paint(new THREE.CylinderGeometry(1.35, 1.75, 13, 12).translate(x, g0 + 6.5, z), flat(0xf3efe6)));
      parts.push(paint(new THREE.CylinderGeometry(1.38, 1.4, 1.8, 12).translate(x, g0 + 11.4, z), flat(0xb8392e)));
      parts.push(paint(new THREE.CylinderGeometry(2.05, 2.05, 0.35, 12).translate(x, g0 + 13.2, z), flat(0x2d2f33)));
      parts.push(paint(new THREE.CylinderGeometry(1.0, 1.0, 1.9, 10).translate(x, g0 + 14.3, z), flat(0xfff0c0)));
      parts.push(paint(new THREE.ConeGeometry(1.3, 1.5, 10).translate(x, g0 + 16, z), flat(0x7b2b22)));
    }
    // awnings over the quay cafés, and parasols out on the piazza
    const AWN = [0x3e6b4a, 0xe9dfc8, 0xb5563a, 0x2c3e5c, 0xeae6dc, 0x4f7a58];
    for (const [a, w, rFace] of front) {
      if (R() < 0.18) continue;
      const r = rFace - 1.4;
      const g = new THREE.BoxGeometry(w * 0.84, 0.14, 2.8).rotateX(0.28).rotateY(yawAt(a)).translate(r * Math.cos(a), COVE.quayTop + 3.4, r * Math.sin(a));
      parts.push(paint(g, flat(AWN[Math.floor(R() * AWN.length)])));
    }
    for (let k = 0; k < (isSmall ? 10 : 16); k++) {
      const a = (-147 + R() * 15) * D2R, r = COVE.quay + 3.5 + R() * 8;
      const x = r * Math.cos(a), z = r * Math.sin(a);
      parts.push(paint(new THREE.ConeGeometry(1.7, 0.75, 8).translate(x, COVE.quayTop + 2.7, z), flat(R() < 0.7 ? 0xf2ead9 : 0xb5563a)));
      parts.push(paint(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 4).translate(x, COVE.quayTop + 1.2, z), flat(0x3a3530)));
    }
    const propsGeo = mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    geos.push(propsGeo);
    const propsMat = coveMaterial({ vertexColors: true }, U);
    mats.push(propsMat);
    add(new THREE.Mesh(propsGeo, propsMat));

    /* harbour life: tenders on the quay, boats on moorings, sailing yachts, two motor yachts */
    const boatMat = coveMaterial({ vertexColors: true, side: THREE.DoubleSide }, U, { bob: true });
    mats.push(boatMat);
    const tenderGeo = mergeGeometries([
      ...hullGeo(6.4, 1.15, 0.72, 0xe4e2da, 0xcdb996),
      boxAt(0.8, 0.55, 1.0, 0.4, 0.95, 0, 0xe9e7df),
      boxAt(0.1, 0.28, 0.9, 0.82, 1.35, 0, 0x2a3440),
      boxAt(2.4, 0.22, 1.7, -1.6, 0.8, 0, 0x2f4d6e),
    ], false);
    const sailGeo = mergeGeometries([
      ...hullGeo(10.5, 1.7, 1.0, 0xf1f0ea, 0xcdb792),
      boxAt(3.4, 0.6, 2.1, -0.3, 1.2, 0, 0xf1efe8),
      boxAt(0.18, 14.5, 0.18, 0.9, 7.9, 0, 0xd9dcdf),
      boxAt(4.0, 0.14, 0.14, -1.1, 2.55, 0, 0xd9dcdf),
      boxAt(3.7, 0.36, 0.34, -1.1, 2.8, 0, 0x2c3f63),
    ], false);
    const yachtGeo = mergeGeometries([
      ...hullGeo(16.5, 2.25, 2.1, 0xf2f1ec, 0xc9b28c),
      boxAt(8.4, 1.7, 3.6, -1.3, 2.9, 0, 0xf4f3ee),
      boxAt(8.5, 0.62, 3.66, -1.1, 3.05, 0, 0x1f2833),
      boxAt(5.2, 1.0, 3.1, -2.1, 4.25, 0, 0xf4f3ee),
      boxAt(4.4, 0.14, 3.3, -2.6, 5.2, 0, 0xf4f3ee),
      boxAt(0.14, 0.6, 2.8, 0.45, 4.9, 0, 0x1f2833),
    ], false);
    const buoyGeo = paint(blobGeo(0, 0).scale(0.42, 0.36, 0.42).translate(0, 0.1, 0), flat(0xffffff));
    geos.push(tenderGeo, sailGeo, yachtGeo, buoyGeo);
    const tenders = [], sails = [], yachts = [], buoys = [];
    const swing = 32 * D2R;   // boats on moorings lie head to the breeze, bows toward the mouth (-32°)
    // West of about -150° the water lies behind the hero copy (eyebrow and headline, lower left at
    // 1280-1920 widths, see STOPS[0]): nothing afloat is moored there, so the copy reads on open water.
    const COPY_W = -150;
    const HULL_TINT = [[1, 1, 1], [1, 1, 1], [1, 1, 1], [0.66, 0.46, 0.3], [0.62, 0.74, 0.9], [0.95, 0.94, 0.9], [0.55, 0.36, 0.24]];
    // tenders bow-in along the quay, in a neat row
    for (let ad = -158; ad < -121; ad += 1.05 + R() * 0.9) {
      if (Math.abs(ad + 161.5) < 2.4 || ad > -130 || R() < 0.18) continue;   // (the yachts lie at the east end)
      const s = 0.8 + R() * 0.4, a = ad * D2R, r = COVE.quay - 3.4 * s - 1.2 - R() * 0.8;
      tenders.push([r * Math.cos(a), r * Math.sin(a), -a + (R() - 0.5) * 0.3, s]);
    }
    // boats on moorings, out in the harbour
    // (thinner in the lane behind the yacht, where the hero looks, so she keeps clear water)
    for (let tries = 0; tries < 400 && tenders.length < (isSmall ? 36 : 46); tries++) {
      const ad = COPY_W + R() * 68, a = ad * D2R, r = 104 + Math.sqrt(R()) * 48;
      const x = r * Math.cos(a), z = r * Math.sin(a);
      if (bumpDeg(ad, -140, 14) > R() * 1.4 || tenders.some((t) => (t[0] - x) ** 2 + (t[1] - z) ** 2 < 90)) continue;
      tenders.push([x, z, swing + (R() - 0.5) * 0.3, 0.9 + R() * 0.3]);
    }
    for (let tries = 0; tries < 200 && sails.length < 5; tries++) {
      const ad = COPY_W + R() * 64, a = ad * D2R, r = 100 + R() * 40;
      const x = r * Math.cos(a), z = r * Math.sin(a);
      if ([...tenders, ...sails].some((t) => (t[0] - x) ** 2 + (t[1] - z) ** 2 < 200)) continue;
      sails.push([x, z, swing + (R() - 0.5) * 0.25, 0.95 + R() * 0.15]);
    }
    // two motor yachts stern-to on the quay's east end (clear of the hero copy), one lying off the headland
    // (stern-to: bow out into the harbour, square to the quay)
    for (const [ad, r, yaw] of [[-126.5, COVE.quay - 9.5, 'out'], [-121, COVE.quay - 9.5, 'out'], [-86, 124, swing + 0.1]]) {
      const a = ad * D2R;
      yachts.push([r * Math.cos(a), r * Math.sin(a), yaw === 'out' ? Math.PI - a : yaw, 1]);
    }
    for (let tries = 0; tries < 300 && buoys.length < 10; tries++) {
      const ad = COPY_W + R() * 52, a = ad * D2R, r = 88 + R() * 56;
      const x = r * Math.cos(a), z = r * Math.sin(a);
      if ([...tenders, ...sails, ...yachts].some((t) => (t[0] - x) ** 2 + (t[1] - z) ** 2 < 120)) continue;
      buoys.push([x, z, 0, 1]);
    }
    for (const [list, geo, tinted] of [[tenders, tenderGeo, true], [sails, sailGeo, false], [yachts, yachtGeo, false], [buoys, buoyGeo, false]]) {
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(geo, boatMat, list.length);
      list.forEach(([x, z, yaw, s], i) => {
        m4.compose(ps.set(x, 0, z), qt.setFromEuler(eul.set(0, yaw, 0)), sc.set(s, s, s));
        mesh.setMatrixAt(i, m4);
        if (geo === buoyGeo) mesh.setColorAt(i, R() < 0.3 ? col.setRGB(0.85, 0.3, 0.1) : col.setRGB(0.8, 0.8, 0.78));
        else if (tinted) { const t = HULL_TINT[Math.floor(R() * HULL_TINT.length)]; mesh.setColorAt(i, col.setRGB(t[0], t[1], t[2])); }
        else mesh.setColorAt(i, col.setRGB(1, 1, 1));
      });
      inst.push(add(mesh));
    }

    /* a tender under way: a slow circuit of the inner harbour (inside the moorings), its wake
       streaming out astern. The wake is a flat V (alphaMap, fixed to the tender) with foam
       scrolled through it at the tender's speed, so the foam holds still on the water. */
    {
      const L = 28, SW = 20;
      const wakeAlpha = (() => {
        const cw = 256, ch = 64, c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        const ctx = c.getContext('2d'), img = ctx.createImageData(cw, ch);
        for (let j = 0; j < ch; j++) {
          const across = ((j + 0.5) / ch) * 2 - 1;
          for (let i = 0; i < cw; i++) {
            const sAft = 1 - (i + 0.5) / cw;   // 0 at the stern, 1 at the far end
            const armC = 0.06 + 0.9 * sAft, armW = 0.05 + 0.1 * sAft;
            const arm = Math.exp(-(((Math.abs(across) - armC) / armW) ** 2));
            const trail = Math.exp(-((across / (0.09 + 0.22 * sAft)) ** 2)) * 0.85;
            const a = Math.max(arm * 0.8, trail) * Math.pow(1 - sAft, 1.5) * Math.min(1, sAft * 14 + 0.25);
            const o = (j * cw + i) * 4;
            img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.round(clamp(a, 0, 1) * 255);
            img.data[o + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
        return new THREE.CanvasTexture(c);
      })();
      const wakeFoam = (() => {
        const S = 128, c = document.createElement('canvas');
        c.width = c.height = S;
        const ctx = c.getContext('2d'), img = ctx.createImageData(S, S);
        const h = noiseField(S, [[8, 1], [16, 0.6], [32, 0.45], [64, 0.3]], 9091);
        let lo = Infinity, hi = -Infinity;
        for (const v of h) { if (v < lo) lo = v; if (v > hi) hi = v; }
        for (let i = 0; i < S * S; i++) {
          const v = Math.round(255 * (0.35 + 0.65 * sstep(0.35, 0.75, (h[i] - lo) / (hi - lo))));
          img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
          img.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(2, 1);
        return t;
      })();
      texs.push(wakeAlpha, wakeFoam);
      const wakeMat = new THREE.MeshBasicMaterial({
        color: 0xe6f2ef, map: wakeFoam, alphaMap: wakeAlpha, transparent: true, opacity: 0.62,
        depthWrite: false, fog: false,
      });
      mats.push(wakeMat);
      const wakeGeo = new THREE.PlaneGeometry(L, SW).rotateX(-Math.PI / 2).translate(-3.1 - L / 2, 0.06, 0);
      geos.push(wakeGeo);
      const runner = new THREE.Group();
      runner.add(new THREE.Mesh(tenderGeo, boatMat));
      const wake = new THREE.Mesh(wakeGeo, wakeMat);
      runner.add(wake);
      runner.visible = false;   // shown once the clock runs (never under reduced motion: it would sit still)
      group.add(runner);
      const RC = -128 * D2R, R0 = 95, AX = 50, AR = 10, LAP = 58, SPEED = (TAU * Math.sqrt((AX * AX + AR * AR) / 2)) / LAP;
      const cx0 = R0 * Math.cos(RC), cz0 = R0 * Math.sin(RC);
      const tX = -Math.sin(RC), tZ = Math.cos(RC), nX = Math.cos(RC), nZ = Math.sin(RC);
      api.moveTender = (t) => {
        const ph = (t / LAP) * TAU;
        const c = Math.cos(ph), s = Math.sin(ph);
        runner.position.set(cx0 + tX * AX * c + nX * AR * s, Math.sin(t * 1.3) * 0.05, cz0 + tZ * AX * c + nZ * AR * s);
        const vx = -tX * AX * s + nX * AR * c, vz = -tZ * AX * s + nZ * AR * c;
        runner.rotation.set(0, Math.atan2(-vz, vx), Math.sin(t * 1.1) * 0.02);
        wakeFoam.offset.x = (t * SPEED / L) * 2;
        runner.visible = true;
      };
    }

    // what the water needs: the shore-distance field (read once, into the water mesh) and the
    // ridge silhouette (a small texture the mirror looks up)
    api.shoreAt = makeShoreField(isSmall ? 160 : 192);
    const silTex = makeSilhouetteTexture(96);
    texs.push(silTex);
    U.cvSilTex.value = silTex;
  });

  return Object.assign(api, {
    stages,
    maxAniso: (n) => { if (atlas) atlas.anisotropy = n; },
    update(t) { U.cvTime.value = t; if (api.moveTender) api.moveTender(t); },
    dispose(blank) {
      U.cvSilTex.value = blank;
      inst.forEach((m) => m.dispose());
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      texs.forEach((t) => t.dispose());
      if (group.parent) group.parent.remove(group);
    },
  });
}


/* ==================================================================== 7. the voyage path
   Seven stops around the yacht. A stop is a direction on a sphere around a look-at point plus
   the world width the frame should span — so the same stop composes correctly on a laptop,
   a portrait window and a phone (see `framing`). `p` is progress through the voyage, which
   voyage.js maps onto page scroll; `card` is the side the info card takes at that stop.

   Each stop is then placed per layout — L a landscape window, T a tall desktop window (the
   card still floats at the side), N a narrow one (under 900 px: the chips sit at the top and
   the card docks at the bottom) — as [panX, panY, hz, tilt]:
     panX, panY  a shift of the lens, in frame fractions: positive moves the yacht right / up.
                 The camera itself never moves for it. (A portrait frame is 35-57 m tall at the
                 yacht, and panning the camera by a fraction of that sank it through the water.)
     hz          where the horizon should sit, in NDC (-1 bottom, 1 top). The camera's height on
                 its orbit is solved from it, so on every screen the cove shows where the layout
                 has room for it. null keeps the stop's own `phi` (the deck stop looks down).
     tilt        degrees the view is pitched up after aiming at the yacht: at the establishing
                 stops it keeps the village's verticals near-upright.                        */

const STOPS = [
  // the hero: bow quarter, yacht low and right of the copy, the village across the top
  { p: 0.00, zone: 'whole', theta: 0.876, phi: 1.318, look: [-0.4, 3.3, 0], fit: 44, card: 'right',
    L: [0.22, 0.02, 0.42, 6], T: [0.08, 0.02, 0.46, 4], N: [0.02, 0.25, 0.59, 0] },
  // the same quarter, settling in — this is what the "Whole boat" chip scrolls to
  { p: 0.11, zone: 'whole', theta: 0.815, phi: 1.296, look: [-0.6, 3.2, 0], fit: 34, card: 'right',
    L: [-0.10, 0.146, 0.55, 6], T: [-0.07, 0.07, 0.5, 4], N: [-0.025, 0.12, 0.5, 0] },
  // deck: high over the aft quarter, looking down into the cockpit
  { p: 0.30, zone: 'deck', theta: -0.817, phi: 1.108, look: [-8.4, 2.1, 0], fit: 28, card: 'left',
    L: [0.18, 0.15, null, 0], T: [0.13, 0.07, null, 0], N: [0.03, 0.155, null, 0] },
  // cabin: level with the saloon glass, three-quarters on
  { p: 0.48, zone: 'cabin', theta: -0.320, phi: 1.430, look: [-1.6, 3.0, 1.0], fit: 22, card: 'right',
    L: [-0.22, 0.16, 0.50, 0], T: [-0.16, 0.07, 0.40, 0], N: [-0.04, 0.155, 0.50, 0] },
  // engine: down at the waterline on the engine-room vents
  { p: 0.65, zone: 'engine', theta: -0.885, phi: 1.505, look: [-8.7, 1.4, 1.2], fit: 22, card: 'left',
    L: [0.21, 0.12, 0.42, 0], T: [0.15, 0.08, 0.30, 0], N: [0.04, 0.155, 0.42, 0] },
  // hull: beam-on, low, the whole sheer in one line
  { p: 0.83, zone: 'hull', theta: -0.072, phi: 1.482, look: [0.2, 2.0, 0], fit: 36, card: 'right',
    L: [-0.14, 0.13, 0.36, 0], T: [-0.10, 0.06, 0.30, 0], N: [-0.025, 0.155, 0.40, 0] },
  // and out: back to the bow quarter, further off, to close the voyage
  { p: 1.00, zone: 'whole', theta: 0.876, phi: 1.238, look: [-0.4, 3.4, 0], fit: 40, card: 'right',
    L: [-0.12, 0.02, 0.46, 6], T: [-0.09, 0.02, 0.50, 4], N: [-0.02, 0.20, 0.60, 0] },
];

// one array per interpolated track, with theta unwrapped so the camera always takes the
// short way round between stops (the per-layout tracks are built on resize, see layoutTracks)
const T_P = STOPS.map((s) => s.p);
const T_TH = (() => {
  const out = [STOPS[0].theta];
  for (let i = 1; i < STOPS.length; i++) {
    let d = STOPS[i].theta - STOPS[i - 1].theta;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    out.push(out[i - 1] + d);
  }
  return out;
})();
const T_FIT = STOPS.map((s) => s.fit);
const T_LX = STOPS.map((s) => s.look[0]);
const T_LY = STOPS.map((s) => s.look[1]);
const T_LZ = STOPS.map((s) => s.look[2]);

// Catmull-Rom through the stop values: continuous velocity across a stop, so a steady scroll
// reads as one continuous move rather than a series of eases.
function crSeg(a, i, u) {
  const p0 = a[Math.max(0, i - 1)], p1 = a[i], p2 = a[i + 1], p3 = a[Math.min(a.length - 1, i + 2)];
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
}
function segOf(p) {
  let i = 0;
  while (i < T_P.length - 2 && p > T_P[i + 1]) i++;
  return i;
}

const DEG = Math.PI / 180;
const FOV_BASE = 30, FOV_MAX = 56, R_MAX = 76;

// Distance + lens that make `fit` metres span the frame width at this aspect. Portrait
// windows widen the lens before they retreat, and accept a little crop, so the yacht stays
// dominant instead of shrinking into the middle of the frame.
function framing(fit, aspect) {
  const w = fit * (0.60 + 0.40 * clamp(aspect / 1.5, 0, 1));
  let fov = FOV_BASE;
  let tanH = Math.tan(fov * DEG / 2) * aspect;
  let r = (w / 2) / tanH;
  if (r > R_MAX) {
    fov = Math.min(FOV_MAX, 2 * Math.atan((w / 2) / R_MAX / aspect) / DEG);
    tanH = Math.tan(fov * DEG / 2) * aspect;
    r = (w / 2) / tanH;
  }
  return { r, fov, tanH };
}

// The per-layout tracks for this window: the lens shift, the tilt and the orbit elevation
// solved from each stop's horizon target (see STOPS). With the camera aimed at the look-at
// point and pitched up by `tilt`, the horizon lands at tan(δ - tilt) / tanV + 2·panY in NDC,
// δ being how far the camera looks down at the yacht; that is solved for δ, so phi = π/2 - δ.
function layoutTracks(W, aspect) {
  const lay = W < 900 ? 'N' : (aspect < 1.15 ? 'T' : 'L');
  const q = STOPS.map((s) => s[lay]);
  return {
    px: q.map((v) => v[0]),
    py: q.map((v) => v[1]),
    tilt: q.map((v) => v[3] * DEG),
    phi: STOPS.map((s, k) => {
      const [, panY, hz, tilt] = q[k];
      if (hz === null) return s.phi;
      const tanV = Math.tan(framing(s.fit, aspect).fov * DEG / 2);
      return Math.PI / 2 - clamp(tilt * DEG + Math.atan((hz - 2 * panY) * tanV), 1.5 * DEG, 40 * DEG);
    }),
  };
}

const MARKERS = {
  hull: sidePoint(0.552, 0.55, 1, 0.34).toArray(),
  deck: [-9.55, 1.98, 0.9],
  cabin: [-2.0, 2.92, houseHalf(-2.0) * 0.965 + 0.42],
  engine: sidePoint(0.128, 0.665, 1, 0.38).toArray(),
};

/* ==================================================================== 8. init */

export function initBoat({ stageEl, panelEl, chipsEl, hotspots, reducedMotion, ui, onNavigate }) {   // eslint-disable-line no-unused-vars
  try {
    const test = document.createElement('canvas');
    if (!(test.getContext('webgl2') || test.getContext('webgl'))) return null;
  } catch (err) { return null; }

  const byZone = new Map(hotspots.map((h) => [h.zone, h]));
  let disposed = false;

  // loader: the wordmark and a thin shimmering line, gone on the first rendered frame
  const veil = document.createElement('div');
  veil.className = 'boat-veil';
  veil.innerHTML = '<span class="veil-brand"><span class="veil-a">a</span>Beam</span><span class="veil-line"></span>';
  stageEl.appendChild(veil);

  // renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(STAGE_BG, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stageEl.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'boat-labels';
  stageEl.appendChild(labelRenderer.domElement);

  const isSmall = (stageEl.clientWidth || window.innerWidth) < 768;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(STAGE_BG);
  // no scene fog: the yacht sits 25-76 m from the camera, inside the clear air the cove's own haze
  // leaves before 80 m (a navy fog here tinted her 4-10% toward a colour the scene no longer has)

  let envMap = null;
  // far enough for the cove's back ridges (~730 m) seen from the far side of the orbit
  const camera = new THREE.PerspectiveCamera(FOV_BASE, 1, 1.2, 1400);

  // the harbour cove's shared sky / haze / water uniforms (the cove itself is built in stage 4)
  const coveBlank = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  coveBlank.needsUpdate = true;
  const coveU = makeCoveUniforms(coveBlank);
  let harbor = null;
  let revealT0 = -1;   // when the cove started rising out of the haze; -1 when not animating

  /* ---- lights: late golden hour, raking down the topsides ---- */
  const key = new THREE.DirectionalLight(0xffdfa4, 3.1);
  key.position.copy(SUN).multiplyScalar(26);
  key.castShadow = true;
  key.shadow.mapSize.set(isSmall ? 1024 : 2048, isSmall ? 1024 : 2048);
  key.shadow.camera.left = -16;
  key.shadow.camera.right = 16;
  key.shadow.camera.top = 16;
  key.shadow.camera.bottom = -16;
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 62;
  key.shadow.bias = -0.0015;
  key.shadow.normalBias = 0.09;
  key.target.position.set(-1, 2.2, 0);
  scene.add(key, key.target);
  scene.add(new THREE.HemisphereLight(0xb4d2f0, 0x14283f, 0.55));
  const fill = new THREE.DirectionalLight(0x9fc4e8, 0.5);
  fill.position.set(-18, 9, -13);
  scene.add(fill);

  /* ---- water ---- */
  // Out past the cove, so the mouth reads as open sea to the horizon. The rim sits deep in the
  // haze, so the water no longer needs to fade out: it is opaque, drawn after the hills and
  // before the sky, and neither pays for pixels the other covers.
  const WATER_R = 900;
  const waterNormal = makeWaterNormal();
  waterNormal.repeat.set(15 * WATER_R / 150, 15 * WATER_R / 150);   // same ~20 m swell tile
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x03121a, roughness: 0.2, metalness: 0.0,
    envMapIntensity: 0.5, normalMap: waterNormal,
  });
  waterMat.normalScale.set(0.13, 0.13);
  waterMat.fog = false;   // the cove haze below replaces the scene fog on the water
  waterMat.customProgramCacheKey = () => 'cove-water';
  // The harbour's own colour, the hills and the quay mirrored near the shore, the sun's gold on the
  // open water, the same haze as the cove far out. (onBeforeCompile sees the shader before its
  // #includes are expanded, so the hooks are the include lines themselves.) Guarded: if a hook
  // ever disappears the water stays a plain dark sea.
  waterMat.onBeforeCompile = (shader) => {
    const fs = shader.fragmentShader;
    if (!['<emissivemap_fragment>', '<lights_fragment_maps>', '<lights_fragment_end>', '<opaque_fragment>']
      .every((k) => fs.includes(`#include ${k}`))) return;
    Object.assign(shader.uniforms, coveU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WATER_VERT_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${WATER_VERT}`);
    shader.fragmentShader = fs
      .replace('#include <common>', `#include <common>\n${WATER_PARS}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${WATER_BODY_FRAG}`)
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>\n${WATER_REFL_FRAG}`)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.directSpecular = vec3(0.0);')
      .replace('#include <opaque_fragment>', `${WATER_OUT_FRAG}\n#include <opaque_fragment>`);
  };
  const water = new THREE.Mesh(makeWaterGeometry(WATER_R), waterMat);
  water.rotation.x = -Math.PI / 2;
  // no shadow map on the water: its body colour is its own light, not the sun's, so the yacht's
  // shadow would barely show on it (the contact shadow below grounds her), and skipping the
  // soft-shadow taps on the biggest surface in the frame is a real saving
  water.receiveShadow = false;
  water.renderOrder = 2;   // after the yacht and the cove (0), and the hills (1); the sky is 3
  scene.add(water);

  // the warm glow the low sun lays along the horizon, brightest in its own bearing
  const glowTex = (() => {
    const S = 512, c = document.createElement('canvas');
    c.width = S; c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 128, 0, 0);
    g.addColorStop(0, 'rgba(255,196,124,.95)');
    g.addColorStop(0.35, 'rgba(255,164,92,.34)');
    g.addColorStop(1, 'rgba(255,150,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, 128);
    // fade away from the sun's bearing (painted at the middle of the tile)
    const h = ctx.createLinearGradient(0, 0, S, 0);
    h.addColorStop(0, 'rgba(0,0,0,.66)');
    h.addColorStop(0.26, 'rgba(0,0,0,.44)');
    h.addColorStop(0.5, 'rgba(0,0,0,0)');
    h.addColorStop(0.74, 'rgba(0,0,0,.44)');
    h.addColorStop(1, 'rgba(0,0,0,.66)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = h;
    ctx.fillRect(0, 0, S, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const glowMat = new THREE.MeshBasicMaterial({
    map: glowTex, transparent: true, opacity: 0.85, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending, side: THREE.BackSide, toneMapped: false,
  });
  // out beyond the cove: the hills hide it, so it only burns through the harbour mouth
  const horizonGlow = new THREE.Mesh(new THREE.CylinderGeometry(520, 520, 90, 64, 1, true), glowMat);
  horizonGlow.position.y = 12;
  horizonGlow.rotation.y = Math.atan2(SUN.x, SUN.z) - Math.PI;
  horizonGlow.renderOrder = -1;
  scene.add(horizonGlow);

  const shadowTex = canvasRadial(256, [[0, 'rgba(0,0,0,.55)'], [0.5, 'rgba(0,0,0,.24)'], [1, 'rgba(0,0,0,0)']]);
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(29, 10),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(-1, 0.015, 0);
  scene.add(contact);

  const sheenTex = canvasRadial(256, [[0, 'rgba(255,236,208,.5)'], [0.42, 'rgba(255,226,186,.16)'], [1, 'rgba(255,220,180,0)']]);
  const sheen = new THREE.Mesh(
    new THREE.PlaneGeometry(31, 13),
    new THREE.MeshBasicMaterial({
      map: sheenTex, transparent: true, opacity: 0.18, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }),
  );
  sheen.rotation.x = -Math.PI / 2;
  sheen.position.set(-1, 0.008, 0);
  scene.add(sheen);

  // ripple rings travelling out from the waterline, two of them out of phase
  const ringTex = makeRingTexture();
  const ripples = [0, 0.5].map((phase) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 15),
      new THREE.MeshBasicMaterial({
        map: ringTex, transparent: true, opacity: 0, depthWrite: false, fog: false,
        blending: THREE.AdditiveBlending, color: 0x9ec8f0, toneMapped: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(-1, 0.03 + phase * 0.004, 0);
    mesh.visible = !reducedMotion;
    scene.add(mesh);
    return { mesh, phase };
  });

  /* ---- yacht (built in stage 3, below) ---- */
  let boat = null, occluders = [], overlays = {};
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  waterNormal.anisotropy = Math.min(8, maxAniso);

  /* ---- the path camera ----------------------------------------------------------------
     pathP is the only camera state. Scroll sets it (voyage.js), a chip click tweens it when
     there is no voyage running, and the free-look offset rides on top of it.             */
  let pathP = 0;
  let pathTween = null;
  let tracks = null;   // this window's per-layout tracks (layoutTracks), rebuilt on resize
  // loop state, declared up here because resize() and showZone() both wake the loop
  let visible = true, pageVisible = document.visibilityState === 'visible';
  let raf = 0, forceFrame = false, ready = false;
  // under reduced motion nothing animates on its own, so the loop runs only for a short
  // burst after something actually changes instead of spinning at 60fps forever
  let wake = 0;
  const nudge = () => { wake = 30; };
  const look = { th: 0, ph: 0, vth: 0, vph: 0 };
  const LOOK_TH = 0.30, LOOK_PH = 0.115;
  const SPRING_K = 9.0, SPRING_C = 5.6;   // ~2s back to neutral, a touch of overshoot

  const sph = new THREE.Spherical();
  const lookAt = new THREE.Vector3();

  function applyCamera() {
    const p = clamp(pathP, 0, 1);
    const i = segOf(p);
    const span = T_P[i + 1] - T_P[i];
    const u = span > 0 ? clamp((p - T_P[i]) / span, 0, 1) : 0;
    const theta = crSeg(T_TH, i, u);
    const phi = clamp(crSeg(tracks.phi, i, u), 0.16, 1.535);
    const fit = Math.max(8, crSeg(T_FIT, i, u));
    const panX = crSeg(tracks.px, i, u), panY = crSeg(tracks.py, i, u), tilt = crSeg(tracks.tilt, i, u);

    const f = framing(fit, camera.aspect);
    camera.fov = f.fov;
    sph.set(f.r, clamp(phi + look.ph, 0.14, 1.545), theta + look.th);
    lookAt.set(crSeg(T_LX, i, u), crSeg(T_LY, i, u), crSeg(T_LZ, i, u));
    camera.position.setFromSpherical(sph).add(lookAt);
    camera.lookAt(lookAt);
    if (tilt) camera.rotateX(tilt);
    // the pan is a shift of the lens (positive panX / panY move the yacht right / up): the frame
    // slides across the image plane and the camera stays on its orbit, always above the water.
    // (setViewOffset also brings the projection up to date with the fov above.)
    camera.setViewOffset(W, H, -panX * W, panY * H, W, H);
  }

  /* ---- free-look: a drag adds an orbital offset that eases back to neutral ---- */
  let dragId = null, lastX = 0, lastY = 0;
  const canvas = renderer.domElement;
  function onPointerDown(ev) {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    dragId = ev.pointerId;
    lastX = ev.clientX; lastY = ev.clientY;
    look.vth = 0; look.vph = 0;
    stageEl.classList.add('is-dragging');
    try { canvas.setPointerCapture(ev.pointerId); } catch (err) { /* not fatal */ }
    nudge();
    loop();
  }
  function onPointerMove(ev) {
    if (dragId !== ev.pointerId) return;
    const mx = ev.clientX - lastX, my = ev.clientY - lastY;
    lastX = ev.clientX; lastY = ev.clientY;
    look.th = clamp(look.th - mx * 0.0032, -LOOK_TH, LOOK_TH);
    look.ph = clamp(look.ph - my * 0.0020, -LOOK_PH, LOOK_PH);
    look.vth = -mx * 0.020;
    look.vph = -my * 0.012;
    nudge();
    if (reducedMotion) loop();
  }
  function onPointerUp(ev) {
    if (dragId !== ev.pointerId) return;
    dragId = null;
    stageEl.classList.remove('is-dragging');
    if (reducedMotion) { look.th = 0; look.ph = 0; look.vth = 0; look.vph = 0; }
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('lostpointercapture', onPointerUp);

  function springLook(dt) {
    if (dragId !== null || reducedMotion) return;
    for (const [d, v] of [['th', 'vth'], ['ph', 'vph']]) {
      const a = -SPRING_K * look[d] - SPRING_C * look[v];
      look[v] += a * dt;
      look[d] += look[v] * dt;
      if (Math.abs(look[d]) < 0.0004 && Math.abs(look[v]) < 0.0015) { look[d] = 0; look[v] = 0; }
    }
  }

  /* ---- zone highlighting ---- */
  function setHover(zone, on) {
    const o = overlays[zone];
    if (o) o.hover = on;
  }

  /* ---- hotspot markers ---- */
  const markers = new Map();
  function buildMarkers() {
    Object.entries(MARKERS).forEach(([zone, pos]) => {
    const h = byZone.get(zone);
    if (!h) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hotspot';
    btn.dataset.zone = zone;
    btn.setAttribute('aria-label', `${h.label}: ${h.service}`);
    btn.innerHTML = `<span class="hotspot-dot" aria-hidden="true"></span><span class="hotspot-tip" role="tooltip">${h.tooltip}</span>`;
    btn.addEventListener('click', (ev) => { ev.stopPropagation(); go(zone); });
    btn.addEventListener('focus', () => { btn.classList.add('is-focused'); setHover(zone, true); });
    btn.addEventListener('blur', () => { btn.classList.remove('is-focused'); setHover(zone, false); });
    btn.addEventListener('mouseenter', () => setHover(zone, true));
    btn.addEventListener('mouseleave', () => setHover(zone, false));
      const obj = new CSS2DObject(btn);
      obj.position.set(pos[0], pos[1], pos[2]);
      boat.add(obj);
      markers.set(zone, { btn, obj, world: new THREE.Vector3() });
    });
  }

  /* ---- chips ---- */
  const chips = Array.from(chipsEl.querySelectorAll('[data-zone]'));
  const chipHandlers = [];
  chips.forEach((c) => {
    const onClick = () => go(c.dataset.zone);
    const onEnter = () => setHover(c.dataset.zone, true);
    const onLeave = () => setHover(c.dataset.zone, false);
    c.addEventListener('click', onClick);
    c.addEventListener('mouseenter', onEnter);
    c.addEventListener('mouseleave', onLeave);
    chipHandlers.push([c, onClick, onEnter, onLeave]);
  });

  // Navigation is scroll: the page owns it, so a chip or a marker asks the voyage to scroll
  // and the camera follows from there. Without a voyage (no scroll region) we tween instead.
  function go(zone) {
    if (onNavigate && onNavigate(zone) !== false) return;
    selectZone(zone);
  }

  /* ---- content: the panel, the pressed chip, the marker and the zone tint ---- */
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  let currentZone = null, pendingZone = null;

  function showZone(zone) {
    const h = byZone.get(zone);
    if (!h) return;
    if (zone !== currentZone) {
      panelEl.querySelector('.panel-eyebrow').textContent = h.eyebrow;
      panelEl.querySelector('.panel-title').textContent = h.title;
      panelEl.querySelector('.panel-body').textContent = h.body;
      const cta = panelEl.querySelector('.panel-cta');
      cta.textContent = h.cta.label;
      cta.href = h.cta.href;
      panelEl.dataset.zone = zone;
      currentZone = zone;
    }
    chips.forEach((c) => c.setAttribute('aria-pressed', c.dataset.zone === zone ? 'true' : 'false'));
    if (!boat) pendingZone = zone;   // the zone tint and the marker arrive with the yacht
    markers.forEach((m, z) => m.btn.classList.toggle('is-selected', z === zone));
    Object.entries(overlays).forEach(([z, o]) => {
      o.selected = z === zone;
      if (z === zone && o.flash === 0) o.flash = 0.16;
    });
    forceFrame = true;   // the stage may be gated (hidden tab): draw the new framing anyway
    nudge();
    if (ready) loop();
  }

  function stopFor(zone) {
    return STOPS.find((s) => s.zone === zone && s.p > 0.05) || STOPS[0];
  }

  // used when no voyage is driving the camera (e.g. the module failed to load)
  function selectZone(zone) {
    if (!byZone.has(zone)) return;
    showZone(zone);
    const to = stopFor(zone).p;
    if (reducedMotion || !visible || !pageVisible) { pathP = to; pathTween = null; return; }
    pathTween = { t0: performance.now(), dur: 900, from: pathP, to };
  }

  function setVoyageProgress(p) {
    pathP = clamp(p, 0, 1);
    pathTween = null;
    nudge();
    if (reducedMotion && ready) loop();
  }

  /* ---- sizing ---- */
  let W = 1, H = 1;
  // the priming frame is drawn at DPR 1 and the real ratio comes in on the frame after: it is
  // hidden behind the loader, and it takes three quarters of the pixels out of the first paint
  let dprPrime = true;
  // The pixel ratio is capped at 1.5 (the cove is a lot of fill at 2x), and steps down a further
  // quarter at a time, to 1, if a steady scroll keeps missing frames (see perfSample).
  let dprCap = 1.5;
  function resize() {
    if (disposed) return;
    W = Math.max(1, stageEl.clientWidth);
    H = Math.max(1, stageEl.clientHeight);
    renderer.setPixelRatio(dprPrime ? 1 : Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.setSize(W, H, false);
    labelRenderer.setSize(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    tracks = layoutTracks(W, camera.aspect);
    forceFrame = true;
    nudge();
    if (ready) loop();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stageEl);
  resize();
  applyCamera();

  /* ---- visibility gating ---- */
  const io = new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; if (visible) loop(); }, { rootMargin: '120px' });
  io.observe(stageEl);
  const onVis = () => { pageVisible = document.visibilityState === 'visible'; if (pageVisible) loop(); };
  document.addEventListener('visibilitychange', onVis);

  /* ---- adaptive resolution: a rolling window of frame times; if its 90th percentile is over
     19 ms (dropping frames at 60 Hz), the next frames render with fewer pixels ---- */
  const perfWin = [];
  function perfSample(ms) {
    if (ms < 4 || ms > 100 || dprCap <= 1 || (window.devicePixelRatio || 1) <= 1) return;
    perfWin.push(ms);
    if (perfWin.length < 90) return;
    const p90 = perfWin.slice().sort((a, b) => a - b)[80];
    perfWin.length = 0;
    if (p90 > 19) { dprCap = Math.max(1, dprCap - 0.25); window.setTimeout(resize, 0); }   // (not from inside the frame)
  }

  /* ---- render loop ---- */
  const raycaster = new THREE.Raycaster();
  const tmp = new THREE.Vector3();
  let frame = 0, firstFrame = true;
  const clock = new THREE.Clock();
  function loop() {
    if (disposed) return;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    // Gated when the stage is off-screen or the tab is hidden — but the very first
    // frame always runs: it is what removes the veil and lets CSS2DRenderer mount the
    // markers. A page opened in a background tab would otherwise sit on the loader
    // with no markers until it was focused.
    const gated = !visible || !pageVisible;
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 1 / 20);
    if (gated && !firstFrame && !forceFrame) return;
    if (!gated && !firstFrame && !reducedMotion) perfSample(rawDt * 1000);
    forceFrame = false;
    const t = clock.getElapsedTime();
    frame++;

    if (pathTween) {
      const k = Math.min(1, (performance.now() - pathTween.t0) / pathTween.dur);
      pathP = pathTween.from + (pathTween.to - pathTween.from) * easeInOut(k);
      if (k >= 1) pathTween = null;
    }
    if (boat && !reducedMotion) {
      boat.position.y = Math.sin(t * 0.55) * 0.035;
      boat.rotation.z = Math.sin(t * 0.43) * 0.0045;
      boat.rotation.x = Math.sin(t * 0.33) * 0.0026;
    }
    if (harbor && !reducedMotion) harbor.update(t);   // the moored boats ride the same clock
    if (revealT0 >= 0) {   // the cove rising out of the haze once it is built (~1.2 s, then idle)
      const k = Math.min(1, (performance.now() - revealT0) / 1200);
      coveU.cvReveal.value = k * k * (3 - 2 * k);
      if (k >= 1) revealT0 = -1;
    }
    if (!reducedMotion) {
      waterNormal.offset.x = t * 0.0075;
      waterNormal.offset.y = t * 0.0042;
      for (const r of ripples) {
        const k = (t * 0.17 + r.phase) % 1;
        r.mesh.scale.setScalar(0.97 + k * 0.30);
        r.mesh.material.opacity = 0.30 * Math.sin(k * Math.PI) ** 1.6;
      }
    }
    springLook(dt);
    applyCamera();

    // zone highlight easing
    for (const o of Object.values(overlays)) {
      const want = Math.max(o.hover ? 0.12 : (o.selected ? 0.06 : 0), o.flash);
      o.flash *= 0.93;
      if (o.flash < 0.004) o.flash = 0;
      o.mat.opacity += (want - o.mat.opacity) * 0.14;
      o.mesh.visible = o.mat.opacity > 0.003;
    }

    if (frame % 3 === 0) {
      markers.forEach((m) => {
        m.obj.getWorldPosition(m.world);
        tmp.copy(m.world).sub(camera.position);
        const dist = tmp.length();
        raycaster.set(camera.position, tmp.normalize());
        raycaster.far = dist;
        const hit = raycaster.intersectObjects(occluders, false);
        m.btn.classList.toggle('is-behind', hit.length > 0 && hit[0].distance < dist - 0.4);
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
      if (dprPrime) { dprPrime = false; window.setTimeout(resize, 0); }
      veil.classList.add('is-gone');
      veilTimer = window.setTimeout(() => veil.remove(), 600);
      // the sun and the yacht are both fixed: one shadow pass is enough, and dropping the
      // per-frame pass is most of the frame budget back on a phone
      renderer.shadowMap.autoUpdate = false;
    }
    if (gated) return;   // that was the priming frame; wait to be woken again
    if (reducedMotion && !pathTween) {
      if (wake <= 0) return;   // settle and stop until something changes
      wake--;
    }
    raf = requestAnimationFrame(loop);
  }
  /* ---- staged build -------------------------------------------------------------------
     One synchronous init was a ~5s long task: the PMREM bake, the yacht, and above all the
     first render (every shader program linked at once). It is split into three short tasks
     with a yield between them, and the programs are linked off-thread where the browser
     supports it. A hidden tab never gets a rAF, so the steps are scheduled on timers and
     the compile is raced against one — the priming frame still runs in a background tab. */
  let stageTimer = 0, veilTimer = 0;
  const nextStep = (fn) => {
    if (disposed) return;
    if (document.visibilityState === 'hidden') { stageTimer = window.setTimeout(fn, 0); return; }
    requestAnimationFrame(() => { stageTimer = window.setTimeout(fn, 0); });
  };

  function stageEnv() {
    if (disposed) return;
    envMap = buildEnvironment(renderer, coveU);
    scene.environment = envMap;
    nextStep(stageYacht);
  }

  function stageYacht() {
    if (disposed) return;
    const built = buildYacht(envMap, isSmall);
    boat = built.group;
    occluders = built.occluders;
    overlays = built.overlays;
    for (const t of built.texs) t.anisotropy = Math.min(8, maxAniso);
    scene.add(boat);
    buildMarkers();
    if (pendingZone) { const z = pendingZone; pendingZone = null; showZone(z); }
    nextStep(stageHarbor);
  }

  // the cove is scenery: if it ever fails to build, the yacht still sails on open water
  function stageHarbor() {
    if (disposed) return;
    try {
      if (!harbor) harbor = buildHarbor(coveU, isSmall);
      harbor.stages.shift()();
      if (harbor.stages.length) { nextStep(stageHarbor); return; }
      harbor.maxAniso(Math.min(8, maxAniso));
      scene.add(harbor.group);
      // bake the turquoise shallows into the water's vertices (local x, y → world x, -z)
      const wp = water.geometry.attributes.position, ws = water.geometry.attributes.aShore;
      for (let i = 0; i < wp.count; i++) ws.array[i] = harbor.shoreAt(wp.getX(i), -wp.getY(i));
      ws.needsUpdate = true;
      // fade it in unless nobody would see the fade (reduced motion, a hidden or off-screen stage)
      if (reducedMotion || !visible || !pageVisible) coveU.cvReveal.value = 1;
      else revealT0 = performance.now();
    } catch (err) {
      console.error('[aBeam] harbour backdrop failed to build', err);
      if (harbor) harbor.dispose(coveBlank);
      harbor = null;
    }
    nextStep(stageFirstFrame);
  }

  function stageFirstFrame() {
    if (disposed) return;
    ready = true;
    const start = () => { if (!disposed) loop(); };
    if (document.visibilityState === 'hidden' || typeof renderer.compileAsync !== 'function') {
      start();
      return;
    }
    let done = false;
    const once = () => { if (!done) { done = true; start(); } };
    stageTimer = window.setTimeout(once, 1500);
    renderer.compileAsync(scene, camera).then(once, once);
  }

  nextStep(stageEnv);

  /* ---- teardown ---- */
  function destroy() {
    disposed = true;
    if (raf) cancelAnimationFrame(raf);
    if (stageTimer) clearTimeout(stageTimer);
    if (veilTimer) clearTimeout(veilTimer);
    ro.disconnect();
    io.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('lostpointercapture', onPointerUp);
    chipHandlers.forEach(([c, a, b, d]) => {
      c.removeEventListener('click', a);
      c.removeEventListener('mouseenter', b);
      c.removeEventListener('mouseleave', d);
    });

    // the cove first: its instanced meshes and uniform-bound textures are not reachable by the
    // traversal below, which then sweeps up everything else
    if (harbor) { harbor.dispose(coveBlank); harbor = null; }
    coveBlank.dispose();
    const seenGeo = new Set(), seenMat = new Set(), seenTex = new Set();
    scene.traverse((o) => {
      if (o.geometry && !seenGeo.has(o.geometry)) { seenGeo.add(o.geometry); o.geometry.dispose(); }
      const list = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of list) {
        if (seenMat.has(m)) continue;
        seenMat.add(m);
        for (const k of ['map', 'normalMap', 'alphaMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
          const tex = m[k];
          if (tex && !seenTex.has(tex)) { seenTex.add(tex); tex.dispose(); }
        }
        m.dispose();
      }
    });
    if (envMap) envMap.dispose();
    scene.environment = null;
    renderer.dispose();
    stageEl.innerHTML = '';
  }

  return {
    stops: STOPS.map((s) => ({ p: s.p, zone: s.zone, card: s.card })),
    showZone,
    selectZone,
    setVoyageProgress,
    stopFor: (zone) => stopFor(zone).p,
    info: () => ({ triangles: renderer.info.render.triangles, calls: renderer.info.render.calls }),
    destroy,
  };
}
