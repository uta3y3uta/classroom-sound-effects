(() => {
"use strict";

const SOUNDS = window.SOUNDS, CATS = window.CATS, ICONS = window.ICONS;
const byId = new Map(SOUNDS.map((s, i) => [s.i, i]));
const catColor = new Map(CATS.map((c) => [c.id, c.color]));
const MAX = 8, STORE = "kyoshitsu-se.v3";
const $ = (s) => document.querySelector(s);

/* ---------- アイコン ---------- */
function svg(name) {
  const d = ICONS[name];
  return d
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
    : "";
}
for (const el of document.querySelectorAll("[data-icon]")) {
  const target = el.classList.contains("gi") ? el : el.querySelector(".gi") || el;
  target.innerHTML = svg(el.dataset.icon);
}

/* ---------- 状態 ---------- */
const DEFAULT = ["jajaan","mokugyo","buu","seikai2",
                 "tenshi","drumroll","memai","yay",
                 "pafupafu","iyoo","uwaa","hakushu",
                 "tettere","kotsuzumi","gakkari","horn"];
let state = { cols: 4, rows: 4, slots: DEFAULT.slice(), vol: 80, muted: false, colors: {} };

function clampState(s) {
  s.cols = Math.min(MAX, Math.max(1, s.cols | 0 || 4));
  s.rows = Math.min(MAX, Math.max(1, s.rows | 0 || 4));
  const count = s.cols * s.rows;
  s.slots = Array.from({ length: count }, (_, i) => {
    const v = s.slots[i];
    return typeof v === "string" && byId.has(v) ? v : null;
  });
  s.vol = Math.min(100, Math.max(0, s.vol | 0));
  const colors = {};
  if (s.colors && typeof s.colors === "object") {
    for (const k of Object.keys(s.colors)) {
      const i = +k, v = s.colors[k];
      if (i >= 0 && i < count && /^#[0-9a-fA-F]{6}$/.test(v)) colors[i] = v;
    }
  }
  s.colors = colors;
  return s;
}

function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {}
}

function load() {
  const fromHash = decodeHash(location.hash.slice(1));
  if (fromHash) { state = clampState(fromHash); save(); return; }
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) state = clampState({ ...state, ...JSON.parse(raw) });
  } catch (e) {}
  clampState(state);
}

/* ---------- 共有URL ---------- */
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function encodeState() {
  const bytes = [7, state.cols, state.rows];
  for (const id of state.slots) bytes.push(id ? byId.get(id) + 1 : 0);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    const take = Math.min(4, bytes.length - i + 1);
    for (let j = 0; j < take; j++) out += B64[(n >> (18 - j * 6)) & 63];
  }
  return out;
}

function decodeHash(str) {
  if (!/^[A-Za-z0-9\-_]{4,}$/.test(str)) return null;
  const bytes = [];
  for (let i = 0; i < str.length; i += 4) {
    let n = 0, take = Math.min(4, str.length - i);
    for (let j = 0; j < 4; j++) {
      const v = j < take ? B64.indexOf(str[i + j]) : 0;
      if (v < 0) return null;
      n = (n << 6) | v;
    }
    for (let j = 0; j < take - 1; j++) bytes.push((n >> (16 - j * 8)) & 255);
  }
  // 音の並びが変わると番号の意味が変わるので，旧版のURLは受け付けない
  if (bytes[0] !== 7) return null;
  const cols = bytes[1], rows = bytes[2];
  if (cols < 1 || cols > MAX || rows < 1 || rows > MAX) return null;
  const slots = [];
  for (let i = 0; i < cols * rows; i++) {
    const v = bytes[3 + i];
    slots.push(v ? (SOUNDS[v - 1] || {}).i || null : null);
  }
  return { cols, rows, slots, vol: 80, muted: false };
}

/* ---------- 音 ---------- */
const ctx = new (window.AudioContext || window.webkitAudioContext)();
const limiter = ctx.createDynamicsCompressor();
limiter.threshold.value = -3; limiter.knee.value = 0;
limiter.ratio.value = 20; limiter.attack.value = 0.003; limiter.release.value = 0.1;
const master = ctx.createGain();
master.connect(limiter).connect(ctx.destination);

const buffers = new Map(), pending = new Map();
let active = [];

function loadSound(id) {
  if (buffers.has(id)) return Promise.resolve(buffers.get(id));
  if (pending.has(id)) return pending.get(id);
  const p = fetch(`sfx/${id}.mp3?v=${window.ASSET_VER}`)
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
    .then((ab) => ctx.decodeAudioData(ab))
    .then((buf) => { buffers.set(id, buf); pending.delete(id); return buf; })
    .catch((e) => { pending.delete(id); throw e; });
  pending.set(id, p);
  return p;
}

function applyVolume() {
  const v = state.muted ? 0 : Math.pow(state.vol / 100, 1.6) * 0.95;
  master.gain.setTargetAtTime(v, ctx.currentTime, 0.015);
}

function play(id) {
  if (ctx.state === "suspended") ctx.resume();
  loadSound(id).then((buf) => {
    // 同じ音を連打したとき重なって濁らないよう，前の発音は素早く切る
    const t0 = ctx.currentTime;
    for (const a of active) {
      if (a.id !== id) continue;
      a.g.gain.cancelScheduledValues(t0);
      a.g.gain.setValueAtTime(a.g.gain.value, t0);
      a.g.gain.linearRampToValueAtTime(0, t0 + 0.02);
      try { a.src.stop(t0 + 0.025); } catch (e) {}
    }
    active = active.filter((a) => a.id !== id);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = SOUNDS[byId.get(id)].g || 1;
    src.connect(g).connect(master);
    src.start();
    const rec = { src, g, id };
    active.push(rec);
    src.onended = () => { active = active.filter((a) => a !== rec); };
  }).catch(() => toast("音を読み込めませんでした"));
}

function stopAll() {
  const t = ctx.currentTime;
  for (const a of active) {
    a.g.gain.setTargetAtTime(0, t, 0.02);
    try { a.src.stop(t + 0.12); } catch (e) {}
  }
  active = [];
}

/* ---------- グリッド ---------- */
const grid = $("#grid");
let selected = -1;

function renderGrid() {
  document.body.style.setProperty("--cols", state.cols);
  document.body.style.setProperty("--rows", state.rows);
  grid.innerHTML = "";
  state.slots.forEach((id, i) => {
    const s = id ? SOUNDS[byId.get(id)] : null;
    const pad = document.createElement("button");
    pad.className = "pad" + (s ? "" : " empty") + (i === selected ? " selected" : "");
    pad.dataset.i = i;
    if (s) pad.style.setProperty("--c", state.colors[i] || catColor.get(s.c));
    pad.innerHTML =
      `<span class="slotno">${i + 1}</span>` +
      `<span class="glyph">${svg(s ? s.ic : "plus")}</span>` +
      `<span class="cap">${s ? esc(s.n) : "あける"}</span>`;
    grid.appendChild(pad);
  });
  $("#colVal").textContent = state.cols;
  $("#rowVal").textContent = state.rows;
  $("#padCount").textContent = `${state.cols * state.rows} こ`;
  for (const [b, v, d] of [["#colMinus", state.cols, -1], ["#colPlus", state.cols, 1],
                           ["#rowMinus", state.rows, -1], ["#rowPlus", state.rows, 1]]) {
    $(b).disabled = d < 0 ? v <= 1 : v >= MAX;
  }
  renderColorOptions();
  prefetch();
}

function esc(s) { return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function prefetch() {
  const ids = [...new Set(state.slots.filter(Boolean))];
  let i = 0;
  const next = () => { if (i < ids.length) loadSound(ids[i++]).catch(() => {}).then(next); };
  for (let k = 0; k < 4; k++) next();
}

function resize(dc, dr) {
  const oc = state.cols, or = state.rows, old = state.slots, oldColors = state.colors;
  state.cols = Math.min(MAX, Math.max(1, oc + dc));
  state.rows = Math.min(MAX, Math.max(1, or + dr));
  const next = new Array(state.cols * state.rows).fill(null);
  const nextColors = {};
  for (let r = 0; r < Math.min(or, state.rows); r++)
    for (let c = 0; c < Math.min(oc, state.cols); c++) {
      const oi = r * oc + c, ni = r * state.cols + c;
      next[ni] = old[oi];
      if (oldColors[oi] !== undefined) nextColors[ni] = oldColors[oi];
    }
  state.slots = next;
  state.colors = nextColors;
  if (selected >= next.length) selected = -1;
  save(); renderGrid();
}

/* ---------- パッドの色を変える ---------- */
// 32色のネオンパレット。HSL の S=100% / L=61%（最大チャンネル255・最小56）という
// 「ネオンの面」を一周し，OKLab 空間での色の差が等間隔になる位置で32色を取ったもの。
// 色相の角度で等分すると橙ばかり6色も並ぶので，見た目の差で等分してある。
const NEON = ["#ff3838","#ff6138","#ff7f38","#ff9b38","#ffb438","#ffcd38","#ffe638","#fffe38",
              "#d0ff38","#97ff38","#38ff39","#38ff84","#38ffb7","#38ffe4","#38f7ff","#38e1ff",
              "#38cbff","#38b5ff","#389eff","#3887ff","#386eff","#3851ff","#4838ff","#6e38ff",
              "#8f38ff","#af38ff","#cf38ff","#ef38ff","#ff38ea","#ff38c1","#ff3898","#ff386d"];

const colorNoEl = $("#colorNo"), colorPickEl = $("#colorPick"),
      colorResetEl = $("#colorReset"), paletteEl = $("#palette");
let colorOptCount = -1, lastPicked = NEON[0];

function defaultColorFor(i) {
  const id = state.slots[i];
  return id ? catColor.get(SOUNDS[byId.get(id)].c) : "#8b8b99";
}

function currentColor() {
  const v = colorNoEl.value;
  return v === "all" ? lastPicked : (state.colors[+v] || defaultColorFor(+v));
}

function syncColorPick() {
  const cur = currentColor().toLowerCase();
  colorPickEl.style.setProperty("--c", cur);
  for (const b of paletteEl.children) b.classList.toggle("on", b.dataset.c === cur);
}

function renderColorOptions() {
  const count = state.cols * state.rows;
  if (colorOptCount !== count) {
    const prev = colorNoEl.value;
    colorNoEl.innerHTML = `<option value="all">全部</option>` +
      Array.from({ length: count }, (_, i) => `<option value="${i}">${i + 1}</option>`).join("");
    colorNoEl.value = prev === "all" || (+prev >= 0 && +prev < count) ? prev : "all";
    colorOptCount = count;
  }
  syncColorPick();
}

paletteEl.innerHTML = NEON.map((c) =>
  `<button type="button" role="option" data-c="${c}" style="--c:${c}" aria-label="${c}"></button>`).join("");

function openPalette(open) {
  paletteEl.classList.toggle("open", open);
  colorPickEl.setAttribute("aria-expanded", open ? "true" : "false");
  if (!open) return;
  // 画面からはみ出さない位置に寄せる
  paletteEl.style.left = "0px";
  const box = paletteEl.getBoundingClientRect();
  const over = box.right - (innerWidth - 8);
  if (over > 0) paletteEl.style.left = -over + "px";
}

colorPickEl.addEventListener("click", () => openPalette(!paletteEl.classList.contains("open")));
colorNoEl.addEventListener("change", syncColorPick);

paletteEl.addEventListener("click", (e) => {
  const hex = e.target.dataset && e.target.dataset.c;
  if (!hex) return;
  if (colorNoEl.value === "all") {
    lastPicked = hex;
    for (let i = 0; i < state.cols * state.rows; i++) state.colors[i] = hex;
  } else {
    state.colors[+colorNoEl.value] = hex;
  }
  openPalette(false);
  save(); renderGrid();
});

colorResetEl.addEventListener("click", () => {
  if (colorNoEl.value === "all") state.colors = {};
  else delete state.colors[+colorNoEl.value];
  openPalette(false);
  save(); renderGrid();
});

document.addEventListener("pointerdown", (e) => {
  if (!paletteEl.classList.contains("open")) return;
  const t = e.target;
  if (!t || !t.closest || !t.closest(".color-ctl")) openPalette(false);
}, true);

/* ---------- 長押しでパッドを入れかえる（つくる画面） ---------- */
const LONG_MS = 240, MOVE_TOL = 10;
let press = null;   // 長押し待ち { pad, i, x, y, timer }
let drag = null;    // ドラッグ中 { pad, i, ghost, ox, oy, over }

function cancelPress() {
  if (!press) return;
  clearTimeout(press.timer);
  press = null;
}

function startDrag() {
  if (!press || drag) return;
  const { pad, i, x, y } = press;
  press = null;
  const r = pad.getBoundingClientRect();
  const ghost = pad.cloneNode(true);
  ghost.classList.add("drag-ghost");
  ghost.style.width = r.width + "px";
  ghost.style.height = r.height + "px";
  document.body.appendChild(ghost);
  drag = { pad, i, ghost, ox: x - r.left, oy: y - r.top, over: null };
  moveDrag(x, y);
  pad.classList.add("dragging");
  navigator.vibrate?.(12);
}

function moveDrag(x, y) {
  drag.ghost.style.transform = `translate3d(${x - drag.ox}px,${y - drag.oy}px,0) scale(1.06)`;
  const el = document.elementFromPoint(x, y);
  const p = el && el.closest ? el.closest(".pad") : null;
  const over = p && p !== drag.pad && grid.contains(p) ? +p.dataset.i : null;
  if (over === drag.over) return;
  grid.querySelector(".pad.drop-target")?.classList.remove("drop-target");
  drag.over = over;
  if (over !== null) grid.children[over].classList.add("drop-target");
}

function endDrag(commit) {
  const { ghost, i, over } = drag;
  drag = null;
  ghost.remove();
  if (commit && over !== null && over !== i) {
    const t = state.slots[i];
    state.slots[i] = state.slots[over];
    state.slots[over] = t;
    save();
  }
  renderGrid();
}

grid.addEventListener("pointerdown", (e) => {
  if (drag) return;   // ドラッグ中は2本目の指を無視する
  const pad = e.target.closest(".pad");
  if (!pad) return;
  const i = +pad.dataset.i;
  if (document.body.dataset.mode === "edit") {
    cancelPress();
    press = { pad, i, x: e.clientX, y: e.clientY, timer: 0 };
    if (state.slots[i]) {
      try { pad.setPointerCapture(e.pointerId); } catch (err) {}
      press.timer = setTimeout(startDrag, LONG_MS);
    }
    return;
  }
  const id = state.slots[i];
  if (!id) return;
  pad.classList.add("hit");
  play(id);
});

grid.addEventListener("pointermove", (e) => {
  if (drag) { moveDrag(e.clientX, e.clientY); return; }
  if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_TOL) cancelPress();
});

grid.addEventListener("pointerup", (e) => {
  e.target.closest(".pad")?.classList.remove("hit");
  if (drag) { endDrag(true); return; }
  if (press) { const i = press.i; cancelPress(); openSheet(i); }
});
grid.addEventListener("pointerleave", (e) => e.target.closest(".pad")?.classList.remove("hit"), true);
grid.addEventListener("pointercancel", (e) => {
  e.target.closest(".pad")?.classList.remove("hit");
  cancelPress();
  if (drag) endDrag(false);
});
grid.addEventListener("contextmenu", (e) => { if (document.body.dataset.mode === "edit") e.preventDefault(); });

/* ---------- 音をえらぶシート ---------- */
const sheetBg = $("#sheetBg"), listEl = $("#list"), catsEl = $("#cats"), qEl = $("#q");
let filterCat = "", query = "";

function renderCats() {
  catsEl.innerHTML = "";
  for (const c of [{ id: "", label: "すべて" }, ...CATS]) {
    const b = document.createElement("button");
    b.textContent = c.label;
    b.dataset.cat = c.id;
    b.setAttribute("aria-selected", c.id === filterCat);
    catsEl.appendChild(b);
  }
}
catsEl.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  filterCat = b.dataset.cat; renderCats(); renderList();
});

// ひらがなで打っても，カタカナの音名がヒットするようにそろえる
function norm(s) {
  return s.normalize("NFKC").toLowerCase()
    .replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}
const haystack = new Map(SOUNDS.map((s) => [s.i, norm(`${s.n} ${s.k} ${s.i}`)]));

function renderList() {
  const q = norm(query.trim());
  const cur = selected >= 0 ? state.slots[selected] : null;
  const hits = SOUNDS.filter((s) =>
    (!filterCat || s.c === filterCat) && (!q || haystack.get(s.i).includes(q)));
  listEl.innerHTML = hits.length
    ? hits.map((s) =>
        `<button class="item${s.i === cur ? " current" : ""}" data-id="${s.i}" style="--c:${catColor.get(s.c)}">` +
        `<span class="glyph">${svg(s.ic)}</span><span class="nm">${esc(s.n)}</span></button>`).join("")
    : `<p class="empty-msg">みつかりませんでした</p>`;
}
qEl.addEventListener("input", () => { query = qEl.value; renderList(); });

listEl.addEventListener("click", (e) => {
  const b = e.target.closest(".item"); if (!b || selected < 0) return;
  state.slots[selected] = b.dataset.id;
  save(); renderGrid(); renderList();
  play(b.dataset.id);
});

function openSheet(i) {
  selected = i;
  renderGrid();
  $("#sheetTitle").textContent = `${i + 1}ばんに入れる音`;
  renderCats(); renderList();
  sheetBg.classList.add("open");
}
function closeSheet() {
  sheetBg.classList.remove("open");
  selected = -1; renderGrid();
}
$("#sheetClose").addEventListener("click", closeSheet);
sheetBg.addEventListener("click", (e) => { if (e.target === sheetBg) closeSheet(); });
$("#sheetClear").addEventListener("click", () => {
  if (selected < 0) return;
  state.slots[selected] = null; save(); renderGrid(); renderList();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (drag) { cancelPress(); endDrag(false); return; }
  if (paletteEl.classList.contains("open")) { openPalette(false); return; }
  if (sheetBg.classList.contains("open")) closeSheet();
});

/* ---------- ヘッダー・フッター ---------- */
for (const b of document.querySelectorAll(".seg button")) {
  b.addEventListener("click", () => {
    cancelPress();
    if (drag) endDrag(false);
    openPalette(false);
    document.body.dataset.mode = b.dataset.mode;
    document.querySelectorAll(".seg button").forEach((x) =>
      x.setAttribute("aria-selected", x === b));
    if (b.dataset.mode === "play") closeSheet();
  });
}
$("#colMinus").addEventListener("click", () => resize(-1, 0));
$("#colPlus").addEventListener("click", () => resize(1, 0));
$("#rowMinus").addEventListener("click", () => resize(0, -1));
$("#rowPlus").addEventListener("click", () => resize(0, 1));
$("#resetAll").addEventListener("click", () => {
  if (!confirm("ぜんぶのパッドを空にします。よろしいですか？")) return;
  state.slots = state.slots.map(() => null); save(); renderGrid();
});

const volEl = $("#vol"), muteBtn = $("#mute");
function syncVol() {
  volEl.value = state.vol;
  volEl.style.setProperty("--p", state.vol + "%");
  document.body.classList.toggle("is-muted", state.muted);
  muteBtn.classList.toggle("on", state.muted);
  muteBtn.querySelector("svg")?.remove();
  muteBtn.insertAdjacentHTML("beforeend", svg(state.muted ? "volume-x" : "volume-2"));
  applyVolume();
}
volEl.addEventListener("input", () => { state.vol = +volEl.value; state.muted = false; syncVol(); save(); });
muteBtn.addEventListener("click", () => { state.muted = !state.muted; syncVol(); save(); });
$("#stop").addEventListener("click", stopAll);

/* ---------- 共有 ---------- */
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}
$("#share").addEventListener("click", async () => {
  const hash = encodeState();
  history.replaceState(null, "", "#" + hash);
  const url = location.href;
  // クリップボードは権限や環境で固まることがあるので待ち時間を区切る
  const copied = await Promise.race([
    navigator.clipboard?.writeText(url).then(() => true, () => false) ?? Promise.resolve(false),
    new Promise((r) => setTimeout(() => r(false), 1200)),
  ]);
  toast(copied ? "共有URLをコピーしました" : "このページのURLが共有URLです");
});

/* ---------- 起動 ---------- */
load();
syncVol();
renderGrid();
document.addEventListener("pointerdown", function once() {
  if (ctx.state === "suspended") ctx.resume();
  document.removeEventListener("pointerdown", once);
});
})();
