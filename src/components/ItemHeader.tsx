import { APP_LINK_ROLES } from "@haakco/custd-sdk/browser";
import { useMutation } from "@tanstack/react-query";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import type { DoneWhenData, ItemAccess, ItemKind, ItemMeta } from "../data";
import { dismissOwnerNotice, ownerNoticeDismissed, savedShareToken, subscribeDevice } from "../lib/device";
import { absoluteUrl, copyText, sharePath } from "../lib/links";
import { CopyButton } from "./CopyButton";
import { WriteError } from "./ItemStates";

type HeaderProps = {
  data: DoneWhenData;
  access: ItemAccess;
  kind: ItemKind;
  meta: ItemMeta;
  title: string;
  owner: boolean;
  /** Status badges beside the title. */
  children?: ReactNode;
  /** Shown after Share, e.g. the Download menu. */
  actions?: ReactNode;
};

/** The title with the Share button (and any other actions) beside it, and the owner's one-time "save your owner link" notice. */
export function ItemHeader({ data, access, kind, meta, title, owner, children, actions }: HeaderProps) {
  return (
    <>
      <header className="item__head">
        <h1 id="item-name">{title}</h1>
        {children}
        <div className="item__actions">
          <ShareButton data={data} access={access} kind={kind} meta={meta} owner={owner} />
          {actions}
        </div>
      </header>
      {owner && typeof access === "string" ? <OwnerLinkNotice itemUuid={meta.itemUuid} /> : null}
    </>
  );
}

export function useShareToken(itemUuid: string): string | null {
  return useSyncExternalStore(subscribeDevice, () => savedShareToken(itemUuid), () => null);
}

type ShareProps = { data: DoneWhenData; access: ItemAccess; kind: ItemKind; meta: ItemMeta; owner: boolean };

function ShareButton({ data, access, kind, meta, owner }: ShareProps) {
  const saved = useShareToken(meta.itemUuid);
  const [status, setStatus] = useState<string>("");
  const shareLink = meta.links.find((link) => link.role === APP_LINK_ROLES.share);
  const make = useMutation({
    mutationFn: (linkUuid: string) => data.replaceShareLink(access, meta.itemUuid, linkUuid),
    onSuccess: (token) => {
      void copy(token);
    },
  });
  // A viewer shares the page they are on; an owner shares the view-only link, never the owner link.
  const token = owner ? saved : typeof access === "string" ? access : null;
  const copy = async (shareToken: string) => {
    const result = await copyText(absoluteUrl(sharePath(kind, shareToken)), navigator.clipboard);
    if (kind === "model" && result.status === "copied") data.trackModelShared();
    setStatus(result.status === "copied" ? "View-only link copied." : "Could not copy. Open “Links” below to copy it yourself.");
  };
  if (!token && !(owner && shareLink)) return null;
  return (
    <div className="share-button">
      <button
        type="button"
        className="button button--primary"
        disabled={make.isPending}
        onClick={() => {
          if (token) void copy(token);
          else if (shareLink) make.mutate(shareLink.linkUuid);
        }}
      >
        <span aria-hidden="true">↗</span> {make.isPending ? "Making link…" : "Share"}
      </button>
      <span className="status-line" role="status">
        {status}
      </span>
      <WriteError error={make.error} />
    </div>
  );
}

function OwnerLinkNotice({ itemUuid }: { itemUuid: string }) {
  const dismissed = useSyncExternalStore(subscribeDevice, () => ownerNoticeDismissed(itemUuid), () => true);
  if (dismissed) return null;
  return (
    <section className="notice notice--done owner-notice" aria-labelledby="owner-notice-heading">
      <h2 id="owner-notice-heading" className="owner-notice__title">
        Save your owner link
      </h2>
      <p>This page&apos;s address is the only way to change this item. Bookmark it or keep a copy somewhere safe. Share sends a view-only link instead.</p>
      <div className="button-row">
        <CopyButton label="Copy owner link" text={absoluteUrl(`${window.location.pathname}${window.location.hash}`)} showText={false} />
        <button type="button" className="button button--quiet" onClick={() => { dismissOwnerNotice(itemUuid); }}>
          Got it
        </button>
      </div>
    </section>
  );
}
