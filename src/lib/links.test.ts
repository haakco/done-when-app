import { describe, expect, it, vi } from "vitest";
import { copyLink, itemPath, itemUrl, parseItemRef } from "./links";

describe("item links", () => {
  it("builds owner and share paths for every item kind", () => {
    expect(itemPath("counter", "share", "abc")).toBe("/c/abc");
    expect(itemPath("project", "owner", "xyz")).toBe("/edit/p/xyz");
    expect(itemPath("dashboard", "share", "a b")).toBe("/d/a%20b");
  });

  it("makes absolute links on the current origin", () => {
    expect(itemUrl("https://done.example", "counter", "owner", "t1")).toBe("https://done.example/edit/c/t1");
  });
});

describe("copyLink", () => {
  it("writes the link to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(copyLink("https://x/c/1", { writeText })).resolves.toEqual({ status: "copied" });
    expect(writeText).toHaveBeenCalledWith("https://x/c/1");
  });

  it("returns a failed result when the clipboard is missing or refuses", async () => {
    await expect(copyLink("https://x/c/1", undefined)).resolves.toEqual({
      status: "failed",
      reason: "clipboard_unavailable",
    });
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    await expect(copyLink("https://x/c/1", { writeText })).resolves.toEqual({
      status: "failed",
      reason: "clipboard_refused",
    });
  });
});

describe("parseItemRef", () => {
  it("reads the kind and token from pasted share or owner links", () => {
    expect(parseItemRef("https://done.example/c/abc")).toEqual({ kind: "counter", token: "abc" });
    expect(parseItemRef(" https://done.example/edit/p/x%20y?ref=1 ")).toEqual({ kind: "project", token: "x y" });
  });

  it("accepts a bare token and refuses anything else", () => {
    expect(parseItemRef("abc123")).toEqual({ kind: null, token: "abc123" });
    expect(parseItemRef("https://done.example/mine")).toBeNull();
    expect(parseItemRef("")).toBeNull();
  });
});
