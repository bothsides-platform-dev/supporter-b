/**
 * 템플릿 경로 계약의 서명 마감(일) — 템플릿 생성 시 provider `deadline_days` 로
 * 전송돼, 그 템플릿으로 만든 계약이 이 기한을 넘기면 provider 가 `expired` 로
 * 종결한다(우리는 미러링만 한다). 값이 없으면 계약은 **영구 유효**다(실측
 * docs/SNOWSIGN_SANDBOX.md T9 — `expires_at` 기본 null). 업계 통상 14~30일 중
 * 보수적으로 30일. 임베드 건별 경로에는 만료 파라미터 자체가 없어 적용 불가 —
 * PG 가 임베드 UI 에서 정한 값이 있으면 reconcile 의 `expires_at` 미러링으로만
 * 반영된다.
 */
export const SIGNING_DEADLINE_DAYS = 30;
