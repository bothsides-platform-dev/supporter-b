#!/usr/bin/env bash
#
# oci-a1-retry.sh — OCI Always Free Ampere A1 용량 추첨 자동 재시도 런처
#
# 'Out of host capacity'는 영구 거절이 아니라 추첨이다. 콘솔 수동 클릭은
# 추첨에서 가장 불리하므로, 이 스크립트가 용량이 뜰 때까지 launchInstance 를
# 반복 호출한다. 핵심 안전속성 두 가지:
#   1) 성공하는 즉시 멈춘다           → 중복/과금 인스턴스 방지
#   2) 기존 인스턴스가 있으면 시작 거부 → 두 번째 인스턴스 생성 방지
# 'Out of host capacity' 외의 에러(인증·쿼터·잘못된 파라미터)는 재시도해도
# 무의미하므로 즉시 중단한다.
#
# 사용법 (Mac 안 자게 caffeinate 로 감싸 백그라운드 방치):
#   caffeinate -i ./scripts/deploy/oci-a1-retry.sh 2>&1 | tee oci-a1-retry.log
#
# 조정 가능(환경변수): OCPUS, MEM_GB, SLEEP_BASE, DISPLAY_NAME, SSH_PUBKEY
#
# 파라미터는 2026-05-21 `oci` CLI 조회로 확정된 bidit-prod / ap-chuncheon-1 값.
set -uo pipefail

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
SLEEP_BASE="${SLEEP_BASE:-60}"   # 재시도 간격(초). 0~20초 지터가 더해진다.

export SUPPRESS_LABEL_WARNING=True

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# ---- 사전 점검 ----
[[ -f "$SSH_PUBKEY" ]] || { log "[ABORT] SSH 공개키 없음: $SSH_PUBKEY"; exit 1; }

existing=$(oci compute instance list -c "$COMPARTMENT_ID" \
  --query 'data[?"lifecycle-state"!=`TERMINATED`].id | length(@)' --raw-output 2>/dev/null || echo "ERR")
if [[ "$existing" == "ERR" ]]; then
  log "[ABORT] 인증/조회 실패. 'oci iam region-subscription list' 로 ~/.oci/config 를 먼저 확인."
  exit 1
fi
if [[ "$existing" != "0" ]]; then
  log "[ABORT] 활성 인스턴스가 이미 $existing 개 존재. 중복 생성 방지를 위해 시작하지 않음."
  exit 1
fi

log "재시도 시작: $SHAPE ${OCPUS}OCPU/${MEM_GB}GB → '$DISPLAY_NAME' @ $AD"
log "성공하면 자동으로 멈추고 예약 IP(168.107.39.155)를 연결한다. Ctrl-C 로 중단 가능."

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

attempt=0
while true; do
  attempt=$((attempt + 1))
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
    iid=$(echo "$out" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])' 2>/dev/null)
    log "(#$attempt) ✅ 성공! 인스턴스 RUNNING: ${iid:-<id 파싱 실패, 콘솔 확인>}"
    [[ -n "${iid:-}" ]] && attach_reserved_ip "$iid"
    log "다음: DEPLOY_OCI.md §2(부트스트랩)로 진행."
    exit 0
  fi

  if echo "$out" | grep -qi "Out of host capacity"; then
    wait=$((SLEEP_BASE + RANDOM % 21))
    log "(#$attempt) 용량 없음(Out of host capacity). ${wait}s 후 재시도…"
    sleep "$wait"
    continue
  fi

  log "(#$attempt) ❌ 치명적 에러(재시도 안 함):"
  echo "$out" | head -25
  exit 1
done
