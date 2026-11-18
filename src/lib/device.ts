// Custd shows an item's share token once, at creation or when the link is replaced, and never
// again. The owner page keeps it on this device so "Copy share link" works after a reload. If it
// is missing (another browser, cleared storage), the owner makes a new share link instead.

const PREFIX = "done-when:share:";

function storage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function rememberShareToken(itemUuid: string, shareToken: string): void {
  try {
    storage()?.setItem(`${PREFIX}${itemUuid}`, shareToken);
  } catch {
    // Storage is full or blocked: the owner page offers a new share link instead.
  }
}

export function savedShareToken(itemUuid: string): string | null {
  try {
    return storage()?.getItem(`${PREFIX}${itemUuid}`) ?? null;
  } catch {
    return null;
  }
}
