// What this browser remembers, and nothing a server sees: the share token Custd shows only once,
// the items opened here ("Recent on this device"), which owner-link notices and nudges were
// dismissed, the "Celebrations" preference, and the guesses made here before a forecast was shown.
// Storage can be blocked or full; every read then falls back to "nothing remembered".

import type { Access, ItemKind } from "../data/types";
import { parseGuessBook, type GuessBook } from "./guesses";

const SHARE_PREFIX = "done-when:share:";
const NOTICE_PREFIX = "done-when:owner-notice:";
const RECENT_KEY = "done-when:recent";
const CELEBRATIONS_KEY = "done-when:celebrations";
const NUDGE_PREFIX = "done-when:nudge:";
const GUESS_PREFIX = "done-when:guesses:";
const RECENT_LIMIT = 20;
const CHANGE_EVENT = "done-when:device";

function read(key: string): string | null {
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) globalThis.localStorage.removeItem(key);
    else globalThis.localStorage.setItem(key, value);
  } catch {
    // Blocked or full: the app works without the memory.
  }
  globalThis.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Re-renders a component when something on this device changes. */
export function subscribeDevice(listener: () => void): () => void {
  globalThis.addEventListener(CHANGE_EVENT, listener);
  globalThis.addEventListener("storage", listener);
  return () => {
    globalThis.removeEventListener(CHANGE_EVENT, listener);
    globalThis.removeEventListener("storage", listener);
  };
}

export function rememberShareToken(itemUuid: string, shareToken: string): void {
  write(`${SHARE_PREFIX}${itemUuid}`, shareToken);
}

export function savedShareToken(itemUuid: string): string | null {
  return read(`${SHARE_PREFIX}${itemUuid}`);
}

export function ownerNoticeDismissed(itemUuid: string): boolean {
  return read(`${NOTICE_PREFIX}${itemUuid}`) !== null;
}

export function dismissOwnerNotice(itemUuid: string): void {
  write(`${NOTICE_PREFIX}${itemUuid}`, "1");
}

/** An item opened in this browser. `path` is the page it was opened on, owner token included. */
export type RecentItem = { itemUuid: string; kind: ItemKind; name: string; role: Access; path: string; openedAt: string };

export function recentItems(): RecentItem[] {
  try {
    const parsed: unknown = JSON.parse(read(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as RecentItem[]) : [];
  } catch {
    return [];
  }
}

/** Keeps the newest opening of each item, owner access over share, at most 20 items. */
export function rememberRecent(item: RecentItem): void {
  const others = recentItems().filter((entry) => entry.itemUuid !== item.itemUuid);
  const previous = recentItems().find((entry) => entry.itemUuid === item.itemUuid);
  const kept = previous?.role === "owner" && item.role === "share" ? { ...item, role: previous.role, path: previous.path } : item;
  if (previous && previous.name === kept.name && previous.path === kept.path && Date.parse(kept.openedAt) - Date.parse(previous.openedAt) < 60_000) return;
  write(RECENT_KEY, JSON.stringify([kept, ...others].slice(0, RECENT_LIMIT)));
}

export function forgetRecent(): void {
  write(RECENT_KEY, null);
}

/** Celebrations are on unless this device turned them off. */
export function celebrationsOn(): boolean {
  return read(CELEBRATIONS_KEY) !== "off";
}

export function setCelebrations(on: boolean): void {
  write(CELEBRATIONS_KEY, on ? null : "off");
}

/** A nudge is dismissed for one state of an item, e.g. its latest estimate; a newer one nudges again. */
export function nudgeDismissed(itemUuid: string, state: string): boolean {
  return read(`${NUDGE_PREFIX}${itemUuid}`) === state;
}

export function dismissNudge(itemUuid: string, state: string): void {
  write(`${NUDGE_PREFIX}${itemUuid}`, state);
}

/** The raw stored text, so `useSyncExternalStore` compares a stable value. */
export function guessBookText(itemUuid: string): string | null {
  return read(`${GUESS_PREFIX}${itemUuid}`);
}

export function guessBook(itemUuid: string): GuessBook {
  return parseGuessBook(guessBookText(itemUuid));
}

export function saveGuessBook(itemUuid: string, book: GuessBook): void {
  write(`${GUESS_PREFIX}${itemUuid}`, JSON.stringify(book));
}
