// @vitest-environment node

/**
 * 에이전트 진입점 불변식 가드.
 *
 * 상대 심링크로 Codex·Claude Code가 같은 내용을 읽고, 마지막 센티널로 절단을 감지한다.
 * 공통 지침은 8KiB 이하로 유지하며 작업별 상세로 가는 문서 링크가 끊기지 않아야 한다.
 */
import { describe, expect, it } from "vitest";
import { existsSync, lstatSync, readlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const SENTINEL = "<!-- CLAUDE.md: END -->";
/** Codex `project_doc_max_bytes` 기본값. */
const CODEX_DEFAULT_DOC_CAP = 32 * 1024;
const COMMON_DOC_BUDGET = 8 * 1024;

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
    expect(text).toContain("project_doc_max_bytes"); // 절단 원인
    expect(text).toContain("rtk proxy cat"); // 원문 재확인
    expect(text).toContain("git rev-parse --show-toplevel"); // 복구 명령
  });

  it("CLAUDE.md 전문이 공통 지침 예산 8KiB 안에 들어간다", () => {
    const bytes = readFileSync(join(ROOT, "CLAUDE.md")).byteLength;
    expect(bytes).toBeLessThanOrEqual(COMMON_DOC_BUDGET);
  });

  it("CLAUDE.md 의 문서 포인터가 모두 실제 파일을 가리킨다", () => {
    // 상세가 포인터 뒤로 내려갔으므로 끊어진 포인터는 규칙을 조용히 숨긴다.
    const doc = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");
    const pointers = [...doc.matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/g)].map(
      ([, target]) => target.split("#")[0],
    );
    expect(pointers).toEqual(
      expect.arrayContaining([
        "docs/agents/workflow.md",
        "docs/agents/product-rules.md",
        "docs/agents/routing.md",
        "docs/agents/server.md",
        "DESIGN.md",
        "SCREEN_DESIGN.md",
        "UX_WRITING.md",
      ]),
    );
    expect(pointers.filter((path) => !existsSync(join(ROOT, path)))).toEqual([]);
  });
});
