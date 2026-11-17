import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

type RoutingRules = {
  indexFile: string;
  notFoundPage: string;
  spaFallbacks: { prefix: string; file: string }[];
  cache: { match: string; mode: string }[];
  shareableRoutes: { route: string }[];
};

/** A file in the built release: Vite entries at the root, everything else from public/. */
function inRelease(file: string): boolean {
  return existsSync(resolve(root, file)) || existsSync(resolve(root, "public", file));
}

describe("custd-app.json routing rules", () => {
  const rules = JSON.parse(readFileSync(resolve(root, "public/custd-app.json"), "utf8")) as RoutingRules;

  it("names files the release contains", () => {
    for (const file of [rules.indexFile, rules.notFoundPage, ...rules.spaFallbacks.map((fallback) => fallback.file)]) {
      expect(inRelease(file), file).toBe(true);
    }
  });

  it("keeps fallbacks scoped so unknown paths get a real 404", () => {
    for (const { prefix } of rules.spaFallbacks) {
      expect(prefix).toMatch(/^\/[a-z]+\/$/);
    }
  });

  it("caches only hashed assets for good and never makes owner routes shareable", () => {
    expect(rules.cache).toEqual([{ match: "assets/**", mode: "immutable" }]);
    for (const { route } of rules.shareableRoutes) {
      expect(route).toMatch(/^\/[cpd]\/\*$/);
    }
  });
});

describe("share card templates", () => {
  const dir = resolve(root, "public/share-cards");
  const cards = readdirSync(dir);

  it("has a 1200×630 template for each item kind and the site", () => {
    expect(cards.sort()).toEqual(["counter.svg", "dashboard.svg", "project.svg", "site.svg"]);
    for (const card of cards) {
      const svg = readFileSync(resolve(dir, card), "utf8");
      expect(svg, card).toContain('width="1200" height="630"');
      expect(svg, card).toMatch(/\{\{[a-zA-Z]+\}\}/);
    }
  });
});
