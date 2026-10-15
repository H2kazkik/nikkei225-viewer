// main.js — シーン、カメラ経路、スクロール連動。
//
// 設計: スクロールは 1 本の時間軸 T (0〜100) を動かすだけ。
// 平面 → 壁が立つ → 街路 → 門 → 玄関 → ギャラリー、のすべての状態は T の関数。
// なので同じ T を与えれば、スクロールでも録画でも同じ絵になる。
import * as THREE from 'three';
import { buildHouse, ROOMS } from './model.js';
import { makeSky, PAPER, reveal } from './materials.js';
import { createLabels, updateLabels } from './overlay.js';

const params = new URLSearchParams(location.search);
const REC = params.has('rec'); // 録画用: スクロール連動を切り、T を外から与える

// ---- レンダラ ----------------------------------------------------------------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: REC });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, REC ? 1 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping; // 色調はマテリアル側（製図の紙色を保つため）

const scene = new THREE.Scene();
scene.background = PAPER.clone();
scene.fog = new THREE.Fog(0xffffff, 1e5, 2e5);
scene.fog.color.setRGB(0.93, 0.80, 0.66, THREE.LinearSRGBColorSpace); // 出力は sRGB 空間で混ざるので数値をそのまま入れる

const camera = new THREE.PerspectiveCamera(8, 1, 1, 1200);

// ---- 光: 秋の夕方、西南西の低い日 ------------------------------------------------
const SUN_AZ = THREE.MathUtils.degToRad(245); // 北から時計回り
const SUN_EL = THREE.MathUtils.degToRad(17);
const sunDir = new THREE.Vector3(
  Math.sin(SUN_AZ) * Math.cos(SUN_EL), Math.sin(SUN_EL), -Math.cos(SUN_AZ) * Math.cos(SUN_EL)
).normalize();
const sun = new THREE.DirectionalLight(0xffbd80, 3.4);
sun.target.position.set(17, 0, 14);
sun.position.copy(sun.target.position).addScaledVector(sunDir, 90);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 10, far: 220 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.035;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xc4d0e0, 0x9a8c78, 0.45));
// ギャラリーの天井灯（暖色）
const lamp = new THREE.PointLight(0xffd2a0, 4.5, 11, 2);
lamp.position.set(22.75, 2.7, 19);
scene.add(lamp);
const lamp2 = new THREE.PointLight(0xffb870, 4, 8, 2);
lamp2.position.set(21.5, 1.1, 16.15); // 行灯
scene.add(lamp2);

// 空
const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), makeSky());
sky.material.uniforms.uSun.value.copy(sunDir);
sky.renderOrder = -10;
scene.add(sky);
{
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const m = makeSky();
  m.uniforms.uSky.value = 1;
  m.uniforms.uSun.value.copy(sunDir);
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), m));
  scene.environment = pm.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.55;
}

// ---- 家 -----------------------------------------------------------------------
const house = buildHouse({ resolution: new THREE.Vector2(1, 1) });
scene.add(house.root);

const labelLayer = document.getElementById('labels');
const labels = createLabels(labelLayer, house.dimLabels);

// ---- ユーティリティ -------------------------------------------------------------
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const sr = (T, a, b) => clamp01((T - a) / (b - a));
const sm = (t) => t * t * (3 - 2 * t);

// ---- カメラ経路 -----------------------------------------------------------------
// 各キー: T, 位置 p, 注視点 t, 画角 f。
//  0–8   平面図（長いレンズ、真上）
//  8–34  レンズが開きながら降りて、斜め上から見下ろす
//  34–52 街路へ降りる
//  52–73 門をくぐって玄関の前へ
//  73–100 玄関を入り、ギャラリーを奥へ歩く
const KEYS = [
  { T: 8, p: [26, 330, 16], t: [26, 0, 16], f: 8, e: 'inout' },
  { T: 34, p: [14, 47, 63], t: [17, 0.5, 12], f: 34, e: 'inout' },
  { T: 52, p: [25, 7.2, 55], t: [22.75, 3.0, 24], f: 42, e: 'inout' },
  { T: 62, p: [22.75, 1.7, 41], t: [22.75, 2.0, 24], f: 50, e: 'lin' },
  { T: 67, p: [22.75, 1.66, 33.5], t: [22.75, 1.9, 22], f: 55, e: 'lin' },
  { T: 73, p: [22.75, 1.65, 26.9], t: [22.75, 1.85, 19], f: 58, e: 'lin' },
  { T: 83, p: [22.75, 1.62, 20.8], t: [22.8, 1.95, 14], f: 60, e: 'lin' },
  { T: 92, p: [22.9, 1.6, 16.6], t: [21.5, 1.85, 12.9], f: 60, e: 'out' },
  { T: 100, p: [23.1, 1.6, 13.15], t: [10.5, 2.05, 13.1], f: 58, e: 'out' },
];
const V3 = (a) => new THREE.Vector3(...a);
const curveP = new THREE.CatmullRomCurve3(KEYS.map((k) => V3(k.p)), false, 'centripetal');
const curveT = new THREE.CatmullRomCurve3(KEYS.map((k) => V3(k.t)), false, 'centripetal');
const EASE = {
  lin: (s) => s,
  inout: (s) => s * s * (3 - 2 * s),
  in: (s) => s * s,
  out: (s) => 1 - (1 - s) * (1 - s),
};

// 平面図: 画面の縦横比に合わせて、敷地と寸法線が収まる距離にする
function planPose(aspect) {
  const fovHalf = THREE.MathUtils.degToRad(8 / 2);
  const needH = 46, needW = 54;
  const viewH = Math.max(needH, needW / aspect);
  const shift = aspect > 1.45 ? 7 : 0; // 右に表題欄の余白を残すため、図を左へ
  return { dist: viewH / 2 / Math.tan(fovHalf), shift };
}

const tmpUp = new THREE.Vector3();
const lookM = new THREE.Matrix4();
function poseAt(T, aspect) {
  const plan = planPose(aspect);
  let pos, tgt, fov;
  const k0 = KEYS[0];
  if (T <= k0.T) {
    pos = new THREE.Vector3(17 + plan.shift, plan.dist, 16);
    tgt = new THREE.Vector3(17 + plan.shift, 0, 16);
    fov = 8;
  } else {
    let i = 0;
    while (i < KEYS.length - 2 && T > KEYS[i + 1].T) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const s = EASE[b.e || 'lin']((T - a.T) / (b.T - a.T));
    const u = (i + s) / (KEYS.length - 1);
    pos = curveP.getPoint(u);
    tgt = curveT.getPoint(u);
    fov = a.f + (b.f - a.f) * s;
    if (i === 0) {
      // 最初の区間: 平面図の姿勢から出発し、画角は「家の見かけの大きさ」を保つように決める
      // （距離が縮むぶんレンズが開く = 平面の長いレンズから歩行の広角へ）
      const p0 = new THREE.Vector3(17 + plan.shift, plan.dist, 16);
      const t0 = new THREE.Vector3(17 + plan.shift, 0, 16);
      const mixK = 1 - sm(clamp01(s));
      pos = pos.clone().lerp(p0, mixK * mixK);
      tgt = tgt.clone().lerp(t0, mixK * mixK);
      const c = new THREE.Vector3(17, 0, 14);
      const k0 = plan.dist * Math.tan(THREE.MathUtils.degToRad(4));
      const k1 = new THREE.Vector3(...b.p).distanceTo(c) * Math.tan(THREE.MathUtils.degToRad(b.f / 2));
      const k = k0 + (k1 - k0) * s;
      fov = THREE.MathUtils.radToDeg(2 * Math.atan(k / pos.distanceTo(c)));
    }
  }
  // 歩行のわずかな上下動
  const walk = sm(sr(T, 70, 78));
  pos.y += Math.sin(T * 2.3) * 0.016 * walk;
  // 上方向: 真下を見ているあいだは「北が上」、傾くにつれ通常の上方向へ（ロールしない）
  const dir = tgt.clone().sub(pos).normalize();
  const pitchDeg = THREE.MathUtils.radToDeg(Math.asin(clamp01(-dir.y)));
  const w = sm(clamp01((90 - pitchDeg) / 28));
  tmpUp.set(0, w, -(1 - w));
  return { pos, tgt, fov, up: tmpUp };
}

// ---- 状態 ---------------------------------------------------------------------
function stateAt(T) {
  return {
    rise: sm(sr(T, 8, 30)),
    poche: 1 - sm(sr(T, 8, 22)),
    planFade: 1 - sm(sr(T, 4, 16)),
    roofDrop: sm(sr(T, 34, 50)),
    door: T < 40 ? 1.5 * (1 - sm(sr(T, 10, 28))) : 1.5 * sm(sr(T, 66, 74)),
    sky: sm(sr(T, 36, 58)),
    extR: sm(sr(T, 38, 60)) * 1400,
    extCenter: [22.75, 36],
    rooms: {
      gallery: sm(sr(T, 70, 86)) * 17,
      court: sm(sr(T, 74, 94)) * 20,
      engawa: sr(T, 95, 100) * 6.5, // 終点で縁側の手前から質感が掃き始める（次チェックポイントへ）
    },
  };
}

// 章のキャプション
const captions = [
  { a: 14, b: 30, no: '02', tx: '壁が立ち上がる', paper: true },
  { a: 40, b: 55, no: '03', tx: '西日の路地' },
  { a: 59, b: 71, no: '04', tx: '門をくぐり、玄関へ' },
  { a: 76, b: 99, no: '05', tx: '玄関ギャラリー' },
];
const capEl = document.getElementById('caption');
const capNo = capEl.querySelector('.no');
const capTx = capEl.querySelector('.tx');
const sheetEl = document.getElementById('sheet');
const endEl = document.getElementById('chapter-end');
let capIdx = -1;

// ---- 描画 ---------------------------------------------------------------------
const state = { T: 0 };
let W = 1, H = 1, dirty = true, lastT = -1;

function resize() {
  W = window.innerWidth; H = window.innerHeight;
  renderer.setSize(W, H, false);
  const pr = renderer.getPixelRatio();
  house.setResolution(W * pr, H * pr);
  camera.aspect = W / H;
  dirty = true;
}
window.addEventListener('resize', resize);
resize();

function render() {
  const T = state.T;
  if (!dirty && T === lastT) return;
  dirty = false; lastT = T;
  const st = stateAt(T);
  house.update(st);
  sky.material.uniforms.uSky.value = st.sky;
  scene.fog.near = st.sky > 0.01 ? 1e5 - (1e5 - 70) * st.sky : 1e5;
  scene.fog.far = st.sky > 0.01 ? 2e5 - (2e5 - 900) * st.sky : 2e5;

  const p = poseAt(T, camera.aspect);
  camera.position.copy(p.pos);
  camera.fov = p.fov;
  const d = p.pos.distanceTo(new THREE.Vector3(17, 0, 14));
  camera.near = THREE.MathUtils.clamp((d - 45) * 0.5, 0.05, 400);
  camera.far = 1200;
  camera.updateProjectionMatrix();
  lookM.lookAt(p.pos, p.tgt, p.up.clone().normalize());
  camera.quaternion.setFromRotationMatrix(lookM);
  camera.updateMatrixWorld();
  sky.position.copy(p.pos);

  renderer.render(scene, camera);
  updateLabels(labels, camera, W, H, st.planFade);

  // DOM
  sheetEl.style.opacity = (1 - sm(sr(T, 6, 20))).toFixed(3);
  sheetEl.style.display = T > 21 ? 'none' : 'block';
  let ci = -1;
  captions.forEach((c, i) => { if (T >= c.a && T <= c.b) ci = i; });
  if (ci !== capIdx) {
    capIdx = ci;
    if (ci >= 0) { capNo.textContent = captions[ci].no; capTx.textContent = captions[ci].tx; }
  }
  if (ci >= 0) {
    const c = captions[ci];
    capEl.style.opacity = Math.min(sr(T, c.a, c.a + 2.5), 1 - sr(T, c.b - 2.5, c.b)).toFixed(3);
    capEl.classList.toggle('on-paper', T < 44);
  } else capEl.style.opacity = 0;
  endEl.style.opacity = sm(sr(T, 96, 100)).toFixed(3);
}

// ---- スクロール連動（GSAP ScrollTrigger + Lenis）---------------------------------
if (REC) {
  window.__setT = (T) => { state.T = T; dirty = true; render(); };
  window.__getT = () => state.T;
  window.__ready = true;
} else {
  const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.registerPlugin(ScrollTrigger);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  gsap.to(state, {
    T: 100, ease: 'none',
    scrollTrigger: { trigger: '#scroll', start: 'top top', end: 'bottom bottom', scrub: 0.5 },
  });
  const qT = params.get('T');
  if (qT != null) state.T = parseFloat(qT);
  gsap.ticker.add(render);
  window.__setT = (T) => { state.T = T; dirty = true; render(); };
  window.__getT = () => state.T;
  window.__ready = true;
}
