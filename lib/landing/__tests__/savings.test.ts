import { expect, it } from "vitest";
import { calculateSavings } from "../savings";

it.each([
  ["1000000000", "1", 10000000, 833333],
  ["0", "1", 0, 0],
  ["100", "0", 0, 0],
  ["250", "64.6", 162, 13],
  ["550", "1", 6, 0],
  ["1000000000", ".3", 3000000, 250000],
  ["9007199254740991", "100", 9007199254740991, 750599937895083],
] as const)(
  "calculates %s at %s with independent exact rounding",
  (volume, reduction, annual, monthly) => {
    expect(calculateSavings(volume, reduction)).toEqual({ annual, monthly });
  },
);
it.each([
  ["", "1"],
  ["1", ""],
  ["1", "."],
  ["-1", "1"],
  ["1.1", "1"],
  ["9007199254740992", "1"],
  ["1", "100.01"],
  ["1", "0.123"],
])("rejects missing or invalid %s / %s", (volume, reduction) => {
  expect(calculateSavings(volume, reduction)).toEqual({
    annual: null,
    monthly: null,
  });
});
