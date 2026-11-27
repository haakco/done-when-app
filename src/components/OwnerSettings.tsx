import { APP_LINK_ROLES } from "@haakco/custd-sdk/browser";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { DoneWhenData, ItemAccess, ItemKind, ItemMeta } from "../data";
import { formatDate } from "../lib/dates";
import { absoluteUrl, sharePath } from "../lib/links";
import { CopyButton } from "./CopyButton";
import { ExpiryField } from "./ExpiryField";
import { useShareToken } from "./ItemHeader";
import { WriteError } from "./ItemStates";
import { useSession } from "./Session";

type Props = { data: DoneWhenData; access: ItemAccess; kind: ItemKind; meta: ItemMeta };

/** The share and owner links, replacing the share link, and the idle-expiry window. */
export function LinksAndExpiry({ data, access, kind, meta }: Props) {
  const savedShareToken = useShareToken(meta.itemUuid);
  const shareLink = meta.links.find((link) => link.role === APP_LINK_ROLES.share);
  const replace = useMutation({ mutationFn: (linkUuid: string) => data.replaceShareLink(access, meta.itemUuid, linkUuid) });
  const shareToken = replace.data ?? shareLink?.shareToken ?? savedShareToken;
  const [expiry, setExpiry] = useState(meta.idleExpirySeconds);
  const save = useMutation({ mutationFn: (seconds: number) => data.setExpiry(access, seconds) });
  return (
    <div className="stack">
      <div>
        <h3>View-only link</h3>
        {shareToken ? (
          <CopyButton label="Copy view-only link" text={absoluteUrl(sharePath(kind, shareToken))} />
        ) : (
          <p className="small muted">This browser has no copy of the link. If you need a new link, you can replace it below.</p>
        )}
        {shareLink ? (
          <details className="quiet-details">
            <summary>Shared it with the wrong person?</summary>
            <p className="small">Replace the link: the old one stops working at once.</p>
            <button type="button" className="button button--quiet" disabled={replace.isPending} onClick={() => { replace.mutate(shareLink.linkUuid); }}>
              {replace.isPending ? "Replacing…" : "Replace view-only link"}
            </button>
            <WriteError error={replace.error} />
          </details>
        ) : null}
      </div>
      {typeof access === "string" ? (
        <div>
          <h3>Owner link</h3>
          <p className="small muted">This page&apos;s address is the owner link. Anyone with it can change this item, so keep it private and bookmark it.</p>
          <CopyButton label="Copy owner link" text={absoluteUrl(`${window.location.pathname}${window.location.hash}`)} showText={false} />
        </div>
      ) : null}
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(expiry);
        }}
      >
        <h3>Expiry</h3>
        <p className="small muted">Deleted on {formatDate(meta.expiresAt)} unless it changes before then.</p>
        <ExpiryField value={expiry} onChange={setExpiry} />
        <div className="button-row">
          <button type="submit" className="button" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save expiry"}
          </button>
          {save.isSuccess ? <span role="status">Saved.</span> : null}
        </div>
        <WriteError error={save.error} />
      </form>
    </div>
  );
}

/** Keep the item in "My items": sign in, then claim it with the owner link. */
export function KeepInMyItems({ data, access, meta }: Props) {
  const session = useSession();
  const claim = useMutation({ mutationFn: (token: string) => data.claim(token) });
  if (!session.available) return null;
  if (meta.ownership === "yours" || claim.isSuccess) {
    return <p className="small"><span aria-hidden="true">✓</span> In your items.</p>;
  }
  if (meta.ownership === "other") {
    return <p className="small muted">Someone else keeps this item in their list.</p>;
  }
  if (!session.signedIn) {
    return (
      <div className="inline-action">
        <p className="small">Sign in to keep this in My items and open it anywhere without the link.</p>
        <button type="button" className="button" disabled={session.pending} onClick={() => { session.signIn(); }}>
          Sign in
        </button>
      </div>
    );
  }
  return (
    <div className="inline-action">
      <p className="small">Keep this in My items so you can open it anywhere.</p>
      <button
        type="button"
        className="button"
        disabled={claim.isPending || typeof access !== "string"}
        onClick={() => {
          if (typeof access === "string") claim.mutate(access);
        }}
      >
        {claim.isPending ? "Adding…" : "Add to my items"}
      </button>
      <WriteError error={claim.error} />
    </div>
  );
}
