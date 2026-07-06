// 둘이서 대국 — 한 화면에서 두 사람이 번갈아 두는 모드 (엔진 없이 board.js 재사용)
import { JanggiBoard } from "./board.js";

const $ = (id) => document.getElementById(id);

// 잡은 말 표시용 글자 (board.js 의 GLYPH 와 동일 규칙)
const GLYPH = {
  cho: { R: "車", C: "包", N: "馬", B: "象", A: "士", P: "卒", K: "楚" },
  han: { R: "車", C: "包", N: "馬", B: "象", A: "士", P: "兵", K: "漢" },
};
// 장기 점수(기물 가치) — 장(K)은 잡히면 대국 종료라 0
const VALUE = { R: 13, C: 7, N: 5, B: 3, A: 3, P: 2, K: 0 };
// 한 진영의 처음 기물 수 (장1·차2·포2·마2·상2·사2·졸5)
const START = { K: 1, R: 2, C: 2, N: 2, B: 2, A: 2, P: 5 };

let board;
const names = { cho: "파란편", han: "빨간편" };

async function boot() {
  board = new JanggiBoard($("board"));
  board.onMove = onMove;
  board.onBlocked = toast;
  await board.init();
  board.setMySide("none"); // 어느 편도 굵게 강조하지 않음(중립)

  $("start-btn").disabled = false;
  $("start-btn").textContent = "대국 시작 ▶";
  bindUI();
}

function bindUI() {
  $("start-btn").onclick = startGame;
  $("win-again").onclick = startGame;
  $("undo-btn").onclick = () => board.undo();
  $("pass-btn").onclick = () => {
    if (!board.passMove()) toast("지금은 쉴 수 없어요 (장군일 땐 피해야 해요)");
  };
  $("flip-btn").onclick = () => { board.flip(); updateAll(); };
  $("restart-btn").onclick = () => {
    if (confirm("대국을 처음부터 다시 시작할까요?")) startGame();
  };
}

function startGame() {
  names.cho = ($("name-cho").value || "").trim() || "파란편";
  names.han = ($("name-han").value || "").trim() || "빨간편";
  const choKey = $("cho-setup").value;
  const hanKey = $("han-setup").value;
  board.newGame(choKey, hanKey, "w"); // 楚 초를 아래에
  board.setMySide("none");
  $("setup").classList.add("hidden");
  $("game").classList.remove("hidden");
  $("win-overlay").classList.add("hidden");
  updateAll();
}

// 매 수마다 호출
function onMove() {
  updateAll();
  if (board.isCheck() && !board.isGameOver()) checkFx("장군!");
  if (board.isGameOver()) {
    if (board.isCheck()) checkFx("외통!");
    setTimeout(showWinner, 700);
  }
}

function updateAll() {
  updateTurnBanner();
  updateCaptures();
}

function updateTurnBanner() {
  const el = $("turn-banner");
  if (board.isGameOver()) { el.textContent = "대국 종료"; el.className = "turn-banner over"; return; }
  const cho = board.turn(); // true = 楚 초 차례
  const side = cho ? "cho" : "han";
  el.textContent = `${names[side]} 차례` + (board.isCheck() ? " · 장군!" : "");
  el.className = "turn-banner " + side + (board.isCheck() ? " check" : "");
}

// 현재 판을 세어 각 편이 잡은 상대 말과 점수 계산
function countPieces(fen) {
  const counts = {};
  for (const ch of fen.split(" ")[0]) {
    if (/[a-zA-Z]/.test(ch)) counts[ch] = (counts[ch] || 0) + 1;
  }
  return counts;
}
// side='cho'|'han' 이 잡은 상대 말 목록과 점수
function capturedBy(side, counts) {
  const enemyIsUpper = side === "han"; // 漢(빨강)이 잡은 것 = 사라진 楚(대문자)
  const items = [];
  let score = 0;
  for (const T of ["R", "C", "N", "B", "A", "P"]) {
    const letter = enemyIsUpper ? T : T.toLowerCase();
    const gone = START[T] - (counts[letter] || 0);
    for (let i = 0; i < gone; i++) {
      items.push({ T, value: VALUE[T] });
      score += VALUE[T];
    }
  }
  items.sort((a, b) => b.value - a.value);
  return { items, score };
}

function updateCaptures() {
  const counts = countPieces(board.fen());
  // 판이 뒤집혔으면 위=楚, 아래=漢
  const topSide = board.flipped ? "cho" : "han";
  const botSide = board.flipped ? "han" : "cho";
  fillPinfo($("pinfo-top"), topSide, counts);
  fillPinfo($("pinfo-bottom"), botSide, counts);
}

function fillPinfo(el, side, counts) {
  el.className = "pinfo " + side;
  // 이 편이 잡은 상대 말(= 상대 진영 글자)을 상대 색으로 표시
  const enemy = side === "cho" ? "han" : "cho";
  const { items, score } = capturedBy(side, counts);
  el.querySelector(".pinfo-name").textContent = names[side];
  el.querySelector(".pinfo-score").textContent = score;
  el.querySelector(".pinfo-captured").innerHTML = items.length
    ? items.map((it) => `<span class="cap ${enemy}">${GLYPH[enemy][it.T]}</span>`).join("")
    : '<span class="cap-empty">잡은 말 없음</span>';
}

function showWinner() {
  const r = board.result(); // "1-0"=楚 승, "0-1"=漢 승, "1/2-1/2"=무승부
  const overlay = $("win-overlay");
  const title = $("win-title");
  const sub = $("win-sub");
  if (r === "1/2-1/2") {
    title.textContent = "무승부!";
    title.className = "win-title";
    sub.textContent = "막상막하였어요. 다시 한 판?";
  } else {
    const winner = r === "1-0" ? "cho" : "han";
    title.textContent = `${names[winner]} 승리! 🎉`;
    title.className = "win-title " + winner;
    sub.textContent = winner === "cho" ? "楚 초가 이겼어요" : "漢 한이 이겼어요";
  }
  overlay.classList.remove("hidden");
}

// ---- 이펙트 / 토스트 (advisor 와 동일 UX) ----
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
