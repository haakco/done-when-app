import { describe, expect, it } from "vitest";
import { DEFAULT_EXPIRY_SECONDS, EXPIRY_OPTIONS, expiryLabel } from "./expiry";

describe("expiry options", () => {
  it("runs from 1 minute to 1 year in ascending order", () => {
    const seconds = EXPIRY_OPTIONS.map((option) => option.seconds);
    expect(seconds[0]).toBe(60);
    expect(seconds.at(-1)).toBe(365 * 86400);
    expect([...seconds].sort((a, b) => a - b)).toEqual(seconds);
  });

  it("defaults to 7 days, which is one of the options", () => {
    expect(DEFAULT_EXPIRY_SECONDS).toBe(7 * 86400);
    expect(expiryLabel(DEFAULT_EXPIRY_SECONDS)).toBe("7 days");
  });

  it("labels values that are not an option", () => {
    expect(expiryLabel(90)).toBe("90 seconds");
  });
});
