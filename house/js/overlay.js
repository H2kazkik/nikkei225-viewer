// overlay.js — 図面の文字（部屋名・寸法）。3D の点を画面に投影して HTML で置く。
import * as THREE from 'three';
import { ROOMS } from './model.js';

const fmt = (n) => Math.round(n * 1000).toLocaleString('en-US');

// 縦書きにする細長い部屋
const VERTICAL = new Set(['gallery']);
// 名前だけにする小さな部屋
const TINY = new Set(['svc1', 'svc2', 'svc3', 'svc4', 'svc5', 'dressing']);

export function createLabels(layer, dimLabels) {
  const items = [];
  const add = (html, cls, pos) => {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    layer.appendChild(el);
    items.push({ el, pos });
  };
  ROOMS.forEach((r) => {
    const [x0, z0, x1, z1] = r.rect;
    const w = x1 - x0, d = z1 - z0;
    const pos = new THREE.Vector3((x0 + x1) / 2, 0.1, (z0 + z1) / 2);
    if (r.id === 'court') pos.set(16, 0.1, 22.7);
    const area = (w * d).toFixed(1);
    if (TINY.has(r.id)) {
      add(`<b>${r.name}</b>`, 'room tiny', pos);
    } else if (VERTICAL.has(r.id)) {
      add(`<b>${r.name}</b><i>${r.en}</i><span>${fmt(w)} × ${fmt(d)}</span>`, 'room vertical', pos);
    } else if (r.id === 'engawa') {
      add(`<b>${r.name}</b><i>${r.en}</i>`, 'room', pos);
    } else {
      add(`<b>${r.name}</b><i>${r.en}</i><span>${fmt(w)} × ${fmt(d)}</span><span>${area} m²</span>`, 'room', pos);
    }
  });
  // 門・玄関の注記
  add('<b>玄関扉</b><i>PIVOT DOOR</i><span>W1,600 × H3,000</span>', 'room note', new THREE.Vector3(26.9, 0.1, 25.9));
  add('<b>門</b><i>GATE</i>', 'room note', new THREE.Vector3(25.4, 0.1, 31.4));
  add('<b>敷地境界</b>', 'room note small', new THREE.Vector3(5, 0.1, 31.0));
  dimLabels.forEach((d) => add(d.text, d.cls, d.pos));
  return items;
}

const v = new THREE.Vector3();
export function updateLabels(items, camera, w, h, fade) {
  const show = fade > 0.01;
  for (const it of items) {
    if (!show) { if (it.el.style.display !== 'none') it.el.style.display = 'none'; continue; }
    v.copy(it.pos).project(camera);
    const x = (v.x * 0.5 + 0.5) * w;
    const y = (-v.y * 0.5 + 0.5) * h;
    it.el.style.display = 'block';
    it.el.style.opacity = fade.toFixed(3);
    it.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
  }
}
