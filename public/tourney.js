// 우리 반 대회 — 참가자 추첨 → 단판 토너먼트 대진표. board 없이 순수 DOM + localStorage.
const $ = (id) => document.getElementById(id);
const STORE = "janggi.tourney";

// 진실의 원천은 (1) 1라운드 대진 seedMatches, (2) 라운드별 승자 winners.
// 그 외 라운드의 대진(a/b)은 이전 라운드 승자로부터 매번 다시 계산한다(결과 수정 자동 반영).
let T = null;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }

function createTournament(name, players) {
  players = shuffle(players.slice());
  const N = players.length;
  const size = nextPow2(N);
  const byes = size - N;
  const m0 = size / 2;
  const seedMatches = [];
  let pi = 0;
  for (let i = 0; i < m0; i++) {
    if (i < byes) seedMatches.push({ a: players[pi++], b: null, bye: true });
    else { const a = players[pi++], b = players[pi++]; seedMatches.push({ a, b, bye: false }); }
  }
  // winners: 라운드 수 = log2(size). 각 행 길이는 절반씩.
  const winners = [];
  let cnt = m0;
  let r = 0;
  while (cnt >= 1) {
    winners.push(new Array(cnt).fill(null));
    if (cnt === 1) break;
    cnt = cnt / 2; r++;
  }
  // 1라운드 부전승은 자동 승자
  seedMatches.forEach((sm, i) => { if (sm.bye) winners[0][i] = sm.a; });
  T = { name, players, seedMatches, winners, createdAt: Date.now() };
  save();
}

// winners/seedMatches 로부터 표시용 라운드 배열을 계산
function computeRounds() {
  const rounds = [];
  const r0 = T.seedMatches.map((sm, i) => ({ a: sm.a, b: sm.b, bye: sm.bye, winner: T.winners[0][i] || null }));
  rounds.push(r0);
  let prev = r0, r = 0;
  while (prev.length > 1) {
    r++;
    const cnt = prev.length / 2;
    const rr = [];
    for (let i = 0; i < cnt; i++) {
      const a = prev[2 * i].winner;
      const b = prev[2 * i + 1].winner;
      let w = (T.winners[r] && T.winners[r][i]) || null;
      if (w != null && w !== a && w !== b) w = null; // 상류 결과가 바뀌면 무효화
      rr.push({ a, b, bye: false, winner: w });
    }
    rounds.push(rr);
    prev = rr;
  }
  const champion = rounds[rounds.length - 1][0].winner;
  return { rounds, champion };
}

function setWinner(r, m, who) {
  if (!T.winners[r]) T.winners[r] = [];
  T.winners[r][m] = (T.winners[r][m] === who) ? null : who; // 다시 누르면 취소
  save();
  render();
}

function save() { try { localStorage.setItem(STORE, JSON.stringify(T)); } catch (e) { /* 무시 */ } }
function load() { try { return JSON.parse(localStorage.getItem(STORE) || "null"); } catch (e) { return null; } }

// ---- 화면 ----
function showSetup() {
  $("setup").classList.remove("hidden");
  $("bracket-view").classList.add("hidden");
}
function showBracket() {
  $("setup").classList.add("hidden");
  $("bracket-view").classList.remove("hidden");
  render();
}

function roundLabel(matchCount) {
  const map = { 1: "결승", 2: "준결승", 4: "8강", 8: "16강", 16: "32강" };
  return map[matchCount] || (matchCount * 2) + "강";
}

function render() {
  const { rounds, champion } = computeRounds();
  $("brk-title").textContent = T.name || "우리 반 장기 대회";
  $("brk-sub").textContent = `${T.players.length}명 · 단판 토너먼트`;

  const champ = $("champ");
  if (champion) {
    champ.classList.remove("hidden");
    champ.innerHTML = `<span class="champ-emoji">🏆</span> 우승 <b>${esc(champion)}</b> 축하해요!`;
  } else champ.classList.add("hidden");

  const el = $("bracket");
  el.innerHTML = "";
  rounds.forEach((round, r) => {
    const col = document.createElement("div");
    col.className = "brk-col";
    const title = document.createElement("div");
    title.className = "brk-col-title";
    title.textContent = roundLabel(round.length);
    const box = document.createElement("div");
    box.className = "brk-matches";
    round.forEach((mt, m) => box.appendChild(matchCard(round, r, m, mt)));
    col.appendChild(title); col.appendChild(box);
    el.appendChild(col);
  });
}

function matchCard(round, r, m, mt) {
  const card = document.createElement("div");
  card.className = "brk-match";
  card.appendChild(slot(r, m, mt, "a"));
  card.appendChild(slot(r, m, mt, "b"));
  // 두 사람이 다 정해졌고 아직 승자 없으면 '대국하기' 링크
  if (mt.a && mt.b && !mt.winner) {
    const play = document.createElement("a");
    play.className = "brk-play";
    play.href = `together.html?cho=${encodeURIComponent(mt.a)}&han=${encodeURIComponent(mt.b)}`;
    play.textContent = "▶ 이 대국 두기";
    card.appendChild(play);
  }
  return card;
}

function slot(r, m, mt, key) {
  const name = mt[key];
  const div = document.createElement("div");
  const isBye = mt.bye && key === "b";
  if (isBye) { div.className = "brk-slot bye"; div.textContent = "부전승"; return div; }
  if (!name) { div.className = "brk-slot tbd"; div.textContent = "…"; return div; }
  const decided = mt.winner != null;
  const win = decided && mt.winner === name;
  div.className = "brk-slot" + (win ? " win" : decided ? " lose" : "");
  const nameSpan = document.createElement("span");
  nameSpan.className = "brk-name";
  nameSpan.textContent = name;
  div.appendChild(nameSpan);
  if (win) { const c = document.createElement("span"); c.className = "brk-check"; c.textContent = "✓"; div.appendChild(c); }
  // 상대가 있어야 승자 선택 가능(부전승은 자동)
  if (mt.a && mt.b) div.onclick = () => setWinner(r, m, name);
  return div;
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// ---- 입력/버튼 ----
function parsePlayers() {
  return ($("t-players").value || "")
    .split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 32);
}
function updateCount() { $("t-count").textContent = parsePlayers().length; }

function makeBracket() {
  const players = parsePlayers();
  if (players.length < 2) { $("setup-msg").textContent = "참가자를 2명 이상 넣어 주세요."; return; }
  const uniq = new Set(players);
  if (uniq.size !== players.length) { $("setup-msg").textContent = "이름이 겹쳐요. 서로 다르게 적어 주세요(예: 김민준, 이민준)."; return; }
  const name = ($("t-name").value || "").trim() || "우리 반 장기 대회";
  createTournament(name, players);
  showBracket();
}

function bindUI() {
  $("t-players").oninput = updateCount;
  $("make-btn").onclick = makeBracket;
  $("redraw-btn").onclick = () => {
    if (!confirm("같은 참가자로 다시 추첨할까요? (현재 결과는 지워져요)")) return;
    createTournament(T.name, T.players);
    render();
  };
  $("clear-btn").onclick = () => {
    if (!confirm("경기 결과를 모두 지울까요? (대진표는 그대로)")) return;
    T.winners = T.winners.map((row) => row.map(() => null));
    T.seedMatches.forEach((sm, i) => { if (sm.bye) T.winners[0][i] = sm.a; });
    save(); render();
  };
  $("new-btn").onclick = () => {
    if (!confirm("새 대회를 열까요? 지금 대회는 사라져요.")) return;
    T = null; localStorage.removeItem(STORE);
    $("t-name").value = ""; $("t-players").value = ""; updateCount();
    $("setup-msg").textContent = "";
    showSetup();
  };
}

function boot() {
  bindUI();
  updateCount();
  const saved = load();
  if (saved && saved.seedMatches) { T = saved; showBracket(); }
  else showSetup();
}
boot();
