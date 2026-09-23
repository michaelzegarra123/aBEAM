// aBeam — boat.js
// Interactive 3D motor yacht (~24 m LOA), built procedurally with Three.js.
// No model files, no image files, no fetches: the hull and superstructure are lofted /
// extruded in code, the teak and water textures are drawn on a <canvas>, and the
// environment map is a shader sky run through PMREMGenerator.
//
// The camera is not an orbit toy: it is a rig that cuts between composed shots
// (position AND look-at keyframed, framed by fraction of the frame so the yacht sits
// where the layout leaves room). chapters.js drives it from the page scroll.
// Exposes: initBoat({ stageEl, panelEl, chipsEl, hotspots, reducedMotion, ui })
//   → { selectZone, destroy, enterChapter, reframe, setNavigator, chapters, chapterOf } | null

import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHAPTER_KEYS, zoneOfChapter, CARD_SIDE } from './chapters.js';

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

// value-noise height field → tangent-space normal map for the water
function makeWaterNormal() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const h = new Float32Array(S * S);
  let seed = 77771;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const sm = (a) => a * a * (3 - 2 * a);
  for (const [n, amp] of [[4, 1], [8, 0.52], [16, 0.26], [32, 0.13]]) {
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
  const STR = 2.6;
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
  tex.repeat.set(24, 24);
  return tex;
}

// soft concentric rings — the ripple that stands off the hull at the waterline
function makeRippleTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.58, 'rgba(255,255,255,0)');
  g.addColorStop(0.68, 'rgba(198,224,255,.42)');
  g.addColorStop(0.74, 'rgba(255,255,255,0)');
  g.addColorStop(0.85, 'rgba(198,224,255,.20)');
  g.addColorStop(0.91, 'rgba(255,255,255,0)');
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
   A gradient sky with a sun disc, rendered into a PMREM cubemap. This is what makes
   the gelcoat, the smoked glass and the stainless read as real materials.        */

const SUN = new THREE.Vector3(14, 18, 10).normalize();

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = /* glsl */`
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 below;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float gain;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 c = y > 0.0
    ? mix(horizon, zenith, pow(clamp(y, 0.0, 1.0), 0.42))
    : mix(horizon, below, pow(clamp(-y, 0.0, 1.0), 0.30));
  float s = dot(d, sunDir);
  c += sunColor * smoothstep(0.9974, 0.9994, s) * 16.0;
  c += sunColor * pow(max(s, 0.0), 40.0) * 0.55;
  gl_FragColor = vec4(c * gain, 1.0);
}`;

function buildEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 32, 20);
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      zenith: { value: new THREE.Color(0x2c6cb2) },
      horizon: { value: new THREE.Color(0xfadfb4) },
      below: { value: new THREE.Color(0x091a30) },
      sunDir: { value: SUN.clone() },
      sunColor: { value: new THREE.Color(0xffeccb) },
      gain: { value: 1.5 },
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
  texs.push(teakTex);

  /* ---- materials ---- */
  const gelcoat = M(new THREE.MeshPhysicalMaterial({
    color: 0xe8e3d6, roughness: 0.31, metalness: 0.0,
    clearcoat: 1, clearcoatRoughness: 0.075, envMapIntensity: 1.05,
  }));
  const gelcoatSoft = M(new THREE.MeshPhysicalMaterial({
    color: 0xdcd8cd, roughness: 0.52, metalness: 0.0,
    clearcoat: 0.4, clearcoatRoughness: 0.2, envMapIntensity: 0.85,
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
  const teakGloss = M(new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: teakTex, roughness: 0.2, metalness: 0.0,
    clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.95,
  }));
  const cushion = M(new THREE.MeshStandardMaterial({ color: 0xded7c6, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.4 }));
  const rubber = M(new THREE.MeshStandardMaterial({ color: 0x15191f, roughness: 0.78, metalness: 0.0, envMapIntensity: 0.4 }));
  const interior = M(new THREE.MeshStandardMaterial({ color: 0x10161f, roughness: 0.82, metalness: 0.0, envMapIntensity: 0.25 }));
  const dash = M(new THREE.MeshStandardMaterial({ color: 0x1b2028, roughness: 0.45, metalness: 0.1, envMapIntensity: 0.6 }));
  const lampR = M(new THREE.MeshStandardMaterial({ color: 0x3a0a10, emissive: 0xd8343f, emissiveIntensity: 1.1, roughness: 0.3 }));
  const lampG = M(new THREE.MeshStandardMaterial({ color: 0x062615, emissive: 0x2fc07a, emissiveIntensity: 1.1, roughness: 0.3 }));
  const lampW = M(new THREE.MeshStandardMaterial({ color: 0x2a2c2e, emissive: 0xfff2d8, emissiveIntensity: 0.9, roughness: 0.3 }));
  // env may be null on the priming frame — initBoat bakes the PMREM sky a beat later and
  // assigns it to exactly this list (the additive zone overlays must never get one).
  const pbrMats = mats.slice();
  for (const m of pbrMats) m.envMap = env;

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
    return new THREE.Vector3(X_STERN - 0.006, y, (a < 0.5 ? -1 : 1) * transomHalfAtY(y));
  }, false), navy);

  // carry the navy sheer stripe across the transom
  add(gridGeometry(1, 1, (a2, b2) => {
    const y = chineY(0) + (deckEdgeY(0) - chineY(0)) * (0.781 + 0.048 * b2);
    return new THREE.Vector3(X_STERN - 0.006, y, (a2 < 0.5 ? -1 : 1) * transomHalfAtY(y));
  }, false), navy);

  // beach-club door, set into the transom with a stainless surround
  const doorW = 2.8, doorH = 0.9, doorY = 1.26;
  const garage = add(new THREE.BoxGeometry(0.04, doorH, doorW), dash, false, false);
  garage.position.set(X_STERN - 0.012, doorY, 0);
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
  add(soleGeo, teak, false, true);
  add(bothSides((s) => gridGeometry(14, 2, (a, b) => {
    const t = tC0 + (tC1 - tC0) * a;
    const hw = sheerHalf(t) - 0.30 + 0.11 * b;
    return new THREE.Vector3(tx(t), COCKPIT.sole + (deckEdgeY(t) - 0.02 - COCKPIT.sole) * b, s * hw);
  }, s < 0 ? false : true)), gelcoatSoft, false, true);
  // aft face of the cockpit (the transom locker) and the riser under the side decks
  const lockerW = (sheerHalf(tC0) - 0.30) * 2;
  const locker = add(new THREE.BoxGeometry(0.16, deckEdgeY(0) - COCKPIT.sole, lockerW), gelcoatSoft, false, true);
  locker.position.set(tx(tC0) + 0.08, (COCKPIT.sole + deckEdgeY(0) - 0.02) / 2, 0);
  const riser = add(new THREE.BoxGeometry(0.16, 0.86, houseHalf(HOUSE.x0) * 2), gelcoatSoft, true, false);
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
  }, true), gelcoatSoft, true, false);
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
  const hardtopLiner = add(prism(HARD_CFG, FLY.hardLo - 0.03, FLY.hardLo + 0.01, { off: -0.07, crease: 0.42 }), gelcoatSoft);
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
  const fbSetteeBase = add(new THREE.BoxGeometry(0.72, 0.4, 2.5), gelcoatSoft);
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
  const setteeAft = add(new THREE.BoxGeometry(aftBaseW, 0.46, 4.4), gelcoatSoft, true, true);
  setteeAft.position.set(-10.0, COCKPIT.sole + 0.23, 0);
  const setteeAftPad = add(padGeo(0.86, 4.4, 0.17, 0.1, 0.05), cushion, true);
  setteeAftPad.position.set(-10.0, COCKPIT.sole + 0.46, 0);
  const setteeAftBack = add(padGeo(0.2, 4.4, 0.5, 0.08, 0.05), cushion, true);
  setteeAftBack.position.set(-10.42, COCKPIT.sole + 0.6, 0);
  const setteeSide = add(new THREE.BoxGeometry(2.1, 0.46, 0.76), gelcoatSoft, true, true);
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

  return { group, occluders, overlays, mats, pbrMats, texs };
}

/* ==================================================================== 7. the shot list
   One entry per chapter, in scroll order. pos / target are world metres. compose is the
   framing: [x, y] as a fraction of the half-frame that the LOOK-AT point is pushed by,
   which slides the yacht the other way — negative x puts the yacht right of centre,
   negative y lifts it. mfy is the vertical compose used when the card is docked at the
   bottom of a narrow viewport. fov is the focal length of the shot. */

const SHOT_DEFS = {
  // hero — three-quarter bow from the sun side, yacht dominant, copy lower-left
  hero: { pos: [30.7, 8.6, 23.0], target: [1.2, 2.7, 0], fov: 29, compose: [-0.19, -0.21], mfy: -0.26 },
  // whole boat — high aft quarter, full length in frame: the establishing shot
  whole: { pos: [-37.5, 15.5, 33.4], target: [-1.0, 3.3, 0], fov: 26, compose: [0.31, 0.03], mfy: -0.12 },
  // deck — dock level off the stern quarter: cockpit, swim platform, the handover
  deck: { pos: [-26.8, 3.9, 13.0], target: [-8.8, 1.9, 0.4], fov: 30, compose: [-0.24, 0.03], mfy: -0.10 },
  // cabin — close on the deckhouse glass, just above window height
  cabin: { pos: [7.0, 9.2, 30.5], target: [-2.2, 3.1, 0.5], fov: 27, compose: [0.30, -0.02], mfy: -0.12 },
  // engine — low rake along the aft topsides, on the engine-room vents
  engine: { pos: [-22.3, 2.2, 15.2], target: [-7.8, 1.8, 1.0], fov: 30, compose: [-0.24, 0.03], mfy: -0.10 },
  // hull — from the water forward, topsides sweeping away to the bow
  hull: { pos: [33.3, 3.5, 27.6], target: [2.0, 1.8, 0], fov: 29, compose: [0.30, -0.03], mfy: -0.12 },
  // pull-back — the closing wide, back on the hero side
  wide: { pos: [60.0, 17.0, 55.0], target: [-0.5, 3.0, 0], fov: 22, compose: [0.10, 0.02], mfy: -0.08 },
};

// the running order comes from chapters.js, so the film and the page agree on it
const SHOTS = CHAPTER_KEYS.map((key) => ({ key, zone: zoneOfChapter(key), ...SHOT_DEFS[key] }));
const SHOT_OF_ZONE = new Map(SHOTS.map((s, i) => [s.zone, i]));

const MARKERS = {
  hull: sidePoint(0.552, 0.55, 1, 0.34).toArray(),
  deck: [-9.55, 1.98, 0.9],
  cabin: [-2.0, 2.92, houseHalf(-2.0) * 0.965 + 0.42],
  engine: sidePoint(0.128, 0.665, 1, 0.38).toArray(),
};

/* ==================================================================== 8. init */

export function initBoat({ stageEl, panelEl, chipsEl, hotspots, reducedMotion, ui }) {
  try {
    const test = document.createElement('canvas');
    if (!(test.getContext('webgl2') || test.getContext('webgl'))) return null;
  } catch (err) { return null; }

  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const byZone = new Map(hotspots.map((h) => [h.zone, h]));
  let disposed = false;

  // branded loader veil
  const veil = document.createElement('div');
  veil.className = 'boat-veil';
  veil.innerHTML = '<span class="veil-mark"><span class="veil-a">a</span>Beam</span>'
    + '<span class="veil-line" aria-hidden="true"></span>'
    + '<span class="veil-note">Preparing your boat…</span>';
  stageEl.appendChild(veil);

  // renderer — deliberately cheap for the priming frame: DPR 1, no shadow pass, no
  // environment, flat water. upgradeQuality() below switches all of that on one tick
  // after the first frame has been presented, which is what keeps time-to-first-frame
  // short on a big desktop canvas (the shadow pass, DPR 2 and the PMREM bake were the
  // whole of a single multi-second blocking task).
  // A ?p= still stops the loop after it has composed its frame, so that frame has to
  // survive the next composite — an unpreserved drawing buffer would come back empty.
  // Normal visits never pay for it.
  const wantsStill = /[?&]p=/.test(window.location.search);
  const renderer = new THREE.WebGLRenderer({
    antialias: true, alpha: false, powerPreference: 'high-performance',
    preserveDrawingBuffer: wantsStill,
  });
  renderer.setClearColor(STAGE_BG, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stageEl.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'boat-labels';
  stageEl.appendChild(labelRenderer.domElement);

  const isSmall = (stageEl.clientWidth || window.innerWidth) < 768;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(STAGE_BG);
  scene.fog = new THREE.FogExp2(0x123048, 0.0062);

  let envMap = null;   // baked in upgradeQuality()

  const camera = new THREE.PerspectiveCamera(SHOTS[0].fov, 1, 0.4, 480);
  camera.position.set(...SHOTS[0].pos);

  /* ---- lights ---- */
  const key = new THREE.DirectionalLight(0xffe3bc, 2.6);
  key.position.copy(SUN).multiplyScalar(26);
  key.castShadow = false;   // on in upgradeQuality()
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
  scene.add(new THREE.HemisphereLight(0xbcd8f2, 0x0d2138, 0.6));
  const fill = new THREE.DirectionalLight(0x9fc4e8, 0.6);
  fill.position.set(-18, 9, -13);
  scene.add(fill);

  /* ---- water + contact shadow ---- */
  let waterNormal = null;   // generated in upgradeQuality()
  const waterAlpha = canvasRadial(512, [[0, '#fff'], [0.4, '#fff'], [1, '#000']]);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x0d2140, roughness: 0.2, metalness: 0.0,
    envMapIntensity: 0.7,
    transparent: true, alphaMap: waterAlpha,
  });
  waterMat.normalScale.set(0.15, 0.15);
  const water = new THREE.Mesh(new THREE.CircleGeometry(150, 84), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.receiveShadow = true;
  scene.add(water);

  const shadowTex = canvasRadial(256, [[0, 'rgba(0,0,0,.55)'], [0.5, 'rgba(0,0,0,.24)'], [1, 'rgba(0,0,0,0)']]);
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(29, 10),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(-1, 0.015, 0);
  scene.add(contact);

  // waterline ripple: two soft rings standing off the hull, breathing out of phase
  const rippleTex = makeRippleTexture();
  const ripples = [];
  for (const [i, sx] of [1.0, 1.18].entries()) {
    const mat = new THREE.MeshBasicMaterial({
      map: rippleTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: i ? 0.10 : 0.16, toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(34 * sx, 15 * sx), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(-1, 0.02 + i * 0.004, 0);
    mesh.renderOrder = 1;
    scene.add(mesh);
    ripples.push({ mesh, mat, base: mat.opacity, phase: i * 2.6 });
  }

  /* ---- yacht ---- */
  const { group: boat, occluders, overlays, pbrMats, texs } = buildYacht(null, isSmall);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  for (const t of texs) t.anisotropy = Math.min(4, maxAniso);
  scene.add(boat);

  /* ---- camera rig -------------------------------------------------------------
     `base` is the shot the rig is holding (or interpolating towards). Every frame the
     drift, the settle and the viewer's free-look offset are added on top of it, so a
     cut never fights the idle motion and an interrupted cut blends from wherever the
     camera actually is. The wheel is never touched: the page always scrolls.        */
  const UP = new THREE.Vector3(0, 1, 0);
  const sph = new THREE.Spherical();
  const vTmp = new THREE.Vector3();
  const vTmp2 = new THREE.Vector3();
  const base = { pos: new THREE.Vector3(...SHOTS[0].pos), target: new THREE.Vector3(...SHOTS[0].target), fov: SHOTS[0].fov };
  let move = null, settleAt = -1, chapter = -1, still = false;
  let lookYaw = 0, lookPitch = 0, dragId = null, lastX = 0, lastY = 0;

  // cubic-bezier(.16,.86,.12,1) — a long, slow-out camera move with weight at the front
  function bezierEase(x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const p1 = 0.16, p2 = 0.12;                 // x-control points
    const cx = 3 * p1, bx = 3 * (p2 - p1) - cx, ax = 1 - cx - bx;
    const cy = 3 * 0.86, by = 3 * (1 - 0.86) - cy, ay = 1 - cy - by;
    let t = x;
    for (let i = 0; i < 6; i++) {               // Newton solve for t(x)
      const fx = ((ax * t + bx) * t + cx) * t - x;
      const d = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(d) < 1e-6) break;
      t -= fx / d;
      t = clamp(t, 0, 1);
    }
    return ((ay * t + by) * t + cy) * t;
  }

  // Resolve a shot into a camera basis for the current viewport: distance is scaled so a
  // portrait frame still holds a 24 m yacht, then the whole rig is trucked sideways /
  // pedestalled so the yacht sits clear of whatever the layout puts on top of it.
  const REF_ASPECT = 1.6;        // the aspect each shot is composed for
  const MAX_VFOV = 50;           // past this the vertical perspective starts to bend

  function resolveShot(i) {
    const s = SHOTS[i];
    const aspect = clamp(W / H, 0.35, 4);
    // Hold the HORIZONTAL coverage the shot was composed with: on a narrower frame open
    // the vertical angle first (a wider lens), and only once that would distort do we
    // pull the camera back for the rest. A 24 m yacht then stays framed the same way at
    // 21:9, at 4:3 and on a phone.
    const hHalf = Math.atan(Math.tan(THREE.MathUtils.degToRad(s.fov) / 2) * REF_ASPECT);
    let vHalf = Math.max(Math.atan(Math.tan(hHalf) / aspect), THREE.MathUtils.degToRad(s.fov) / 2);
    const maxHalf = THREE.MathUtils.degToRad(MAX_VFOV) / 2;
    let fit = 1;
    if (vHalf > maxHalf) { fit = Math.tan(vHalf) / Math.tan(maxHalf); vHalf = maxHalf; }
    // a tall frame is allowed to crop a little rather than hold the yacht at arm's length
    if (aspect < 1.2) fit *= 1 - 0.22 * clamp((1.2 - aspect) / 0.55, 0, 1);

    const target = new THREE.Vector3(...s.target);
    const off = new THREE.Vector3(...s.pos).sub(target).multiplyScalar(fit);
    const halfH = off.length() * Math.tan(vHalf);
    const docked = W < 900;
    // the sideways compose only matters while the card sits BESIDE the yacht: in a tall
    // frame it floats above it, so the shot re-centres instead of hugging one edge
    const fx = docked ? 0 : s.compose[0] * clamp((aspect - 0.75) / 0.85, 0, 1);
    const fy = docked ? (s.mfy != null ? s.mfy : s.compose[1]) : s.compose[1];
    const fwd = off.clone().negate().normalize();
    const right = fwd.clone().cross(UP).normalize();
    const up = right.clone().cross(fwd).normalize();
    const shift = right.multiplyScalar(fx * halfH * aspect).add(up.multiplyScalar(fy * halfH));
    target.add(shift);
    return { pos: target.clone().add(off), target, fov: THREE.MathUtils.radToDeg(vHalf * 2) };
  }

  function startMove(to) {
    const fromS = new THREE.Spherical().setFromVector3(vTmp.subVectors(base.pos, base.target));
    const toS = new THREE.Spherical().setFromVector3(vTmp.subVectors(to.pos, to.target));
    let dTheta = toS.theta - fromS.theta;
    while (dTheta > Math.PI) dTheta -= Math.PI * 2;
    while (dTheta < -Math.PI) dTheta += Math.PI * 2;
    move = {
      t0: performance.now(), dur: 1100,
      fromT: base.target.clone(), toT: to.target.clone(),
      fromS, toS, dTheta, fromFov: base.fov, toFov: to.fov,
    };
  }

  function advanceMove() {
    if (!move) return;
    const k = clamp((performance.now() - move.t0) / move.dur, 0, 1);
    const e = bezierEase(k);
    base.target.lerpVectors(move.fromT, move.toT, e);
    sph.radius = move.fromS.radius + (move.toS.radius - move.fromS.radius) * e;
    sph.phi = move.fromS.phi + (move.toS.phi - move.fromS.phi) * e;
    sph.theta = move.fromS.theta + move.dTheta * e;
    base.pos.copy(base.target).add(vTmp.setFromSpherical(sph));
    base.fov = move.fromFov + (move.toFov - move.fromFov) * e;
    if (k >= 1) { move = null; settleAt = performance.now(); }
  }

  // the drifted, free-looked camera for this frame
  function applyCamera(t) {
    let dYaw = 0, dPitch = 0, dRad = 1;
    if (!reducedMotion) {
      dYaw = Math.sin(t * 0.107) * 0.013 + Math.sin(t * 0.041 + 1.1) * 0.009;
      dPitch = Math.sin(t * 0.079 + 0.7) * 0.0055;
      dRad = 1 + Math.sin(t * 0.058) * 0.005;
      if (settleAt >= 0) {                       // a short damped settle after each cut
        const s = (performance.now() - settleAt) / 1000;
        if (s < 1) dRad *= 1 + Math.exp(-5.2 * s) * Math.sin(s * 13.5) * 0.008;
        else settleAt = -1;
      }
    }
    sph.setFromVector3(vTmp.subVectors(base.pos, base.target));
    sph.theta += dYaw + lookYaw;
    sph.phi = clamp(sph.phi + dPitch + lookPitch, 0.14, Math.PI / 2 + 0.10);
    sph.radius *= dRad;
    camera.position.copy(base.target).add(vTmp2.setFromSpherical(sph));
    if (camera.position.y < 0.6) camera.position.y = 0.6;
    camera.lookAt(base.target);
    if (Math.abs(camera.fov - base.fov) > 0.004) { camera.fov = base.fov; camera.updateProjectionMatrix(); }
  }

  /* ---- free-look: drag the canvas for a small offset that eases back ---- */
  function onDown(ev) {
    if (ev.button != null && ev.button !== 0) return;
    still = false;
    dragId = ev.pointerId;
    lastX = ev.clientX; lastY = ev.clientY;
    stageEl.classList.add('is-dragging');
    try { renderer.domElement.setPointerCapture(ev.pointerId); } catch (err) { /* ignore */ }
    loop();
  }
  function onMove(ev) {
    if (dragId !== ev.pointerId) return;
    const dx = (ev.clientX - lastX) / Math.max(1, W);
    const dy = (ev.clientY - lastY) / Math.max(1, H);
    lastX = ev.clientX; lastY = ev.clientY;
    lookYaw = clamp(lookYaw - dx * (isTouch ? 0.85 : 1.1), -0.17, 0.17);
    lookPitch = clamp(lookPitch - dy * 0.5, -0.085, 0.085);
    forceFrame = true;
    loop();
  }
  function onUp(ev) {
    if (dragId !== ev.pointerId) return;
    dragId = null;
    stageEl.classList.remove('is-dragging');
  }
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointercancel', onUp);
  renderer.domElement.style.touchAction = 'pan-y';   // vertical touch always scrolls

  /* ---- zone highlighting ---- */
  function setHover(zone, on) {
    const o = overlays[zone];
    if (o) o.hover = on;
  }

  /* ---- hotspot markers ---- */
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
    btn.addEventListener('focus', () => { btn.classList.add('is-focused'); setHover(zone, true); });
    btn.addEventListener('blur', () => { btn.classList.remove('is-focused'); setHover(zone, false); });
    btn.addEventListener('mouseenter', () => setHover(zone, true));
    btn.addEventListener('mouseleave', () => setHover(zone, false));
    const obj = new CSS2DObject(btn);
    obj.position.set(p[0], p[1], p[2]);
    boat.add(obj);
    markers.set(zone, { btn, obj, world: new THREE.Vector3() });
  });

  /* ---- chips ---- */
  const chips = Array.from(chipsEl.querySelectorAll('[data-zone]'));
  const chipHandlers = [];
  chips.forEach((c) => {
    const onClick = () => selectZone(c.dataset.zone);
    const onEnter = () => setHover(c.dataset.zone, true);
    const onLeave = () => setHover(c.dataset.zone, false);
    c.addEventListener('click', onClick);
    c.addEventListener('mouseenter', onEnter);
    c.addEventListener('mouseleave', onLeave);
    chipHandlers.push([c, onClick, onEnter, onLeave]);
  });

  /* ---- chapters ----------------------------------------------------------------
     enterChapter() is the single entry point: it writes the card, the ticks, the
     markers and the overlay for the chapter's zone, then cuts the camera to that
     chapter's composed shot. chapters.js calls it from the scroll position; a chip or
     a marker click asks the page to scroll there instead (see setNavigator), so the
     scroll and the shot can never disagree.                                         */

  // only touch what actually changes: rewriting identical text would invalidate the
  // overlay layer (and re-announce the aria-live card) for nothing
  const setText = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };

  function writeCard(zone) {
    const h = zone ? byZone.get(zone) : null;
    if (h) {
      setText(panelEl.querySelector('.panel-eyebrow'), h.eyebrow);
      setText(panelEl.querySelector('.panel-title'), h.title);
      setText(panelEl.querySelector('.panel-body'), h.body);
      const cta = panelEl.querySelector('.panel-cta');
      setText(cta, h.cta.label);
      if (cta.getAttribute('href') !== h.cta.href) cta.href = h.cta.href;
      panelEl.dataset.zone = zone;
      panelEl.dataset.side = CARD_SIDE[zone] || 'right';
      panelEl.classList.add('is-open');
    } else {
      panelEl.classList.remove('is-open');
    }
    chips.forEach((c) => c.setAttribute('aria-pressed', h && c.dataset.zone === zone ? 'true' : 'false'));
    markers.forEach((m, z) => m.btn.classList.toggle('is-selected', z === zone));
    Object.entries(overlays).forEach(([z, o]) => {
      o.selected = z === zone;
      if (z === zone) o.flash = 0.2;
    });
  }

  function enterChapter(i, opts = {}) {
    const n = clamp(Math.round(i), 0, SHOTS.length - 1);
    const shot = SHOTS[n];
    const same = n === chapter;
    chapter = n;
    writeCard(shot.zone);
    stageEl.classList.toggle('is-wide', shot.key === 'wide');
    const to = resolveShot(n);
    // a cut is only animated when it can actually be seen — otherwise snap, so the next
    // frame the stage draws is already composed on the new chapter
    if (opts.instant || reducedMotion || firstFrame || !visible || !pageVisible) {
      base.pos.copy(to.pos); base.target.copy(to.target); base.fov = to.fov;
      move = null; settleAt = -1;
    } else if (!same) {
      startMove(to);
    }
    forceFrame = true;
    loop();
  }

  // re-resolve the held shot for a new viewport without breaking a cut in flight
  function reframe() {
    if (chapter < 0) return;
    const to = resolveShot(chapter);
    if (move) {
      move.toT.copy(to.target);
      move.toS.setFromVector3(vTmp.subVectors(to.pos, to.target));
      move.toFov = to.fov;
      let d = move.toS.theta - move.fromS.theta;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      move.dTheta = d;
    } else {
      base.pos.copy(to.pos); base.target.copy(to.target); base.fov = to.fov;
    }
    forceFrame = true;
  }

  // Still mode: hold the composed frame and stop driving the loop (deep links and
  // ?p= stills, and anything that wants a deterministic frame). Any interaction or a
  // chapter change with drift wanted turns it back off.
  function setStill(on) {
    still = !!on;
    if (!still) { forceFrame = true; loop(); }
  }

  // the page-level navigator (a smooth scroll to the chapter). Without one — boat.js
  // used on its own — selecting a zone just cuts to it.
  let navigate = (i) => enterChapter(i);
  function setNavigator(fn) { navigate = typeof fn === 'function' ? fn : ((i) => enterChapter(i)); }

  function chapterOf(zone) {
    const i = SHOT_OF_ZONE.get(zone);
    return i == null ? 0 : i;
  }

  function selectZone(zone) {
    if (!byZone.has(zone)) return;
    navigate(chapterOf(zone), zone);
  }

  /* ---- sizing ---- */
  let W = 1, H = 1, dprCap = 1;
  function resize() {
    W = Math.max(1, stageEl.clientWidth);
    H = Math.max(1, stageEl.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.setSize(W, H, false);
    labelRenderer.setSize(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }
  // a resize clears the drawing buffer, so always redraw — even when holding a still
  const ro = new ResizeObserver(() => { resize(); reframe(); forceFrame = true; loop(); });
  ro.observe(stageEl);
  resize();

  /* ---- visibility gating ---- */
  let visible = true, pageVisible = document.visibilityState === 'visible', raf = 0, forceFrame = false;
  const io = new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; if (visible) loop(); }, { rootMargin: '120px' });
  io.observe(stageEl);
  const onVis = () => { pageVisible = document.visibilityState === 'visible'; if (pageVisible) loop(); };
  document.addEventListener('visibilitychange', onVis);

  /* ---- deferred quality pass ----------------------------------------------------
     Everything the first frame can live without: the PMREM sky that the gelcoat, the
     smoked glass and the stainless reflect, the shadow pass, the water normal map and
     the real device pixel ratio. Materials are marked for recompile once, here, off
     the critical path.                                                             */
  let veilTimer = null, qualityTimer = null, upgraded = false;
  function upgradeQuality() {
    qualityTimer = null;
    if (upgraded || disposed) return;
    upgraded = true;
    envMap = buildEnvironment(renderer);
    scene.environment = envMap;
    // the same sky, heavily blurred and pulled down, as the backdrop: a horizon to sit
    // the water against instead of a flat navy wall
    scene.background = envMap;
    scene.backgroundBlurriness = 0.22;
    scene.backgroundIntensity = 0.38;
    for (const m of pbrMats) { m.envMap = envMap; m.needsUpdate = true; }
    waterNormal = makeWaterNormal();
    waterNormal.anisotropy = Math.min(4, maxAniso);
    waterMat.normalMap = waterNormal;
    waterMat.needsUpdate = true;
    key.castShadow = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.needsUpdate = true;
    dprCap = W < 768 ? 1.5 : 2;
    resize();
    reframe();
    forceFrame = true;
    loop();
  }

  /* ---- render loop ---- */
  const raycaster = new THREE.Raycaster();
  const tmp = new THREE.Vector3();
  let frame = 0, firstFrame = true, t = 0;
  const clock = new THREE.Clock();
  function loop() {
    if (disposed) return;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    // Gated when the stage is off-screen or the tab is hidden — but the very first
    // frame always runs: it is what removes the veil and lets CSS2DRenderer mount the
    // markers. A page opened in a background tab would otherwise sit on "Preparing
    // your boat…" with no markers until it was focused.
    const gated = !visible || !pageVisible;
    if (gated && !firstFrame && !forceFrame) return;
    forceFrame = false;
    // own clock: capped so a long gated gap resumes smoothly instead of jumping
    const dt = Math.min(0.05, clock.getDelta());
    t += dt;
    frame++;

    advanceMove();
    if (!dragId && (lookYaw || lookPitch)) {
      const f = Math.pow(0.5, dt / 0.34);          // ~2 s back to the composed framing
      lookYaw *= f; lookPitch *= f;
      if (Math.abs(lookYaw) < 1e-4) lookYaw = 0;
      if (Math.abs(lookPitch) < 1e-4) lookPitch = 0;
    }
    if (!reducedMotion) {
      boat.position.y = Math.sin(t * 0.55) * 0.035;
      boat.rotation.z = Math.sin(t * 0.43) * 0.0045;
      boat.rotation.x = Math.sin(t * 0.33) * 0.0026;
      if (waterNormal) {
        waterNormal.offset.x = t * 0.0075;
        waterNormal.offset.y = t * 0.0042;
      }
      for (const r of ripples) {
        const w = Math.sin(t * 0.30 + r.phase);
        r.mesh.scale.setScalar(1 + w * 0.022);
        r.mat.opacity = r.base * (0.72 + 0.28 * w);
      }
    }
    applyCamera(t);

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
      veil.classList.add('is-gone');
      veilTimer = window.setTimeout(() => veil.remove(), 600);
      // hand the frame to the compositor, then load the expensive half. A timer, not
      // rAF/idle: this has to run in a hidden tab too.
      qualityTimer = window.setTimeout(upgradeQuality, 80);
    }
    // that was a priming / still frame; wait to be woken again. Under reduced motion
    // nothing drifts, so the loop only runs while a cut or a drag is actually moving.
    const quiet = (still && !move)
      || (reducedMotion && !move && dragId === null && !lookYaw && !lookPitch);
    if (gated || quiet) return;
    raf = requestAnimationFrame(loop);
  }
  enterChapter(0, { instant: true });
  loop();

  /* ---- teardown ---- */
  function destroy() {
    disposed = true;
    if (raf) cancelAnimationFrame(raf);
    if (veilTimer) clearTimeout(veilTimer);
    if (qualityTimer) clearTimeout(qualityTimer);
    ro.disconnect();
    io.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    renderer.domElement.removeEventListener('pointerdown', onDown);
    renderer.domElement.removeEventListener('pointermove', onMove);
    renderer.domElement.removeEventListener('pointerup', onUp);
    renderer.domElement.removeEventListener('pointercancel', onUp);
    chipHandlers.forEach(([c, a, b, d]) => {
      c.removeEventListener('click', a);
      c.removeEventListener('mouseenter', b);
      c.removeEventListener('mouseleave', d);
    });
    markers.forEach((m) => { if (m.obj.parent) m.obj.parent.remove(m.obj); m.btn.remove(); });

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
    if (waterNormal) waterNormal.dispose();
    scene.environment = null;
    renderer.dispose();
    labelRenderer.domElement.remove();
    stageEl.innerHTML = '';
    stageEl.classList.remove('is-wide', 'is-dragging');
  }

  return {
    selectZone,
    destroy,
    enterChapter,
    reframe,
    setStill,
    setNavigator,
    chapterOf,
    chapters: SHOTS.map((s) => ({ key: s.key, zone: s.zone })),
  };
}
