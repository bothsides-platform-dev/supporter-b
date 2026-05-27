import ky from "ky";
import { describe, expect, it } from "vitest";

describe("ky", () => {
  it("imports as a function", () => {
    expect(typeof ky).toBe("function");
  });
});
