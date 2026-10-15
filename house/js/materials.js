// materials.js — 「製図 → 実物」の切り替えを担う質感まわり。
//
// ・すべての面は同じシェーダーを通る。部屋ごとの reveal 半径が 0 の間は
//   紙色（製図の塗り）、半径が広がると入口から実物の質感が掃くように現れる。
// ・線（LineMaterial）にも同じマスクをかけて、実物になった部屋では墨線が消える。
// ・テクスチャは 3 方向投影（triplanar）でワールド寸法に張る。今は
//   Canvas で生成した代替テクスチャ。CC0 の画像に差し替えるときは
//   TEXTURE_FILES に URL を書くだけ（下記）。
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

export const NR = 18; // 部屋スロット数

// 配布元（ambientCG / Poly Haven）に届いたら、ここに実ファイルを指定する。
// 例: sugi: 'assets/textures/sugi_color.jpg'
export const TEXTURE_FILES = {};

export const PAPER = new THREE.Color('#ece6d7');
export const INK = new THREE.Color('#15110d');

export const reveal = {
  rect: Array.from({ length: NR }, () => new THREE.Vector4(1e5, 1e5, 1e5 + 1, 1e5 + 1)),
  info: Array.from({ length: NR }, () => new THREE.Vector4(0, 0, 0, 0)),
  ext: new THREE.Vector4(0, 0, 0, 0),
  poche: { value: 1 },
  exposure: { value: 1.0 },
};

const sharedUniforms = () => ({
  uRect: { value: reveal.rect },
  uInfo: { value: reveal.info },
  uExt: { value: reveal.ext },
  uPoche: reveal.poche,
  uExposure: reveal.exposure,
});

const GLSL_REVEAL = /* glsl */ `
#define NR ${NR}
uniform vec4 uRect[NR];
uniform vec4 uInfo[NR];
uniform vec4 uExt;
float rvHash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float rvNoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(rvHash(i),rvHash(i+vec2(1,0)),f.x), mix(rvHash(i+vec2(0,1)),rvHash(i+vec2(1,1)),f.x), f.y);
}
float rvWipe(vec2 c, float R, vec3 p){
  float d = distance(p.xz, c) + (rvNoise(p.xz*0.8 + p.y*0.45) - 0.5)*1.8 + (rvNoise(p.xz*3.1)-0.5)*0.4;
  return 1.0 - smoothstep(R - 2.8, R, d);
}
float revealAt(vec3 p, vec3 n){
  vec3 q = p + n*0.07;
  float m = 0.0; bool inside = false;
  for (int i = 0; i < NR; i++) {
    vec4 r = uRect[i]; vec4 f = uInfo[i];
    if (q.x > r.x && q.x < r.z && q.z > r.y && q.z < r.w && q.y < f.w + 0.3) {
      inside = true; m = max(m, rvWipe(f.xy, f.z, p));
    }
  }
  if (!inside) m = rvWipe(uExt.xy, uExt.z, p);
  return m;
}
`;

const GLSL_TONE = /* glsl */ `
uniform float uPoche;
uniform float uExposure;
const vec3 PAPER_LIN = vec3(0.842, 0.797, 0.688);
const vec3 INK_LIN = vec3(0.0075, 0.0056, 0.0040);
vec3 acesApprox(vec3 x){ x *= 0.62; return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
vec3 drawingTone(vec3 n){
  float s = 0.865 + 0.135*clamp(n.y, 0.0, 1.0) + 0.05*dot(n.xz, vec2(-0.906, 0.423));
  return PAPER_LIN * clamp(s, 0.0, 1.0);
}
`;

// ---- 面マテリアル ---------------------------------------------------------
// opts: { map, scale, tint, glass, cut }
export function injectReveal(mat, opts = {}) {
  const u = sharedUniforms();
  const tri = !!opts.map && opts.triplanar !== false;
  if (tri) {
    u.uTex = { value: opts.map };
    u.uTexScale = { value: opts.scale ?? 1 };
    u.uTint = { value: new THREE.Color(opts.tint ?? 0xffffff) };
  }
  u.uCutTop = opts.cut || { value: 0 };
  mat.userData.cut = u.uCutTop;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNor;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 rvW = vec4(transformed, 1.0);
        vec3 rvN = objectNormal;
        #ifdef USE_INSTANCING
          rvW = instanceMatrix * rvW; rvN = mat3(instanceMatrix) * rvN;
        #endif
        vWPos = (modelMatrix * rvW).xyz;
        vWNor = normalize(mat3(modelMatrix) * rvN);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        varying vec3 vWNor;
        uniform float uCutTop;
        ${GLSL_REVEAL}
        ${GLSL_TONE}
        ${tri ? `uniform sampler2D uTex; uniform float uTexScale; uniform vec3 uTint;
        vec3 triplanar(vec3 p, vec3 n){
          vec3 w = pow(abs(n), vec3(6.0)); w /= (w.x+w.y+w.z);
          return texture2D(uTex, p.zy*uTexScale).rgb*w.x + texture2D(uTex, p.xz*uTexScale).rgb*w.y + texture2D(uTex, p.xy*uTexScale).rgb*w.z;
        }` : ''}`
      )
      .replace(
        '#include <map_fragment>',
        `${tri ? 'diffuseColor.rgb *= triplanar(vWPos, normalize(vWNor)) * uTint;' : '#include <map_fragment>'}
        vec3 rvNorm = normalize(vWNor);
        float rv = revealAt(vWPos, rvNorm);`
      )
      .replace(
        '#include <opaque_fragment>',
        `vec3 litTM = acesApprox(outgoingLight * uExposure);
        vec3 dc = drawingTone(rvNorm);
        if (rvNorm.y > 0.9) dc = mix(dc, INK_LIN, uPoche * uCutTop);
        vec3 outc = mix(dc, litTM, rv);
        ${opts.glass ? 'diffuseColor.a *= rv;' : 'diffuseColor.a = 1.0;'}
        gl_FragColor = vec4(outc, diffuseColor.a);`
      );
  };
  mat.customProgramCacheKey = () => `rv-${tri ? 't' : 'n'}-${opts.glass ? 'g' : 's'}`;
  return mat;
}

export function makeSurface(o = {}) {
  const m = new THREE.MeshStandardMaterial({
    color: o.color ?? 0xffffff,
    roughness: o.rough ?? 0.85,
    metalness: o.metal ?? 0.0,
    emissive: o.emissive ?? 0x000000,
    emissiveMap: o.emissiveMap ?? null,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    map: o.uvMap ?? null,
    transparent: !!o.glass,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    side: o.side ?? THREE.FrontSide,
    envMapIntensity: o.env ?? 1,
  });
  if (o.glass) m.depthWrite = false;
  return injectReveal(m, o);
}

// ---- 線マテリアル（reveal で薄くなる墨線） ------------------------------
export function makeInkLine(widthPx, resolution) {
  const m = new LineMaterial({
    color: INK.getHex(),
    linewidth: widthPx,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    resolution,
  });
  const u = sharedUniforms();
  Object.assign(m.uniforms, u);
  m.uniforms.uFade = { value: 1 };
  m.vertexShader = m.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
    .replace(
      'void main() {',
      `void main() {
        vWPos = (modelMatrix * vec4( (position.y < 0.5) ? instanceStart : instanceEnd, 1.0 )).xyz;`
    );
  m.fragmentShader = m.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nuniform float uFade;\n${GLSL_REVEAL}`)
    .replace(
      'gl_FragColor = vec4( diffuseColor.rgb, alpha );',
      'float rvl = revealAt(vWPos, vec3(0.0));\n gl_FragColor = vec4( diffuseColor.rgb, alpha * (1.0 - rvl) * uFade );'
    );
  return m;
}

// ---- 空 ---------------------------------------------------------------
export function makeSky() {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uSun: { value: new THREE.Vector3(-0.9, 0.3, 0.4).normalize() },
      uSky: { value: 0 }, // 0..1 地平線から天頂へ掃く
      uPaper: { value: new THREE.Color('#ece6d7') },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 uSun; uniform float uSky; uniform vec3 uPaper;
      vec3 srgb(vec3 c){ return pow(c, vec3(2.2)); }
      float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 hor = srgb(vec3(0.99,0.83,0.64));
        vec3 mid = srgb(vec3(0.70,0.77,0.86));
        vec3 top = srgb(vec3(0.30,0.43,0.62));
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.32, h));
        c = mix(c, top, smoothstep(0.22, 0.95, h));
        vec3 sn = normalize(uSun);
        float s = max(dot(d, sn), 0.0);
        c += srgb(vec3(1.0,0.66,0.36)) * (pow(s, 5.0)*0.42 + pow(s, 80.0)*1.1);
        // 夕日の方角から、空が円状に広がるように現れる
        float ang = acos(clamp(dot(d, sn), -1.0, 1.0));
        float edge = uSky * 3.9 - 0.4;
        float n = (vn(d.xz*4.0 + d.y*3.0) - 0.5) * 0.5;
        float m = 1.0 - smoothstep(edge - 0.55, edge, ang + n);
        gl_FragColor = vec4(mix(uPaper, c, m), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  return m;
}

// ---- 代替テクスチャ（Canvas 生成）-----------------------------------------
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function tileNoise(seed, gx, gy) {
  const r = rng(seed);
  const g = new Float32Array(gx * gy);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (u, v) => {
    const x = u * gx, y = v * gy;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = g[(y0 % gy) * gx + (x0 % gx)], b = g[(y0 % gy) * gx + ((x0 + 1) % gx)];
    const c = g[((y0 + 1) % gy) * gx + (x0 % gx)], d = g[((y0 + 1) % gy) * gx + ((x0 + 1) % gx)];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
function fbm(seed, gx, gy, oct = 4) {
  const ns = Array.from({ length: oct }, (_, i) => tileNoise(seed + i * 17, gx << i, gy << i));
  return (u, v) => {
    let s = 0, a = 0.5, t = 0;
    for (let i = 0; i < oct; i++) { s += ns[i](u % 1, v % 1) * a; t += a; a *= 0.5; }
    return s / t;
  };
}
function canvasTex(size, painter, { repeat = true, srgb = true } = {}) {
  const w = typeof size === 'number' ? size : size[0];
  const h = typeof size === 'number' ? size : size[1];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  painter(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
function perPixel(ctx, w, h, fn) {
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = fn(x / w, y / h, x, y);
    const i = (y * w + x) * 4;
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
const clamp8 = (v) => Math.max(0, Math.min(255, v));
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const makers = {
  // 漆喰・土壁
  plaster() {
    const big = fbm(3, 3, 3, 4), fine = fbm(9, 64, 64, 2), streak = fbm(21, 6, 2, 3);
    return canvasTex(512, (ctx, w, h) => perPixel(ctx, w, h, (u, v) => {
      const t = big(u, v) * 0.8 + streak(u, v) * 0.35 + (fine(u, v) - 0.5) * 0.5;
      const c = mix3([214, 204, 184], [233, 225, 207], Math.max(0, Math.min(1, t)));
      return [clamp8(c[0]), clamp8(c[1]), clamp8(c[2])];
    }));
  },
  // 杉板（天井・造作）
  sugi() {
    const grain = fbm(5, 48, 3, 4), tone = fbm(8, 5, 5, 2);
    const boards = 4; const r = rng(77); const shift = Array.from({ length: boards }, () => (r() - 0.5) * 0.22);
    return canvasTex(512, (ctx, w, h) => perPixel(ctx, w, h, (u, v, x) => {
      const bi = Math.floor(u * boards), bu = u * boards - bi;
      const g = grain((u + bi * 0.37) % 1, v);
      const t = 0.5 + (g - 0.5) * 1.5 + shift[bi] + (tone(u, v) - 0.5) * 0.3;
      let c = mix3([186, 150, 108], [226, 198, 154], Math.max(0, Math.min(1, t)));
      const edge = Math.min(bu, 1 - bu) * 512 / boards;
      if (edge < 1.6) c = mix3(c, [96, 72, 50], 0.7);
      return [clamp8(c[0]), clamp8(c[1]), clamp8(c[2])];
    }));
  },
  // 焼杉（外壁・玄関扉）
  charred() {
    const crack = fbm(31, 30, 5, 4), tone = fbm(33, 4, 8, 3), fine = fbm(35, 80, 20, 2);
    const boards = 3;
    return canvasTex(512, (ctx, w, h) => perPixel(ctx, w, h, (u, v) => {
      const bi = Math.floor(u * boards), bu = u * boards - bi;
      const cr = Math.abs(crack((u + bi * 0.21) % 1, v) - 0.5) * 2; // 0 = 割れ目
      const ridge = Math.pow(1 - Math.min(1, cr * 3.2), 2.2);
      const base = 40 + tone(u, v) * 20 + fine(u, v) * 12;
      let c = [base + ridge * 58, base + ridge * 57, base + ridge * 55];
      const edge = Math.min(bu, 1 - bu) * 512 / boards;
      if (edge < 1.8) c = [16, 15, 14];
      return [clamp8(c[0]), clamp8(c[1]), clamp8(c[2])];
    }));
  },
  // 土間・黒御影の敷石
  slate() {
    const n = fbm(41, 8, 8, 3), sp = fbm(43, 120, 120, 1);
    const r = rng(5); const tiles = [0, 1, 2, 3].map(() => (r() - 0.5) * 0.35);
    return canvasTex(512, (ctx, w, h) => perPixel(ctx, w, h, (u, v) => {
      const tx = Math.floor(u * 2), ty = Math.floor(v * 2);
      const fu = (u * 2) % 1, fv = (v * 2) % 1;
      const t = tiles[ty * 2 + tx] + (n(u, v) - 0.5) * 0.5;
      let c = mix3([58, 62, 62], [110, 116, 113], Math.max(0, Math.min(1, 0.45 + t)));
      const speck = sp(u, v) > 0.8 ? 18 : 0;
      c = [c[0] + speck, c[1] + speck, c[2] + speck];
      const e = Math.min(fu, 1 - fu, fv, 1 - fv) * 256;
      if (e < 2.2) c = [34, 34, 32];
      return [clamp8(c[0]), clamp8(c[1]), clamp8(c[2])];
    }));
  },
  // 瓦（いぶし銀）
  kawara() {
    const n = fbm(51, 8, 8, 3);
    return canvasTex(512, (ctx, w, h) => perPixel(ctx, w, h, (u, v) => {
      const ridge = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 12);
      const row = (v * 8) % 1;
      const shade = 0.55 + ridge * 0.35 - Math.pow(row, 6) * 0.5 + (n(u, v) - 0.5) * 0.25;
      const c = mix3([40, 44, 48], [104, 110, 114], Math.max(0, Math.min(1, shade)));
      return [clamp8(c[0]), clamp8(c[1]), clamp8(c[2])];
    }));
  },
  // 砂利・土
  gravel() {
    const n = fbm(61, 10, 10, 3), sp = fbm(63, 140, 140, 1);
    return canvasTex(512, (ctx, w, h) => perPixel(ctx, w, h, (u, v) => {
      const t = n(u, v) * 0.6 + sp(u, v) * 0.7;
      const c = mix3([160, 150, 124], [230, 220, 192], Math.max(0, Math.min(1, t)));
      return [clamp8(c[0]), clamp8(c[1]), clamp8(c[2])];
    }));
  },
  // 障子（UV 張り、紙＋組子）
  shoji() {
    const fiber = fbm(71, 90, 120, 2);
    return canvasTex([256, 512], (ctx, w, h) => {
      perPixel(ctx, w, h, (u, v) => {
        const f = fiber(u, v);
        return [clamp8(246 - f * 14), clamp8(238 - f * 14), clamp8(218 - f * 16)];
      });
      ctx.fillStyle = '#4a3220';
      const bar = (x, y, bw, bh) => ctx.fillRect(x, y, bw, bh);
      bar(0, 0, w, 7); bar(0, h - 7, w, 7); bar(0, 0, 7, h); bar(w - 7, 0, 7, h);
      for (let i = 1; i < 6; i++) bar((w / 6) * i - 1.5, 0, 3, h);
      for (let i = 1; i < 9; i++) bar(0, (h / 9) * i - 1.5, w, 3);
      bar(0, h * 0.18 - 3, w, 5); // 腰の桟
    }, { repeat: false });
  },
  // 楓の葉
  leaf() {
    return canvasTex(64, (ctx, w, h) => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); });
  },
};

const cache = {};
export function texture(name) {
  if (cache[name]) return cache[name];
  let t;
  if (TEXTURE_FILES[name]) {
    t = new THREE.TextureLoader().load(TEXTURE_FILES[name]);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  } else {
    t = makers[name]();
  }
  return (cache[name] = t);
}
