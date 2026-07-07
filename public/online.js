// 온라인 대전 — Supabase Realtime(Broadcast) 로 두 사람이 방 코드로 붙어 실시간 대국.
// board.js 재사용. 수(手)만 채널로 주고받고, DB 테이블은 건드리지 않는다.
// 전송부는 tx.* 로 감싸 두어 나중에 다른 백엔드로 교체하기 쉽게 했다.
import { JanggiBoard } from "./board.js";

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 잡은 말 표시 (together.js 와 동일) ----
const GLYPH = {
  cho: { R: "車", C: "包", N: "馬", B: "象", A: "士", P: "卒", K: "楚" },
  han: { R: "車", C: "包", N: "馬", B: "象", A: "士", P: "兵", K: "漢" },
};
const VALUE = { R: 13, C: 7, N: 5, B: 3, A: 3, P: 2, K: 0 };
const START = { K: 1, R: 2, C: 2, N: 2, B: 2, A: 2, P: 5 };

const CFG = window.SUPABASE_CONFIG || {};
const configured = !!(CFG.url && CFG.anonKey);
const myId = "p" + Math.random().toString(36).slice(2, 8);

// ---- 상태 ----
let board;
let sb = null, channel = null;
let myName = "", isHost = false, code = "";
let mySideCho = true;       // 방장 = 楚 초
let gameActive = false, started = false;
let applyingRemote = false; // 상대 수를 적용 중일 땐 되돌려보내지 않음
let membersCount = 0;
const names = { cho: "楚", han: "漢" };

const myKey = () => (mySideCho ? "cho" : "han");
const isMyTurn = () => board.turn() === mySideCho; // turn() true = 楚 초

// ================= 전송부 (Supabase) =================
const tx = {
  async connect(roomCode, onMsg, onPresence, onLeave) {
    if (!sb) sb = window.supabase.createClient(CFG.url, CFG.anonKey);
    channel = sb.channel("janggi:" + roomCode, {
      config: { broadcast: { self: false }, presence: { key: myId } },
    });
    channel.on("broadcast", { event: "msg" }, ({ payload }) => onMsg(payload));
    channel.on("presence", { event: "sync" }, onPresence);
    channel.on("presence", { event: "leave" }, onLeave);
    await new Promise((resolve, reject) => {
      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ name: myName, host: isHost, id: myId });
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reject(new Error(status));
        }
      });
    });
  },
  send(payload) {
    if (channel) channel.send({ type: "broadcast", event: "msg", payload });
  },
  members() {
    if (!channel) return [];
    return Object.values(channel.presenceState()).flat();
  },
  async close() {
    if (channel && sb) { await sb.removeChannel(channel); channel = null; }
  },
};

// ================= 부팅 =================
async function boot() {
  board = new JanggiBoard($("board"));
  board.onMove = onMove;
  board.onBlocked = toast;
  await board.init();
  board.setMySide("none");

  // 내 차례가 아니거나 대국 중이 아니면 판 클릭 잠금
  $("board").addEventListener("click", (e) => {
    if (!gameActive || board.isGameOver() || !isMyTurn()) e.stopImmediatePropagation();
  }, true);

  if (!configured) {
    $("cfg-warn").classList.remove("hidden");
    $("create-btn").disabled = true;
    $("join-btn").disabled = true;
  }
  bindUI();
}

function bindUI() {
  $("create-btn").onclick = createRoom;
  $("join-btn").onclick = joinRoom;
  $("join-code").oninput = (e) => { e.target.value = e.target.value.toUpperCase(); };
  $("copy-btn").onclick = copyCode;
  $("cancel-btn").onclick = leave;
  $("flip-btn").onclick = () => { board.flip(); updateAll(); };
  $("resign-btn").onclick = resign;
  $("leave-btn").onclick = leave;
  $("leave2-btn").onclick = leave;
  $("rematch-btn").onclick = requestRematch;
}

function nick() { return ($("nick").value || "").trim().slice(0, 8); }
function genCode() {
  const s = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 4; i++) c += s[Math.floor(Math.random() * s.length)];
  return c;
}

// ---- 방 만들기 / 들어가기 ----
async function createRoom() {
  myName = nick() || "방장";
  isHost = true; mySideCho = true;
  code = genCode();
  setConn("방을 여는 중…");
  try {
    await tx.connect(code, onMsg, onPresence, onLeave);
  } catch (e) { setConn("연결 실패: " + e.message); return; }
  $("room-code").textContent = code;
  $("wait-title").textContent = "방을 만들었어요!";
  $("wait-msg").textContent = "친구에게 이 코드를 알려주세요. 친구가 들어오면 시작해요.";
  showScreen("waiting");
}

async function joinRoom() {
  code = ($("join-code").value || "").trim().toUpperCase();
  if (code.length < 4) { setConn("방 코드 4자리를 입력해 주세요."); return; }
  myName = nick() || "도전자";
  isHost = false; mySideCho = false;
  setConn("방에 들어가는 중…");
  try {
    await tx.connect(code, onMsg, onPresence, onLeave);
  } catch (e) { setConn("연결 실패: " + e.message); return; }
  $("room-code").textContent = code;
  $("wait-title").textContent = "방에 들어왔어요!";
  $("wait-msg").textContent = "방장이 시작하기를 기다리는 중…";
  showScreen("waiting");
}

// ---- 접속 상태(presence) ----
function onPresence() {
  const members = tx.members();
  membersCount = members.length;
  const opp = members.find((m) => m.host !== isHost);
  if (opp && opp.name) names[isHost ? "han" : "cho"] = opp.name;
  if (isHost) names.cho = myName;
  // 방장은 상대가 들어오면 대국 시작을 알림
  if (isHost && !started && membersCount >= 2) startAsHost();
}

function onLeave() {
  membersCount = tx.members().length;
  if (membersCount < 2 && (started || gameActive)) {
    gameActive = false; started = false;
    hideOverlays();
    $("left-overlay").classList.remove("hidden");
  }
}

// ---- 대국 시작 ----
function startAsHost() {
  started = true;
  const payload = {
    t: "start",
    choName: myName,
    hanName: names.han,
    choSetup: "마상상마",
    hanSetup: "마상상마",
  };
  tx.send(payload);
  beginGame(payload);
}

function beginGame(p) {
  started = true; gameActive = true;
  names.cho = p.choName || "楚";
  names.han = p.hanName || "漢";
  hideOverlays();
  showScreen("game");
  board.newGame(p.choSetup, p.hanSetup, mySideCho ? "w" : "b"); // → onMove (수 0 → 전송 안 함)
  board.setMySide(myKey());
  updateAll();
}

// ---- 수 처리 ----
function onMove() {
  if (!gameActive) return;
  updateAll();
  if (board.isCheck() && !board.isGameOver()) checkFx("장군!");
  if (board.isGameOver()) {
    if (board.isCheck()) checkFx("외통!");
    setTimeout(() => endGame(null), 700);
    applyingRemote = false;
    return;
  }
  const moves = board.getState().moves;
  if (!applyingRemote && moves.length) {
    tx.send({ t: "move", uci: moves[moves.length - 1] });
  }
  applyingRemote = false; // 이번 수 처리 끝
}

function applyRemoteMove(uci) {
  if (!gameActive) return;
  if (board.animating) { setTimeout(() => applyRemoteMove(uci), 120); return; }
  applyingRemote = true;
  const ok = board.pushMove(uci, { force: true });
  if (!ok) applyingRemote = false; // 적용 실패 시 플래그 복구
}

function onMsg(p) {
  if (!p) return;
  if (p.t === "start") { if (!isHost) beginGame(p); }
  else if (p.t === "move") applyRemoteMove(p.uci);
  else if (p.t === "resign") endGame("opp-resign");
  else if (p.t === "rematch") { if (isHost) doRematch(); }
}

// ---- 종료 / 재대국 ----
function endGame(reason) {
  if (!gameActive && reason === null) return;
  gameActive = false;
  let outcome;
  if (reason === "opp-resign") outcome = "win";
  else if (reason === "i-resign") outcome = "lose";
  else {
    const r = board.result();
    if (r === "1/2-1/2") outcome = "draw";
    else outcome = ((r === "1-0") === mySideCho) ? "win" : "lose";
  }
  showResult(outcome);
}

function resign() {
  if (!gameActive) return;
  if (!confirm("항복할까요? 이 판은 패배로 기록돼요.")) return;
  tx.send({ t: "resign" });
  endGame("i-resign");
}

function requestRematch() {
  tx.send({ t: "rematch" });
  if (isHost) doRematch();
  else { $("rematch-btn").disabled = true; $("win-sub").textContent = "방장에게 다시 하기를 요청했어요…"; }
}
function doRematch() {
  started = false;
  $("rematch-btn").disabled = false;
  if (membersCount >= 2) startAsHost();
}

// ---- 화면 전환 ----
function showScreen(which) {
  $("setup").classList.toggle("hidden", which !== "setup");
  $("waiting").classList.toggle("hidden", which !== "waiting");
  $("game").classList.toggle("hidden", which !== "game");
}
function hideOverlays() {
  $("win-overlay").classList.add("hidden");
  $("left-overlay").classList.add("hidden");
}

function showResult(outcome) {
  const emoji = $("win-emoji"), title = $("win-title"), sub = $("win-sub");
  $("rematch-btn").disabled = false;
  if (outcome === "win") {
    emoji.textContent = "🎉"; title.textContent = "이겼어요!"; title.className = "win-title cho";
    sub.textContent = "멋진 대국이었어요.";
  } else if (outcome === "lose") {
    emoji.textContent = "😅"; title.textContent = "졌어요"; title.className = "win-title han";
    sub.textContent = "다음엔 이길 수 있어요!";
  } else {
    emoji.textContent = "🤝"; title.textContent = "비겼어요"; title.className = "win-title";
    sub.textContent = "막상막하였어요!";
  }
  $("win-overlay").classList.remove("hidden");
}

async function leave() {
  await tx.close();
  location.href = "index.html";
}

function copyCode() {
  const t = $("copy-btn");
  const done = () => { t.textContent = "복사됨 ✓"; setTimeout(() => (t.textContent = "복사"), 1500); };
  if (navigator.clipboard) navigator.clipboard.writeText(code).then(done, done);
  else done();
}
function setConn(msg) { $("conn-status").textContent = msg || ""; }

// ---- 화면 갱신 (잡은 말·차례) ----
function updateAll() { updateTurnBanner(); updateCaptures(); }

function updateTurnBanner() {
  const el = $("turn-banner");
  if (board.isGameOver()) { el.textContent = "대국 종료"; el.className = "turn-banner over"; return; }
  const cho = board.turn();
  const check = board.isCheck() ? " · 장군!" : "";
  el.textContent = (isMyTurn() ? "내 차례" : "상대 차례") + check;
  el.className = "turn-banner " + (cho ? "cho" : "han") + (board.isCheck() ? " check" : "");
}

function countPieces(fen) {
  const counts = {};
  for (const ch of fen.split(" ")[0]) if (/[a-zA-Z]/.test(ch)) counts[ch] = (counts[ch] || 0) + 1;
  return counts;
}
function capturedBy(side, counts) {
  const enemyIsUpper = side === "han";
  const items = []; let score = 0;
  for (const T of ["R", "C", "N", "B", "A", "P"]) {
    const letter = enemyIsUpper ? T : T.toLowerCase();
    const gone = START[T] - (counts[letter] || 0);
    for (let i = 0; i < gone; i++) { items.push({ T, value: VALUE[T] }); score += VALUE[T]; }
  }
  items.sort((a, b) => b.value - a.value);
  return { items, score };
}
function sideName(side) {
  const nm = names[side] || (side === "cho" ? "楚" : "漢");
  return nm + (side === myKey() ? " (나)" : "");
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

// ---- 이펙트 / 토스트 ----
let fxTimer = null, toastTimer = null;
function checkFx(text) {
  const el = $("check-fx");
  el.textContent = text; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  clearTimeout(fxTimer); fxTimer = setTimeout(() => el.classList.remove("show"), 1200);
}
function toast(msg) {
  const el = $("toast");
  el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

boot().catch((e) => { setConn("오류: " + (e.message || e)); console.error(e); });
