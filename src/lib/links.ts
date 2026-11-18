import { appItemOwnerUrl, appItemShareUrl, parseAppItemLink } from "@haakco/custd-sdk/browser";
import { KIND_PATH } from "../data/mappers";
import type { ItemAccess, ItemKind } from "../data/types";

const ITEM_FRAGMENT = "item=";

/** In-app path of the SDK's URL for this item, so links work on any origin, local ones included. */
function pathOf(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.hash}`;
}

/** The owner page: the token sits in the fragment, which never reaches a server or analytics. */
export function ownerPath(kind: ItemKind, ownerToken: string): string {
  return pathOf(appItemOwnerUrl({ host: "app.invalid", kindPath: KIND_PATH[kind], token: ownerToken }));
}

/** The owner page of an item the signed-in user owns, opened without a link. */
export function ownedItemPath(kind: ItemKind, itemUuid: string): string {
  return `/edit/${KIND_PATH[kind]}#${ITEM_FRAGMENT}${encodeURIComponent(itemUuid)}`;
}

export function sharePath(kind: ItemKind, shareToken: string): string {
  return pathOf(appItemShareUrl({ host: "app.invalid", kindPath: KIND_PATH[kind], token: shareToken }));
}

export function absoluteUrl(path: string, origin: string = window.location.origin): string {
  return `${origin}${path}`;
}

/** Reads the owner page's fragment: an owner token, or `item=<uuid>` for a signed-in owner. */
export function ownerAccessFromHash(hash: string): ItemAccess | null {
  const fragment = hash.replace(/^#/, "");
  if (fragment.startsWith(ITEM_FRAGMENT)) {
    const item = decodeURIComponent(fragment.slice(ITEM_FRAGMENT.length));
    return item === "" ? null : { item };
  }
  return parseAppItemLink(fragment)?.token ?? null;
}

/** The token in a pasted share link, owner link or bare token. */
export function tokenFromPaste(input: string): string | null {
  return parseAppItemLink(input)?.token ?? null;
}

export type ClipboardWriter = Pick<Clipboard, "writeText">;
export type CopyFailureReason = "clipboard_unavailable" | "clipboard_refused";
export type CopyResult = { status: "copied" } | { status: "failed"; reason: CopyFailureReason };

export async function copyText(text: string, clipboard: ClipboardWriter | undefined): Promise<CopyResult> {
  if (clipboard === undefined) {
    return { status: "failed", reason: "clipboard_unavailable" };
  }
  try {
    await clipboard.writeText(text);
    return { status: "copied" };
  } catch {
    return { status: "failed", reason: "clipboard_refused" };
  }
}
