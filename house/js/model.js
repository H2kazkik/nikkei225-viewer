// model.js — 中庭の家（和風）の 3D モデル。
// 平面図は別の絵ではなく、このモデルを高さ 1.2 m で切って真上から見たもの。
//
// 座標: x = 東, z = 南（平面図では上が北 = -z）, y = 上。単位 m。
// 敷地 34 × 30 m、母屋 30 × 22 m（x 2–32, z 2–24）。南側の中庭は切り欠き。
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { makeSurface, makeInkLine, texture, reveal, NR } from './materials.js';

export const CUT_HEIGHT = 1.2;
export const LOW = 3.5;
export const HIGH = 4.9;

// name: 和名 / en: 英名 / rect: [x0, z0, x1, z1]（壁の中心線基準）/ h: 天井高 / entry: 質感が掃き始める点
export const ROOMS = [
  { id: 'gallery', name: '玄関ギャラリー', en: 'ENTRY GALLERY', rect: [21, 14, 24.5, 24], h: LOW, entry: [22.75, 24] },
  { id: 'engawa', name: '縁側', en: 'ENGAWA', rect: [11, 12, 24.5, 14], h: LOW, entry: [24.5, 13] },
  { id: 'living', name: '居間', en: 'LIVING', rect: [2, 12, 11, 24], h: HIGH, entry: [11, 13] },
  { id: 'dining', name: '食堂', en: 'DINING', rect: [2, 5, 8, 12], h: HIGH, entry: [5, 12] },
  { id: 'kitchen', name: '台所', en: 'KITCHEN', rect: [8, 5, 14, 12], h: LOW, entry: [10, 12] },
  { id: 'library', name: '書斎', en: 'LIBRARY', rect: [14, 5, 19, 12], h: LOW, entry: [16.7, 12] },
  { id: 'zashiki', name: '座敷', en: 'ZASHIKI', rect: [19, 5, 24.5, 12], h: LOW, entry: [22, 12] },
  { id: 'primary', name: '主寝室', en: 'PRIMARY SUITE', rect: [24.5, 5, 32, 13], h: LOW, entry: [26, 13] },
  { id: 'dressing', name: '脱衣', en: 'DRESSING', rect: [24.5, 13, 28, 19], h: LOW, entry: [26, 19] },
  { id: 'bath', name: '浴室', en: 'BATH', rect: [28, 13, 32, 19], h: LOW, entry: [28, 16] },
  { id: 'tea', name: '茶室', en: 'TEA ROOM', rect: [24.5, 19, 32, 24], h: LOW, entry: [24.5, 21] },
  { id: 'svc1', name: '納戸', en: '', rect: [2, 2, 8, 5], h: LOW, entry: [5, 5] },
  { id: 'svc2', name: '食品庫', en: '', rect: [8, 2, 14, 5], h: LOW, entry: [11, 5] },
  { id: 'svc3', name: '設備', en: '', rect: [14, 2, 19, 5], h: LOW, entry: [16.5, 5] },
  { id: 'svc4', name: '納戸', en: '', rect: [19, 2, 24.5, 5], h: LOW, entry: [22, 5] },
  { id: 'svc5', name: '衣装', en: '', rect: [24.5, 2, 32, 5], h: LOW, entry: [28, 5] },
  { id: 'court', name: '中庭', en: 'COURTYARD', rect: [11, 14, 21, 24], h: 14, entry: [21, 19] },
];
export const ROOM_INDEX = Object.fromEntries(ROOMS.map((r, i) => [r.id, i]));
if (ROOMS.length > NR) throw new Error('increase NR');

// 屋根スラブ（軒込み）: [x0, z0, x1, z1, 下端高]
const ROOFS = [
  [0.6, 0.6, 11.0, 5.0, LOW],   // 納戸まわり
  [8.0, 5.0, 11.0, 12.0, LOW],  // 台所西
  [0.6, 5.0, 8.0, 12.0, HIGH],  // 食堂
  [0.6, 12.0, 11.6, 25.6, HIGH],// 居間
  [11.0, 0.6, 33.4, 14.0, LOW], // 北棟・縁側
  [11.0, 14.0, 20.0, 15.0, LOW],// 中庭側の軒
  [20.0, 14.0, 33.4, 25.6, LOW],// 玄関棟
];

const UNIT = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const EDGE_POS = (() => {
  const e = new THREE.EdgesGeometry(UNIT);
  return Array.from(e.attributes.position.array);
})();
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (t) => t * t * (3 - 2 * t);

export function buildHouse({ resolution }) {
  const root = new THREE.Group();
  const roofGroup = new THREE.Group();
  const lineMats = [];
  const inkWall = makeInkLine(1.9, resolution);
  const inkMid = makeInkLine(1.1, resolution);
  const inkThin = makeInkLine(0.8, resolution);
  const inkDim = makeInkLine(0.8, resolution);
  lineMats.push(inkWall, inkMid, inkThin, inkDim);
  root.add(roofGroup);

  const sharedEdgeGeo = new LineSegmentsGeometry().setPositions(EDGE_POS);
  const segs = [];

  // ---- 面の種類 ----------------------------------------------------------
  const SKIN = {
    plaster: () => ({ map: texture('plaster'), scale: 0.8, rough: 0.95 }),
    charred: () => ({ map: texture('charred'), scale: 1.6, rough: 0.82 }),
    sugi: () => ({ map: texture('sugi'), scale: 2.0, rough: 0.7 }),
    sugiDark: () => ({ map: texture('sugi'), scale: 2.0, rough: 0.6, tint: 0x8a6a4c }),
    steel: () => ({ color: 0x1b1c1e, rough: 0.45, metal: 0.75 }),
    slate: () => ({ map: texture('slate'), scale: 0.83, rough: 0.5 }),
    kawara: () => ({ map: texture('kawara'), scale: 0.9, rough: 0.55 }),
    gravel: () => ({ map: texture('gravel'), scale: 0.38, rough: 1 }),
    stone: () => ({ map: texture('slate'), scale: 1.4, rough: 0.8, tint: new THREE.Color().setRGB(1.9, 1.9, 1.85) }),
    glass: () => ({ color: 0xcfe2e8, rough: 0.04, glass: true, env: 1.6, opacity: 0.16 }),
    shoji: () => ({ uvMap: texture('shoji'), triplanar: false, rough: 0.9, emissive: 0xffe2b0, emissiveMap: texture('shoji'), emissiveIntensity: 0.28, map: null }),
    lantern: () => ({ uvMap: texture('shoji'), triplanar: false, rough: 0.9, emissive: 0xffc27a, emissiveMap: texture('shoji'), emissiveIntensity: 1.5 }),
    ceramic: () => ({ color: 0x23272a, rough: 0.3 }),
    bark: () => ({ color: 0x3a2c22, rough: 1 }),
  };
  function surface(kind, cut) {
    const o = SKIN[kind]();
    const m = makeSurface({ ...o, cut });
    if (o.opacity != null) m.opacity = o.opacity;
    return m;
  }
  // 6 面（+x, -x, +y, -y, +z, -z）に種類を割り当て
  function faceMats(kinds, cut) {
    const cache = {};
    return kinds.map((k) => (cache[k] ||= surface(k, cut)));
  }

  // ---- ボックス ---------------------------------------------------------
  // seg.cut = 切断の対象（壁・柱）。家具は切られない。
  function addBox({ x0, x1, z0, z1, y0 = 0, y1, kinds, line = inkWall, cutable = true, cast = true, recv = true, parent = root, delay = 0 }) {
    const cut = { value: 0 };
    const grp = new THREE.Group();
    const mesh = new THREE.Mesh(UNIT, faceMats(kinds, cut));
    mesh.castShadow = cast; mesh.receiveShadow = recv;
    const ln = new LineSegments2(sharedEdgeGeo, line);
    ln.frustumCulled = false;
    grp.add(mesh, ln);
    grp.position.set((x0 + x1) / 2, y0, (z0 + z1) / 2);
    grp.scale.set(x1 - x0, y1 - y0, z1 - z0);
    parent.add(grp);
    const seg = { grp, y0, y1, w: x1 - x0, d: z1 - z0, cut, cutable, delay, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
    if (cutable) segs.push(seg);
    return seg;
  }
  const same = (k) => [k, k, k, k, k, k];

  // ---- 壁 ----------------------------------------------------------------
  // a, b: 中心線の端点 [x, z]。out: 外側の向き（'+x','-x','+z','-z'）。
  const OUTIDX = { '+x': [0], '-x': [1], '+z': [4], '-z': [5] };
  function wall({ a, b, t, h, out, outKind = 'charred', inKind = 'plaster', openings = [], ext = t / 2, y0 = 0, shrinkTop = 0 }) {
    const horiz = a[1] === b[1];
    const s0 = (horiz ? Math.min(a[0], b[0]) : Math.min(a[1], b[1])) - ext;
    const s1 = (horiz ? Math.max(a[0], b[0]) : Math.max(a[1], b[1])) + ext;
    const fixed = horiz ? a[1] : a[0];
    const ops = openings.map((o) => ({ sill: 0, head: 2.2, kind: 'open', ...o, c0: o.c - o.w / 2, c1: o.c + o.w / 2 })).sort((p, q) => p.c0 - q.c0);
    const mk = (u0, u1, yy0, yy1, kinds, line = inkWall, parent = root) => {
      if (u1 - u0 < 1e-3 || yy1 - yy0 < 1e-3) return;
      const box = horiz
        ? { x0: u0, x1: u1, z0: fixed - t / 2, z1: fixed + t / 2 }
        : { x0: fixed - t / 2, x1: fixed + t / 2, z0: u0, z1: u1 };
      return addBox({ ...box, y0: yy0, y1: yy1, kinds, line, parent, delay: 0 });
    };
    const wallKinds = (() => {
      const k = same(inKind);
      if (out) OUTIDX[out].forEach((i) => (k[i] = outKind));
      return k;
    })();
    const H = h - shrinkTop;
    let cur = s0;
    for (const o of ops) {
      mk(cur, o.c0, y0, H, wallKinds);
      if (o.sill > y0) mk(o.c0, o.c1, y0, o.sill, wallKinds);
      if (o.head < H) mk(o.c0, o.c1, o.head, H, wallKinds);
      fillOpening(o, horiz, fixed, t, mk);
      cur = o.c1;
    }
    mk(cur, s1, y0, H, wallKinds);
  }

  // 開口の中身（ガラス・障子・建具）
  function fillOpening(o, horiz, fixed, t, mk) {
    const nAxisKinds = (kind) => {
      const k = same('sugiDark');
      (horiz ? [4, 5] : [0, 1]).forEach((i) => (k[i] = kind));
      return k;
    };
    const thin = 0.05;
    const thick = (u0, u1, y0, y1, kinds, tt = thin) => {
      const half = tt / 2;
      const box = horiz
        ? { x0: u0, x1: u1, z0: fixed - half, z1: fixed + half }
        : { x0: fixed - half, x1: fixed + half, z0: u0, z1: u1 };
      return addBox({ ...box, y0, y1, kinds, line: inkThin });
    };
    if (o.kind === 'glass') {
      const gk = same('glass');
      thick(o.c0, o.c1, o.sill + 0.04, o.head - 0.04, gk, 0.03);
      const n = Math.max(1, Math.round(o.w / 1.5));
      for (let i = 0; i <= n; i++) {
        const u = o.c0 + (o.w * i) / n;
        const post = horiz
          ? { x0: u - 0.03, x1: u + 0.03, z0: fixed - 0.06, z1: fixed + 0.06 }
          : { x0: fixed - 0.06, x1: fixed + 0.06, z0: u - 0.03, z1: u + 0.03 };
        addBox({ ...post, y0: o.sill, y1: o.head, kinds: same('steel'), line: inkMid });
      }
      const rail = (y0, y1) => {
        const r = horiz
          ? { x0: o.c0, x1: o.c1, z0: fixed - 0.06, z1: fixed + 0.06 }
          : { x0: fixed - 0.06, x1: fixed + 0.06, z0: o.c0, z1: o.c1 };
        addBox({ ...r, y0, y1, kinds: same('steel'), line: inkMid });
      };
      rail(o.sill, o.sill + 0.04); rail(o.head - 0.04, o.head);
    } else if (o.kind === 'shoji') {
      const n = Math.max(1, Math.round(o.w / 0.9));
      for (let i = 0; i < n; i++) {
        const u0 = o.c0 + (o.w * i) / n, u1 = o.c0 + (o.w * (i + 1)) / n;
        const off = (i % 2 ? 0.035 : -0.035);
        const half = 0.02;
        const box = horiz
          ? { x0: u0 + 0.005, x1: u1 - 0.005, z0: fixed + off - half, z1: fixed + off + half }
          : { x0: fixed + off - half, x1: fixed + off + half, z0: u0 + 0.005, z1: u1 - 0.005 };
        addBox({ ...box, y0: o.sill, y1: o.head, kinds: nAxisKinds('shoji'), line: inkThin });
      }
    }
  }

  // ---- 外壁・中庭まわり ----------------------------------------------------
  const TE = 0.3, TI = 0.12;
  // 北
  wall({ a: [2, 2], b: [32, 2], t: TE, h: LOW, out: '-z' });
  // 東
  wall({
    a: [32, 2], b: [32, 24], t: TE, h: LOW, out: '+x', openings: [
      { c: 9, w: 4, sill: 0.3, head: 2.6, kind: 'glass' },
      { c: 16, w: 3.4, sill: 1.5, head: 2.3, kind: 'glass' },
      { c: 21.5, w: 1.8, sill: 0.5, head: 1.7, kind: 'glass' },
    ],
  });
  // 南（玄関棟）— 玄関扉の開口 w1.6 × h3.0
  wall({
    a: [21, 24], b: [32, 24], t: TE, h: LOW, out: '+z', openings: [
      { c: 22.75, w: 1.6, sill: 0, head: 3.0, kind: 'door' },
      { c: 29.5, w: 1.2, sill: 0.3, head: 2.2, kind: 'glass' },
    ],
  });
  // 南（居間）
  wall({ a: [2, 24], b: [11, 24], t: TE, h: HIGH, out: '+z' });
  // 西
  wall({ a: [2, 2], b: [2, 5], t: TE, h: LOW, out: '-x', ext: TE / 2 });
  wall({
    a: [2, 5], b: [2, 24], t: TE, h: HIGH, out: '-x', ext: TE / 2, openings: [
      { c: 8.4, w: 5.4, sill: 0.9, head: 3.0, kind: 'glass' },
      { c: 18, w: 11.4, sill: 0, head: 3.7, kind: 'glass' },
    ],
  });
  // 中庭を囲む壁
  wall({ a: [21, 14], b: [21, 24], t: 0.1, h: LOW, inKind: 'sugiDark', ext: 0, openings: [{ c: 19, w: 9.4, sill: 0, head: 3.2, kind: 'glass' }] });
  wall({ a: [11, 14], b: [21, 14], t: 0.1, h: LOW, inKind: 'sugiDark', ext: 0, openings: [{ c: 16, w: 9.4, sill: 0, head: 3.2, kind: 'glass' }] });
  wall({ a: [11, 14], b: [11, 24], t: TI, h: HIGH, ext: 0, openings: [{ c: 19.2, w: 8, sill: 0, head: 3.7, kind: 'glass' }] });
  wall({ a: [11, 24], b: [21, 24], t: 0.25, h: 2.4, out: '+z', outKind: 'charred', inKind: 'charred' });

  // ---- 内壁 ----------------------------------------------------------------
  const IN = (o) => wall({ t: TI, ...o, ext: o.ext ?? 0.06, shrinkTop: 0.01 });
  IN({ a: [8, 12], b: [11, 12], h: HIGH, openings: [{ c: 9.9, w: 1.8, head: 2.2 }] });
  IN({ a: [11, 12], b: [24.5, 12], h: LOW, openings: [
    { c: 16.7, w: 2.4, head: 2.2, kind: 'shoji' },
    { c: 22.1, w: 3.8, head: 2.2, kind: 'shoji' },
  ] });
  IN({ a: [24.5, 2], b: [24.5, 24], h: LOW, openings: [
    { c: 18.9, w: 7.8, sill: 0.9, head: 2.7, kind: 'shoji' },
  ] });
  // 縁側と居間の境の欄間（低い屋根と高い屋根の段差を塞ぐ）
  wall({ a: [11, 12], b: [11, 14], t: 0.12, h: HIGH, y0: LOW, ext: 0, shrinkTop: 0.01 });
  IN({ a: [2, 5], b: [8, 5], h: HIGH, openings: [{ c: 5, w: 0.9, head: 2.1 }] });
  IN({ a: [8, 5], b: [32, 5], h: LOW, openings: [
    { c: 11, w: 0.9, head: 2.1 }, { c: 16.5, w: 0.9, head: 2.1 }, { c: 22, w: 0.9, head: 2.1 }, { c: 28, w: 0.9, head: 2.1 },
  ] });
  IN({ a: [8, 2], b: [8, 5], h: LOW });
  IN({ a: [8, 5], b: [8, 12], h: HIGH, openings: [{ c: 8, w: 3.4, head: 2.4 }] });
  IN({ a: [14, 2], b: [14, 12], h: LOW, openings: [{ c: 9.5, w: 0.9, head: 2.1 }] });
  IN({ a: [19, 2], b: [19, 12], h: LOW, openings: [{ c: 7.5, w: 2.0, head: 2.0, kind: 'shoji' }] });
  IN({ a: [24.5, 13], b: [32, 13], h: LOW, openings: [{ c: 26.5, w: 0.9, head: 2.1 }] });
  IN({ a: [28, 13], b: [28, 19], h: LOW, openings: [{ c: 15.9, w: 0.9, head: 2.1 }] });
  IN({ a: [24.5, 19], b: [32, 19], h: LOW, openings: [{ c: 26, w: 1.0, head: 2.0 }] });

  // ---- 床 -----------------------------------------------------------------
  const floorKind = { gallery: 'slate', engawa: 'sugiDark', tea: 'sugiDark', zashiki: 'sugiDark', court: 'gravel' };
  ROOMS.forEach((r) => {
    const [x0, z0, x1, z1] = r.rect;
    const kind = floorKind[r.id] || 'sugiDark';
    addBox({ x0, x1, z0, z1, y0: -0.12, y1: 0, kinds: same(kind), line: inkThin, cutable: false, cast: false });
  });

  // ---- 屋根（軒を深く）-----------------------------------------------------
  ROOFS.forEach(([x0, z0, x1, z1, under]) => {
    const kinds = ['charred', 'charred', 'kawara', 'sugi', 'charred', 'charred'];
    addBox({ x0, x1, z0, z1, y0: under, y1: under + 0.38, kinds, line: inkWall, cutable: false, parent: roofGroup });
  });

  // ---- 敷地・庭 -----------------------------------------------------------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), surface('gravel', { value: 0 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(17, -0.13, 15);
  ground.receiveShadow = true;
  root.add(ground);
  // 敷地境界の塀
  const fence = (x0, x1, z0, z1, h) => {
    addBox({ x0, x1, z0, z1, y0: 0, y1: h, kinds: same('plaster'), line: inkMid });
    addBox({ x0: x0 - (x1 - x0 < 1 ? 0.12 : 0), x1: x1 + (x1 - x0 < 1 ? 0.12 : 0), z0: z0 - (z1 - z0 < 1 ? 0.12 : 0), z1: z1 + (z1 - z0 < 1 ? 0.12 : 0), y0: h, y1: h + 0.14, kinds: same('kawara'), line: inkMid });
  };
  fence(-0.08, 21.5, 29.92, 30.08, 1.9);
  fence(24.0, 34.08, 29.92, 30.08, 1.9);
  fence(-0.08, 0.08, 0, 29.92, 1.4);
  fence(33.92, 34.08, 0, 29.92, 1.9);
  fence(0.08, 33.92, -0.08, 0.08, 1.9);
  // 飛び石（門 → 玄関）
  const stones = [];
  [[22.7, 29.1], [22.9, 28.2], [22.6, 27.2], [22.85, 26.3], [22.75, 25.4]].forEach(([x, z], i) => {
    stones.push(addBox({ x0: x - 0.38, x1: x + 0.38, z0: z - 0.3, z1: z + 0.3, y0: 0, y1: 0.06, kinds: same('stone'), line: inkMid, cutable: false }));
  });
  [[22.75, 31.0], [22.6, 30.2]].forEach(([x, z]) => addBox({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.3, z1: z + 0.3, y0: 0, y1: 0.05, kinds: same('stone'), line: inkMid, cutable: false }));
  // 沓脱石
  addBox({ x0: 21.7, x1: 23.8, z0: 24.15, z1: 24.95, y0: 0, y1: 0.08, kinds: same('stone'), line: inkMid, cutable: false });

  // ---- 玄関扉（ピボット）---------------------------------------------------
  const doorPivot = new THREE.Group();
  doorPivot.position.set(23.42, 0, 24);
  root.add(doorPivot);
  {
    const kinds = ['charred', 'charred', 'charred', 'charred', 'charred', 'sugi'];
    const cut = { value: 0 };
    const leaf = new THREE.Mesh(UNIT, faceMats(kinds, cut));
    leaf.scale.set(1.5, 3.0, 0.09);
    leaf.position.set(-0.75, 0, 0);
    leaf.castShadow = leaf.receiveShadow = true;
    const ln = new LineSegments2(sharedEdgeGeo, inkMid); ln.frustumCulled = false;
    ln.scale.copy(leaf.scale); ln.position.copy(leaf.position);
    // 取っ手（縦のスチール）
    const handle = new THREE.Mesh(UNIT, surface('steel', cut));
    handle.scale.set(0.03, 1.2, 0.05); handle.position.set(-1.38, 0.9, 0.07);
    doorPivot.add(leaf, ln, handle);
  }
  // 平面図の開き勝手（扉が 90° 開いた姿と軌跡の円弧）
  const arcPts = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI / 2;
    arcPts.push(23.42 - 1.5 * Math.cos(a), 0.04, 24 - 1.5 * Math.sin(a));
  }
  const arcGeo = new LineSegmentsGeometry();
  const arcSeg = [];
  for (let i = 0; i < 24; i++) arcSeg.push(arcPts[i * 3], arcPts[i * 3 + 1], arcPts[i * 3 + 2], arcPts[i * 3 + 3], arcPts[i * 3 + 4], arcPts[i * 3 + 5]);
  arcGeo.setPositions(arcSeg);
  const doorArc = new LineSegments2(arcGeo, inkDim); doorArc.frustumCulled = false;
  root.add(doorArc);

  // ---- 玄関ギャラリーの家具 ------------------------------------------------
  const furniture = new THREE.Group();
  root.add(furniture);
  const fbox = (x0, x1, z0, z1, y0, y1, kinds, line = inkThin) => addBox({ x0, x1, z0, z1, y0, y1, kinds, line, cutable: false, parent: furniture });
  // 低い飾り棚（障子の下）
  fbox(24.02, 24.42, 15.4, 22.4, 0.08, 0.86, ['sugiDark', 'sugiDark', 'charred', 'sugiDark', 'sugiDark', 'sugiDark']);
  fbox(24.04, 24.40, 15.5, 22.3, 0.0, 0.08, same('steel'));
  // 腰掛
  fbox(21.18, 21.62, 20.7, 22.5, 0.0, 0.44, ['sugi', 'sugi', 'sugi', 'sugi', 'sugi', 'sugi']);
  // 行灯
  fbox(21.35, 21.65, 16.0, 16.3, 0.0, 0.05, same('steel'));
  addBox({ x0: 21.37, x1: 21.63, z0: 16.02, z1: 16.28, y0: 0.05, y1: 1.05, kinds: same('lantern'), line: inkThin, cutable: false, parent: furniture, cast: false });
  // 花器と枝
  const vaseGeo = new THREE.CylinderGeometry(0.1, 0.13, 0.36, 24).translate(0, 0.18, 0);
  const vase = new THREE.Mesh(vaseGeo, surface('ceramic', { value: 0 }));
  vase.position.set(24.22, 0.86, 18.8); vase.castShadow = true;
  furniture.add(vase);
  const vaseEdges = new THREE.EdgesGeometry(vaseGeo, 30);
  const vaseLn = new LineSegments2(new LineSegmentsGeometry().setPositions(Array.from(vaseEdges.attributes.position.array)), inkThin);
  vaseLn.position.copy(vase.position); vaseLn.frustumCulled = false;
  furniture.add(vaseLn);
  // 楓の枝
  {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.3, 0), new THREE.Vector3(-0.08, 0.7, 0.05), new THREE.Vector3(-0.28, 1.0, -0.04), new THREE.Vector3(-0.5, 1.12, 0.02),
    ]);
    const branch = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.012, 5), surface('bark', { value: 0 }));
    branch.position.set(24.22, 0.86, 18.8); branch.castShadow = true;
    furniture.add(branch);
    const leafGeo = new THREE.IcosahedronGeometry(0.06, 0);
    const leafMat = makeSurface({ color: 0xffffff, rough: 0.8 });
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, 14);
    const col = new THREE.Color();
    const rr = (i) => ((Math.sin(i * 91.7) + 1) * 0.5);
    for (let i = 0; i < 14; i++) {
      const t = 0.45 + rr(i) * 0.55;
      const p = curve.getPoint(Math.min(1, t));
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(p.x + (rr(i + 3) - 0.5) * 0.12, p.y + (rr(i + 7) - 0.3) * 0.1, p.z + (rr(i + 11) - 0.5) * 0.12).add(new THREE.Vector3(24.22, 0.86, 18.8)),
        new THREE.Quaternion(), new THREE.Vector3(1.3, 0.35, 1.3));
      leaves.setMatrixAt(i, m);
      col.setHSL(0.02 + rr(i + 5) * 0.06, 0.8, 0.38 + rr(i) * 0.12);
      leaves.setColorAt(i, col);
    }
    leaves.castShadow = true;
    furniture.add(leaves);
  }

  // ---- 中庭の楓（庭が現れてから育つ）---------------------------------------
  const tree = new THREE.Group();
  tree.position.set(15.6, 0, 19.4);
  {
    const trunk = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.1, 1.0, 0.05), new THREE.Vector3(-0.25, 2.0, 0.1), new THREE.Vector3(0.05, 3.1, -0.1),
      ]), 20, 0.16, 7), surface('bark', { value: 0 }));
    trunk.castShadow = true;
    tree.add(trunk);
    const N = 900;
    const leafGeo = new THREE.IcosahedronGeometry(0.22, 1);
    const leafMat = makeSurface({ color: 0xffffff, rough: 0.85, emissive: 0x3a1204, emissiveIntensity: 0.55 });
    const inst = new THREE.InstancedMesh(leafGeo, leafMat, N);
    const col = new THREE.Color();
    let seed = 12;
    const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N; i++) {
      // 傘状の樹冠: 水平に広く、上に薄い
      const a = R() * Math.PI * 2, rad = Math.pow(R(), 0.55) * 2.9;
      const y = 3.35 + (R() - 0.35) * 1.5 * (1 - rad / 3.6) + Math.sin(a * 3 + rad) * 0.15;
      const s = 0.7 + R() * 0.9;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(a) * rad + 0.1, y, Math.sin(a) * rad),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 3, R() * 3, R() * 3)),
        new THREE.Vector3(s * 1.5, s * 0.8, s * 1.5));
      inst.setMatrixAt(i, m);
      col.setHSL(0.0 + R() * 0.085, 0.8, 0.34 + R() * 0.2);
      inst.setColorAt(i, col);
    }
    inst.castShadow = true;
    tree.add(inst);
  }
  root.add(tree);
  // 平面図上の樹木記号
  const treeSym = (() => {
    const pts = [];
    [1.1, 2.0, 2.7].forEach((rad, k) => {
      const n = 28;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        pts.push(15.6 + Math.cos(a0) * rad, 0.05, 19.4 + Math.sin(a0) * rad, 15.6 + Math.cos(a1) * rad, 0.05, 19.4 + Math.sin(a1) * rad);
      }
    });
    const l = new LineSegments2(new LineSegmentsGeometry().setPositions(pts), inkThin);
    l.frustumCulled = false;
    return l;
  })();
  root.add(treeSym);

  // ---- 平面図の寸法線 -----------------------------------------------------
  const dims = new THREE.Group();
  root.add(dims);
  const dimLabels = [];
  function dimChain(axis, at, stops, wallEdge) {
    // axis 'x': 水平方向の寸法（z=at に引く）, 'z': 垂直方向（x=at）
    const pts = [];
    const P = (u, y = 0.05) => (axis === 'x' ? [u, y, at] : [at, y, u]);
    const first = stops[0], last = stops[stops.length - 1];
    const L = (a, b) => pts.push(...a, ...b);
    L(P(first), P(last));
    const tick = 0.42;
    stops.forEach((u) => {
      const [x, y, z] = P(u);
      // 45° のティック
      if (axis === 'x') L([x - tick, y, z + tick], [x + tick, y, z - tick]);
      else L([x - tick, y, z - tick], [x + tick, y, z + tick]);
      // 寸法補助線
      const sign = Math.sign(wallEdge - at);
      const far = at + sign * (Math.abs(wallEdge - at) - 0.5);
      const e0 = axis === 'x' ? [u, y, at + sign * -0.6] : [at + sign * -0.6, y, u];
      const e1 = axis === 'x' ? [u, y, far] : [far, y, u];
      L(e0, e1);
    });
    const seg = new LineSegments2(new LineSegmentsGeometry().setPositions(pts), inkDim);
    seg.frustumCulled = false;
    dims.add(seg);
    for (let i = 0; i < stops.length - 1; i++) {
      const mid = (stops[i] + stops[i + 1]) / 2;
      const mm = Math.round((stops[i + 1] - stops[i]) * 1000);
      const [x, y, z] = P(mid, 0.05);
      dimLabels.push({ text: mm.toLocaleString('en-US'), pos: new THREE.Vector3(x, y, z), cls: axis === 'x' ? 'dim' : 'dim dim-v' });
    }
  }
  dimChain('x', -2.6, [2, 8, 14, 19, 24.5, 32], 2);
  dimChain('x', -4.4, [2, 32], 2);
  dimChain('z', -2.6, [2, 5, 12, 24], 2);
  dimChain('z', 36.4, [2, 24], 32);
  dimChain('x', 33.0, [2, 11, 21, 24.5, 32], 24);

  // ---- 更新 --------------------------------------------------------------
  const center = new THREE.Vector2(17, 19);
  segs.forEach((s) => { s.delay = clamp01(Math.hypot(s.cx - center.x, s.cz - center.y) / 26); });

  function update(s) {
    // 壁: 切断面が 1.2 m → 天井まで、距離に応じて時間差で上がる
    for (const seg of segs) {
      const p = ease(clamp01((s.rise - 0.5 * seg.delay) / 0.5));
      const cutY = CUT_HEIGHT + (11 - CUT_HEIGHT) * p;
      const top = Math.min(seg.y1, cutY);
      const hgt = top - seg.y0;
      if (hgt <= 0.002) { seg.grp.visible = false; continue; }
      seg.grp.visible = true;
      seg.grp.scale.y = hgt;
      seg.cut.value = cutY < seg.y1 - 1e-3 ? 1 : 0;
    }
    roofGroup.position.y = (1 - ease(clamp01(s.roofDrop))) * 16;
    roofGroup.visible = s.roofDrop > 0.001;
    doorPivot.rotation.y = -s.door;
    doorArc.visible = true;
    inkDim.uniforms.uFade.value = s.planFade;
    reveal.poche.value = s.poche;
    // 部屋の掃き出し
    ROOMS.forEach((r, i) => {
      const [x0, z0, x1, z1] = r.rect;
      reveal.rect[i].set(x0, z0, x1, z1);
      reveal.info[i].set(r.entry[0], r.entry[1], s.rooms[r.id] ?? 0, r.h);
    });
    reveal.ext.set(s.extCenter[0], s.extCenter[1], s.extR, 0);
    // 庭の木・樹木記号
    const court = s.rooms.court ?? 0;
    tree.visible = court > 0.5;
    tree.scale.setScalar(0.6 + 0.4 * clamp01((court - 0.5) / 8));
    treeSym.visible = true;
  }

  function setResolution(w, h) {
    lineMats.forEach((m) => m.resolution.set(w, h));
  }

  return { root, update, setResolution, dimLabels, lineMats, doorArc, treeSym, furniture, tree };
}
