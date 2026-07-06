// 빅장(왕 마주보기) 규칙을 끈 커스텀 장기 변종.
// 기본 'janggi' 를 상속하고 bikjangRule 만 끈다.
// ffish(보드 로직)와 Fairy-Stockfish(엔진) 양쪽에 동일하게 적용한다.
export const VARIANT = "janggimod";
export const VARIANT_CONFIG =
  "[janggimod:janggi]\n" +
  "bikjangRule = false\n";
