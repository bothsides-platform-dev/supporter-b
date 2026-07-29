// 견적 템플릿 저장 상한 — 단일 출처.
//
// 서버(QuoteTemplateService)가 강제하는 값이고, 목록 하단 안내 문구와
// LIMIT_REACHED 에러 문구가 여기서 파생된다. 손으로 세 곳에 20 을 박아 두면
// 서버 상한을 올렸을 때 사용자에게 거짓말 두 개가 남는다.
//
// 순수 상수 — 클라·서버 공용이므로 server-only import 금지.
export const MAX_QUOTE_TEMPLATES = 20;
