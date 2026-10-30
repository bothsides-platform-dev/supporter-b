// @vitest-environment node

/**
 * 에이전트 진입점 불변식 가드.
 *
 * `AGENTS.md` 는 `CLAUDE.md` 로 향하는 심볼릭 링크다 — Codex 는 AGENTS.md 를 프로젝트
 * 문서로 읽고 Claude Code 의 `@파일` import 를 확장하지 않으므로, 링크여야 두 도구가
 * 같은 바이트를 본다. 사본을 손으로 유지하면 이 레포가 반복해서 겪은 드리프트가 된다.
 *
 * 링크는 조용히 깨진다: 제자리 쓰기(`>` 리다이렉트·일부 에디터)는 링크를 따라가
 * CLAUDE.md 를 덮어쓰고, 원자적 저장(임시파일 → rename)은 링크를 일반 파일로 바꿔
 * 사본을 되살린다. 어느 쪽도 사람 눈에 띄지 않아 여기서 못박는다.
 *
 * 절단 안전망도 함께 지킨다. Codex 는 `project_doc_max_bytes`(기본 32KiB)에서 표시 없이
 * 자르므로 CLAUDE.md 는 ① 마지막 줄 센티널로 절단을 드러내고 ② 그 판별법을 적은 경고
 * 블록이 32KiB 안에 있어야 한다. 문서가 자라 경고가 상한 밖으로 밀리면 안전망이 조용히
 * 죽는다 — 그 순간을 이 테스트가 잡는다.
 */
import { describe, expect, it } from "vitest";
import { existsSync, lstatSync, readlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const SENTINEL = "<!-- CLAUDE.md: END -->";
/** Codex `project_doc_max_bytes` 기본값. */
const CODEX_DEFAULT_DOC_CAP = 32 * 1024;

describe("agent entrypoint", () => {
  it("Next.js dev 서버가 에이전트 진입점 파일을 자동으로 다시 쓰지 않는다", async () => {
    const { default: nextConfig } = await import("../../next.config");

    expect(nextConfig.agentRules).toBe(false);
  });

  it("AGENTS.md 는 CLAUDE.md 로 향하는 상대 심링크다", () => {
    const stat = lstatSync(join(ROOT, "AGENTS.md"));
    expect(stat.isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(ROOT, "AGENTS.md"))).toBe("CLAUDE.md");
  });

  it("CLAUDE.md 는 센티널로 끝난다 — 절단 판별이 이 위치에 걸려 있다", () => {
    const lines = readFileSync(join(ROOT, "CLAUDE.md"), "utf8").trimEnd().split("\n");
    expect(lines[lines.length - 1]).toBe(SENTINEL);
  });

  it("센티널 리터럴은 문서에 딱 한 번만 나온다", () => {
    // 앞쪽에 한 번 더 적히면 grep 방식 판별이 잘린 로드에서도 1건을 찾아 통과시킨다.
    const doc = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");
    expect(doc.split(SENTINEL).length - 1).toBe(1);
  });

  it("절단 경고 블록이 Codex 기본 상한 안에 있다", () => {
    const head = readFileSync(join(ROOT, "CLAUDE.md")).subarray(0, CODEX_DEFAULT_DOC_CAP);
    const text = head.toString("utf8");
    expect(text).toContain("잘렸는지 먼저 확인하라"); // 경고의 시작
    expect(text).toContain("git rev-parse --show-toplevel"); // 복구 명령
    expect(text).toContain("project_doc_max_bytes = 262144"); // 항구적 해결
  });

  it("CLAUDE.md 전문이 Codex 기본 상한 안에 들어간다", () => {
    // 넘으면 설정 없는 Codex 는 앞부분만 보고, 모든 세션이 그만큼 컨텍스트를 더 쓴다.
    // 상세는 `docs/agents/` 로 내리고 이 파일에는 포인터만 남긴다.
    const bytes = readFileSync(join(ROOT, "CLAUDE.md")).byteLength;
    expect(bytes).toBeLessThanOrEqual(CODEX_DEFAULT_DOC_CAP);
  });

  it("CLAUDE.md 의 문서 포인터가 모두 실제 파일을 가리킨다", () => {
    // 상세가 포인터 뒤로 내려갔으므로 끊어진 포인터는 규칙을 조용히 숨긴다.
    const doc = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");
    const pointers = [...doc.matchAll(/`([\w./-]+\.md)`/g)].map(([, path]) => path);
    expect(pointers).toContain("docs/agents/product-rules.md");
    expect(pointers.filter((path) => !existsSync(join(ROOT, path)))).toEqual([]);
  });
});
