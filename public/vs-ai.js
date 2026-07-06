// AI와 대국 + 급수 — 컴퓨터(Fairy-Stockfish)와 두며 급수를 올리는 모드
// board.js / engine.js 를 그대로 재사용하고, 위에 '급수 사다리'만 얹는다.
import { JanggiBoard } from "./board.js";
import { JanggiEngine } from "./engine.js";

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 급수 사다리 ----
// index 0 = 가장 약함(15급) … 마지막 = 가장 셈(3단).
// 급수가 오를수록 엔진의 Skill Level(0~20)과 생각 시간(ms)을 함께 키운다.
const RANKS = (() => {
  const names = [];
  for (let g = 15; g >= 1; g--) names.push(g + "급"); // 15급 … 1급
  names.push("초단", "2단", "3단");                    // 그 위로 단
  const N = names.length;
  return names.map((name, i) => {
    const t = i / (N - 1); // 0 … 1
    return {
      name,
      skill: Math.round(t * 20),          // 0 … 20
      movetime: Math.round(300 + t * 2200), // 300 … 2500ms
    };
  });
})();
const TOP = RANKS.length - 1;

// ---- 잡은 말 표시 (together.js 와 동일 규칙) ----
const GLYPH = {
  cho: { R: "車", C: "包", N: "馬", B: "象", A: "士", P: "卒", K: "楚" },
  han: { R: "車", C: "包", N: "馬", B: "象", A: "士", P: "兵", K: "漢" },
};
const VALUE = { R: 13, C: 7, N: 5, B: 3, A: 3, P: 2, K: 0 };
const START = { K: 1, R: 2, C: 2, N: 2, B: 2, A: 2, P: 5 };

// ---- 저장 (localStorage) ----
const STORE_RANK = "janggi.ai.rank"; // 현재 급수 index
const STORE_BEST = "janggi.ai.best"; // 최고 달성 급수 index
const STORE_WINS = "janggi.ai.wins"; // 통산 승수
function loadInt(key, def) {
  const v = parseInt(localStorage.getItem(key));
  return Number.isFinite(v) ? v : def;
}
function clampRank(i) { return Math.max(0, Math.min(TOP, i)); }
function saveInt(key, v) { try { localStorage.setItem(key, String(v)); } catch (e) { /* 저장 불가여도 진행 */ } }

// ---- 상태 ----
let board, engine;
let rankIdx = clampRank(loadInt(STORE_RANK, 0));
let bestIdx = clampRank(loadInt(STORE_BEST, rankIdx));
let wins = loadInt(STORE_WINS, 0);
let mySideW = true;      // true = 내가 楚 초(먼저), false = 내가 漢 한(나중)
let lastChoKey = "마상상마", lastHanKey = "마상상마";
let engineReady = false;
let gameActive = false;  // 대국 진행 중 (화면 이동/재시작 시 stale AI 수 방지)
let aiThinking = false;
let suppressAI = false;  // 무르기 도중 AI 자동 착수 잠깐 막기

function rank() { return RANKS[rankIdx]; }
function myKey() { return mySideW ? "cho" : "han"; }
function aiKey() { return mySideW ? "han" : "cho"; }
function isMyTurn() { return board.turn() === mySideW; } // board.turn() true = 楚 초

async function boot() {
  board = new JanggiBoard($("board"));
  board.onMove = onMove;
  board.onBlocked = toast;
  await board.init();
  board.setMySide("none");

  // AI 차례에는 판 클릭을 막아 학생이 AI 말을 대신 두지 못하게 한다.
  // (board 의 클릭 리스너보다 먼저 실행되는 캡처 단계 리스너)
  $("board").addEventListener("click", (e) => {
    if (gameActive && (aiThinking || !isMyTurn() || board.isGameOver())) {
      e.stopImmediatePropagation();
    }
  }, true);

  renderRankCard();
  bindUI();

  engine = new JanggiEngine();
  await engine.init((s) => { $("engine-status").textContent = s; });
  engineReady = true;
  $("start-btn").disabled = false;
  $("start-btn").textContent = "대국 시작 ▶";
}

function bindUI() {
  $("start-btn").onclick = startGame;
  $("undo-btn").onclick = requestUndo;
  $("flip-btn").onclick = () => { board.flip(); updateAll(); };
  $("restart-btn").onclick = () => {
    if (confirm("이 판을 처음부터 다시 둘까요?")) startGame();
  };
  $("resign-btn").onclick = resign;
  $("reset-rank-btn").onclick = () => {
    if (!confirm("급수를 15급(맨 처음)으로 되돌릴까요?")) return;
    rankIdx = 0; saveInt(STORE_RANK, rankIdx);
    renderRankCard();
  };
  $("win-again").onclick = startGame;
  $("win-setup").onclick = backToSetup;
}

// ---- 급수 카드 (설정 화면) ----
function renderRankCard() {
  $("rank-name").textContent = rank().name;
  $("rank-fill").style.width = Math.round((rankIdx / TOP) * 100) + "%";
  $("rank-best").textContent = RANKS[bestIdx].name;
  $("rank-wins").textContent = wins;
  const next = rankIdx < TOP ? RANKS[rankIdx + 1].name : null;
  $("rank-next").textContent = next
    ? `이기면 ${next}(으)로 올라가요!`
    : "최고 급수예요! 계속 지켜내세요 🏆";
}

// ---- 화면 전환 ----
function showScreen(which) {
  $("setup").classList.toggle("hidden", which !== "setup");
  $("game").classList.toggle("hidden", which !== "game");
  if (which !== "win") $("win-overlay").classList.add("hidden");
}
function backToSetup() {
  gameActive = false;
  renderRankCard();
  showScreen("setup");
}

// ---- 대국 시작 ----
function startGame() {
  mySideW = $("side-select").value !== "b";
  lastChoKey = $("cho-setup").value;
  lastHanKey = $("han-setup").value;
  aiThinking = false; suppressAI = false;
  gameActive = true;
  showScreen("game");
  // newGame 이 onMove 를 호출 → updateAll + (AI 선수면) 착수까지 이어짐
  board.newGame(lastChoKey, lastHanKey, mySideW ? "w" : "b");
  board.setMySide(myKey());
  updateAll();
}

// 매 수마다(및 newGame 직후) 호출
function onMove() {
  if (!gameActive) return;
  updateAll();
  if (board.isGameOver()) {
    if (board.isCheck()) checkFx("외통!");
    setTimeout(endGame, 750);
    return;
  }
  if (board.isCheck()) checkFx("장군!");
  if (!suppressAI && !isMyTurn()) engineMove();
}

async function engineMove() {
  if (aiThinking || !engineReady) return;
  aiThinking = true;
  updateAll();
  await sleep(350); // 살짝 뜸 들여 '생각하는 느낌'
  if (!gameActive) { aiThinking = false; return; }
  engine.setSkill(rank().skill);
  const { bestmove } = await engine.analyze(board.fen(), { movetime: rank().movetime });
  aiThinking = false;
  if (!gameActive) return; // 재시작/이탈로 무효화됨
  if (bestmove) {
    board.pushMove(bestmove, { force: true }); // AI 수는 반복수 예외(멈춤 방지) → onMove 로 이어짐
  } else {
    updateAll();
    setTimeout(endGame, 300);
  }
}

// ---- 무르기 (내 수 + AI 응수 되돌리기) ----
function canUndo() {
  return gameActive && !aiThinking && isMyTurn()
    && board.getState().moves.length > 0;
}
function requestUndo() {
  if (!canUndo()) return;
  suppressAI = true;
  let guard = 0;
  // 내 차례가 될 때까지 되돌린다(보통 AI 응수 + 내 수 = 2번).
  do { board.undo(); guard++; }
  while (board.getState().moves.length > 0 && !isMyTurn() && guard < 4);
  suppressAI = false;
  updateAll();
  if (!isMyTurn()) engineMove(); // 내가 후수인데 맨 앞까지 되돌린 경우 AI가 다시 선수
}

function resign() {
  if (!gameActive || aiThinking) return;
  if (!confirm("항복할까요? 이 판은 패배로 기록돼요.")) return;
  gameActive = false;
  applyRankChange("lose");
  showWinOverlay("lose");
}

// ---- 대국 종료 · 급수 변동 ----
function endGame() {
  if (!gameActive) return;
  gameActive = false;
  const r = board.result(); // 1-0=楚 승, 0-1=漢 승, 1/2-1/2=무
  let outcome;
  if (r === "1/2-1/2") outcome = "draw";
  else outcome = ((r === "1-0") === mySideW) ? "win" : "lose";
  applyRankChange(outcome);
  showWinOverlay(outcome);
}

let lastChange = { outcome: "draw", prev: 0, now: 0 };
function applyRankChange(outcome) {
  const prev = rankIdx;
  if (outcome === "win") {
    rankIdx = clampRank(rankIdx + 1);
    wins += 1; saveInt(STORE_WINS, wins);
    if (rankIdx > bestIdx) { bestIdx = rankIdx; saveInt(STORE_BEST, bestIdx); }
  } else if (outcome === "lose") {
    rankIdx = clampRank(rankIdx - 1);
  }
  saveInt(STORE_RANK, rankIdx);
  lastChange = { outcome, prev, now: rankIdx };
  renderRankCard();
}

function showWinOverlay(outcome) {
  const { prev, now } = lastChange;
  const emoji = $("win-emoji"), title = $("win-title"), sub = $("win-sub");
  const changed = now !== prev;
  if (outcome === "win") {
    emoji.textContent = "🎉";
    title.textContent = "이겼어요!";
    title.className = "win-title cho";
    sub.textContent = changed
      ? `급수 UP!  ${RANKS[prev].name} → ${RANKS[now].name}`
      : `${RANKS[now].name} 유지 — 이미 최고 급수예요! 🏆`;
  } else if (outcome === "lose") {
    emoji.textContent = "😅";
    title.textContent = "아쉽게 졌어요";
    title.className = "win-title han";
    sub.textContent = changed
      ? `급수 DOWN  ${RANKS[prev].name} → ${RANKS[now].name} · 다시 도전!`
      : `${RANKS[now].name} 유지 — 다음엔 이길 수 있어요!`;
  } else {
    emoji.textContent = "🤝";
    title.textContent = "비겼어요";
    title.className = "win-title";
    sub.textContent = `${RANKS[now].name} 그대로 — 막상막하였어요!`;
  }
  $("win-overlay").classList.remove("hidden");
}

// ---- 화면 갱신 ----
function updateAll() {
  updateTurnBanner();
  updateCaptures();
  updateControls();
}

function updateControls() {
  $("undo-btn").disabled = !canUndo();
  $("restart-btn").disabled = aiThinking;
  $("resign-btn").disabled = !gameActive || aiThinking;
}

function updateTurnBanner() {
  const el = $("turn-banner");
  if (board.isGameOver()) { el.textContent = "대국 종료"; el.className = "turn-banner over"; return; }
  if (aiThinking) {
    el.textContent = "AI 생각 중… 🤖";
    el.className = "turn-banner " + aiKey();
    return;
  }
  const cho = board.turn();
  const check = board.isCheck() ? " · 장군!" : "";
  el.textContent = (isMyTurn() ? "내 차례" : "AI 차례") + check;
  el.className = "turn-banner " + (cho ? "cho" : "han") + (board.isCheck() ? " check" : "");
}

// 현재 판을 세어 각 편이 잡은 상대 말과 점수 계산 (together.js 와 동일)
function countPieces(fen) {
  const counts = {};
  for (const ch of fen.split(" ")[0]) {
    if (/[a-zA-Z]/.test(ch)) counts[ch] = (counts[ch] || 0) + 1;
  }
  return counts;
}
function capturedBy(side, counts) {
  const enemyIsUpper = side === "han";
  const items = [];
  let score = 0;
  for (const T of ["R", "C", "N", "B", "A", "P"]) {
    const letter = enemyIsUpper ? T : T.toLowerCase();
    const gone = START[T] - (counts[letter] || 0);
    for (let i = 0; i < gone; i++) { items.push({ T, value: VALUE[T] }); score += VALUE[T]; }
  }
  items.sort((a, b) => b.value - a.value);
  return { items, score };
}
function sideName(side) {
  const isMe = side === myKey();
  return isMe ? "나" : `AI · ${rank().name}`;
}
function updateCaptures() {
  const counts = countPieces(board.fen());
  const topSide = board.flipped ? "cho" : "han";
  const botSide = board.flipped ? "han" : "cho";
  fillPinfo($("pinfo-top"), topSide, counts);
  fillPinfo($("pinfo-bottom"), botSide, counts);
}
function fillPinfo(el, side, counts) {
  el.className = "pinfo " + side;
  const enemy = side === "cho" ? "han" : "cho";
  const { items, score } = capturedBy(side, counts);
  el.querySelector(".pinfo-name").textContent = sideName(side);
  el.querySelector(".pinfo-score").textContent = score;
  el.querySelector(".pinfo-captured").innerHTML = items.length
    ? items.map((it) => `<span class="cap ${enemy}">${GLYPH[enemy][it.T]}</span>`).join("")
    : '<span class="cap-empty">잡은 말 없음</span>';
}

// ---- 이펙트 / 토스트 (together.js 와 동일) ----
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
  $("start-btn").textContent = "오류: " + (e.message || e);
  console.error(e);
});
