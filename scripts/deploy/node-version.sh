# Node 버전 고정(mise.toml)을 Lightsail 스크립트가 공유한다. source 해서 쓴다.
# 호출하는 쪽이 set -euo pipefail 이므로 head 로 끊는 파이프를 쓰지 않는다.

# stdin 의 mise.toml 에서 [tools] node = "x.y.z" 값을 출력한다. 없으면 실패.
# 이 한 줄 형식은 lib/__tests__/node-version-source.test.ts 가 고정한다.
pinned_node_version() {
  local pin
  pin="$(sed -n 's/^node[[:space:]]*=[[:space:]]*"\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)"[[:space:]]*$/\1/p')"
  pin="${pin%%$'\n'*}"
  [ -n "$pin" ] || return 1
  printf '%s\n' "$pin"
}

# $1 이 x.y.z 형식인지. URL·명령에 들어가기 전에 확인한다.
is_node_version() {
  [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

# node -v 출력($1)이 고정 버전($2)과 메이저가 같고 그 이상인지 — package.json
# engines(^<pin>)와 같은 조건이라, engine-strict 가 pnpm install 을 막을 경우를
# 미리 거른다.
node_satisfies_pin() {
  local have="${1#v}" want="$2"
  [ -n "$have" ] && [ -n "$want" ] || return 1
  [ "${have%%.*}" = "${want%%.*}" ] || return 1
  printf '%s\n%s\n' "$want" "$have" | sort -V -C
}

# 리비전 $1 의 mise.toml 고정 버전을 지금 node 가 만족하는지 확인한다. 그
# 리비전에 mise.toml 이 없으면(이 게이트 이전으로의 revert) 경고만 하고 통과한다
# — pnpm install 의 engine-strict 가 마지막 방어선으로 남는다.
check_node_for_rev() {
  local rev="$1" want have
  if ! git cat-file -e "$rev:mise.toml" 2>/dev/null; then
    echo "WARN: $rev has no mise.toml — skipping the Node pin check" >&2
    return 0
  fi
  want="$(git show "$rev:mise.toml" | pinned_node_version)" || {
    echo "ERROR: $rev:mise.toml has no node = \"x.y.z\" pin" >&2
    return 1
  }
  have="$(node -v 2>/dev/null || true)"
  if ! node_satisfies_pin "$have" "$want"; then
    echo "ERROR: Node ${have:-(none)} does not satisfy ^$want (same major, $want or later). Install it first: bash scripts/deploy/install-node.sh $want — then restart PM2 as in docs/DEPLOY_LIGHTSAIL.md (Node 설치)." >&2
    return 1
  fi
}
