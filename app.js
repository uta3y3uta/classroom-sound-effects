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
                 "tettere","iyoo","uwaa","hakushu",
                 "pafupafu","kotsuzumi","gakkari","horn"];
// pattern＝配色パターン（0〜9がA〜J），rot＝グラデーションの向き（0〜7）
let state = { cols: 4, rows: 4, slots: DEFAULT.slice(), vol: 80, muted: false, colors: {},
              pattern: 0, rot: 0, neon: true, pastel: false };

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
  const within = (v, n) => Number.isInteger(v) && v >= 0 && v < n;
  s.pattern = within(s.pattern, PATTERNS.length) ? s.pattern : 0;
  s.rot = within(s.rot, DIRS.length) ? s.rot : 0;
  s.neon = s.neon !== false;          // 前の版で保存したものには無いので，無ければON
  s.pastel = s.pastel === true;
  return s;
}

function save() {
  recordHistory();
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {}
}

/* ---------- もとにもどす／やりなおす ---------- */
// 並べ方・ボタンの数・色・配色パターン・ネオン・パステルを，変わるたびにまるごと控えておく。
// 音量とミュートは「見た目」ではないので，控えの対象に入れない。
// save() から自動で呼ぶので，これから編集の処理を足しても取りこぼさない。
const HIST_MAX = 60;
const undoStack = [], redoStack = [];
let histNow = null, histLock = false;

function histSnapshot() {
  return JSON.stringify([state.cols, state.rows, state.slots, state.colors,
                         state.pattern, state.rot, state.neon, state.pastel]);
}

// もどせないときはボタンを薄くして，押しても何も起きないことを見せておく
const undoBtn = $("#undoBtn"), redoBtn = $("#redoBtn");
function syncHistBtns() {
  undoBtn.disabled = !undoStack.length;
  redoBtn.disabled = !redoStack.length;
}

function recordHistory() {
  if (histLock) return;
  const s = histSnapshot();
  if (histNow === null) { histNow = s; syncHistBtns(); return; }   // 起動直後の1回目
  if (s === histNow) return;                       // 中身が変わっていない
  undoStack.push(histNow);
  if (undoStack.length > HIST_MAX) undoStack.shift();
  redoStack.length = 0;
  histNow = s;
  syncHistBtns();
}

function applyHistory(s) {
  const [cols, rows, slots, colors, pattern, rot, neon, pastel] = JSON.parse(s);
  state.cols = cols; state.rows = rows; state.slots = slots; state.colors = colors;
  state.pattern = pattern; state.rot = rot; state.neon = neon; state.pastel = pastel;
  histNow = s;
  if (selected >= slots.length) selected = -1;
  colorOptCount = -1;                              // 番号の選択肢を作り直す
  histLock = true; save(); histLock = false;       // 控えずに保存だけする
  renderGrid();
  if (sheetBg.classList.contains("open")) renderList();
}

function undo() {
  if (!undoStack.length) return false;
  redoStack.push(histNow); applyHistory(undoStack.pop()); syncHistBtns(); return true;
}
function redo() {
  if (!redoStack.length) return false;
  undoStack.push(histNow); applyHistory(redoStack.pop()); syncHistBtns(); return true;
}

// Ctrlキーのないタブレットでも使えるよう，画面にもボタンを置く
undoBtn.addEventListener("click", () => toast(undo() ? "もとにもどしました" : "もとにもどせません"));
redoBtn.addEventListener("click", () => toast(redo() ? "やりなおしました" : "これより先はありません"));

document.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const t = e.target;
  // 検索らんに入力中は，文字のほうの取り消しを邪魔しない
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  const k = e.key.toLowerCase();
  let msg = null;
  if (k === "z" && !e.shiftKey) msg = undo() ? "もとにもどしました" : "もとにもどせません";
  else if (k === "y" || (k === "z" && e.shiftKey)) msg = redo() ? "やりなおしました" : "これより先はありません";
  if (msg === null) return;
  e.preventDefault();
  toast(msg);
});

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

// 色のぶんを何バイト足すか決める。
// ぜんぶ既定の色なら1バイトも足さない（前と同じ長さのURLになる）。
// 「全部」で染めたときはたった2バイト。1つずつ変えたときだけ1マス1バイト使う。
// 0＝既定の色，1〜32＝ネオンパレットの何番目か。
function colorBytes() {
  const n = state.cols * state.rows;
  const idx = [];
  let any = false, uniform = true;
  for (let i = 0; i < n; i++) {
    const hex = state.colors[i];
    const v = hex ? neonIndex(hex) + 1 : 0;
    idx.push(v);
    if (v) any = true;
    if (v !== idx[0]) uniform = false;
  }
  if (!any) return [];
  return uniform ? [0, idx[0]] : [1, ...idx];
}

// パレットにない色（パターンの色を四角から運んだときなど）は，いちばん近いネオン色で送る
function neonIndex(hex) {
  const k = NEON.indexOf(hex.toLowerCase());
  if (k >= 0) return k;
  const [L, a, b] = hexToOklab(hex);
  let best = 0, bestD = Infinity;
  NEON.forEach((c, j) => {
    const [L2, a2, b2] = hexToOklab(c);
    const d = (L - L2) ** 2 + (a - a2) ** 2 + (b - b2) ** 2;
    if (d < bestD) { bestD = d; best = j; }
  });
  return best;
}

// 配色パターン・向き・ネオン・パステル。既定（A・↘・ネオンON・パステルOFF）なら足さない
// 目じるしの 2 のあとに，パターン・向き・ON/OFF（1＝ネオン，2＝パステル）を1バイトずつ
function lookBytes() {
  const flags = (state.neon ? 1 : 0) | (state.pastel ? 2 : 0);
  if (state.pattern === 0 && state.rot === 0 && flags === 1) return [];
  return [2, state.pattern, state.rot, flags];
}

function encodeState() {
  const bytes = [7, state.cols, state.rows];
  for (const id of state.slots) bytes.push(id ? byId.get(id) + 1 : 0);
  // 色と配色はうしろに足すだけ。古い版のアプリは読み飛ばすので，音の並びは正しく開ける
  bytes.push(...colorBytes(), ...lookBytes());
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
  const n = cols * rows;
  const slots = [];
  for (let i = 0; i < n; i++) {
    const v = bytes[3 + i];
    slots.push(v ? (SOUNDS[v - 1] || {}).i || null : null);
  }
  // うしろに色と配色がついていれば，順に取り出す。ついていなければ既定のまま
  const colors = {};
  let p = 3 + n;
  if (bytes[p] === 0) {                    // 全部同じ色
    const hex = NEON[bytes[p + 1] - 1];
    if (hex) for (let i = 0; i < n; i++) colors[i] = hex;
    p += 2;
  } else if (bytes[p] === 1) {             // 1つずつ
    for (let i = 0; i < n; i++) {
      const hex = NEON[bytes[p + 1 + i] - 1];
      if (hex) colors[i] = hex;
    }
    p += 1 + n;
  }
  const look = { pattern: 0, rot: 0, neon: true, pastel: false };
  if (bytes[p] === 2) {
    look.pattern = bytes[p + 1]; look.rot = bytes[p + 2];
    look.neon = !!(bytes[p + 3] & 1); look.pastel = !!(bytes[p + 3] & 2);
  }
  return { cols, rows, slots, colors, vol: 80, muted: false, ...look };
}

/* ---------- 音 ---------- */
// iPhone・iPad の消音モード（横のスイッチやアクションボタン）で音が消えないようにする。
// Safari はふつう，Web Audio を着信音と同じあつかいにするので，消音にすると鳴らない。
// 音楽や動画と同じ「playback」あつかいに切りかえると，消音モードに左右されなくなる。
// 新しい iOS は navigator.audioSession で直接切りかえられる。
// それが無い古い iOS では，無音の <audio> を流しつづけて同じ状態を作る（startSilentTag）。
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
               (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);   // iPadOS
const HAS_SESSION = "audioSession" in navigator;

function setPlaybackSession() {
  if (!HAS_SESSION) return;
  try {
    if (navigator.audioSession.type !== "playback") navigator.audioSession.type = "playback";
  } catch (e) {}
}
setPlaybackSession();   // 音の準備をする前に切りかえておく

const ctx = new (window.AudioContext || window.webkitAudioContext)();
const limiter = ctx.createDynamicsCompressor();
limiter.threshold.value = -3; limiter.knee.value = 0;
limiter.ratio.value = 20; limiter.attack.value = 0.003; limiter.release.value = 0.1;
const master = ctx.createGain();
master.connect(limiter).connect(ctx.destination);

// 古い iOS 用。0.1秒の無音WAVをその場で作り，くり返し流しておく
let silentTag = null;
function silentWavURL() {
  const rate = 8000, n = 800, v = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([v.buffer], { type: "audio/wav" }));
}
function startSilentTag() {
  if (!IS_IOS || HAS_SESSION) return;
  if (!silentTag) {
    silentTag = document.createElement("audio");
    silentTag.src = silentWavURL();
    silentTag.loop = true;
    silentTag.preload = "auto";
    silentTag.setAttribute("playsinline", "");
    silentTag.setAttribute("x-webkit-airplay", "deny");
  }
  if (silentTag.paused) silentTag.play().catch(() => {});
}

// 古いブラウザは resume が Promise を返さないことがあるので，受け方をそろえる
function resumeCtx() {
  try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
}

// スマホは「画面にふれた」ときでないと音を出させてくれない。
// しかも指のときは，押した瞬間ではなく「はなした瞬間」がその合図になる。
// 一度ゆるしてもらっても，ほかのアプリに切りかえたり電話が来たりすると止まるので，
// ふれるたびに確かめて，止まっていれば動かしなおす。
function unlockAudio() {
  setPlaybackSession();
  startSilentTag();
  if (ctx.state === "running") return;
  resumeCtx();
  // 古い iOS は，ふれた瞬間に何か1つ鳴らさないと音の出口が開かない
  const s = ctx.createBufferSource();
  s.buffer = ctx.createBuffer(1, 1, 22050);
  s.connect(ctx.destination);
  s.start(0);
}
for (const t of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) {
  document.addEventListener(t, unlockAudio, { capture: true, passive: true });
}
// 画面を離れたら無音の <audio> も止める。流しっぱなしだとロック画面に再生中と出てしまう
document.addEventListener("visibilitychange", () => {
  if (document.hidden && silentTag) silentTag.pause();
});

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
  // iOS は止まった理由によって "suspended" ではなく "interrupted" になるので，両方見る
  if (ctx.state !== "running") resumeCtx();
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
    if (s) pad.style.setProperty("--c", shown(state.colors[i] || defaultColorFor(i)));
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
  syncLook();
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

/* ---------- 色の計算 ---------- */
// 見た目の近さで色をまぜたり比べたりするため，OKLab（明るさと2つの色の軸）を使う。
// sRGB のまま混ぜると，途中が暗くにごる。
function hexToOklab(hex) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const r = lin(parseInt(hex.slice(1, 3), 16)), g = lin(parseInt(hex.slice(3, 5), 16)),
        b = lin(parseInt(hex.slice(5, 7), 16));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function oklabToRgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
          -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
          -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
// 明るさ L・あざやかさ C・色あい h から色を作る。画面で出せない色は，あざやかさだけ下げて収める
function lch(L, C, h) {
  const rad = h * Math.PI / 180;
  const rgbAt = (c) => oklabToRgb(L, c * Math.cos(rad), c * Math.sin(rad));
  const fits = (c) => rgbAt(c).every((v) => v >= -1e-4 && v <= 1 + 1e-4);
  let c = C;
  if (!fits(c)) {
    let lo = 0, hi = C;
    for (let k = 0; k < 18; k++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    c = lo;
  }
  return "#" + rgbAt(c).map((v) => {
    v = Math.min(1, Math.max(0, v));
    v = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(v * 255).toString(16).padStart(2, "0");
  }).join("");
}

/* ---------- 配色パターン ---------- */
// A〜J の10パターン。どれも色の流れ（グラデーション）で，[明るさ, あざやかさ, 色あい] を並べたもの。
// 黒い画面で沈まないよう，明るさは 0.62 より下げない。
const PATTERNS = [
  { name: "ネオンサイン", stops: [[0.70, 0.25, 358], [0.64, 0.26, 305], [0.72, 0.19, 262], [0.84, 0.15, 210]] },
  { name: "サンセット",   stops: [[0.90, 0.17, 95], [0.78, 0.18, 55], [0.70, 0.21, 20], [0.66, 0.26, -15]] },
  { name: "オーロラ",     stops: [[0.88, 0.22, 145], [0.86, 0.15, 190], [0.74, 0.16, 245], [0.66, 0.24, 300]] },
  { name: "レインボー",   stops: [[0.68, 0.23, 25], [0.80, 0.17, 65], [0.92, 0.18, 105], [0.87, 0.23, 145],
                                  [0.86, 0.15, 195], [0.70, 0.18, 258], [0.65, 0.26, 310], [0.70, 0.25, 355]] },
  { name: "オーシャン",   stops: [[0.92, 0.12, 185], [0.84, 0.14, 215], [0.72, 0.17, 245], [0.64, 0.20, 268]] },
  { name: "ライム",       stops: [[0.95, 0.20, 110], [0.89, 0.24, 135], [0.85, 0.19, 160], [0.83, 0.14, 185]] },
  { name: "さくら",       stops: [[0.88, 0.08, 10], [0.78, 0.16, 0], [0.70, 0.23, 350], [0.66, 0.27, 335]] },
  { name: "ラベンダー",   stops: [[0.86, 0.10, 300], [0.76, 0.16, 298], [0.68, 0.21, 292], [0.62, 0.24, 280]] },
  { name: "ゴールド",     stops: [[0.95, 0.12, 100], [0.86, 0.14, 85], [0.76, 0.14, 70], [0.66, 0.13, 60]] },
  { name: "シルバー",     stops: [[0.97, 0.005, 250], [0.88, 0.02, 250], [0.79, 0.04, 252], [0.72, 0.06, 255]] },
];
const LETTERS = "ABCDEFGHIJ";

// 色が流れる向き。0 が左上→右下（↘）で，回すたびに時計回りに45度ずつ進む
const DIRS = [[1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0]];   // [横, 縦]
const cssAngle = (k) => Math.round(Math.atan2(DIRS[k][0], -DIRS[k][1]) * 180 / Math.PI);

// パターン k の流れの，t（0＝はじまり〜1＝おわり）の位置の色
const patCache = new Map();
function patternAt(k, t) {
  const key = k + ":" + t;
  let hex = patCache.get(key);
  if (!hex) {
    const st = PATTERNS[k].stops, n = st.length - 1;
    const j = Math.min(n - 1, Math.floor(t * n)), u = t * n - j, a = st[j], b = st[j + 1];
    hex = lch(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u);
    patCache.set(key, hex);
  }
  return hex;
}

// そのボタンが，いまの向きで流したとき流れのどのあたり（0〜1）にいるか。
// ボタンの数を変えても，いつも端から端まで流れきるようにしてある
function patternT(i) {
  const [dx, dy] = DIRS[state.rot], w = state.cols - 1, h = state.rows - 1;
  const r = Math.floor(i / state.cols), c = i % state.cols;
  const lo = Math.min(0, dx * w) + Math.min(0, dy * h), hi = Math.max(0, dx * w) + Math.max(0, dy * h);
  return hi === lo ? 0 : (c * dx + r * dy - lo) / (hi - lo);
}

// パステル：色あいはそのままで，明るくやわらかくする
const pastelCache = new Map();
function pastel(hex) {
  let v = pastelCache.get(hex);
  if (!v) {
    const [, a, b] = hexToOklab(hex);
    v = lch(0.87, Math.min(0.09, Math.hypot(a, b) * 0.5), Math.atan2(b, a) * 180 / Math.PI);
    pastelCache.set(hex, v);
  }
  return v;
}
// 画面に出すときの色。パステルがONなら，やわらかくしてから出す
const shown = (hex) => (state.pastel ? pastel(hex) : hex);

// ボタンの見本やパターンの一覧に描く，色の流れ
function patternCSS(k, angle) {
  const pts = Array.from({ length: 7 }, (_, j) => shown(patternAt(k, j / 6)));
  return `linear-gradient(${angle}deg,${pts.join(",")})`;
}

const colorNoEl = $("#colorNo"), colorPickEl = $("#colorPick"),
      colorResetEl = $("#colorReset"), paletteEl = $("#palette"),
      patBtn = $("#patBtn"), patRotEl = $("#patRot"), patternsEl = $("#patterns"),
      neonSw = $("#neonSw"), pastelSw = $("#pastelSw");
let colorOptCount = -1, lastPicked = NEON[0];
let paletteSkipClick = false, swatchSkipClick = false;

// ボタンの既定の色。選んでいるパターンを，いまの向きで流したときの色
function defaultColorFor(i) {
  if (!state.slots[i]) return "#8b8b99";
  return patternAt(state.pattern, patternT(i));
}

// 「ー」は，どこにも色をつけない状態。色をえらんでも画面は変わらず，
// つまんで運ぶための色を手に持つだけになる。はじめはこれを選んでおく
function currentColor() {
  const v = colorNoEl.value;
  return v === "all" || v === "none" ? lastPicked : (state.colors[+v] || defaultColorFor(+v));
}

function syncColorPick() {
  const cur = currentColor().toLowerCase();
  colorPickEl.style.setProperty("--c", shown(cur));
  for (const b of paletteEl.children) b.classList.toggle("on", b.dataset.c === cur);
}

// ネオン・パステル・配色パターンの見た目を，いまの状態にそろえる
function syncLook() {
  document.body.classList.toggle("neon", state.neon);
  neonSw.setAttribute("aria-pressed", state.neon ? "true" : "false");
  pastelSw.setAttribute("aria-pressed", state.pastel ? "true" : "false");
  patBtn.style.setProperty("--g", patternCSS(state.pattern, cssAngle(state.rot)));
  patBtn.firstChild.textContent = LETTERS[state.pattern];
  patBtn.setAttribute("aria-label", `配色パターン ${LETTERS[state.pattern]}（${PATTERNS[state.pattern].name}）`);
  // パステルがONなら，パレットと一覧もやわらかい色で見せる（置いたときの色がそのまま分かる）
  for (const b of paletteEl.children) b.style.setProperty("--c", shown(b.dataset.c));
  for (const b of patternsEl.children) {
    b.classList.toggle("on", +b.dataset.k === state.pattern);
    b.style.setProperty("--g", patternCSS(+b.dataset.k, 90));
  }
}

function renderColorOptions() {
  const count = state.cols * state.rows;
  if (colorOptCount !== count) {
    const prev = colorNoEl.value;
    colorNoEl.innerHTML = `<option value="none">ー</option><option value="all">全部</option>` +
      Array.from({ length: count }, (_, i) => `<option value="${i}">${i + 1}</option>`).join("");
    // はじめて作るときは prev が空。そのまま入れると，らんが空っぽに見えてしまう
    const keep = prev === "none" || prev === "all" ||
                 (prev !== "" && +prev >= 0 && +prev < count);
    colorNoEl.value = keep ? prev : "none";
    colorOptCount = count;
  }
  syncColorPick();
}

paletteEl.innerHTML = NEON.map((c) =>
  `<button type="button" role="option" data-c="${c}" style="--c:${c}" aria-label="${c}"></button>`).join("");

patternsEl.innerHTML = PATTERNS.map((p, k) =>
  `<button type="button" role="option" data-k="${k}"><span class="chip"></span><b>${LETTERS[k]}</b>${p.name}</button>`).join("");

// パレットとパターン一覧は，どちらか1つだけ開く
function openPop(el, btn, open) {
  el.classList.toggle("open", open);
  btn.setAttribute("aria-expanded", open ? "true" : "false");
  if (!open) return;
  // 画面からはみ出さない位置に寄せる
  el.style.left = "0px";
  const box = el.getBoundingClientRect();
  const over = box.right - (innerWidth - 8);
  if (over > 0) el.style.left = -Math.min(over, box.left - 8) + "px";
}
function openPalette(open) {
  if (open) openPop(patternsEl, patBtn, false);
  openPop(paletteEl, colorPickEl, open);
}
function openPatterns(open) {
  if (open) openPop(paletteEl, colorPickEl, false);
  openPop(patternsEl, patBtn, open);
}

colorPickEl.addEventListener("click", () => {
  if (swatchSkipClick) { swatchSkipClick = false; return; }   // 色を運んだ直後は開かない
  openPalette(!paletteEl.classList.contains("open"));
});

patBtn.addEventListener("click", () => openPatterns(!patternsEl.classList.contains("open")));

patternsEl.addEventListener("click", (e) => {
  const b = e.target.closest ? e.target.closest("button[data-k]") : null;
  if (!b) return;
  state.pattern = +b.dataset.k;
  state.colors = {};      // パターンが全体に行きわたるよう，1つずつ変えた色はリセットする
  openPatterns(false);
  save(); renderGrid();
});

// 押すたびに，色の流れる向きが時計回りに45度ずつ回る
patRotEl.addEventListener("click", () => {
  state.rot = (state.rot + 1) % DIRS.length;
  save(); renderGrid();
});

neonSw.addEventListener("click", () => { state.neon = !state.neon; save(); syncLook(); });
pastelSw.addEventListener("click", () => { state.pastel = !state.pastel; save(); renderGrid(); });
colorNoEl.addEventListener("change", syncColorPick);

paletteEl.addEventListener("click", (e) => {
  if (paletteSkipClick) { paletteSkipClick = false; return; }
  const hex = e.target.dataset && e.target.dataset.c;
  if (!hex) return;
  const v = colorNoEl.value;
  openPalette(false);
  if (v === "none") {                 // 手に持つだけ。画面は変えない
    lastPicked = hex;
    syncColorPick();
    return;
  }
  if (v === "all") {
    lastPicked = hex;
    for (let i = 0; i < state.cols * state.rows; i++) state.colors[i] = hex;
  } else {
    state.colors[+v] = hex;
  }
  save(); renderGrid();
});

colorResetEl.addEventListener("click", () => {
  const v = colorNoEl.value;
  openPalette(false);
  if (v === "none") return;           // どこにもかからないので，もどす先もない
  if (v === "all") state.colors = {};
  else delete state.colors[+v];
  save(); renderGrid();
});

// 開いている一覧の外をさわったら閉じる
document.addEventListener("pointerdown", (e) => {
  const t = e.target;
  if (!t || !t.closest) return;
  if (paletteEl.classList.contains("open") && !t.closest("#palette, #colorPick")) openPalette(false);
  if (patternsEl.classList.contains("open") && !t.closest("#patterns, #patBtn")) openPatterns(false);
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

/* ---------- パレットの色を長押しでつまみ，パッドまで運ぶ ---------- */
let cpress = null;   // 長押し待ち { hex, x, y, timer }
let cdrag = null;    // 運んでいる最中 { hex, ghost, over }

function cancelCPress() {
  if (!cpress) return;
  clearTimeout(cpress.timer);
  cpress = null;
}

function startCDrag() {
  if (!cpress || cdrag) return;
  const { hex, x, y, from } = cpress;
  cpress = null;
  // はなしたときに，色が二重に付いたりパレットが開いたりしないように
  if (from === "swatch") swatchSkipClick = true;
  else paletteSkipClick = true;
  const ghost = document.createElement("span");
  ghost.className = "color-ghost";
  ghost.style.setProperty("--c", shown(hex));
  document.body.appendChild(ghost);
  cdrag = { hex, ghost, over: null };
  paletteEl.classList.add("carrying");  // 下のパッドが見えるよう薄くする
  moveCDrag(x, y);
  navigator.vibrate?.(12);
}

// パッドの色をもとにもどす（運んでいる最中の下見を消す）
function unpreview(i) {
  grid.children[i].classList.remove("drop-target");
  grid.children[i].style.setProperty("--c", shown(state.colors[i] || defaultColorFor(i)));
}

function moveCDrag(x, y) {
  cdrag.ghost.style.transform = `translate3d(${x}px,${y}px,0)`;
  // パレットや四角が指の下にあると当たり判定をさえぎるので，測る一瞬だけ透かす
  paletteEl.style.pointerEvents = "none";
  colorPickEl.style.pointerEvents = "none";
  const el = document.elementFromPoint(x, y);
  paletteEl.style.pointerEvents = "";
  colorPickEl.style.pointerEvents = "";
  const p = el && el.closest ? el.closest(".pad") : null;
  const over = p && grid.contains(p) && !p.classList.contains("empty") ? +p.dataset.i : null;
  if (over === cdrag.over) return;
  if (cdrag.over !== null) unpreview(cdrag.over);
  cdrag.over = over;
  if (over !== null) {
    grid.children[over].classList.add("drop-target");
    grid.children[over].style.setProperty("--c", shown(cdrag.hex));   // 置く前に色を下見できる
  }
}

function endCDrag(commit) {
  const { hex, ghost, over } = cdrag;
  cdrag = null;
  ghost.remove();
  paletteEl.classList.remove("carrying");
  if (commit && over !== null) { state.colors[over] = hex; save(); }
  renderGrid();
}

// つまむ操作は2か所から始められるので，中身は共通にしておく。
// pick は「どの色をつまむか」を返す。useTimer は長押しの時間だけでもつまめるかどうか。
function colorDragFrom(el, pick, from, useTimer) {
  el.addEventListener("pointerdown", (e) => {
    paletteSkipClick = false; swatchSkipClick = false;
    const src = cdrag ? null : pick(e);
    if (!src) return;
    try { src.el.setPointerCapture(e.pointerId); } catch (err) {}
    cpress = { hex: src.hex, x: e.clientX, y: e.clientY, from,
               timer: useTimer ? setTimeout(startCDrag, LONG_MS) : 0 };
  });
  el.addEventListener("pointermove", (e) => {
    if (cdrag) { moveCDrag(e.clientX, e.clientY); return; }
    if (!cpress || cpress.from !== from) return;
    if (Math.hypot(e.clientX - cpress.x, e.clientY - cpress.y) <= MOVE_TOL) return;
    // 時間を待たず，動かしはじめた時点でつまめるようにする。
    // マウスだと押したとたんに動きだすので，長押しの時間だけで見ると取りこぼす。
    clearTimeout(cpress.timer);
    cpress.x = e.clientX; cpress.y = e.clientY;
    startCDrag();
    if (cdrag) moveCDrag(e.clientX, e.clientY);
  });
  el.addEventListener("pointerup", () => {
    if (cdrag) { endCDrag(true); return; }
    cancelCPress();
  });
  el.addEventListener("pointercancel", () => {
    cancelCPress();
    if (cdrag) endCDrag(false);
  });
}

// パレットの32色から
colorDragFrom(paletteEl, (e) => {
  const b = e.target.closest ? e.target.closest("button[data-c]") : null;
  return b ? { el: b, hex: b.dataset.c } : null;
}, "palette", true);

// いま選んでいる色の四角から。パレットを開かなくても，ここから運べる。
// こちらは時間ではなく「動かしたら」つまむ。押しっぱなしはパレットを開く操作のままにしたいので
colorDragFrom(colorPickEl, () => ({ el: colorPickEl, hex: currentColor() }), "swatch", false);

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
  if (cdrag) { cancelCPress(); endCDrag(false); return; }
  if (paletteEl.classList.contains("open")) { openPalette(false); return; }
  if (patternsEl.classList.contains("open")) { openPatterns(false); return; }
  if (sheetBg.classList.contains("open")) closeSheet();
});

/* ---------- ヘッダー・フッター ---------- */
for (const b of document.querySelectorAll(".seg button")) {
  b.addEventListener("click", () => {
    cancelPress();
    if (drag) endDrag(false);
    cancelCPress();
    if (cdrag) endCDrag(false);
    openPalette(false);
    openPatterns(false);
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

/* ---------- 新しい版が出ていないか見に行く ---------- */
// index.html には10分のキャッシュが効いてしまう（GitHub Pagesの既定）。
// 版番号は index.html が持っているので，更新した直後に開くと
// 古いHTMLがそのまま使われ，新しいCSS/JSに入れかわらない。
// そこで版番号だけを別ファイルにして，キャッシュを通さずに確かめる。
// 数字が上がっていたらURLに ?v= を足して読み直す（別のURL扱いになり，確実に取り直される）。
function checkVersion() {
  fetch("version.json?t=" + Date.now(), { cache: "no-store" })
    .then((r) => r.json())
    .then((v) => {
      const ver = +v.ver;
      if (!(ver > window.ASSET_VER)) return;
      if (sessionStorage.getItem("ver-reload") === String(ver)) return;  // 読み直しは1回だけ
      sessionStorage.setItem("ver-reload", String(ver));
      location.replace(location.pathname + "?v=" + ver + location.hash);
    })
    .catch(() => {});
}

/* ---------- 起動 ---------- */
// 読み直しに使った ?v= は，共有URLに混ざらないよう消しておく
if (/[?&]v=\d+/.test(location.search)) {
  history.replaceState(null, "", location.pathname + location.hash);
}
load();
recordHistory();   // 起動時の状態を，もとにもどす先として控えておく
syncVol();
renderGrid();
checkVersion();
})();
