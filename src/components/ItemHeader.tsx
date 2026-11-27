import { APP_LINK_ROLES } from "@haakco/custd-sdk/browser";
import { useMutation } from "@tanstack/react-query";
import { useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
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
  const detailsId = useId();
  const shareButton = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const shareLink = meta.links.find((link) => link.role === APP_LINK_ROLES.share);
  const replace = useMutation({
    mutationFn: (linkUuid: string) => data.replaceShareLink(access, meta.itemUuid, linkUuid),
    onSuccess: () => {
      setStatus("View-only link replaced. You can copy the new link.");
      setShowDetails(true);
      shareButton.current?.focus();
    },
  });
  const token = owner ? replace.data ?? shareLink?.shareToken ?? saved : typeof access === "string" ? access : null;
  const url = token ? absoluteUrl(sharePath(kind, token)) : null;
  async function share() {
    if (!url) {
      setShowDetails(true);
      return;
    }
    const result = await copyText(url, navigator.clipboard);
    if (kind === "model" && result.status === "copied") data.trackModelShared();
    setShowDetails(result.status === "failed");
    setStatus(result.status === "copied" ? "View-only link copied." : "Select and copy the view-only link below.");
  }
  if (!url && !(owner && shareLink)) return null;
  return (
    <div className="share-button">
      <button
        type="button"
        className="button button--primary"
        ref={shareButton}
        aria-controls={detailsId}
        aria-expanded={showDetails}
        onClick={() => { void share(); }}
      >
        <span aria-hidden="true">↗</span> Share view-only link
      </button>
      <span className="status-line" role="status">{status}</span>
      <div id={detailsId} hidden={!showDetails}>
        {!showDetails ? null : url ? (
          <code className="link-text">{url}</code>
        ) : shareLink ? (
          <div className="notice">
            <p>This browser has no copy of the view-only link. Copy it from the device where you last shared it, or replace it here. The old link will stop working.</p>
            <button
              type="button"
              className="button"
              disabled={replace.isPending}
              onClick={() => { replace.mutate(shareLink.linkUuid); }}
            >
              {replace.isPending ? "Replacing…" : "Replace view-only link"}
            </button>
            <WriteError error={replace.error} />
          </div>
        ) : null}
      </div>
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
