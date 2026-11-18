import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

type Card = { cardTemplate: string; title: string; description?: string };
type RoutingRules = {
  indexFile: string;
  notFoundPage: string;
  spaFallbacks: { prefix: string; file: string }[];
  cache: { match: string; mode: string }[];
  shareableRoutes: (Card & { route: string; kind: string })[];
  siteCard: Card;
};

/**
 * Card fields Custd's share previews fill (services/app-delivery/internal/preview/item_read.go),
 * plus `percent`, which the counter card's progress bar asks for and Custd does not send yet: the
 * bar then shows empty.
 */
const ITEM_FIELDS = new Set(["name", "description", "unit", "target", "deliveryTarget", "estimateLow", "estimateHigh", "chance", "itemCount", "percent"]);
const SITE_FIELDS = new Set(["title", "description"]);
const FIELD = /\{\{\s*([A-Za-z][A-Za-z0-9_.-]*)\s*\}\}/g;

function fieldsOf(text: string): string[] {
  return [...text.matchAll(FIELD)].map((match) => match[1] ?? "");
}

/** A file in the built release: Vite entries at the root, everything else from public/. */
function inRelease(file: string): boolean {
  return existsSync(resolve(root, file)) || existsSync(resolve(root, "public", file));
}

const rules = JSON.parse(readFileSync(resolve(root, "public/custd-app.json"), "utf8")) as RoutingRules;
const template = (file: string) => readFileSync(resolve(root, "public", file), "utf8");

describe("custd-app.json routing rules", () => {
  it("names files the release contains and keeps fallbacks scoped so unknown paths get a real 404", () => {
    for (const file of [rules.indexFile, rules.notFoundPage, ...rules.spaFallbacks.map((fallback) => fallback.file)]) {
      expect(inRelease(file), file).toBe(true);
    }
    for (const { prefix } of rules.spaFallbacks) {
      expect(prefix).toMatch(/^\/[a-z]+\/$/);
    }
    expect(rules.cache).toEqual([{ match: "assets/**", mode: "immutable" }]);
  });

  it("shares only the read-only routes, each with its item kind and a card", () => {
    expect(rules.shareableRoutes.map(({ route, kind }) => [route, kind])).toEqual([
      ["/c/*", "measurement_project"],
      ["/p/*", "measurement_project"],
      ["/d/*", "link_collection"],
    ]);
    for (const card of [...rules.shareableRoutes, rules.siteCard]) {
      expect(card.title.trim()).not.toBe("");
      expect(inRelease(card.cardTemplate), card.cardTemplate).toBe(true);
    }
  });

  it("uses only fields the previews fill", () => {
    for (const route of rules.shareableRoutes) {
      for (const field of fieldsOf(`${route.title} ${route.description ?? ""} ${template(route.cardTemplate)}`)) {
        expect(ITEM_FIELDS, `${route.route}: ${field}`).toContain(field);
      }
    }
    for (const field of fieldsOf(template(rules.siteCard.cardTemplate))) {
      expect(SITE_FIELDS, `site card: ${field}`).toContain(field);
    }
  });
});

describe("share card templates", () => {
  it("has a 1200×630 template for each item kind and the site", () => {
    const cards = readdirSync(resolve(root, "public/share-cards")).sort();
    expect(cards).toEqual(["counter.svg", "dashboard.svg", "project.svg", "site.svg"]);
    for (const card of cards) {
      expect(template(`share-cards/${card}`), card).toContain('width="1200" height="630"');
    }
  });

  it("draws the counter's progress as a percentage of a nested bar", () => {
    expect(template("share-cards/counter.svg")).toMatch(/<svg x="80" y="390" width="1040" height="28">[\s\S]*width="\{\{percent\}\}%"/);
  });
});
