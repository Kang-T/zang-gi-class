// Fairy-Stockfish (WASM) UCI 래퍼 — 장기(janggi) 변종 전용
// stockfish.js 는 index.html 의 <script> 로 먼저 로드되어 window.Stockfish 전역을 만든다.
import { VARIANT, VARIANT_CONFIG } from "./variant.js";

export class JanggiEngine {
  constructor() {
    this.sf = null;
    this.ready = false;
    this._listeners = [];
    this._goResolve = null;
    this._info = null; // 마지막 info (score, pv)
  }

  // 엔진 로드 및 초기화
  async init(onStatus = () => {}) {
    onStatus("엔진 불러오는 중…");
    // eslint-disable-next-line no-undef
    this.sf = await Stockfish({ locateFile: (p) => "/vendor/" + p });
    this.sf.addMessageListener((line) => this._onLine(line));

    await this._cmdUntil("uci", "uciok");
    // 빅장 규칙 끈 커스텀 변종을 엔진 가상 파일시스템에 써넣고 로드
    try {
      this.sf.FS.writeFile("/janggimod.ini", VARIANT_CONFIG);
      this.send("setoption name VariantPath value /janggimod.ini");
    } catch (e) {
      console.warn("변종 설정 로드 실패, 기본 janggi 사용:", e);
    }
    this.send(`setoption name UCI_Variant value ${VARIANT}`);
    this.send("setoption name Use NNUE value false"); // 장기 NNUE 파일 미동봉 → 고전 평가 사용
    // 멀티스레드로 더 깊이 탐색 (단일 스레드면 수읽기가 얕아 이상한 수가 나옴)
    const cores = (navigator.hardwareConcurrency || 4);
    this.threads = Math.min(Math.max(1, cores - 1), 4);
    this.send(`setoption name Threads value ${this.threads}`);
    this.send("setoption name Hash value 128");
    this.send("setoption name Skill Level value 20"); // 항상 최선수 (약화 없음)
    await this._cmdUntil("isready", "readyok");
    this.ready = true;
    onStatus(`준비 완료 (스레드 ${this.threads})`);
  }

  send(cmd) {
    this.sf.postMessage(cmd);
  }

  _onLine(line) {
    // 분석 정보 파싱
    if (line.startsWith("info ") && line.includes(" pv ")) {
      this._info = this._parseInfo(line);
    }
    if (line.startsWith("bestmove")) {
      const m = line.split(/\s+/)[1];
      if (this._goResolve) {
        const res = this._goResolve;
        this._goResolve = null;
        res({ bestmove: m === "(none)" ? null : m, info: this._info });
      }
    }
    for (const l of this._listeners) l(line);
  }

  _parseInfo(line) {
    const t = line.split(/\s+/);
    const info = { depth: null, scoreCp: null, mate: null, pv: [] };
    for (let i = 0; i < t.length; i++) {
      if (t[i] === "depth") info.depth = parseInt(t[i + 1]);
      else if (t[i] === "score") {
        if (t[i + 1] === "cp") info.scoreCp = parseInt(t[i + 2]);
        else if (t[i + 1] === "mate") info.mate = parseInt(t[i + 2]);
      } else if (t[i] === "pv") {
        info.pv = t.slice(i + 1);
        break;
      }
    }
    return info;
  }

  // cmd 를 보내고 특정 토큰이 나올 때까지 대기
  _cmdUntil(cmd, token) {
    return new Promise((resolve) => {
      const handler = (line) => {
        if (line.includes(token)) {
          this._listeners = this._listeners.filter((l) => l !== handler);
          resolve();
        }
      };
      this._listeners.push(handler);
      this.send(cmd);
    });
  }

  // 강도 설정 (Skill Level 0~20)
  setSkill(level) {
    this.send(`setoption name Skill Level value ${Math.max(0, Math.min(20, level))}`);
  }

  // 위치 분석 → 최선수 반환
  // fen: 현재 FEN. opts: {movetime, depth}
  // 동시 호출이 겹치면 이전 탐색의 bestmove 가 섞여 결과가 어긋나므로 큐로 직렬화한다.
  analyze(fen, opts = {}) {
    const task = () => this._doAnalyze(fen, opts);
    const next = (this._queue || Promise.resolve()).then(task, task);
    this._queue = next.catch(() => {});
    return next;
  }

  _doAnalyze(fen, opts = {}) {
    this._info = null;
    this.send("ucinewgame");
    this.send(`position fen ${fen}`);
    return new Promise((resolve) => {
      this._goResolve = resolve;
      if (opts.depth) this.send(`go depth ${opts.depth}`);
      else this.send(`go movetime ${opts.movetime || 1200}`);
    });
  }

  stop() {
    this.send("stop");
  }
}
