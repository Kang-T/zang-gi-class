// 배우기 — 기물 움직임을 '상대 병 잡기' 미니 퍼즐로 익히는 모드
// board.js 를 재사용한다. 각 퍼즐은 시작 위치(FEN)와 정답 한 수(target→goal)로 정의.
import { JanggiBoard } from "./board.js";

const $ = (id) => document.getElementById(id);
const FILES = "abcdefghi";

// 빈 판에 기물을 놓아 FEN 을 만든다. pieces = [[sq, letter], ...]
function makeFen(pieces, turn = "w") {
  const g = Array.from({ length: 10 }, () => Array(9).fill(null));
  for (const [sq, pc] of pieces) {
    const col = FILES.indexOf(sq[0]);
    const rank = parseInt(sq.slice(1));
    g[10 - rank][col] = pc; // row0 = rank10
  }
  const rows = g.map((row) => {
    let s = "", e = 0;
    for (const c of row) {
      if (c) { if (e) { s += e; e = 0; } s += c; }
      else e++;
    }
    if (e) s += e;
    return s;
  });
  return rows.join("/") + ` ${turn} - - 0 1`;
}

// 초(대문자)=파랑 기물이 상대 병(p)을 한 수에 잡는 퍼즐들.
// 양 진영 장(K/k)은 규칙상 꼭 있어야 하므로 서로 다른 줄(마주보기 방지)에 배치.
const LESSONS = [
  { key: "R", name: "차", glyph: "車",
    desc: "차(車)는 가로·세로로 원하는 만큼 쭉 직진해요. 중간에 말이 막고 있으면 못 지나가요.",
    target: "e5", goal: "e9",
    pieces: [["d1", "K"], ["f10", "k"], ["e5", "R"], ["e9", "p"]] },
  { key: "C", name: "포", glyph: "包",
    desc: "포(包)는 다른 말 하나를 딱 넘어서 움직여요. 단, 포를 넘거나 포를 잡을 수는 없어요.",
    target: "e3", goal: "e8",
    pieces: [["e2", "K"], ["f10", "k"], ["e3", "C"], ["e5", "p"], ["e8", "p"]] },
  { key: "N", name: "마", glyph: "馬",
    desc: "마(馬)는 ㄱ자로 뛰어요. 한 칸 직진 → 대각선 한 칸. 바로 앞이 막히면 못 가요.",
    target: "e3", goal: "f5",
    pieces: [["d1", "K"], ["e10", "k"], ["e3", "N"], ["f5", "p"]] },
  { key: "B", name: "상", glyph: "象",
    desc: "상(象)은 한 칸 직진 뒤 대각선으로 두 칸 가요. 길목이 막히면 못 가요.",
    target: "e3", goal: "g6",
    pieces: [["d1", "K"], ["f10", "k"], ["e3", "B"], ["g6", "p"]] },
  { key: "A", name: "사", glyph: "士",
    desc: "사(士)는 궁성(3×3) 안에서 선을 따라 한 칸씩 움직이며 장을 지켜요.",
    target: "e2", goal: "e3",
    pieces: [["d1", "K"], ["f10", "k"], ["e2", "A"], ["e3", "p"]] },
  { key: "P", name: "졸·병", glyph: "卒",
    desc: "졸(卒)은 앞이나 옆으로 한 칸씩 가요. 뒤로는 절대 못 가요!",
    target: "e5", goal: "e6",
    pieces: [["d1", "K"], ["f10", "k"], ["e5", "P"], ["e6", "p"]] },
  { key: "K", name: "장·왕", glyph: "楚",
    desc: "장(將)은 궁성 밖으로 못 나가요. 선을 따라 한 칸씩 움직여요.",
    target: "e2", goal: "e3",
    pieces: [["e2", "K"], ["f10", "k"], ["e3", "p"]] },
];

const STORE_DONE = "janggi.learn.done";
function loadDone() {
  try { return new Set(JSON.parse(localStorage.getItem(STORE_DONE) || "[]")); }
  catch (e) { return new Set(); }
}
function saveDone(set) {
  try { localStorage.setItem(STORE_DONE, JSON.stringify([...set])); } catch (e) { /* 무시 */ }
}

let board;
let done = loadDone();
let cur = -1;        // 현재 레슨 index
let armed = false;   // 퍼즐 로드 중 onMove 무시
let solved = false;
let wrongs = 0;

async function boot() {
  board = new JanggiBoard($("board"));
  board.onMove = onMove;
  board.onBlocked = toast;
  await board.init();
  bindUI();
  renderCurriculum();
}

function bindUI() {
  $("reset-btn").onclick = () => loadPuzzle(cur);
  $("hint-btn").onclick = showHint;
  $("list-btn").onclick = showCurriculum;
  $("next-btn").onclick = gotoNext;
  $("done-again").onclick = () => {
    done = new Set(); saveDone(done);
    $("done-overlay").classList.add("hidden");
    renderCurriculum(); showCurriculum();
  };
}

function renderCurriculum() {
  const grid = $("learn-grid");
  grid.innerHTML = LESSONS.map((L, i) => `
    <button class="learn-card cho ${done.has(L.key) ? "done" : ""}" data-i="${i}" type="button">
      ${done.has(L.key) ? '<span class="done-badge">✓</span>' : ""}
      <span class="learn-glyph">${L.glyph}</span>
      <span class="learn-name">${L.name}</span>
      <span class="learn-sub">${done.has(L.key) ? "다 배웠어요" : "배우기 →"}</span>
    </button>`).join("");
  grid.querySelectorAll(".learn-card").forEach((b) =>
    (b.onclick = () => startLesson(parseInt(b.dataset.i))));
}

function showCurriculum() {
  $("lesson").classList.add("hidden");
  $("curriculum").classList.remove("hidden");
  renderCurriculum();
}

function startLesson(i) {
  cur = i;
  $("curriculum").classList.add("hidden");
  $("lesson").classList.remove("hidden");
  const L = LESSONS[i];
  $("lesson-glyph").textContent = L.glyph;
  $("lesson-name").textContent = L.name;
  $("lesson-desc").textContent = L.desc;
  loadPuzzle(i);
}

function loadPuzzle(i) {
  const L = LESSONS[i];
  armed = false; solved = false; wrongs = 0;
  board.loadState({ startFen: makeFen(L.pieces, "w"), moves: [] }); // → onMove(무시됨)
  board.setMySide("cho");
  board.selected = L.target;   // 움직일 기물을 미리 선택해 잡을 곳(빨간 고리)을 보여줌
  board.render();
  armed = true;
  setTask(`${L.name}(으)로 상대 병(兵)을 잡아 보세요!`, false);
  $("next-btn").classList.add("hidden");
  $("hint-btn").disabled = false;
}

function setTask(text, ok) {
  const el = $("task-banner");
  el.textContent = text;
  el.className = "task-banner" + (ok ? " ok" : "");
}

function onMove() {
  if (!armed) return;
  const moves = board.getState().moves;
  if (!moves.length) return;
  const L = LESSONS[cur];
  const mv = board.parseMove(moves[moves.length - 1]);
  if (mv && mv.from === L.target && mv.to === L.goal) {
    succeed();
  } else {
    // 틀린 수 → 되돌리고 다시 안내
    wrongs++;
    armed = false;
    board.undo();          // onMove(무시됨)
    board.selected = L.target;
    board.render();
    armed = true;
    if (wrongs >= 2) { showHint(); toast("힌트 화살표를 따라가 보세요!"); }
    else toast("그 수 말고, 상대 병(兵)을 잡아 보세요.");
  }
}

function succeed() {
  solved = true;
  const L = LESSONS[cur];
  checkFx("잘했어요!");
  setTask(`좋아요! ${L.name}의 움직임을 익혔어요 🎉`, true);
  board.setHint(null);
  $("hint-btn").disabled = true;
  $("next-btn").classList.remove("hidden");
  $("next-btn").textContent = cur < LESSONS.length - 1 ? "다음 기물 →" : "끝내기 🎓";
  done.add(L.key); saveDone(done);
}

function gotoNext() {
  if (done.size >= LESSONS.length) { $("done-overlay").classList.remove("hidden"); return; }
  // 아직 안 배운 다음 기물로
  let n = cur;
  for (let k = 1; k <= LESSONS.length; k++) {
    const j = (cur + k) % LESSONS.length;
    if (!done.has(LESSONS[j].key)) { n = j; break; }
  }
  if (n === cur) { $("done-overlay").classList.remove("hidden"); return; }
  startLesson(n);
}

function showHint() {
  const L = LESSONS[cur];
  board.setHint(L.target + L.goal);
}

// ---- 이펙트 / 토스트 (다른 화면과 동일 UX) ----
let fxTimer = null, toastTimer = null;
function checkFx(text) {
  const el = $("check-fx");
  el.textContent = text;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(fxTimer);
  fxTimer = setTimeout(() => el.classList.remove("show"), 1200);
}
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

boot().catch((e) => {
  $("learn-grid").innerHTML = "오류: " + (e.message || e);
  console.error(e);
});
