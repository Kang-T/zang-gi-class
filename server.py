#!/usr/bin/env python3
"""장기 훈수 도우미 로컬 서버.

Fairy-Stockfish(WASM)는 멀티스레드(SharedArrayBuffer)를 쓰기 때문에
브라우저의 cross-origin isolation 이 필요합니다.
이를 위해 COOP/COEP 헤더를 모든 응답에 붙여서 public/ 폴더를 서빙합니다.

실행:  python3 server.py
접속:  http://localhost:8000
"""
import http.server
import os
import socketserver

PORT = int(os.environ.get("PORT", "8777"))
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # SharedArrayBuffer(멀티스레드 WASM) 활성화에 필요한 헤더
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        # 개발 편의를 위해 캐시 비활성화
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # 콘솔 조용히


# .wasm 을 올바른 MIME 으로
Handler.extensions_map[".wasm"] = "application/wasm"
Handler.extensions_map[".js"] = "text/javascript"


def main():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"\n  장기 훈수 도우미 실행 중")
        print(f"  브라우저에서 열기:  http://localhost:{PORT}\n")
        print(f"  (종료: Ctrl+C)\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  종료합니다.")


if __name__ == "__main__":
    main()
