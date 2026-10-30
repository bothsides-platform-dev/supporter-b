import { expect, it } from "vitest";
import { getNavCommands, getChordMap } from "../nav-config";
it("PG의 계약 메뉴와 단축키를 없애고 구매사 보관함은 유지한다", () => {
  expect(getNavCommands("pg").map((x) => x.href)).not.toContain("/contracts");
  expect(getNavCommands("pg").map((x) => x.href)).not.toContain(
    "/contract-templates",
  );
  expect(getChordMap("pg").a).toBeUndefined();
  expect(getChordMap("pg").c).toBeUndefined();
  expect(getNavCommands("pg").map((x) => x.href)).not.toContain("/quote-templates");
  expect(getNavCommands("buyer").map((x) => x.href)).toContain("/contracts");
});
