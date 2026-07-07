// Supabase 연결 설정 — 온라인 대전에서만 사용합니다.
// Realtime "Broadcast" 채널로 두 사람의 수(手)만 주고받고, 데이터베이스 테이블은 건드리지 않습니다.
//
// ⚠️ 반드시 'anon public' 키만 넣으세요. (service_role / secret 키는 절대 넣지 마세요!)
//    anon 키는 원래 클라이언트에 공개되는 키라 넣어도 안전합니다.
//
// Supabase 대시보드 → Project Settings → API 에서 값을 복사하세요.
window.SUPABASE_CONFIG = {
  url: "https://mtvmhlpembzlautbfezg.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10dm1obHBlbWJ6bGF1dGJmZXpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNjc0ODMsImV4cCI6MjA5NDY0MzQ4M30.nfbCiFxIUw2eN39OsjycH1zkM7MhMdnQrufS8UHfKkw",
};
