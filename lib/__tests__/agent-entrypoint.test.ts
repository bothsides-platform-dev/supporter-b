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
import { lstatSync, readlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const SENTINEL = "<!-- CLAUDE.md: END -->";
/** Codex `project_doc_max_bytes` 기본값. */
const CODEX_DEFAULT_DOC_CAP = 32 * 1024;

describe("agent entrypoint", () => {
  it("AGENTS.md 는 CLAUDE.md 로 향하는 상대 심링크다", () => {
    const stat = lstatSync(join(ROOT, "AGENTS.md"));
    expect(stat.isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(ROOT, "AGENTS.md"))).toBe("CLAUDE.md");
  });

  it("CLAUDE.md 는 센티널로 끝난다 — 절단 판별이 이 위치에 걸려 있다", () => {
    const lines = readFileSync(join(ROOT, "CLAUDE.md"), "utf8").trimEnd().split("\n");
    expect(lines[lines.length - 1]).toBe(SENTINEL);
  });

  it("절단 경고 블록이 Codex 기본 상한 안에 있다", () => {
    const head = readFileSync(join(ROOT, "CLAUDE.md")).subarray(0, CODEX_DEFAULT_DOC_CAP);
    expect(head.toString("utf8")).toContain("잘렸는지 먼저 확인하라");
  });
});
