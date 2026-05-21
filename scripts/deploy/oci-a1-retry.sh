#!/usr/bin/env bash
#
# oci-a1-retry.sh — OCI Always Free Ampere A1 용량 추첨 "단발" launch (cron 매시 1회용)
#
# 'Out of host capacity'는 영구 거절이 아니라 추첨이다. 콘솔 수동 클릭은 추첨에서
# 가장 불리하므로, 이 스크립트가 launchInstance 를 대신 호출한다.
#
# ⚠️ 과거엔 한 프로세스가 `while true` 로 60초마다 재시도했는데, 그게 OCI 의
#    launchInstance 레이트리밋(429 TooManyRequests)을 건드려 스크립트가 죽었다.
#    그래서 **이 스크립트는 호출당 launch 를 딱 한 번만** 시도하고, "매시 1회"
#    리듬은 cron 이 준다. 429 와 'Out of host capacity'는 둘 다 "다음 시도에서
#    다시"인 정상 재시도 사유로 취급한다(치명 에러 아님).
#
# 핵심 안전속성 두 가지(예전과 동일):
#   1) 성공하는 즉시 멈춘다           → 중복/과금 인스턴스 방지
#   2) 기존 인스턴스가 있으면 시작 거부 → 두 번째 인스턴스 생성 방지
#      (cron 이 성공 후에도 매시 깨어나지만 이 가드 때문에 절대 둘째를 안 만든다)
#
# 사용법:
#   ./scripts/deploy/oci-a1-retry.sh install     # 매시 정각 cron 등록
#   ./scripts/deploy/oci-a1-retry.sh status      # cron/인스턴스 상태 확인
#   ./scripts/deploy/oci-a1-retry.sh uninstall   # 성공/중단 후 cron 해제
#   ./scripts/deploy/oci-a1-retry.sh run         # 지금 1회만 시도(수동)
#
# 조정 가능(환경변수): OCPUS, MEM_GB, SSH_PUBKEY, DISPLAY_NAME, LOGFILE
#
# 파라미터는 2026-05-21 `oci` CLI 조회로 확정된 bidit-prod / ap-chuncheon-1 값.
set -uo pipefail

# cron 은 PATH 가 거의 비어 있어 /opt/homebrew/bin 의 oci·python3 를 못 찾는다.
# crontab 줄이 아니라 스크립트 안에서 PATH 를 박아 자급자족하게 한다.
PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin"
export PATH

# ---- 확정 파라미터 (ap-chuncheon-1 / bidit-prod) ----
COMPARTMENT_ID="ocid1.compartment.oc1..aaaaaaaan6xwpen74f3ryiv6yijbbsyzgfdwgxvdzjgc3r7j7aeh7i6zzssq"
AD="Szmf:AP-CHUNCHEON-1-AD-1"
SHAPE="VM.Standard.A1.Flex"
IMAGE_ID="ocid1.image.oc1.ap-chuncheon-1.aaaaaaaalcmf2em45er7hd7rc3mfm24ylgfogqefet6ajzujjx6jme7blosq" # Ubuntu 24.04 aarch64 2026.04.30
SUBNET_ID="ocid1.subnet.oc1.ap-chuncheon-1.aaaaaaaa6rxwddghyoac4hxc7uzucxvrudehv26bvhldonkglm5lel6hd4ba" # public subnet-supporter-b (22/80/443)
RESERVED_IP_ID="ocid1.publicip.oc1.ap-chuncheon-1.amaaaaaagyyzfqqayedidce54srlxaszwyk6cgpgns3qod7ocqoo4qk4icpa" # 168.107.39.155

# ---- 조정 가능 ----
OCPUS="${OCPUS:-4}"
MEM_GB="${MEM_GB:-24}"
SSH_PUBKEY="${SSH_PUBKEY:-$HOME/.ssh/bidit_oci.pub}"
DISPLAY_NAME="${DISPLAY_NAME:-bidit-prod}"
LOGFILE="${LOGFILE:-$HOME/oci-a1-retry.log}"

export SUPPRESS_LABEL_WARNING=True

# 이 스크립트의 절대경로 — crontab 줄과 가드 매칭에 쓴다.
SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
# 정각(:00)은 다들 launch 를 몰아쳐 용량 경쟁·레이트리밋이 가장 심하다. 살짝 비켜선 분에 돈다.
CRON_MIN="${CRON_MIN:-14}"
CRON_LINE="$CRON_MIN * * * * $SELF run"

# run 경로 로그는 파일 + 화면 둘 다(cron 은 화면이 없으니 파일이 본체).
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOGFILE"; }

count_instances() {
  local out
  out=$(oci compute instance list -c "$COMPARTMENT_ID" \
    --query 'data[?"lifecycle-state"!=`TERMINATED`].id | length(@)' --raw-output 2>/dev/null) || { echo "ERR"; return; }
  # OCI CLI returns empty string (not "0") when no instances exist
  echo "${out:-0}"
}

attach_reserved_ip() {
  local iid="$1"
  log "예약 공인 IP 연결 시도…"
  local vnic_id priv_ip_id
  vnic_id=$(oci compute instance list-vnics --instance-id "$iid" \
    --query 'data[0].id' --raw-output 2>/dev/null)
  [[ -n "$vnic_id" && "$vnic_id" != "null" ]] || { log "  [WARN] VNIC 조회 실패 — 수동 연결 필요."; return 1; }
  priv_ip_id=$(oci network private-ip list --vnic-id "$vnic_id" \
    --query 'data[0].id' --raw-output 2>/dev/null)
  [[ -n "$priv_ip_id" && "$priv_ip_id" != "null" ]] || { log "  [WARN] private-ip 조회 실패 — 수동 연결 필요."; return 1; }
  if oci network public-ip update --public-ip-id "$RESERVED_IP_ID" --private-ip-id "$priv_ip_id" >/dev/null 2>&1; then
    log "  ✅ 168.107.39.155 연결 완료 → ssh -i ~/.ssh/bidit_oci ubuntu@168.107.39.155"
  else
    log "  [WARN] 예약 IP 연결 실패. 수동: oci network public-ip update --public-ip-id $RESERVED_IP_ID --private-ip-id $priv_ip_id"
    return 1
  fi
}

# ---- 단발 launch 시도 (cron 이 부르는 기본 동작) ----
do_run() {
  [[ -f "$SSH_PUBKEY" ]] || { log "[ABORT] SSH 공개키 없음: $SSH_PUBKEY"; exit 1; }

  local existing
  existing=$(count_instances)
  if [[ "$existing" == "ERR" ]]; then
    log "[ABORT] 인증/조회 실패. 'oci iam region-subscription list' 로 ~/.oci/config 를 먼저 확인."
    exit 1
  fi
  if [[ "$existing" != "0" ]]; then
    # 성공 후 cron 이 또 깨어난 경우 — 둘째를 안 만들고 조용히 끝낸다(정상).
    log "[done] 활성 인스턴스 $existing 개 존재 — 생성 안 함. cron 정리: $SELF uninstall"
    exit 0
  fi

  log "launch 시도: $SHAPE ${OCPUS}OCPU/${MEM_GB}GB → '$DISPLAY_NAME' @ $AD"
  local out rc
  out=$(oci compute instance launch \
    --compartment-id "$COMPARTMENT_ID" \
    --availability-domain "$AD" \
    --shape "$SHAPE" \
    --shape-config "{\"ocpus\": $OCPUS, \"memoryInGBs\": $MEM_GB}" \
    --image-id "$IMAGE_ID" \
    --subnet-id "$SUBNET_ID" \
    --assign-public-ip false \
    --ssh-authorized-keys-file "$SSH_PUBKEY" \
    --display-name "$DISPLAY_NAME" \
    --wait-for-state RUNNING \
    2>&1)
  rc=$?

  if [[ $rc -eq 0 ]]; then
    local iid
    iid=$(echo "$out" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])' 2>/dev/null)
    log "✅ 성공! 인스턴스 RUNNING: ${iid:-<id 파싱 실패, 콘솔 확인>}"
    [[ -n "${iid:-}" ]] && attach_reserved_ip "$iid"
    log "✅ 완료. 다음: DEPLOY_OCI.md §2(부트스트랩). cron 정리: $SELF uninstall"
    exit 0
  fi

  # 정상 재시도 사유 — 다음 cron(1h 후)이 다시 시도. cron 메일 안 울리게 exit 0.
  if echo "$out" | grep -qiE 'Out of host capacity|TooManyRequests|"status": ?429'; then
    local reason
    reason=$(echo "$out" | grep -oiE 'Out of host capacity|TooManyRequests' | head -1)
    log "재시도 사유(${reason:-rate/capacity}) — 다음 cron(약 1h 후) 재시도."
    exit 0
  fi

  # 치명 에러(인증·쿼터·잘못된 파라미터) — 다음 cron도 같은 결과. exit 1 로 구분.
  log "❌ 치명적 에러(다음 cron도 같은 결과일 것 — 원인 해결 필요):"
  echo "$out" | head -25 | tee -a "$LOGFILE"
  exit 1
}

# ---- cron 등록(매시 정각, 멱등) ----
do_install() {
  local current
  current=$(crontab -l 2>/dev/null | grep -vF "$SELF" || true)
  if [[ -z "$current" ]]; then
    printf '%s\n' "$CRON_LINE" | crontab -
  else
    printf '%s\n%s\n' "$current" "$CRON_LINE" | crontab -
  fi
  echo "✅ cron 등록 완료: 매시 ${CRON_MIN}분 launch 1회 시도"
  echo "   $CRON_LINE"
  echo "   로그: $LOGFILE   (실시간: tail -f \"$LOGFILE\")"
  echo
  echo "⚠️  이 Mac 이 절전(sleep)에 들면 그동안 cron 은 안 돈다(밤새 0회 시도 가능)."
  echo "    밤새 시도하려면 절전 방지: caffeinate -s &   (또는 시스템 설정 > 잠금 화면/배터리에서 절전 해제)"
  echo "    절전 후 깨어나며 미실행분을 보충하고 싶으면 cron 대신 launchd 사용."
  echo
  echo "성공/중단 후 정리: $SELF uninstall"
}

# ---- cron 해제 ----
do_uninstall() {
  if ! crontab -l 2>/dev/null | grep -qF "$SELF"; then
    echo "cron 에 등록돼 있지 않음 (정리할 것 없음)."
    return 0
  fi
  local remaining
  remaining=$(crontab -l 2>/dev/null | grep -vF "$SELF" || true)
  if [[ -z "$remaining" ]]; then
    crontab -r 2>/dev/null || true
  else
    printf '%s\n' "$remaining" | crontab -
  fi
  echo "✅ cron 해제 완료."
}

# ---- 상태 ----
do_status() {
  local line
  line=$(crontab -l 2>/dev/null | grep -F "$SELF" | head -1)
  if [[ -n "$line" ]]; then
    echo "cron: 등록됨 (매시 ${line%% *}분)"
  else
    echo "cron: 미등록  ($SELF install 로 등록)"
  fi
  echo "활성 인스턴스: $(count_instances) 개"
  echo "로그: $LOGFILE"
}

usage() {
  cat <<EOF
oci-a1-retry.sh — OCI A1 용량 추첨 단발 launch (cron 매시 1회용)

  $SELF install     매시 cron 등록 (기본 :14분, CRON_MIN 으로 조정)
  $SELF status      cron/인스턴스 상태 확인
  $SELF uninstall   cron 해제
  $SELF run         지금 1회만 launch 시도 (cron 이 부르는 기본 동작)

환경변수: OCPUS MEM_GB SSH_PUBKEY DISPLAY_NAME LOGFILE
EOF
}

case "${1:-run}" in
  run)        do_run ;;
  install)    do_install ;;
  uninstall)  do_uninstall ;;
  status)     do_status ;;
  -h|--help|help) usage ;;
  *) usage; exit 1 ;;
esac
