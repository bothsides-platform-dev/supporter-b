// 병렬 슬롯 기본값 — 가로채기되지 않은 (app) 경로에서 @modal 슬롯은 아무것도
// 렌더하지 않는다. Next 16 은 슬롯마다 default.tsx 가 없으면 비가로채기 경로에서
// 404/500 을 던지므로 필수.
export default function ModalDefault() {
  return null;
}
