#!/usr/bin/env bash
# Stop hook: Claude 턴이 끝날 때마다 변경사항을 자동 commit
# nested guard: hook 내부에서 호출한 `claude -p`가 자기 자신을 재귀 호출하지 않도록
set -u
[ "${BIDIT_AUTOCOMMIT_RUNNING:-}" = "1" ] && exit 0

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$ROOT" || exit 0

# tracked + untracked 변경사항이 전혀 없으면 skip
if git diff --quiet HEAD -- 2>/dev/null && [ -z "$(git ls-files --others --exclude-standard 2>/dev/null)" ]; then
  exit 0
fi

git add -A 2>/dev/null

# add 후 staged 변경이 없으면 (모두 gitignored인 경우 등) skip
if git diff --cached --quiet --; then
  exit 0
fi

# LLM에게 commit 메시지 작성 요청 (재귀 차단을 위해 sentinel export)
DIFF_INPUT=$(
  git diff --cached --stat 2>/dev/null
  echo "---DIFF---"
  git diff --cached 2>/dev/null | head -400
)

export BIDIT_AUTOCOMMIT_RUNNING=1
MSG=$(
  printf '%s\n' "$DIFF_INPUT" \
    | claude -p "다음 git diff를 보고 한국어 conventional commit 메시지를 한 줄만 출력해. 형식: <type>(<scope>): <subject>. 따옴표·설명·코드펜스 없이 메시지 본문만 출력." 2>/dev/null \
    | head -1 \
    | sed -e 's/^[[:space:]"`'"'"']*//;s/[[:space:]"`'"'"']*$//'
)
unset BIDIT_AUTOCOMMIT_RUNNING

[ -z "$MSG" ] && MSG="chore: auto-commit $(date '+%Y-%m-%d %H:%M:%S')"

if git commit -m "$MSG" >/tmp/bidit-autocommit.log 2>&1; then
  SHA=$(git rev-parse --short HEAD)
  printf '{"systemMessage":"auto-commit %s — %s","suppressOutput":true}\n' "$SHA" "$MSG"
else
  # pre-commit hook 실패 등 — 다음 턴에 재시도하도록 silently 종료
  printf '{"systemMessage":"auto-commit skipped (commit failed, see /tmp/bidit-autocommit.log)","suppressOutput":true}\n'
fi
exit 0
