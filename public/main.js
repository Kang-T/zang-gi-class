import { JanggiEngine } from "./engine.js";
import { JanggiBoard, pieceName } from "./board.js";

const $ = (id) => document.getElementById(id);

// 모두 '최선수'를 둠. 생각 시간이 길수록 더 깊이 보고 강해진다.
const STRENGTH = {
  fast: { label: "빠름", movetime: 800 },
  normal: { label: "보통", movetime: 1800 },
  precise: { label: "정밀", movetime: 3500 },
  max: { label: "최강", movetime: 7000 },
};

const engine = new JanggiEngine();
let board;
let analyzing = false;
let currentBest = null; // 현재 추천 최선수(uci)

function updatePlayBestBtn() {
  const btn = $("play-best-btn");
  if (btn) btn.disabled = !currentBest || analyzing || board.reviewMode || board.editMode;
}
function playBest() {
  if (currentBest && !analyzing) board.pushMove(currentBest);
}
// "추천해 줄 편" 선택 → 내 진영 말 굵게 표시
function applyMySide() {
  const v = $("myside").value;
  const s = v === "w" ? "cho" : v === "b" ? "han" : (board.flipped ? "han" : "cho");
  board.setMySide(s);
}

async function boot() {
  board = new JanggiBoard($("board"));
  board.onMove = onPositionChanged;
  board.onReview = updateReviewInfo;
  board.onBlocked = toast;
  await board.init();
  window.JG = { board, engine }; // 디버그/검증용
  applyMySide();
  updateTurn();

  // 이어서 할 대국이 있으면 랜딩에 버튼 표시
  const cur = loadCurrentSave();
  if (cur && cur.moves && cur.moves.length) {
    $("landing-continue").textContent = `이어서 하기 (${cur.moves.length}수 · ${fmtTs(cur.ts)})`;
    $("landing-continue").classList.remove("hidden");
  }

  await engine.init((s) => {
    $("engine-status").textContent = s;
    const ls = $("landing-status"); if (ls) ls.textContent = s;
  });
  onPositionChanged(); // 시작 위치 자동 분석(자동 켜져있으면)
  bindUI();
}

function currentStrength() {
  return STRENGTH[$("strength").value] || STRENGTH.normal;
}

// 지금 둘 차례가 내 편인지
function isMyTurn() {
  return ($("myside").value === "w") === board.turn(); // board.turn() true=초
}
// 자동분석 여부. 내 차례는 항상, 상대 차례는 '상대 예상 수' 옵션에 따라.
function shouldAutoSuggest() {
  if (!$("auto").checked) return false;
  if (studyBusy || board.studyMode || board.reviewMode) return false;
  if (board.isGameOver()) return false;
  if (isMyTurn()) return true;
  return $("opp-analyze").checked; // 상대 차례 분석
}

async function onPositionChanged() {
  board.setHint(null);
  $("suggest-move").textContent = "—";
  $("suggest-detail").textContent = "";
  $("pv").textContent = "";
  $("reply").textContent = "";
  $("win-text").textContent = "…";
  $("suggest-title").textContent = "다음 추천수";
  document.querySelector(".card.suggest").classList.remove("mate");
  currentBest = null; updatePlayBestBtn();
  updateTurn();
  maybeOfferReview();
  saveCurrent(); // 매 수마다 자동 저장
  // 장군/외통 이펙트
  if (!board.reviewMode && board.isCheck()) {
    checkFx(board.isGameOver() ? "외통!!" : "장군!");
  }
  if (practice.on) { await practiceTick(); return; }
  if (shouldAutoSuggest()) await runAnalyze();
}

// ---- 엔진과 연습 대국 ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PRAC_LEVELS = {
  easy: { skill: 3, time: 500 },
  mid: { skill: 8, time: 800 },
  hard: { skill: 14, time: 1300 },
  max: { skill: 20, time: 2500 },
};
const practice = { on: false, mySide: "w", oppSkill: 8, oppTime: 800, hints: false };
let enginePlaying = false;

function isEngineTurn() {
  const userCho = practice.mySide === "w";
  return board.turn() !== userCho; // board.turn() true = 초
}
async function practiceTick() {
  if (board.isGameOver()) { practiceGameOver(); return; }
  if (isEngineTurn()) { await engineMove(); return; }
  // 내 차례
  $("suggest-move").textContent = "내 차례 — 두세요";
  $("suggest-detail").textContent = practice.hints ? "" : "(연습 모드: 추천 숨김)";
  if (practice.hints) await runAnalyze();
}
async function engineMove() {
  if (enginePlaying || !engine.ready) return;
  enginePlaying = true;
  $("suggest-move").textContent = "상대(엔진) 생각 중…";
  $("suggest-detail").textContent = "";
  await sleep(300);
  engine.setSkill(practice.oppSkill);
  const { bestmove } = await engine.analyze(board.fen(), { movetime: practice.oppTime });
  engine.setSkill(20); // 분석/힌트는 다시 최선으로
  enginePlaying = false;
  if (!practice.on) return;
  if (bestmove) board.pushMove(bestmove, { force: true }); // 엔진 수는 반복수 차단 예외(멈춤 방지)
  else practiceGameOver();
}
function practiceResultText(r) {
  if (r === "1/2-1/2") return "무승부 — ‘대국 공부’로 복기해보세요";
  const userWon = (r === "1-0") === (practice.mySide === "w");
  return (userWon ? "🎉 승리! " : "아쉽게 패배… ") + "‘대국 공부’로 복기해보세요";
}
function practiceGameOver() {
  $("suggest-move").textContent = "연습 대국 종료";
  $("suggest-detail").textContent = practiceResultText(board.result());
  maybeOfferReview();
}
function startPractice() {
  practice.mySide = $("prac-side").value;
  const lv = PRAC_LEVELS[$("prac-level").value] || PRAC_LEVELS.mid;
  practice.oppSkill = lv.skill; practice.oppTime = lv.time;
  practice.hints = $("prac-hints").checked;
  practice.on = true;
  $("prac-banner").classList.remove("hidden");
  $("myside").value = practice.mySide; applyMySide();
  board.newGame($("cho-setup").value, $("han-setup").value, practice.mySide);
  closeSetup(); hideLanding();
}
function stopPractice() {
  practice.on = false;
  enginePlaying = false;
  $("prac-banner").classList.add("hidden");
  onPositionChanged();
}

async function runAnalyze() {
  if (analyzing || !engine.ready) return;
  if (board.isGameOver()) { showGameOver(); return; }
  analyzing = true;
  currentBest = null; updatePlayBestBtn();
  $("analyze-btn").disabled = true;
  $("suggest-move").textContent = "생각 중…";
  $("suggest-detail").textContent = "";
  const p = currentStrength();
  const fen = board.fen();
  const { bestmove, info } = await engine.analyze(fen, { movetime: p.movetime });
  analyzing = false;
  $("analyze-btn").disabled = false;
  if (!bestmove) { $("suggest-move").textContent = "둘 수 없음"; return; }
  const opp = !isMyTurn(); // 상대 차례면 상대 시점(주황 화살표)
  const mate = !!(info && info.mate != null && info.mate > 0); // 둘 차례에게 외통 수순 존재
  board.setHints(info && info.pv && info.pv.length ? info.pv : [bestmove], opp, mate && !opp);
  currentBest = opp ? null : bestmove; updatePlayBestBtn(); // 상대 수는 '추천대로 두기' 비활성
  showSuggestion(bestmove, info, fen, opp);
}

function showSuggestion(uci, info, fen, opp) {
  const mv = board.parseMove(uci);
  const grid = board.gridFromFen(fen);
  const fromPiece = grid[10 - mv.fr][mv.fc];
  const toPiece = grid[10 - mv.tr][mv.tc];
  const name = fromPiece ? pieceName(fromPiece) : "";
  const cap = toPiece ? ` · ${pieceName(toPiece)} 잡음` : "";
  // 외통 감지: mate>0 = 지금 둘 차례가 N수 안에 외통 가능
  const mateN = info && info.mate != null && info.mate > 0 ? info.mate : 0;
  const card = document.querySelector(".card.suggest");
  card.classList.toggle("mate", !!mateN);
  $("suggest-title").textContent = opp
    ? (mateN ? "⚠ 상대에게 외통 위협!" : "상대 예상 수")
    : (mateN ? `🔥 외통 찬스 — ${mateN}수면 끝!` : "다음 추천수");
  $("suggest-move").textContent =
    mv.from === mv.to ? "한수쉼(패스)" : `${name}  ${mv.from} → ${mv.to}`;

  // 다음 수(PV 2번째). 내 차례면 상대 응수, 상대 차례면 그에 대한 내 응수.
  let replyTxt = "";
  if (info && info.pv && info.pv.length >= 2) {
    const rmv = board.parseMove(info.pv[1]);
    if (rmv) {
      const rp = grid[10 - rmv.fr][rmv.fc];
      const label = opp ? "이에 대한 내 응수" : "상대 예상 응수";
      replyTxt = rmv.from === rmv.to
        ? `${label}: 한수쉼`
        : `${label}: ${rp ? pieceName(rp) : ""} ${rmv.from}→${rmv.to}`;
    }
  }
  $("reply").textContent = replyTxt;

  let evalTxt = "";
  if (info) {
    if (info.mate != null) {
      evalTxt = info.mate > 0 ? `외통 ${info.mate}수 앞` : `${-info.mate}수 뒤 외통패`;
    } else if (info.scoreCp != null) {
      const pts = (info.scoreCp / 100).toFixed(1);
      const who = info.scoreCp >= 0 ? "둘 편 유리" : "둘 편 불리";
      evalTxt = `평가 ${info.scoreCp >= 0 ? "+" : ""}${pts} (${who}) · 깊이 ${info.depth || "-"}`;
    }
  }
  $("suggest-detail").textContent = evalTxt + cap;
  updateWin(info);

  // 변화수(다음 몇 수) 표시
  if (info && info.pv && info.pv.length) {
    $("pv").textContent = "예상 진행: " + info.pv.slice(0, 8).join("  ");
  } else $("pv").textContent = "";
}

// 평가점수 → 승률(%) 변환 후 막대/숫자 갱신
function winProb(cp) { return 1 / (1 + Math.pow(10, -cp / 500)); }
function updateWin(info) {
  if (!info) return;
  const turnIsCho = board.turn();
  let choWin;
  if (info.mate != null) {
    const stmWins = info.mate > 0;          // 둘 차례가 이기는 외통
    choWin = (stmWins === turnIsCho) ? 0.995 : 0.005;
  } else if (info.scoreCp != null) {
    const choCp = turnIsCho ? info.scoreCp : -info.scoreCp;
    choWin = winProb(choCp);
  } else return;
  const cho = Math.round(choWin * 100), han = 100 - cho;
  $("win-cho").style.width = cho + "%";
  $("win-han").style.width = han + "%";
  const my = $("myside").value;
  const mine = my === "w" ? `내(초) ${cho}%` : my === "b" ? `내(한) ${han}%` : null;
  $("win-text").textContent = mine
    ? `${mine}  ·  楚 ${cho} : ${han} 漢`
    : `楚 초 ${cho}%  ·  漢 한 ${han}%`;
}

function showGameOver() {
  const r = board.result();
  $("suggest-move").textContent = "대국 종료";
  $("suggest-detail").textContent = "결과: " + r;
}

function updateTurn() {
  const cho = board.turn(); // true = 초(楚, 대문자)
  $("turn-ind").textContent = cho ? "楚 초 차례" : "漢 한 차례";
  $("turn-ind").className = "turn " + (cho ? "cho" : "han");
  if (board.isCheck()) $("turn-ind").textContent += " · 장군!";
}

// ---- 저장 (브라우저 localStorage) ----
const STORE_CUR = "janggi.current";   // 진행 중 대국(자동 저장)
const STORE_GAMES = "janggi.games";   // 보관한 대국 목록
const MAX_SAVED = 30;

function saveCurrent() {
  if (!board || board.reviewMode || board.editMode) return;
  // 랜딩 화면이 떠 있는 동안(시작 전)의 초기화 저장이 기존 대국을 덮어쓰지 않게
  if (!$("landing").classList.contains("hidden")) return;
  try {
    const st = board.getState();
    st.myside = $("myside").value;
    st.ts = Date.now();
    localStorage.setItem(STORE_CUR, JSON.stringify(st));
  } catch (e) { /* 저장 불가(시크릿 모드 등)여도 앱은 동작 */ }
}
function loadCurrentSave() {
  try { return JSON.parse(localStorage.getItem(STORE_CUR) || "null"); }
  catch (e) { return null; }
}
function restoreCurrent() {
  const st = loadCurrentSave();
  if (!st) return false;
  const ok = board.loadState(st);
  if (ok && st.myside) { $("myside").value = st.myside; applyMySide(); }
  return ok;
}
function fmtTs(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function loadGames() {
  try { return JSON.parse(localStorage.getItem(STORE_GAMES) || "[]"); }
  catch (e) { return []; }
}
function saveGameToList() {
  const st = board.getState();
  if (!st.moves.length) { alert("저장할 수가 없어요 — 아직 둔 수가 없습니다."); return; }
  st.myside = $("myside").value;
  st.ts = Date.now();
  st.id = "g" + st.ts;
  const games = loadGames();
  games.unshift(st);
  try { localStorage.setItem(STORE_GAMES, JSON.stringify(games.slice(0, MAX_SAVED))); }
  catch (e) { alert("저장 공간이 부족해요."); return; }
  const btn = $("save-btn");
  btn.textContent = "저장됨 ✓";
  setTimeout(() => (btn.textContent = "대국 저장"), 1500);
}
function renderSavedList() {
  const el = $("saved-list");
  const games = loadGames();
  if (!games.length) { el.innerHTML = '<div class="kp-empty">저장된 대국이 없습니다</div>'; return; }
  el.innerHTML = games.map((g) =>
    `<div class="saved-item">
       <span class="saved-name">${fmtTs(g.ts)} · ${g.moves.length}수</span>
       <button data-load="${g.id}">불러오기</button>
       <button data-del="${g.id}" class="saved-del">삭제</button>
     </div>`).join("");
  el.querySelectorAll("[data-load]").forEach((b) => (b.onclick = () => {
    const g = loadGames().find((x) => x.id === b.dataset.load);
    if (!g) return;
    practice.on = false; $("prac-banner").classList.add("hidden");
    board.loadState(g);
    if (g.myside) { $("myside").value = g.myside; applyMySide(); }
    closeSetup(); hideLanding();
  }));
  el.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => {
    localStorage.setItem(STORE_GAMES, JSON.stringify(loadGames().filter((x) => x.id !== b.dataset.del)));
    renderSavedList();
  }));
}

// ---- 이펙트 / 토스트 ----
let fxTimer = null, toastTimer = null;
function checkFx(text) {
  const el = $("check-fx");
  el.textContent = text;
  el.classList.remove("show");
  void el.offsetWidth; // 애니메이션 재시작
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

// ---- 랜딩 / 설정 모달 ----
function hideLanding() { $("landing").classList.add("hidden"); }
function openSetup() { renderSavedList(); $("setup-modal").classList.remove("hidden"); }
function closeSetup() { $("setup-modal").classList.add("hidden"); }

function newGame() {
  const cho = $("cho-setup").value;
  const han = $("han-setup").value;
  const my = $("myside-setup").value; // w=초, b=한
  practice.on = false; $("prac-banner").classList.add("hidden"); // 일반 대국이면 연습 해제
  $("myside").value = my;             // 추천 대상도 내 진영으로
  board.newGame(cho, han, my);        // onMove → onPositionChanged 자동 호출
  closeSetup(); hideLanding();
}

// ---- 편집 모드 ----
function enterEdit() {
  board.enterEdit();
  $("edit-panel").classList.remove("hidden");
  $("play-panel").classList.add("hidden");
  $("suggest-move").textContent = "위치 편집 중";
  $("suggest-detail").textContent = "기물을 고른 뒤 판을 클릭하세요";
  board.setEditPiece("x");
  highlightPalette();
}
function applyEdit() {
  const t = document.querySelector('input[name="edit-turn"]:checked').value;
  board.setEditTurn(t);
  const res = board.applyEdit();
  if (!res.ok) { alert("올바르지 않은 배치입니다(장군 1개씩 필요 등). 다시 확인하세요."); return; }
  $("edit-panel").classList.add("hidden");
  $("play-panel").classList.remove("hidden");
  onPositionChanged();
}
function cancelEdit() {
  board.cancelEdit();
  $("edit-panel").classList.add("hidden");
  $("play-panel").classList.remove("hidden");
  onPositionChanged();
}
function highlightPalette() {
  document.querySelectorAll(".pal").forEach((b) =>
    b.classList.toggle("active", b.dataset.p === board.editPiece));
}

// ---- 복기 / 대국 공부 ----
const STUDY_MT = 500;   // 위치당 분석 시간(ms)
let studyKeys = [];
let studyBusy = false;
let autoTimer = null;

function maybeOfferReview() {
  const can = board.canReview();
  $("review-btn").disabled = !can;
  $("study-btn").disabled = !can;
}
function showStudyUI(on) {
  $("study-controls").classList.toggle("hidden", !on);
  $("study-badge").classList.add("hidden");
  $("study-progress").classList.add("hidden");
  if (!on) $("keypoints").innerHTML = "";
}
function enterReview() {
  board.enterReview();
  $("play-panel").classList.add("hidden");
  $("review-panel").classList.remove("hidden");
  showStudyUI(false);
  board.setHint(null);
  $("suggest-move").textContent = "복기 모드";
  $("suggest-detail").textContent = "◀ ▶ 로 한 수씩 넘겨보세요";
  $("pv").textContent = "";
  updateReviewInfo();
}
function exitReview() {
  stopAuto();
  board.exitReview();
  $("review-panel").classList.add("hidden");
  $("play-panel").classList.remove("hidden");
}

function scoreCp(info) {
  if (!info) return 0;
  if (info.mate != null) return info.mate > 0 ? 100000 : -100000;
  return info.scoreCp != null ? info.scoreCp : 0;
}
function classifyLoss(loss, wasBest) {
  if (wasBest || loss < 0.02) return { label: "최선수", cls: "q-best" };
  if (loss < 0.06) return { label: "좋은 수", cls: "q-good" };
  if (loss < 0.12) return { label: "부정확", cls: "q-inacc" };
  if (loss < 0.22) return { label: "실수", cls: "q-mistake" };
  return { label: "대실수", cls: "q-blunder" };
}
function fmtMove(grid, uci) {
  const mv = board.parseMove(uci);
  if (mv.from === mv.to) return "한수쉼";
  const p = grid[10 - mv.fr][mv.fc];
  return (p ? pieceName(p) : "") + " " + mv.from + "→" + mv.to;
}

// 전체 대국 분석 후 공부 모드 진입
async function startStudy() {
  if (!engine.ready || studyBusy) return;
  const game = board.collectGame();
  const N = game.moves.length;
  if (N === 0) { alert("둔 수가 없어 분석할 게 없어요. 먼저 대국을 두세요."); return; }
  studyBusy = true;
  engine.stop(); // 진행 중인 자동추천 탐색이 있으면 빨리 끝내 큐를 비움
  $("play-panel").classList.add("hidden");
  $("review-panel").classList.remove("hidden");
  showStudyUI(true);
  board.setHint(null);
  $("suggest-move").textContent = "대국 분석 중…";
  $("suggest-detail").textContent = "엔진이 한 수씩 평가하고 있어요";
  $("pv").textContent = "";
  $("study-progress").classList.remove("hidden");
  $("sp-tot").textContent = N + 1;

  const recs = [];
  for (let k = 0; k <= N; k++) {
    $("sp-cur").textContent = k + 1;
    $("sp-bar").style.width = Math.round(((k + 1) / (N + 1)) * 100) + "%";
    const { bestmove, info } = await engine.analyze(game.fens[k], { movetime: STUDY_MT });
    recs.push({ cp: scoreCp(info), best: bestmove, turnCho: game.turns[k] });
  }
  studyKeys = [];
  for (let k = 0; k < N; k++) {
    const grid = board.gridFromFen(game.fens[k]);
    const winBest = winProb(recs[k].cp);
    const winAfter = 1 - winProb(recs[k + 1].cp);
    const loss = Math.max(0, winBest - winAfter);
    recs[k].win = winBest;
    recs[k].move = game.moves[k];
    recs[k].moveStr = fmtMove(grid, game.moves[k]);
    recs[k].bestStr = recs[k].best ? fmtMove(grid, recs[k].best) : "";
    recs[k].q = classifyLoss(loss, game.moves[k] === recs[k].best);
    recs[k].isKey = loss >= 0.12; // 실수 이상이면 핵심 포인트(승부처)
    if (recs[k].isKey) studyKeys.push(k);
  }
  recs[N].win = winProb(recs[N].cp);

  studyBusy = false;
  $("study-progress").classList.add("hidden");
  $("suggest-move").textContent = "대국 공부";
  $("suggest-detail").textContent = "초록 화살표 = 그 자리 최선수 / 보라 = 실제 둔 수";
  buildKeyList(recs);
  board.enterStudy(recs); // → updateReviewInfo
}

function buildKeyList(recs) {
  const el = $("keypoints");
  if (!studyKeys.length) {
    el.innerHTML = '<div class="kp-empty">큰 실수 없이 깔끔한 대국이었어요 👍</div>';
    return;
  }
  el.innerHTML = '<div class="kp-title">핵심 포인트 (눌러서 이동)</div>' +
    studyKeys.map((k) => {
      const r = recs[k];
      const who = r.turnCho ? "초" : "한";
      return `<button class="kp-item ${r.q.cls}" data-k="${k}">${k + 1}수 · ${who} ${r.q.label} — ${r.moveStr}</button>`;
    }).join("");
  el.querySelectorAll(".kp-item").forEach((b) =>
    (b.onclick = () => { stopAuto(); board.reviewGoto(parseInt(b.dataset.k)); }));
}

function updateReviewInfo() {
  const total = board.reviewMoves.length;
  const pos = board.reviewPos;
  $("review-info").textContent = `${pos} / ${total} 수`;
  const last = pos > 0 ? board.reviewMoves[pos - 1] : null;
  $("review-last").textContent = last ? `직전 수: ${last}` : "시작 위치";
  updateTurn();
  if (board.studyMode && board.analysis) updateStudyInfo();
}
function updateStudyInfo() {
  const A = board.analysis, k = board.reviewPos;
  const rec = A[k];
  if (rec && rec.win != null) {
    const cho = Math.round((rec.turnCho ? rec.win : 1 - rec.win) * 100);
    $("win-cho").style.width = cho + "%";
    $("win-han").style.width = (100 - cho) + "%";
    $("win-text").textContent = `楚 초 ${cho}%  ·  漢 한 ${100 - cho}%`;
  }
  const badge = $("study-badge");
  if (k >= 1) {
    const r = A[k - 1];
    const who = r.turnCho ? "楚 초" : "漢 한";
    const better = (r.move !== r.best && r.bestStr) ? ` · 더 나았던 수: ${r.bestStr}` : "";
    badge.className = "study-badge " + r.q.cls;
    badge.innerHTML = `<b>${k}수 ${who}: ${r.moveStr}</b> — ${r.q.label}${r.isKey ? " ⚑핵심" : ""}${better}`;
  } else {
    badge.className = "study-badge";
    badge.textContent = "시작 위치 — ▶ 로 넘기거나 ‘자동 재생’을 눌러보세요";
  }
  badge.classList.remove("hidden");
}

function nextKeyPoint() {
  stopAuto();
  if (!studyKeys.length) return;
  const cur = board.reviewPos;
  const nxt = studyKeys.find((k) => k > cur);
  board.reviewGoto(nxt != null ? nxt : studyKeys[0]);
}

function stopAuto() {
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  const b = $("study-auto"); if (b) b.textContent = "▶ 자동 재생";
}
function toggleAuto() {
  if (autoTimer) { stopAuto(); return; }
  if (board.reviewPos >= board.reviewMoves.length) board.reviewFirst();
  $("study-auto").textContent = "⏸ 일시정지";
  autoStep();
}
async function autoStep() {
  if (board.reviewPos >= board.reviewMoves.length) { stopAuto(); return; }
  await board.reviewForward(true);
  const r = board.analysis && board.analysis[board.reviewPos - 1];
  autoTimer = setTimeout(autoStep, r && r.isKey ? 3200 : 1300);
}

function bindUI() {
  $("analyze-btn").onclick = runAnalyze;
  $("play-best-btn").onclick = playBest;
  $("auto").onchange = () => { if (shouldAutoSuggest()) runAnalyze(); else board.setHint(null); };
  $("myside").onchange = () => { applyMySide(); onPositionChanged(); };
  $("strength").onchange = () => { if (shouldAutoSuggest()) runAnalyze(); };
  $("newgame-btn").onclick = newGame;
  $("prac-start").onclick = startPractice;
  $("prac-stop").onclick = stopPractice;
  $("landing-start").onclick = openSetup;
  $("landing-continue").onclick = () => { if (restoreCurrent()) hideLanding(); };
  $("save-btn").onclick = saveGameToList;
  $("newgame-open").onclick = openSetup;
  $("modal-close").onclick = closeSetup;
  $("modal-backdrop").onclick = closeSetup;
  $("pass-btn").onclick = () => board.passMove();
  $("undo-btn").onclick = () => board.undo();
  $("reset-btn").onclick = () => board.reset();
  $("flip-btn").onclick = () => { board.flip(); applyMySide(); };
  $("edit-btn").onclick = enterEdit;
  $("apply-edit").onclick = applyEdit;
  $("cancel-edit").onclick = cancelEdit;
  $("showline").onchange = (e) => { board.showLine = e.target.checked; board.render(); };
  $("anim").onchange = (e) => { board.animate = e.target.checked; };
  $("review-btn").onclick = enterReview;
  $("study-btn").onclick = startStudy;
  $("review-exit").onclick = exitReview;
  $("rv-first").onclick = () => { stopAuto(); board.reviewFirst(); };
  $("rv-prev").onclick = () => { stopAuto(); board.reviewPrev(); };
  $("rv-next").onclick = () => { stopAuto(); board.reviewForward(true); };
  $("rv-last").onclick = () => { stopAuto(); board.reviewLast(); };
  $("study-auto").onclick = toggleAuto;
  $("study-keypoint").onclick = nextKeyPoint;
  document.querySelectorAll(".pal").forEach((b) => {
    b.onclick = () => { board.setEditPiece(b.dataset.p); highlightPalette(); };
  });
}

boot().catch((e) => {
  $("engine-status").textContent = "오류: " + (e.message || e);
  console.error(e);
});
