import type { Access, ItemKind } from "../data/types";

const KIND_SEGMENT: Record<ItemKind, string> = { counter: "c", project: "p", dashboard: "d" };

/** Share links are short and unfurl with a preview; owner links sit under /edit and never unfurl. */
export function itemPath(kind: ItemKind, access: Access, token: string): string {
  const path = `/${KIND_SEGMENT[kind]}/${encodeURIComponent(token)}`;
  return access === "owner" ? `/edit${path}` : path;
}

export function itemUrl(origin: string, kind: ItemKind, access: Access, token: string): string {
  return `${origin}${itemPath(kind, access, token)}`;
}

export type ClipboardWriter = Pick<Clipboard, "writeText">;
export type CopyFailureReason = "clipboard_unavailable" | "clipboard_refused";
export type CopyResult = { status: "copied" } | { status: "failed"; reason: CopyFailureReason };

export async function copyLink(url: string, clipboard: ClipboardWriter | undefined): Promise<CopyResult> {
  if (clipboard === undefined) {
    return { status: "failed", reason: "clipboard_unavailable" };
  }
  try {
    await clipboard.writeText(url);
    return { status: "copied" };
  } catch {
    return { status: "failed", reason: "clipboard_refused" };
  }
}

export type ItemRef = { kind: ItemKind | null; token: string };

const SEGMENT_KIND: Record<string, ItemKind> = { c: "counter", p: "project", d: "dashboard" };
const BARE_TOKEN = /^[A-Za-z0-9_-]+$/;

/** Reads a pasted share link, owner link or bare token. */
export function parseItemRef(input: string): ItemRef | null {
  const trimmed = input.trim();
  if (BARE_TOKEN.test(trimmed)) {
    return { kind: null, token: trimmed };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const match = /^(?:\/edit)?\/([cpd])\/([^/]+)$/.exec(url.pathname);
  const kind = match?.[1] === undefined ? undefined : SEGMENT_KIND[match[1]];
  if (kind === undefined || match?.[2] === undefined) {
    return null;
  }
  return { kind, token: decodeURIComponent(match[2]) };
}
