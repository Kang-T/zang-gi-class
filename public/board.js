// 장기판 모델 + SVG 렌더링 + 클릭 상호작용
import Module from "./vendor/ffish.js";
import { VARIANT, VARIANT_CONFIG } from "./variant.js";

const FILES = "abcdefghi";              // 9열
const NS = "http://www.w3.org/2000/svg";

// 기물 글자(한자) 및 색
// 대문자 = 楚(초, 선수, 초록) / 소문자 = 漢(한, 빨강)
const GLYPH = {
  K: "楚", A: "士", R: "車", B: "象", N: "馬", C: "包", P: "卒",
  k: "漢", a: "士", r: "車", b: "象", n: "馬", c: "包", p: "兵",
};
const NAME = { R: "차", N: "마", B: "상", A: "사", C: "포", P: "졸", K: "장" };

// 기물 종류별 크기 [반지름, 글자크기] — 장은 크게, 졸은 작게 (전통 장기알 비율)
const PSIZE = {
  K: [30, 30], R: [27, 27], C: [25, 25], N: [23, 23],
  B: [23, 23], A: [21, 21], P: [19, 18],
};

// 차림(마/상 배치) — 뒷줄 안쪽 4칸 [b, c, g, h]
export const SETUPS = {
  마상상마: ["N", "B", "B", "N"], // 귀마(양쪽 마 바깥) — 기본
  상마마상: ["B", "N", "N", "B"], // 면상(양쪽 상 바깥)
  마상마상: ["N", "B", "N", "B"],
  상마상마: ["B", "N", "B", "N"],
};

const M = 46;     // 바깥 여백
const CELL = 58;  // 칸 간격
const COLS = 9, ROWS = 10;

export function pieceName(letter) {
  return NAME[letter.toUpperCase()] || "";
}

export class JanggiBoard {
  constructor(svg) {
    this.svg = svg;
    this.ff = null;
    this.board = null;
    this.flipped = false;     // false: 아래편(대문자)이 화면 아래
    this.mySide = "cho";      // 내 진영('cho'|'han') — 해당 말을 굵게 표시
    this.animate = true;      // 기물 이동 애니메이션
    this.animating = false;   // 애니메이션 진행 중
    this.selected = null;     // 선택된 칸
    this.legal = [];          // 현재 합법수 목록(uci)
    this.hintMoves = [];      // 추천 수순(PV) — uci 배열
    this.showLine = true;     // 예상 수순 화살표 표시 여부
    this.startFen = null;     // 현재 대국의 시작 위치(복기용)
    this.editMode = false;
    this.editGrid = null;     // 편집용 10x9 배열
    this.editPiece = null;    // 팔레트에서 고른 기물
    this.editTurn = "w";
    // 복기(리뷰) 상태
    this.reviewMode = false;
    this.reviewMoves = [];
    this.reviewPos = 0;
    this.lastMove = null;     // 복기 시 마지막으로 둔 수(화살표)
    this.studyMode = false;   // 분석(공부) 모드
    this.analysis = null;     // 위치별 분석 결과 배열(길이 N+1)
    this.hintMate = false;    // 추천수가 외통 수순일 때 강조
    this.onMove = () => {};
    this.onSelect = () => {};
    this.onReview = () => {};
    this.onBlocked = () => {}; // 반복수 금지 등으로 수를 막았을 때
  }

  async init() {
    this.ff = await Module({ locateFile: (p) => "/vendor/" + p });
    this.ff.loadVariantConfig(VARIANT_CONFIG); // 빅장 규칙 끈 변종 등록
    this.board = new this.ff.Board(VARIANT);
    this.startFen = this.board.fen();
    // 클릭은 SVG 에 단 하나의 고정 리스너로 처리(렌더마다 새로 만들지 않음 → 탭 빗나감 방지)
    this.svg.style.cursor = "pointer";
    this.svg.addEventListener("click", (e) => this._onBoardClick(e));
    this._refreshLegal();
    this.render();
  }

  // ---- 좌표 유틸 ----
  sq(col, rank) { return FILES[col] + rank; }
  parseSq(s) {
    const m = s.match(/^([a-i])(10|[1-9])$/);
    return m ? { col: FILES.indexOf(m[1]), rank: parseInt(m[2]) } : null;
  }
  parseMove(uci) {
    const m = uci.match(/^([a-i])(10|[1-9])([a-i])(10|[1-9])$/);
    if (!m) return null;
    return {
      from: m[1] + m[2], to: m[3] + m[4],
      fc: FILES.indexOf(m[1]), fr: parseInt(m[2]),
      tc: FILES.indexOf(m[3]), tr: parseInt(m[4]),
    };
  }
  // col(0..8), rank(1..10) → 화면 픽셀
  xy(col, rank) {
    const x = this.flipped ? COLS - 1 - col : col;
    const drow = this.flipped ? rank - 1 : ROWS - rank;
    return [M + x * CELL, M + drow * CELL];
  }

  // ---- 상태 ----
  fen() { return this.board.fen(); }
  turn() { return this.board.turn(); } // true = 대문자(漢) 차례
  isCheck() { return this.board.isCheck(); }
  isGameOver() { return this.board.isGameOver(); }
  result() { return this.board.result(); }

  _refreshLegal() {
    const s = this.board.legalMoves();
    this.legal = s ? s.split(" ") : [];
  }

  // FEN 보드부분 → 10x9 배열 (row0=rank10 위)
  gridFromFen(fen) {
    const rows = fen.split(" ")[0].split("/");
    const g = [];
    for (let r = 0; r < ROWS; r++) {
      const arr = new Array(COLS).fill(null);
      let c = 0;
      for (const ch of rows[r]) {
        if (/\d/.test(ch)) c += parseInt(ch);
        else { arr[c] = ch; c++; }
      }
      g.push(arr);
    }
    return g; // g[row][col], row0 = rank10
  }

  // ---- 사용자 조작 ----
  // 차림(초/한) 으로 시작 FEN 생성. choKey/hanKey 는 SETUPS 의 키.
  // 차림은 각 진영이 '자기 시점' 왼→오 순서로 고른다.
  // 초는 a열이 자기 왼쪽이라 그대로, 한은 i열이 자기 왼쪽이라 좌우를 뒤집어 배치한다.
  buildStartFen(choKey, hanKey) {
    const [cb, cc, cg, ch] = SETUPS[choKey] || SETUPS["마상상마"];
    const hp = (SETUPS[hanKey] || SETUPS["마상상마"]).slice().reverse(); // 한 시점 보정
    const [hb, hc, hg, hh] = hp.map((s) => s.toLowerCase());
    const choBack = `R${cb}${cc}A1A${cg}${ch}R`;   // 초(대문자) 맨 아랫줄
    const hanBack = `r${hb}${hc}a1a${hg}${hh}r`;   // 한(소문자) 맨 윗줄
    return `${hanBack}/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/${choBack} w - - 0 1`;
  }

  // 새 대국 시작: 차림 + 내 진영(myside: 'w'=초 아래, 'b'=한 아래)
  newGame(choKey, hanKey, myside) {
    const fen = this.buildStartFen(choKey, hanKey);
    this.board.setFen(fen);
    this.startFen = fen;
    this.flipped = myside === "b"; // 내가 한이면 한을 아래로
    this.mySide = myside === "b" ? "han" : "cho";
    this.reviewMode = false; this.lastMove = null;
    this.selected = null; this.hintMoves = [];
    this._refreshLegal(); this.render(); this.onMove();
  }

  reset() { this.newGame("마상상마", "마상상마", "w"); }

  // 한수쉼(패스): 그 차례 장군이 제자리로 두는 수 = 차례만 넘김
  _generalSquare() {
    const grid = this.gridFromFen(this.board.fen());
    const t = this.board.turn() ? "K" : "k";
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (grid[r][c] === t) return this.sq(c, ROWS - r);
    return null;
  }
  passMove() {
    if (this.reviewMode || this.animating) return false;
    const sq = this._generalSquare();
    if (!sq) return false;
    const ok = this.board.push(sq + sq);
    if (ok) {
      this.selected = null; this.hintMoves = [];
      this._refreshLegal(); this.render(); this.onMove();
    }
    return ok;
  }
  undo() {
    if (this.reviewMode || this.board.moveStack().trim() === "") return;
    this.board.pop();
    this.selected = null; this.hintMoves = [];
    this._refreshLegal(); this.render(); this.onMove();
  }
  flip() { this.flipped = !this.flipped; this.render(); }
  setMySide(s) { this.mySide = s; this.render(); }

  // 추천 수순(PV) 화살표. uciList=uci 배열, opp=둘 차례가 상대, mate=외통 수순(강조)
  setHints(uciList, opp = false, mate = false) {
    this.hintOpp = opp;
    this.hintMate = mate;
    this.hintMoves = (uciList || []).map((u) => this.parseMove(u)).filter(Boolean);
    this.render();
  }
  setHint(uci) { this.setHints(uci ? [uci] : []); }

  // 이 수를 두면 같은 국면이 3번째로 반복되는가 (한국 장기: 동일 반복수 금지)
  _wouldRepeat(uci) {
    const ms = this.board.moveStack().trim();
    const moves = ms ? ms.split(/\s+/) : [];
    const key = (f) => f.split(" ").slice(0, 2).join(" "); // 배치+차례만 비교
    const tb = new this.ff.Board(VARIANT, this.startFen);
    const hist = [key(tb.fen())];
    for (const m of moves) { tb.push(m); hist.push(key(tb.fen())); }
    if (!tb.push(uci)) { tb.delete(); return false; }
    const k = key(tb.fen());
    tb.delete();
    return hist.filter((h) => h === k).length >= 2; // 이미 2번 나온 국면 → 3번째 금지
  }

  pushMove(uci, opts = {}) {
    if (this.animating) return false;
    if (!opts.force && !this.reviewMode && this._wouldRepeat(uci)) {
      this.onBlocked("같은 국면 3번 반복은 둘 수 없어요 (반복수 금지)");
      return false;
    }
    if (this.animate && !this.reviewMode && this.legal.includes(uci)) {
      this._animateThenPush(uci);
      return true;
    }
    const ok = this.board.push(uci);
    if (ok) {
      this.selected = null; this.hintMoves = [];
      this._refreshLegal(); this.render(); this.onMove();
    }
    return ok;
  }

  // 한 수 이동을 시각적으로 애니메이션(둠/콜백은 하지 않음)
  async _animMove(uci) {
    const mv = this.parseMove(uci);
    const grid = this.gridFromFen(this.board.fen());
    const mover = grid[ROWS - mv.fr][mv.fc];
    if (!mover) return false;
    const captured = grid[ROWS - mv.tr][mv.tc];
    this.animating = true;
    const omit = [{ col: mv.fc, rank: mv.fr }];
    if (captured) omit.push({ col: mv.tc, rank: mv.tr });
    this.render(omit);
    const capG = captured ? this._overlayPiece(captured, mv.tc, mv.tr) : null;
    const moverG = this._overlayPiece(mover, mv.fc, mv.fr);
    await this._tween(moverG, this._path(mv, mover), capG);
    if (moverG.remove) moverG.remove();
    if (capG && capG.remove) capG.remove();
    this.animating = false;
    return true;
  }

  // 이동 애니메이션 후 실제로 둠 (대국 진행용)
  async _animateThenPush(uci) {
    this.selected = null; this.hintMoves = [];
    await this._animMove(uci);
    this.board.push(uci);
    this._afterMove();
  }
  _afterMove() {
    this.selected = null; this.hintMoves = [];
    this._refreshLegal(); this.render(); this.onMove();
  }

  // 말 종류별 이동 경로(절대 좌표 배열 start→…→end)
  _path(mv, letter) {
    const start = this.xy(mv.fc, mv.fr);
    const end = this.xy(mv.tc, mv.tr);
    const T = letter.toUpperCase();
    const dc = mv.tc - mv.fc, dr = mv.tr - mv.fr;
    const sc = Math.sign(dc), sr = Math.sign(dr);
    const P = (c, r) => this.xy(c, r);
    if (T === "N" && Math.abs(dc) + Math.abs(dr) === 3) {
      // 마: 긴 축으로 한 칸 직진 후 대각 한 칸 (ㄱ자)
      const elbow = Math.abs(dr) === 2 ? P(mv.fc, mv.fr + sr) : P(mv.fc + sc, mv.fr);
      return [start, elbow, end];
    }
    if (T === "B" && Math.abs(dc) + Math.abs(dr) === 5) {
      // 상: 한 칸 직진 후 대각 두 칸 (지그재그)
      if (Math.abs(dr) === 3)
        return [start, P(mv.fc, mv.fr + sr), P(mv.fc + sc, mv.fr + 2 * sr), end];
      return [start, P(mv.fc + sc, mv.fr), P(mv.fc + 2 * sc, mv.fr + sr), end];
    }
    if (T === "C") {
      // 포: 호를 그리며 뛰어넘기
      return [start, [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2 - 30], end];
    }
    return [start, end]; // 직선 (차·졸·장·사)
  }

  // 폴리라인 경로를 따라 el 을 이동. capEl 은 도착 무렵 페이드아웃.
  // 타이머 기반(+안전망)으로 어떤 환경에서도 반드시 완료되게 함.
  _tween(el, pts, capEl) {
    return new Promise((resolve) => {
      const start = pts[0], last = pts[pts.length - 1];
      const segs = []; let total = 0;
      for (let i = 1; i < pts.length; i++) {
        const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        segs.push(L); total += L;
      }
      const DUR = Math.min(480, Math.max(240, total * 0.95));
      const t0 = performance.now();
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        el.setAttribute("transform", `translate(${last[0] - start[0]},${last[1] - start[1]})`);
        if (capEl) capEl.setAttribute("opacity", "0");
        resolve();
      };
      const step = () => {
        if (done) return;
        const p = Math.min(1, (performance.now() - t0) / DUR);
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOutQuad
        let d = e * total, i = 0;
        while (i < segs.length - 1 && d > segs[i]) { d -= segs[i]; i++; }
        const f = segs[i] ? Math.min(1, d / segs[i]) : 1;
        const cx = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f;
        const cy = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f;
        el.setAttribute("transform", `translate(${cx - start[0]},${cy - start[1]})`);
        if (capEl && p > 0.55) capEl.setAttribute("opacity", String(Math.max(0, 1 - (p - 0.55) / 0.45)));
        if (p < 1) setTimeout(step, 16); else finish();
      };
      step();
      setTimeout(finish, DUR + 300); // 안전망: rAF/timer 가 멈춰도 반드시 완료
    });
  }

  // ---- 복기(리뷰) ----
  canReview() { return this.board.moveStack().trim() !== ""; }
  enterReview() {
    const ms = this.board.moveStack().trim();
    this.reviewMoves = ms ? ms.split(/\s+/) : [];
    this.reviewPos = this.reviewMoves.length; // 끝(현재)에서 시작
    this.reviewMode = true;
    this.selected = null; this.hintMoves = [];
    this._setReviewArrow();
    this._refreshLegal(); this.render(); this.onReview();
  }
  _setReviewArrow() {
    this.lastMove = this.reviewPos > 0 ? this.parseMove(this.reviewMoves[this.reviewPos - 1]) : null;
  }
  reviewGoto(pos) {
    pos = Math.max(0, Math.min(this.reviewMoves.length, pos));
    while (this.reviewPos > pos) { this.board.pop(); this.reviewPos--; }
    while (this.reviewPos < pos) { this.board.push(this.reviewMoves[this.reviewPos]); this.reviewPos++; }
    this._setReviewArrow();
    this._refreshLegal(); this.render(); this.onReview();
  }
  reviewPrev() { this.reviewGoto(this.reviewPos - 1); }
  reviewNext() { this.reviewGoto(this.reviewPos + 1); }
  reviewFirst() { this.reviewGoto(0); }
  reviewLast() { this.reviewGoto(this.reviewMoves.length); }
  // 애니메이션과 함께 한 수 전진(자동재생/수동 모두)
  async reviewForward(animate) {
    if (this.reviewPos >= this.reviewMoves.length || this.animating) return false;
    const uci = this.reviewMoves[this.reviewPos];
    if (animate && this.animate) await this._animMove(uci);
    this.board.push(uci); this.reviewPos++;
    this._setReviewArrow();
    this._refreshLegal(); this.render(); this.onReview();
    return true;
  }
  exitReview() {
    this.reviewGoto(this.reviewMoves.length); // 끝(실제 국면)으로 복원
    this.reviewMode = false; this.studyMode = false; this.analysis = null;
    this.lastMove = null;
    this.selected = null; this.hintMoves = [];
    this.render(); this.onMove();
  }

  // ---- 저장/복원 ----
  getState() {
    const ms = this.board.moveStack().trim();
    return {
      startFen: this.startFen,
      moves: ms ? ms.split(/\s+/) : [],
      flipped: this.flipped,
      mySide: this.mySide,
    };
  }
  loadState(st) {
    if (!st || !st.startFen) return false;
    if (this.ff.validateFen(st.startFen, VARIANT) !== 1) return false;
    this.board.setFen(st.startFen);
    this.startFen = st.startFen;
    for (const m of st.moves || []) {
      if (!this.board.push(m)) break; // 손상된 기록은 가능한 곳까지만
    }
    this.flipped = !!st.flipped;
    this.mySide = st.mySide === "han" ? "han" : "cho";
    this.reviewMode = false; this.studyMode = false; this.analysis = null;
    this.lastMove = null; this.selected = null; this.hintMoves = [];
    this._refreshLegal(); this.render(); this.onMove();
    return true;
  }

  // ---- 대국 공부(분석) ----
  // 현재 대국의 모든 위치 FEN/수/차례를 수집(라이브 보드는 건드리지 않음)
  collectGame() {
    const ms = this.board.moveStack().trim();
    const moves = ms ? ms.split(/\s+/) : [];
    const tb = new this.ff.Board(VARIANT, this.startFen);
    const fens = [tb.fen()], turns = [tb.turn()];
    for (const m of moves) { tb.push(m); fens.push(tb.fen()); turns.push(tb.turn()); }
    tb.delete();
    return { startFen: this.startFen, moves, fens, turns };
  }
  // 분석 결과(위치별 배열)를 받아 공부 모드 진입 → 시작 위치로
  enterStudy(analysis) {
    this.analysis = analysis;
    this.studyMode = true;
    this.enterReview();
    this.reviewGoto(0);
  }

  // 화면 클릭 좌표 → 가장 가까운 교차점(SVG 변환행렬 사용: 스크롤/스케일/줌 무관하게 정확)
  _onBoardClick(e) {
    if (this.animating) return;
    const ctm = this.svg.getScreenCTM();
    if (!ctm) return;
    const pt = this.svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const loc = pt.matrixTransform(ctm.inverse());
    const xIdx = Math.round((loc.x - M) / CELL);
    const drow = Math.round((loc.y - M) / CELL);
    if (xIdx < 0 || xIdx > COLS - 1 || drow < 0 || drow > ROWS - 1) return;
    const col = this.flipped ? COLS - 1 - xIdx : xIdx;
    const rank = this.flipped ? drow + 1 : ROWS - drow;
    if (this.editMode) this._clickEdit(col, ROWS - rank);
    else this._clickPlay(this.sq(col, rank));
  }

  _clickPlay(sq) {
    if (this.reviewMode || this.animating) return;
    if (this.selected && this.selected !== sq) {
      const uci = this.selected + sq;
      // 한 칸으로 가는 수 중 일치(승급 등 접미사 없음 → 그대로)
      if (this.legal.includes(uci)) { this.pushMove(uci); return; }
    }
    // 선택/재선택: 그 칸에 둘 차례 기물이 있고 합법수가 있으면 선택
    const movesFrom = this.legal.filter((m) => m.startsWith(sq));
    if (movesFrom.length) { this.selected = sq; this.onSelect(sq); this.render(); }
    else { this.selected = null; this.render(); }
  }

  // ---- 편집 모드 ----
  enterEdit() {
    this.editMode = true;
    this.editGrid = this.gridFromFen(this.board.fen());
    this.editTurn = this.board.turn() ? "w" : "b";
    this.selected = null; this.hintMoves = [];
    this.render();
  }
  cancelEdit() { this.editMode = false; this.render(); }
  setEditPiece(p) { this.editPiece = p; }     // 예: "N","p",  "x"=지우기
  setEditTurn(t) { this.editTurn = t; }
  _clickEdit(col, row) {
    if (this.editPiece === "x" || this.editPiece == null) this.editGrid[row][col] = null;
    else this.editGrid[row][col] = this.editPiece;
    this.render();
  }
  // 편집 결과를 FEN 으로 만들어 검증 후 적용
  applyEdit() {
    const rows = [];
    for (let r = 0; r < ROWS; r++) {
      let s = "", empty = 0;
      for (let c = 0; c < COLS; c++) {
        const p = this.editGrid[r][c];
        if (p) { if (empty) { s += empty; empty = 0; } s += p; }
        else empty++;
      }
      if (empty) s += empty;
      rows.push(s);
    }
    const fen = `${rows.join("/")} ${this.editTurn} - - 0 1`;
    if (this.ff.validateFen(fen, VARIANT) !== 1) {
      return { ok: false, fen };
    }
    this.board.setFen(fen);
    this.startFen = fen;
    this.editMode = false; this.reviewMode = false; this.lastMove = null;
    this.selected = null; this.hintMoves = [];
    this._refreshLegal(); this.render(); this.onMove();
    return { ok: true, fen };
  }

  // ---- 렌더링 ----
  // omit: 그리지 않을 칸 배열 [{col,rank}] (애니메이션 중 출발/잡힘 칸 숨김)
  render(omit = null) {
    const W = M * 2 + (COLS - 1) * CELL;
    const H = M * 2 + (ROWS - 1) * CELL;
    const svg = this.svg;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    this._numQueue = []; // 수순 번호는 기물 위에 마지막에 그림

    // 배경
    this._rect(0, 0, W, H, "board-bg");

    // 격자선
    for (let r = 0; r < ROWS; r++) {
      const [x1, y] = [M, M + r * CELL];
      this._line(x1, y, M + (COLS - 1) * CELL, y, "grid");
    }
    for (let c = 0; c < COLS; c++) {
      const x = M + c * CELL;
      this._line(x, M, x, M + (ROWS - 1) * CELL, "grid");
    }
    // 궁성 대각선 (위/아래 3x3, d~f열)
    this._palace(3, 0); // 위 (row0~2)
    this._palace(3, 7); // 아래 (row7~9)

    const grid = this.editMode ? this.editGrid : this.gridFromFen(this.board.fen());

    // 복기: 마지막으로 둔 수 화살표(보라)
    if (this.reviewMode && this.lastMove) this._arrow(this.lastMove, 0, 1, "review");
    // 공부: 이 자리에서의 엔진 추천수(초록)
    if (this.studyMode && this.analysis) {
      const rec = this.analysis[this.reviewPos];
      if (rec && rec.best) this._arrow(this.parseMove(rec.best), 0, 1, "study");
    }

    // 추천 수순(PV) 화살표 — 기물 아래에 그려 강조
    if (!this.editMode && !this.reviewMode && this.hintMoves.length) {
      const n = this.showLine ? Math.min(this.hintMoves.length, 6) : 1;
      for (let i = n - 1; i >= 0; i--) this._arrow(this.hintMoves[i], i, n);
    }

    // 선택/합법 목적지 표시
    if (!this.editMode && !this.reviewMode && this.selected) {
      const sel = this.parseSq(this.selected);
      const [sx, sy] = this.xy(sel.col, sel.rank);
      this._circle(sx, sy, 26, "sel-ring");
      for (const mv of this.legal.filter((m) => m.startsWith(this.selected))) {
        const mm = this.parseMove(mv);
        const [dx, dy] = this.xy(mm.tc, mm.tr);
        this._circle(dx, dy, 9, grid[ROWS - mm.tr][mm.tc] ? "dest-cap" : "dest-dot");
      }
    }

    // 기물
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = grid[r][c];
        if (!p) continue;
        const rank = ROWS - r;
        if (omit && omit.some((o) => o.col === c && o.rank === rank)) continue;
        this._piece(c, rank, p);
      }
    }

    // 장군이면 장 둘레에 붉은 파동 링
    if (!this.editMode && this.board.isCheck()) {
      const t = this.board.turn() ? "K" : "k"; // 장군 당한(둘 차례) 장
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (grid[r][c] === t) {
            const [x, y] = this.xy(c, ROWS - r);
            this._circle(x, y, 33, "check-ring");
          }
    }

    // 수순 번호 — 기물 위에 그려 가려지지 않게
    this._drawNums();
    // (클릭은 init 에서 SVG 에 단 하나의 고정 리스너로 처리)
  }

  _palace(c0, r0) {
    const p = (c, r) => [M + c * CELL, M + r * CELL];
    let [x1, y1] = p(c0, r0), [x2, y2] = p(c0 + 2, r0 + 2);
    this._line(x1, y1, x2, y2, "grid");
    [x1, y1] = p(c0 + 2, r0); [x2, y2] = p(c0, r0 + 2);
    this._line(x1, y1, x2, y2, "grid");
  }

  // 팔각형 꼭짓점(중심 x,y, 반지름 r) — 위·아래·좌·우 변이 평평한 정팔각형
  _octPoints(x, y, r) {
    const c = r * 0.4142; // tan(22.5°)
    const p = [[-c, -r], [c, -r], [r, -c], [r, c], [c, r], [-c, r], [-r, c], [-r, -c]];
    return p.map(([dx, dy]) => `${(x + dx).toFixed(1)},${(y + dy).toFixed(1)}`).join(" ");
  }

  // 기물 <g> 생성(좌표 x,y 중심). 추가는 호출자가.
  // 전통 장기알처럼 팔각형 + 안쪽 테두리 + 아래 그림자로 그린다.
  _pieceG(letter, x, y) {
    const cho = letter === letter.toUpperCase();
    const [r, fs] = PSIZE[letter.toUpperCase()] || [23, 22];
    const mine = (cho ? "cho" : "han") === this.mySide;
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "piece " + (cho ? "cho" : "han") + (mine ? " mine" : ""));
    // 그림자(살짝 아래로) → 판 위에 떠 보이게
    const sh = document.createElementNS(NS, "polygon");
    sh.setAttribute("points", this._octPoints(x, y + 2.2, r));
    sh.setAttribute("class", "piece-shadow");
    // 팔각형 몸통
    const body = document.createElementNS(NS, "polygon");
    body.setAttribute("points", this._octPoints(x, y, r));
    body.setAttribute("class", "piece-disc");
    // 안쪽 팔각 테두리(각인 느낌)
    const inner = document.createElementNS(NS, "polygon");
    inner.setAttribute("points", this._octPoints(x, y, r - 4.5));
    inner.setAttribute("class", "piece-inner");
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", x); t.setAttribute("y", y + 1);
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("dominant-baseline", "central");
    t.setAttribute("class", "piece-text");
    t.setAttribute("font-size", fs);
    t.textContent = GLYPH[letter] || "?";
    g.appendChild(sh); g.appendChild(body); g.appendChild(inner); g.appendChild(t);
    return g;
  }
  _piece(col, rank, letter) {
    const [x, y] = this.xy(col, rank);
    this.svg.appendChild(this._pieceG(letter, x, y));
  }
  _overlayPiece(letter, col, rank) {
    const [x, y] = this.xy(col, rank);
    const g = this._pieceG(letter, x, y);
    g.setAttribute("class", g.getAttribute("class") + " moving");
    this.svg.appendChild(g);
    return g;
  }

  // mv: 파싱된 수, idx/total: 수순 내 순서, kind: 'review' 면 복기 색
  _arrow(mv, idx = 0, total = 1, kind = "pv") {
    const [x1, y1] = this.xy(mv.fc, mv.fr);
    const [x2, y2] = this.xy(mv.tc, mv.tr);
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const back = 24;
    const sx = x1 + Math.cos(ang) * back, sy = y1 + Math.sin(ang) * back;
    const ex = x2 - Math.cos(ang) * back, ey = y2 - Math.sin(ang) * back;
    const mid = `m${idx}`;
    let cls;
    if (kind === "review" || kind === "study") cls = kind;
    else {
      // 둘 차례가 상대면 짝수 인덱스(상대 수)를 주황으로, 아니면 내 수를 파랑으로
      const isOpp = this.hintOpp ? idx % 2 === 0 : idx % 2 === 1;
      cls = isOpp ? "opp" : "best";
      if (this.hintMate && !isOpp) cls = "mate"; // 외통 수순은 붉게 강조
    }
    const w = idx === 0 ? 7 : 4.5;
    const op = idx === 0 ? 0.95 : Math.max(0.25, 0.7 - idx * 0.1);

    const defs = document.createElementNS(NS, "defs");
    defs.innerHTML = `<marker id="${mid}" markerWidth="6" markerHeight="6" refX="4.2" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" class="ah-${cls}"/></marker>`;
    this.svg.appendChild(defs);

    if (idx === 0) this._circle(x1, y1, 26, "hint-from " + cls);
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", sx); line.setAttribute("y1", sy);
    line.setAttribute("x2", ex); line.setAttribute("y2", ey);
    line.setAttribute("class", "arrow " + cls);
    line.setAttribute("stroke-width", w);
    line.setAttribute("opacity", op);
    line.setAttribute("marker-end", `url(#${mid})`);
    this.svg.appendChild(line);

    // 순서 번호 (수순 표시일 때) — 위치만 큐에 담고, 기물 위에 마지막에 그림
    if (total > 1) {
      const len = Math.hypot(ex - sx, ey - sy) || 1;
      const px = -(ey - sy) / len, py = (ex - sx) / len; // 화살표에 수직
      const off = 15; // 옆으로 살짝 띄워 짧은 이동에서도 안 가리게
      this._numQueue.push({
        x: (sx + ex) / 2 + px * off,
        y: (sy + ey) / 2 + py * off,
        cls, n: idx + 1,
      });
    }
  }

  _drawNums() {
    for (const d of this._numQueue || []) {
      this._circle(d.x, d.y, 10, "arrow-num-bg " + d.cls);
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", d.x); t.setAttribute("y", d.y + 1);
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("dominant-baseline", "central");
      t.setAttribute("class", "arrow-num");
      t.textContent = d.n;
      this.svg.appendChild(t);
    }
  }

  _rect(x, y, w, h, cls) {
    const e = document.createElementNS(NS, "rect");
    e.setAttribute("x", x); e.setAttribute("y", y);
    e.setAttribute("width", w); e.setAttribute("height", h);
    e.setAttribute("class", cls); this.svg.appendChild(e);
  }
  _line(x1, y1, x2, y2, cls) {
    const e = document.createElementNS(NS, "line");
    e.setAttribute("x1", x1); e.setAttribute("y1", y1);
    e.setAttribute("x2", x2); e.setAttribute("y2", y2);
    e.setAttribute("class", cls); this.svg.appendChild(e);
  }
  _circle(x, y, r, cls) {
    const e = document.createElementNS(NS, "circle");
    e.setAttribute("cx", x); e.setAttribute("cy", y); e.setAttribute("r", r);
    e.setAttribute("class", cls); this.svg.appendChild(e);
  }
}
