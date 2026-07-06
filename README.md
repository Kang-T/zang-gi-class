# 장기 훈수 도우미

옆에서 장기를 두면서, 판 위의 돌을 직접 클릭해 옮기면 **다음에 둘 최선수를 화살표로 알려주는** 웹 프로그램입니다.
엔진은 [Fairy-Stockfish](https://github.com/fairy-stockfish/Fairy-Stockfish)(장기 정식 지원)를 브라우저에서 WebAssembly로 구동합니다. 서버에 기보가 나가지 않고 전부 로컬에서 돌아갑니다.

## 실행

```bash
python3 server.py
```

그다음 브라우저에서 **http://localhost:8777** 접속.

> 멀티스레드 WASM(SharedArrayBuffer) 때문에 `file://` 로 직접 열면 안 되고, 반드시 이 서버를 통해 열어야 합니다. (서버가 COOP/COEP 헤더를 붙여 줍니다.)
> 포트를 바꾸려면 `PORT=9000 python3 server.py`.

## 사용법

1. 실제 대국과 똑같이 판 위 돌을 클릭해서 옮깁니다. (돌 클릭 → 갈 곳 클릭)
2. 분석해 줄 차례가 되면 **파란 화살표**로 추천수가 표시되고, 우측에 기물·평가·예상 진행이 나옵니다.
3. **위치 편집**: 중간부터 시작하거나 차림(마/상 배치)이 다를 때, 팔레트에서 기물을 골라 현재 판 그대로 맞춘 뒤 "이 위치로 시작".

### 옵션
- **추천해 줄 편**: 漢(아래) / 楚(위) / 양쪽 다
- **분석 강도**: 입문 → 급수 → 1단 → 유단 최강 (Skill Level + 생각 시간 조절)
- 한 수 무르기 · 판 뒤집기 · 처음 위치로

## 구성

| 파일 | 역할 |
|------|------|
| `server.py` | COOP/COEP 헤더를 붙여 `public/` 를 서빙하는 로컬 서버 |
| `public/index.html` · `style.css` | 화면 |
| `public/board.js` | 장기판 모델·SVG 렌더링·클릭 이동 (ffish 사용) |
| `public/engine.js` | Fairy-Stockfish UCI 래퍼 |
| `public/main.js` | 전체 연결(분석·UI) |
| `public/vendor/` | ffish.js / Fairy-Stockfish(wasm) 엔진 파일 |

## 배포 (Vercel)

배포 주소: **https://public-steel-alpha-12.vercel.app**

`public/` 폴더를 사이트 루트로 배포합니다. SharedArrayBuffer(멀티스레드 WASM)에 필요한
COOP/COEP 헤더는 [public/vercel.json](public/vercel.json)에서 설정합니다.

재배포:

```bash
cd public
vercel deploy --prod --yes
```

> 프로젝트 이름은 폴더명 때문에 `public` 으로 잡혀 있습니다. 바꾸고 싶으면 Vercel 대시보드에서 프로젝트 이름/도메인을 변경하면 됩니다.

## 강도 더 올리기 / 내리기

`public/main.js` 상단 `STRENGTH` 의 `skill`(0~20)과 `movetime`(ms)를 조절하세요.
숫자를 키울수록 강하고 느려집니다.
