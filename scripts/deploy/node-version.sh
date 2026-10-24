# Node 버전 고정(mise.toml)을 Lightsail 스크립트가 공유한다. source 해서 쓴다.

# stdin 의 mise.toml 에서 [tools] node = "x.y.z" 값을 출력한다. 없으면 실패.
pinned_node_version() {
  local pin
  pin="$(sed -n 's/^node[[:space:]]*=[[:space:]]*"\([0-9][0-9.]*\)"[[:space:]]*$/\1/p' | head -n 1)"
  [ -n "$pin" ] || return 1
  printf '%s\n' "$pin"
}

# node -v 출력($1)이 고정 버전($2) 이상이고 메이저가 같은지 — package.json
# engines(^<pin>)와 같은 조건이다. engine-strict 가 pnpm install 을 막는 경우를
# 미리 거른다.
node_satisfies_pin() {
  local have="${1#v}" want="$2"
  [ -n "$have" ] && [ -n "$want" ] || return 1
  [ "${have%%.*}" = "${want%%.*}" ] || return 1
  [ "$(printf '%s\n%s\n' "$want" "$have" | sort -V | head -n 1)" = "$want" ]
}
