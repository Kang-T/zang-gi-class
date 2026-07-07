// 배우기 — 체계적 커리큘럼 (이야기 · 퀴즈 · 판 미니게임)
// board.js 는 판 미니게임(puzzle)에서만 사용. 이야기/퀴즈는 자체 SVG 도해.
import { JanggiBoard } from "./board.js";

const $ = (id) => document.getElementById(id);

/* ==================== SVG 도해 라이브러리 ==================== */
const CHO = "#2f6be6", HAN = "#ef5b4c", BODY = "#f7f0dc", LINE = "#6b4a23", WOOD = "#e8c887";
const G = { K: "楚", k: "漢", R: "車", r: "車", C: "包", c: "包", N: "馬", n: "馬", B: "象", b: "象", A: "士", a: "士", P: "卒", p: "兵" };

function octPts(cx, cy, r) {
  const c = r * 0.4142;
  return [[-c, -r], [c, -r], [r, -c], [r, c], [c, r], [-c, r], [-r, c], [-r, -c]]
    .map(([dx, dy]) => `${(cx + dx).toFixed(1)},${(cy + dy).toFixed(1)}`).join(" ");
}
// 팔각 기물 하나
function pc(letter, cx, cy, r) {
  const cho = letter === letter.toUpperCase();
  const col = cho ? CHO : HAN;
  return `<polygon points="${octPts(cx, cy + 1.5, r)}" fill="rgba(60,45,20,.22)"/>`
    + `<polygon points="${octPts(cx, cy, r)}" fill="${BODY}" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>`
    + `<text x="${cx}" y="${cy + 1}" text-anchor="middle" dominant-baseline="central" font-size="${(r * 0.98).toFixed(1)}" font-weight="800" fill="${col}">${G[letter] || "?"}</text>`;
}
function svg(w, h, inner) {
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" class="art-svg">${inner}</svg>`;
}
// 장기판 그림 (cellsH 줄, pieces=[[col,row(0=위),letter]], palace 강조 여부)
function boardArt(pieces = [], hi = null) {
  const CW = 9, CH = 10, cell = 22, M = 16;
  const W = M * 2 + (CW - 1) * cell, H = M * 2 + (CH - 1) * cell;
  const x = (c) => M + c * cell, y = (r) => M + r * cell;
  let s = `<rect x="0" y="0" width="${W}" height="${H}" rx="10" fill="${WOOD}"/>`;
  if (hi === "palace") {
    s += `<rect x="${x(3)}" y="${y(0)}" width="${cell * 2}" height="${cell * 2}" fill="rgba(245,166,35,.28)"/>`;
    s += `<rect x="${x(3)}" y="${y(7)}" width="${cell * 2}" height="${cell * 2}" fill="rgba(245,166,35,.28)"/>`;
  }
  for (let r = 0; r < CH; r++) s += `<line x1="${x(0)}" y1="${y(r)}" x2="${x(CW - 1)}" y2="${y(r)}" stroke="${LINE}" stroke-width="1"/>`;
  for (let c = 0; c < CW; c++) s += `<line x1="${x(c)}" y1="${y(0)}" x2="${x(c)}" y2="${y(CH - 1)}" stroke="${LINE}" stroke-width="1"/>`;
  const pal = (c0, r0) => `<line x1="${x(c0)}" y1="${y(r0)}" x2="${x(c0 + 2)}" y2="${y(r0 + 2)}" stroke="${LINE}" stroke-width="1"/><line x1="${x(c0 + 2)}" y1="${y(r0)}" x2="${x(c0)}" y2="${y(r0 + 2)}" stroke="${LINE}" stroke-width="1"/>`;
  s += pal(3, 0) + pal(3, 7);
  for (const [c, r, letter] of pieces) s += pc(letter, x(c), y(r), cell * 0.44);
  return svg(W, H, s);
}
const START_PIECES = [
  [0, 0, "r"], [1, 0, "n"], [2, 0, "b"], [3, 0, "a"], [5, 0, "a"], [6, 0, "b"], [7, 0, "n"], [8, 0, "r"], [4, 1, "k"],
  [1, 2, "c"], [7, 2, "c"], [0, 3, "p"], [2, 3, "p"], [4, 3, "p"], [6, 3, "p"], [8, 3, "p"],
  [0, 6, "P"], [2, 6, "P"], [4, 6, "P"], [6, 6, "P"], [8, 6, "P"], [1, 7, "C"], [7, 7, "C"], [4, 8, "K"],
  [0, 9, "R"], [1, 9, "N"], [2, 9, "B"], [3, 9, "A"], [5, 9, "A"], [6, 9, "B"], [7, 9, "N"], [8, 9, "R"],
];
// 여러 기물을 가로로 나열 (labels: [{letter,count,name}])
function rowArt(groups) {
  const r = 24, gap = 14, padY = 30;
  let x = 20; const rows = [];
  for (const g of groups) {
    const n = g.count || 1;
    const cx = x + r;
    rows.push({ cx, g });
    x += r * 2 + gap;
  }
  const W = x + 6, H = r * 2 + padY + 26;
  let s = "";
  for (const { cx, g } of rows) {
    s += pc(g.letter, cx, r + 12, r);
    s += `<text x="${cx}" y="${r * 2 + padY + 8}" text-anchor="middle" font-size="15" font-weight="800" fill="#2e2c3a">${g.name}${g.count ? " ×" + g.count : ""}</text>`;
  }
  return svg(W, H, s);
}

const ART = {
  "start-position": () => boardArt(START_PIECES),
  "board-grid": () => boardArt([]),
  "palace": () => boardArt([[4, 1, "k"], [3, 8, "A"], [4, 8, "K"], [5, 8, "A"]], "palace"),
  "two-generals": () => boardArt([[4, 0, "k"], [4, 9, "K"]]),
  "turns": () => svg(260, 120,
    pc("K", 70, 60, 30) + pc("k", 190, 60, 30)
    + `<path d="M110 45 A 40 40 0 0 1 150 45" fill="none" stroke="#9a94a6" stroke-width="3" marker-end="url(#ar)"/>`
    + `<path d="M150 78 A 40 40 0 0 1 110 78" fill="none" stroke="#9a94a6" stroke-width="3" marker-end="url(#ar)"/>`
    + `<defs><marker id="ar" markerWidth="7" markerHeight="7" refX="4" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#9a94a6"/></marker></defs>`),
  "chu-han": () => svg(280, 150,
    `<rect x="18" y="24" width="104" height="104" rx="14" fill="${CHO}" opacity="0.14"/>`
    + `<rect x="158" y="24" width="104" height="104" rx="14" fill="${HAN}" opacity="0.14"/>`
    + pc("K", 70, 74, 34) + pc("k", 210, 74, 34)
    + `<text x="140" y="82" text-anchor="middle" font-size="22" font-weight="900" fill="#9a94a6">VS</text>`),
  "korea": () => boardArt([[4, 0, "k"], [4, 9, "K"], [2, 9, "C"], [6, 0, "c"]]) ,
  "army": () => rowArt([
    { letter: "K", name: "장", count: 1 }, { letter: "A", name: "사", count: 2 },
    { letter: "R", name: "차", count: 2 }, { letter: "C", name: "포", count: 2 },
    { letter: "N", name: "마", count: 2 }, { letter: "B", name: "상", count: 2 },
    { letter: "P", name: "졸", count: 5 },
  ]),
  "two-colors": () => svg(280, 120,
    pc("K", 80, 60, 34) + pc("k", 200, 60, 34)
    + `<text x="80" y="112" text-anchor="middle" font-size="15" font-weight="800" fill="${CHO}">파란 초(楚)</text>`
    + `<text x="200" y="112" text-anchor="middle" font-size="15" font-weight="800" fill="${HAN}">빨간 한(漢)</text>`),
  "zol-byeong": () => svg(280, 120,
    pc("P", 80, 54, 30) + pc("p", 200, 54, 30)
    + `<text x="80" y="104" text-anchor="middle" font-size="15" font-weight="800" fill="${CHO}">초는 卒(졸)</text>`
    + `<text x="200" y="104" text-anchor="middle" font-size="15" font-weight="800" fill="${HAN}">한은 兵(병)</text>`),
  "values": () => {
    const items = [["R", "차", 13], ["C", "포", 7], ["N", "마", 5], ["B", "상", 3], ["A", "사", 3], ["P", "졸", 2]];
    const r = 24, gap = 16; let x = 18; let s = "";
    for (const [L, nm, v] of items) {
      const cx = x + r;
      s += pc(L, cx, r + 10, r);
      s += `<text x="${cx}" y="${r * 2 + 30}" text-anchor="middle" font-size="14" font-weight="800" fill="#2e2c3a">${nm}</text>`;
      s += `<text x="${cx}" y="${r * 2 + 48}" text-anchor="middle" font-size="16" font-weight="900" fill="${CHO}">${v}점</text>`;
      x += r * 2 + gap;
    }
    return svg(x + 6, r * 2 + 58, s);
  },
};
function renderArt(name) { return (ART[name] ? ART[name]() : ""); }

/* ==================== 커리큘럼 데이터 ==================== */
// 판 미니게임(움직임) — 상대 병 잡기 한 수 퍼즐 (단원 2)
const MOVE_PUZZLES = {
  R: { glyph: "車", name: "차", desc: "차(車)는 가로·세로로 원하는 만큼 쭉 직진해요. 중간에 말이 막고 있으면 못 지나가요.",
    target: "e5", goal: "e9", pieces: [["d1", "K"], ["f10", "k"], ["e5", "R"], ["e9", "p"]] },
  C: { glyph: "包", name: "포", desc: "포(包)는 다른 말 하나를 딱 넘어서 움직여요. 단, 포를 넘거나 포를 잡을 수는 없어요.",
    target: "e3", goal: "e8", pieces: [["e2", "K"], ["f10", "k"], ["e3", "C"], ["e5", "p"], ["e8", "p"]] },
  N: { glyph: "馬", name: "마", desc: "마(馬)는 ㄱ자로 뛰어요. 한 칸 직진 → 대각선 한 칸. 바로 앞이 막히면 못 가요.",
    target: "e3", goal: "f5", pieces: [["d1", "K"], ["e10", "k"], ["e3", "N"], ["f5", "p"]] },
  B: { glyph: "象", name: "상", desc: "상(象)은 한 칸 직진 뒤 대각선으로 두 칸 가요. 길목이 막히면 못 가요.",
    target: "e3", goal: "g6", pieces: [["d1", "K"], ["f10", "k"], ["e3", "B"], ["g6", "p"]] },
  A: { glyph: "士", name: "사", desc: "사(士)는 궁성(3×3) 안에서 선을 따라 한 칸씩 움직이며 장을 지켜요.",
    target: "e2", goal: "e3", pieces: [["d1", "K"], ["f10", "k"], ["e2", "A"], ["e3", "p"]] },
  P: { glyph: "卒", name: "졸·병", desc: "졸(卒)은 앞이나 옆으로 한 칸씩 가요. 뒤로는 절대 못 가요!",
    target: "e5", goal: "e6", pieces: [["d1", "K"], ["f10", "k"], ["e5", "P"], ["e6", "p"]] },
  K: { glyph: "楚", name: "장·왕", desc: "장(將)은 궁성 밖으로 못 나가요. 선을 따라 한 칸씩 움직여요.",
    target: "e2", goal: "e3", pieces: [["e2", "K"], ["f10", "k"], ["e3", "p"]] },
};
function movePuzzle(key) {
  const p = MOVE_PUZZLES[key];
  return { id: "u2_" + key, type: "puzzle", title: p.name, glyph: p.glyph, desc: p.desc, target: p.target, goal: p.goal, pieces: p.pieces };
}

const CURRICULUM = [
  {
    id: "u0", title: "장기와 만나기", icon: "👋", badge: "📜", badgeName: "역사가", color: "orange",
    lessons: [
      { id: "u0_1", type: "story", title: "장기가 뭐예요?", pages: [
        { art: "two-generals", title: "두 대장의 겨루기", text: "장기는 두 사람이 겨루는 아주 오래된 놀이예요. 파란 편 <b>楚(초)</b>와 빨간 편 <b>漢(한)</b>이 서로 상대의 대장을 잡으려고 다퉈요." },
        { art: "start-position", title: "16개씩 마주 보고", text: "각 편은 말 16개를 가지고 시작해요. 아래는 파란 초, 위는 빨간 한. 아주 큰 병정놀이 같지요?" },
        { art: "turns", title: "번갈아 한 수씩", text: "두 사람이 <b>번갈아</b> 말을 한 번씩 움직여요. 상대의 대장 <b>장(將)</b>을 꼼짝 못 하게 잡으면(외통) 이겨요!" },
      ] },
      { id: "u0_2", type: "story", title: "장기의 옛날 이야기", pages: [
        { art: "chu-han", title: "초와 한, 두 영웅", text: "장기는 먼 옛날 <b>초(楚)</b>나라와 <b>한(漢)</b>나라, 두 나라가 천하를 두고 다툰 이야기에서 왔대요. 그래서 말에 楚·漢 글자가 쓰여 있어요." },
        { art: "korea", title: "우리나라의 놀이로", text: "장기는 오래전 우리나라에 들어와 아주 인기 있는 놀이가 되었어요. 지금도 할아버지부터 친구들까지 함께 즐겨요." },
      ] },
      { id: "u0_3", type: "story", title: "장기판 구경", pages: [
        { art: "board-grid", title: "선 위에 놓아요", text: "장기판은 가로 9줄, 세로 10줄의 선으로 되어 있어요. 말은 칸 안이 아니라 <b>선이 만나는 점</b> 위에 놓아요." },
        { art: "palace", title: "궁성 (대장의 방)", text: "가운데 위·아래에 X가 그려진 3×3 방이 <b>궁성</b>이에요. <b>장</b>과 <b>사</b>는 이 방을 절대 벗어날 수 없어요." },
      ] },
      { id: "u0_q", type: "quiz", title: "확인 퀴즈", questions: [
        { q: "장기에서 이기려면 상대의 무엇을 잡아야 할까요?", art: "two-generals",
          options: [{ t: "장(將) — 대장", ok: true }, { t: "졸" }, { t: "차" }], explain: "상대의 대장 장(將)을 꼼짝 못 하게 만들면 이겨요!" },
        { q: "말은 어디에 놓을까요?", options: [{ t: "선이 만나는 점 위", ok: true }, { t: "칸 안" }, { t: "아무 데나" }], explain: "장기는 선이 만나는 '점' 위에 말을 놓아요." },
        { q: "OX: 장은 궁성 밖으로 나갈 수 있다.", options: [{ t: "O" }, { t: "X", ok: true }], explain: "장은 궁성(3×3) 안에서만 움직여요." },
      ] },
    ],
  },
  {
    id: "u1", title: "장기 알 이야기", icon: "♟️", badge: "♟️", badgeName: "알 박사", color: "purple",
    lessons: [
      { id: "u1_1", type: "story", title: "16개는 하나의 군대", pages: [
        { art: "army", title: "말들은 군대예요", text: "한 편의 말 16개는 옛날 <b>군대</b>를 본뜬 거예요. 대장부터 병사까지 역할이 다 달라요." },
        { art: "army", title: "누가 누구?", text: "대장 <b>장</b> 1, 지키는 <b>사</b> 2, 힘센 전차 <b>차</b> 2, 멀리 쏘는 <b>포</b> 2, 뛰는 <b>마</b> 2, <b>상</b> 2, 앞장서는 <b>졸·병</b> 5!" },
      ] },
      { id: "u1_2", type: "story", title: "초와 한, 卒과 兵", pages: [
        { art: "two-colors", title: "색으로 편을 나눠요", text: "파란 글자는 <b>초(楚)</b> 편, 빨간 글자는 <b>한(漢)</b> 편이에요. 색만 보면 어느 편인지 알 수 있어요." },
        { art: "zol-byeong", title: "같은 병사, 다른 글자", text: "같은 병사인데 초는 <b>卒(졸)</b>, 한은 <b>兵(병)</b>이라고 써요. 글자는 달라도 하는 일은 똑같아요." },
      ] },
      { id: "u1_3", type: "story", title: "말의 값어치 (점수)", pages: [
        { art: "values", title: "말마다 힘이 달라요", text: "말마다 힘이 달라서 <b>값(점수)</b>이 있어요. 차 13, 포 7, 마 5, 상·사 3, 졸 2. 장은 잡히면 끝이라 점수가 없어요." },
        { art: "values", title: "함부로 바꾸지 마요", text: "그래서 차를 함부로 잃으면 크게 손해예요. 졸 하나와 차 하나를 바꾸면 아주 밑지는 거죠!" },
      ] },
      { id: "u1_q", type: "quiz", title: "확인 퀴즈", questions: [
        { q: "한 편의 말은 모두 몇 개일까요?", art: "army", options: [{ t: "16개", ok: true }, { t: "10개" }, { t: "20개" }], explain: "장1·사2·차2·포2·마2·상2·졸5 = 16개!" },
        { q: "가장 값이 높은(힘센) 말은?", art: "values", options: [{ t: "차(車)", ok: true }, { t: "졸(卒)" }, { t: "사(士)" }], explain: "차가 13점으로 가장 값이 높아요." },
        { q: "OX: 졸을 주고 상대 차를 잡으면 이득이다.", options: [{ t: "O", ok: true }, { t: "X" }], explain: "졸 2점 ↔ 차 13점! 아주 큰 이득이에요." },
      ] },
    ],
  },
  {
    id: "u2", title: "기물은 어떻게 움직여?", icon: "🧭", badge: "🎮", badgeName: "움직임 마스터", color: "blue",
    lessons: ["R", "C", "N", "B", "A", "P", "K"].map(movePuzzle),
  },
  { id: "u3", title: "대국의 규칙", icon: "📏", locked: true, lessons: [] },
  { id: "u4", title: "기초 전술", icon: "⚔️", locked: true, lessons: [] },
  { id: "u5", title: "첫 대국 & 졸업", icon: "🎓", locked: true, lessons: [] },
];

// 빠른 조회용 인덱스
const LESSON_INDEX = {};
CURRICULUM.forEach((u, ui) => u.lessons.forEach((l, li) => { LESSON_INDEX[l.id] = { unit: u, ui, lesson: l, li }; }));
const ALL_LESSON_IDS = CURRICULUM.flatMap((u) => u.lessons.map((l) => l.id));

/* ==================== 진도 저장 ==================== */
const STORE = "janggi.learn2";
function loadDone() { try { return new Set(JSON.parse(localStorage.getItem(STORE) || "[]")); } catch (e) { return new Set(); } }
function saveDone() { try { localStorage.setItem(STORE, JSON.stringify([...done])); } catch (e) { /* 무시 */ } }
let done = loadDone();
function unitDone(u) { return u.lessons.length > 0 && u.lessons.every((l) => done.has(l.id)); }

/* ==================== 공통 상태 ==================== */
let board = null;
let cur = null; // 현재 레슨 컨텍스트

/* ==================== 학습 지도 ==================== */
function showPath() {
  ["story-view", "quiz-view", "puzzle-view"].forEach((v) => $(v).classList.add("hidden"));
  $("path").classList.remove("hidden");
  renderPath();
}
function renderPath() {
  const el = $("path-list");
  el.innerHTML = CURRICULUM.map((u, ui) => {
    const udone = unitDone(u);
    if (u.locked) {
      return `<div class="unit locked"><div class="unit-head"><span class="unit-icon">${u.icon}</span>
        <span class="unit-title">${u.title}</span><span class="unit-soon">준비 중</span></div></div>`;
    }
    const lessons = u.lessons.map((l) => {
      const d = done.has(l.id);
      const tag = l.type === "story" ? "이야기" : l.type === "quiz" ? "퀴즈" : "미니게임";
      return `<button class="lnode ${d ? "done" : ""}" data-id="${l.id}" type="button">
        <span class="lnode-check">${d ? "✓" : ""}</span>
        <span class="lnode-body"><span class="lnode-title">${l.glyph ? l.glyph + " " : ""}${l.title}</span>
        <span class="lnode-tag">${tag}</span></span></button>`;
    }).join("");
    return `<div class="unit c-${u.color || "blue"} ${udone ? "cleared" : ""}">
      <div class="unit-head"><span class="unit-icon">${u.icon}</span>
        <span class="unit-title">${u.title}</span>
        <span class="unit-badge">${udone ? u.badge + " " + u.badgeName : ""}</span></div>
      <div class="lnodes">${lessons}</div></div>`;
  }).join("");
  el.querySelectorAll(".lnode").forEach((b) => (b.onclick = () => openLesson(b.dataset.id)));
}

function openLesson(id) {
  const ctx = LESSON_INDEX[id];
  if (!ctx) return;
  cur = { id, ...ctx, page: 0, qIndex: 0 };
  $("path").classList.add("hidden");
  const l = ctx.lesson;
  if (l.type === "story") startStory();
  else if (l.type === "quiz") startQuiz();
  else if (l.type === "puzzle") startPuzzle();
}

function completeLesson(id) {
  const wasDone = done.has(id);
  done.add(id); saveDone();
  const ctx = LESSON_INDEX[id];
  // 단원을 이번에 완성했으면 배지
  if (!wasDone && unitDone(ctx.unit)) showBadge(ctx.unit);
}
function nextLessonId(id) {
  const i = ALL_LESSON_IDS.indexOf(id);
  for (let k = i + 1; k < ALL_LESSON_IDS.length; k++) {
    if (!LESSON_INDEX[ALL_LESSON_IDS[k]].unit.locked) return ALL_LESSON_IDS[k];
  }
  return null;
}

/* ==================== 이야기 엔진 ==================== */
function startStory() {
  $("story-view").classList.remove("hidden");
  cur.page = 0;
  renderStory();
}
function renderStory() {
  const l = cur.lesson, p = l.pages[cur.page];
  $("story-art").innerHTML = renderArt(p.art);
  $("story-title").textContent = p.title;
  $("story-text").innerHTML = p.text;
  $("story-dots").innerHTML = l.pages.map((_, i) => `<span class="dot ${i === cur.page ? "on" : ""}"></span>`).join("");
  $("story-prev").disabled = cur.page === 0;
  $("story-next").textContent = cur.page === l.pages.length - 1 ? "다 배웠어요 ✓" : "다음 →";
}
function storyNext() {
  if (cur.page < cur.lesson.pages.length - 1) { cur.page++; renderStory(); }
  else { completeLesson(cur.id); afterLesson(); }
}

/* ==================== 퀴즈 엔진 ==================== */
function startQuiz() {
  $("quiz-view").classList.remove("hidden");
  cur.qIndex = 0;
  renderQuiz();
}
function renderQuiz() {
  const qs = cur.lesson.questions, q = qs[cur.qIndex];
  $("quiz-progress").textContent = `${cur.qIndex + 1} / ${qs.length}`;
  $("quiz-art").innerHTML = q.art ? renderArt(q.art) : "";
  $("quiz-q").textContent = q.q;
  $("quiz-feedback").textContent = "";
  $("quiz-feedback").className = "quiz-feedback";
  $("quiz-next").disabled = true;
  const opts = $("quiz-options");
  opts.innerHTML = q.options.map((o, i) => `<button class="quiz-opt" data-i="${i}" type="button">${o.t}</button>`).join("");
  opts.querySelectorAll(".quiz-opt").forEach((b) => (b.onclick = () => answerQuiz(parseInt(b.dataset.i), b)));
}
function answerQuiz(i, btn) {
  const q = cur.lesson.questions[cur.qIndex];
  if (q.options[i].ok) {
    btn.classList.add("correct");
    $("quiz-options").querySelectorAll(".quiz-opt").forEach((b) => (b.disabled = true));
    const fb = $("quiz-feedback");
    fb.className = "quiz-feedback ok";
    fb.innerHTML = "정답이에요! " + (q.explain || "");
    $("quiz-next").disabled = false;
    $("quiz-next").textContent = cur.qIndex === cur.lesson.questions.length - 1 ? "완료 ✓" : "다음 →";
  } else {
    btn.classList.add("wrong"); btn.disabled = true;
    const fb = $("quiz-feedback");
    fb.className = "quiz-feedback no";
    fb.textContent = "다시 한 번 골라볼까요?";
  }
}
function quizNext() {
  if (cur.qIndex < cur.lesson.questions.length - 1) { cur.qIndex++; renderQuiz(); }
  else { completeLesson(cur.id); afterLesson(); }
}

/* ==================== 판 미니게임(퍼즐) 엔진 ==================== */
const FILES = "abcdefghi";
function makeFen(pieces, turn = "w") {
  const g = Array.from({ length: 10 }, () => Array(9).fill(null));
  for (const [sq, pc2] of pieces) { const col = FILES.indexOf(sq[0]); const rank = parseInt(sq.slice(1)); g[10 - rank][col] = pc2; }
  return g.map((row) => { let s = "", e = 0; for (const c of row) { if (c) { if (e) { s += e; e = 0; } s += c; } else e++; } if (e) s += e; return s; }).join("/") + ` ${turn} - - 0 1`;
}
let pz = { armed: false, wrongs: 0 };
function startPuzzle() {
  $("puzzle-view").classList.remove("hidden");
  const l = cur.lesson;
  $("lesson-glyph").textContent = l.glyph;
  $("lesson-name").textContent = l.name;
  $("lesson-desc").textContent = l.desc;
  $("puzzle-next").classList.add("hidden");
  loadPuzzle();
}
function loadPuzzle() {
  const l = cur.lesson;
  pz.armed = false; pz.wrongs = 0;
  board.loadState({ startFen: makeFen(l.pieces, "w"), moves: [] });
  board.setMySide("cho");
  board.selected = l.target;
  board.render();
  pz.armed = true;
  setTask(`${l.name}(으)로 상대 병(兵)을 잡아 보세요!`, false);
  $("hint-btn").disabled = false;
  $("puzzle-next").classList.add("hidden");
}
function setTask(text, ok) { const el = $("task-banner"); el.textContent = text; el.className = "task-banner" + (ok ? " ok" : ""); }
function onBoardMove() {
  if (!pz.armed) return;
  const moves = board.getState().moves;
  if (!moves.length) return;
  const l = cur.lesson;
  const mv = board.parseMove(moves[moves.length - 1]);
  if (mv && mv.from === l.target && mv.to === l.goal) {
    pz.armed = false;
    checkFx("잘했어요!");
    setTask(`좋아요! ${l.name}의 움직임을 익혔어요 🎉`, true);
    board.setHint(null); $("hint-btn").disabled = true;
    $("puzzle-next").classList.remove("hidden");
    $("puzzle-next").textContent = nextLessonId(cur.id) ? "다음 →" : "목록으로 ✓";
    completeLesson(cur.id);
  } else {
    pz.wrongs++; pz.armed = false;
    board.undo(); board.selected = l.target; board.render(); pz.armed = true;
    if (pz.wrongs >= 2) { board.setHint(l.target + l.goal); toast("힌트 화살표를 따라가 보세요!"); }
    else toast("그 수 말고, 상대 병(兵)을 잡아 보세요.");
  }
}

/* ==================== 공통: 레슨 후 처리 ==================== */
function afterLesson() {
  // 배지 오버레이가 떠 있으면 그쪽 버튼으로 진행
  if (!$("badge-overlay").classList.contains("hidden")) return;
  goNextOrPath();
}
function goNextOrPath() {
  const nid = nextLessonId(cur.id);
  if (nid) openLesson(nid); else showPath();
}

/* ==================== 배지 / 축하 ==================== */
let pendingAfterBadge = null;
function showBadge(unit) {
  $("badge-emoji").textContent = unit.badge;
  $("badge-title").textContent = `${unit.title} 완료!`;
  $("badge-sub").innerHTML = `<b>${unit.badge} ${unit.badgeName}</b> 배지를 얻었어요!`;
  const nid = nextLessonId(cur.id);
  $("badge-next").textContent = nid ? "다음 단원 →" : "학습 지도로";
  pendingAfterBadge = nid;
  $("badge-overlay").classList.remove("hidden");
}
function closeBadge(goNext) {
  $("badge-overlay").classList.add("hidden");
  if (goNext && pendingAfterBadge) openLesson(pendingAfterBadge);
  else showPath();
}

/* ==================== 이펙트 / 토스트 ==================== */
let fxTimer = null, toastTimer = null;
function checkFx(text) { const el = $("check-fx"); el.textContent = text; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show"); clearTimeout(fxTimer); fxTimer = setTimeout(() => el.classList.remove("show"), 1200); }
function toast(msg) { const el = $("toast"); el.textContent = msg; el.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2200); }

/* ==================== 부팅 ==================== */
async function boot() {
  board = new JanggiBoard($("board"));
  board.onMove = onBoardMove;
  board.onBlocked = toast;
  await board.init();
  // 이야기/퀴즈 중엔 판이 안 보이지만, 퍼즐 대비해 미리 init.
  $("board").addEventListener("click", (e) => { if (!pz.armed) e.stopImmediatePropagation(); }, true);

  $("story-prev").onclick = () => { if (cur.page > 0) { cur.page--; renderStory(); } };
  $("story-next").onclick = storyNext;
  $("story-list").onclick = showPath;
  $("quiz-next").onclick = quizNext;
  $("quiz-list").onclick = showPath;
  $("reset-btn").onclick = loadPuzzle;
  $("hint-btn").onclick = () => board.setHint(cur.lesson.target + cur.lesson.goal);
  $("puzzle-next").onclick = goNextOrPath;
  $("puzzle-list").onclick = showPath;
  $("badge-next").onclick = () => closeBadge(true);
  $("badge-close").onclick = () => closeBadge(false);

  showPath();
}
boot().catch((e) => { $("path-list").innerHTML = "오류: " + (e.message || e); console.error(e); });
