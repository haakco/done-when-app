import { describe, expect, it } from "vitest";
import { DEMO_LINKS, placeholderData } from "./placeholder";
import { ReadOnlyLinkError } from "./source";

describe("placeholder data", () => {
  it("gives owner links write access and share links read-only access", async () => {
    const owner = await placeholderData.getCounter(DEMO_LINKS.counter.ownerToken);
    const share = await placeholderData.getCounter(DEMO_LINKS.counter.shareToken);
    expect(owner.access).toBe("owner");
    expect(owner.links).toEqual(DEMO_LINKS.counter);
    expect(share).toMatchObject({ access: "share", links: null });
    await expect(
      placeholderData.addMeasurements(DEMO_LINKS.counter.shareToken, [{ measuredAt: "2026-11-20T00:00:00Z", value: 12 }]),
    ).rejects.toBeInstanceOf(ReadOnlyLinkError);
  });

  it("completes a counter when a measurement reaches the target", async () => {
    const created = await placeholderData.createCounter({
      name: "Push-ups",
      unit: "",
      startValue: 0,
      targetValue: 10,
      startedAt: "2026-11-01T00:00:00Z",
      deadline: null,
      history: [],
      expiresAfterSeconds: 60,
    });
    await placeholderData.addMeasurements(created.links.ownerToken, [{ measuredAt: "2026-11-02T00:00:00Z", value: 10 }]);
    const { item } = await placeholderData.getCounter(created.links.shareToken);
    expect(item.status).toBe("completed");
  });
});
