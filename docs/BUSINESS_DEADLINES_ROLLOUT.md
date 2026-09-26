# 한국 영업일 견적 마감 배포·운영

공식 휴일은 [한국천문연구원 특일 정보](https://www.data.go.kr/data/15012690/openapi.do)의 공휴일 API `getRestDeInfo`에서 가져온다(포털의 기본 상세 선택은 기념일 `getAnniversaryInfo`이므로 혼동하지 않는다). 토요일·일요일과 5월 1일은 앱에서 별도로 휴일로 판정한다. 서버는 연도별 공식 목록의 출처·수집 시각·판본을 저장하고, 달력이 없는 날짜를 근무일로 추정하지 않는다.

## 배포 순서

1. 대상 DB와 백업을 확인하고 `scripts/migrations/business-calendar.sql`을 **앱보다 먼저** 적용한다. 이 SQL은 달력·변경 이벤트·알림 전송 이력 테이블 및 outbox 이벤트 enum 값을 추가하며 기존 견적·달력 행을 덮어쓰지 않는다. enum 추가는 Postgres 제약에 따라 트랜잭션 전에 멱등으로 실행한다.
2. 앱 서버에 `BUSINESS_CALENDAR_API_KEY`(공공데이터포털 공휴일 API 인증키)를 설정한다. 값은 로그·명령 이력에 남기지 않는다.
3. 새 앱 코드로 첫 적재를 실행한다: `node --env-file=.env.production --import tsx scripts/calendar/sync.ts`. CLI는 `DATABASE_URL`과 API 키가 비어 있으면 DB 클라이언트를 만들기 전에 실패한다. 성공 출력의 `years`에 한국 시간 기준 올해와 다음 해가 모두 있는지 확인한다. 두 연도 12개월씩 모든 페이지를 검증한 뒤 한 DB 트랜잭션으로 반영하므로 중간 실패는 마지막 정상 데이터를 보존한다.
4. 두 연도의 `business_calendar_years` 행에 `fetched_at`, `version`, `source`가 들어 있고 `calendar.sync_health` 경고가 없는지 확인한 뒤 `BUSINESS_DEADLINES_ENABLED=true` 앱을 활성화한다. 첫 적재 전 활성화하지 않는다.
5. 공식 달력 갱신은 매일 한국 시간 03:00, 마감·리마인더·휴일변경 안내는 매분 cron으로 등록한다. 기존 `CRON_SECRET`을 crontab 상단에서 정의한다.

```cron
CRON_TZ=Asia/Seoul
0 3 * * * flock -n /tmp/sync-business-calendar.lock curl --max-time 300 -fsS -XPOST localhost:3000/api/cron/sync-business-calendar -H "x-cron-secret: $CRON_SECRET" >/dev/null 2>&1
* * * * * flock -n /tmp/rfp-deadlines.lock curl --max-time 50 -fsS -XPOST localhost:3000/api/cron/rfp-deadlines -H "x-cron-secret: $CRON_SECRET" >/dev/null 2>&1
```

cron 라우트는 헤더의 비어 있지 않은 `CRON_SECRET`만 받는다. 공식 API 호출은 페이지당 10초·연도당 120초(두 연도 최대 약 240초) 예산 안에서 끝나므로 cron의 300초 HTTP 한도보다 짧다. API 키가 없거나 API 형식·결과코드·페이지 완전성이 틀리면 500이 나고 DB를 덮어쓰지 않는다. 실패 후에는 기존 달력이 계속 쓰이며, 48시간 이상 미갱신 또는 앞으로 30일의 연도 coverage가 없으면 `calendar.sync_health` logger/Sentry 경고가 난다. 운영자는 인증키·API 상태를 확인하고 위 CLI로 재적재한다. 현재/다음 연도만 갱신하며 과거 연도는 리마인더 계산을 위해 보존한다.

## 긴급 휴일 반영

공식 API 갱신 전 임시휴일이 발표되면 출처와 변경자를 확인하고 다음 명령으로 추가한다.

```sh
node --env-file=.env.production --import tsx scripts/calendar/override.ts --date 2026-10-05 --closed true --name 임시공휴일 --source '공식 공고 식별자' --actor '운영자 식별자' --reason '긴급 반영 사유'
```

`--closed false`는 운영 예외를 해제한다. 공식 공휴일을 근무일로 바꾸지 않는다. 모든 변경은 `business_calendar_exception_audit`에 사유·출처·변경자가 불변 이력으로 남고, 새로 추가된 휴일은 `business_calendar_changes`에 durable event로 남는다. 알림 cron은 그 이벤트와 영향을 받는 요청을 대조하여 구매사에 안내한다. 이미 저장된 견적 마감 시각은 자동 변경하지 않으며 구매사가 별도로 수정한다. CLI에 날짜·상태·명칭·출처·변경자·사유 중 하나라도 없으면 거부한다.

## 롤백·확인

문제가 생기면 앱 기능 플래그를 내려 새 영업일 마감 선택을 중단한다. 기존 달력과 변경 이력·마감값은 지우지 않는다. 원인 수정 후 두 연도 재적재 및 coverage 확인을 마치고 다시 활성화한다. 운영 DB·실제 API 키·외부 알림·배포를 사용한 검증은 이 구현 범위에 포함되지 않았다.
