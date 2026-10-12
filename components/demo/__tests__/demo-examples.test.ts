import { expect, it } from "vitest";
import { demoRequoteDeadline } from "@/lib/demo/demo-examples";

it("sets the demo requote deadline to the nearest valid business day after the existing deadline", () => {
  expect(demoRequoteDeadline("2026-10-15", new Date("2026-10-12T03:00:00.000Z"))).toBe("2026-10-16");
});

it("skips weekends and May 1 when choosing a demo requote deadline", () => {
  expect(demoRequoteDeadline("2027-04-30", new Date("2027-04-26T03:00:00.000Z"))).toBe("2027-05-03");
});
