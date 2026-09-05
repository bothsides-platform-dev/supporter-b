---
status: accepted
---

# 대화 읽음 상태를 tier-spanning module로 둔다

대화 읽음 상태의 workspace identity와 단조 cursor 규칙이 저장·digest·loader·실시간·화면 projection에 반복되어 한 번의 불변식 수정이 여러 tier를 건넜다. 기존 Actions → Services → Repositories 구조에 맞춰 규칙을 다시 나누는 대신 `lib/chat/read-state/`에 server/client entrypoint가 분리된 deep module을 두어 locality를 확보한다. Postgres SQL은 repository 규칙에 따라 기존 Drizzle adapter에 남기고, Centrifugo는 별도 전달 seam의 adapter로 취급한다. projection은 repository가 읽은 conversation/message facts를 신뢰하되 side·counterparty 판정은 module 안에서만 수행한다. Thread loader의 중복 side 검사는 projection 규칙이 아니라, 권한 확인 전에 message 행을 읽지 않기 위한 ACL-first 게이트로 유지한다. team chat은 상대 읽음 영수증과 전달 규칙이 달라 이 module에 포함하지 않는다.
