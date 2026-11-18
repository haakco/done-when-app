import { describe, expect, it, vi } from "vitest";
import { copyText, ownedItemPath, ownerAccessFromHash, ownerPath, sharePath, tokenFromPaste } from "./links";

const TOKEN = "A".repeat(42) + "b";

describe("item links", () => {
  it("keeps owner tokens in the fragment and share tokens in the path", () => {
    expect(ownerPath("counter", TOKEN)).toBe(`/edit/c#${TOKEN}`);
    expect(sharePath("project", TOKEN)).toBe(`/p/${TOKEN}`);
    expect(ownedItemPath("dashboard", "uuid-1")).toBe("/edit/d#item=uuid-1");
  });

  it("reads the owner page fragment as a token or a signed-in owner's item", () => {
    expect(ownerAccessFromHash(`#${TOKEN}`)).toBe(TOKEN);
    expect(ownerAccessFromHash("#item=uuid-1")).toEqual({ item: "uuid-1" });
    expect(ownerAccessFromHash("#nope")).toBeNull();
    expect(ownerAccessFromHash("")).toBeNull();
  });

  it("finds the token in pasted links and refuses other text", () => {
    expect(tokenFromPaste(` https://done.example/c/${TOKEN} `)).toBe(TOKEN);
    expect(tokenFromPaste(`https://done.example/edit/p#${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromPaste(TOKEN)).toBe(TOKEN);
    expect(tokenFromPaste("https://done.example/mine")).toBeNull();
  });
});

describe("copyText", () => {
  it("writes to the clipboard and reports a missing or refusing clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(copyText("x", { writeText })).resolves.toEqual({ status: "copied" });
    await expect(copyText("x", undefined)).resolves.toEqual({ status: "failed", reason: "clipboard_unavailable" });
    await expect(copyText("x", { writeText: vi.fn().mockRejectedValue(new Error("denied")) })).resolves.toEqual({
      status: "failed",
      reason: "clipboard_refused",
    });
  });
});
