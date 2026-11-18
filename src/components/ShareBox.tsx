import { APP_LINK_ROLES } from "@haakco/custd-sdk/browser";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { DoneWhenData, ItemAccess, ItemKind, ItemMeta } from "../data";
import { savedShareToken } from "../lib/device";
import { absoluteUrl, sharePath } from "../lib/links";
import { CopyButton } from "./CopyButton";
import { WriteError } from "./ItemStates";

type ShareBoxProps = { data: DoneWhenData; access: ItemAccess; kind: ItemKind; meta: ItemMeta };

/** The owner's one-step share: copy the view-only link. Shown right under the summary. */
export function ShareBox({ data, access, kind, meta }: ShareBoxProps) {
  const [token, setToken] = useState(() => savedShareToken(meta.itemUuid));
  const shareLink = meta.links.find((link) => link.role === APP_LINK_ROLES.share);
  const create = useMutation({
    mutationFn: (linkUuid: string) => data.replaceShareLink(access, meta.itemUuid, linkUuid),
    onSuccess: setToken,
  });
  return (
    <section className="share-box" aria-labelledby="share-heading">
      <h2 id="share-heading" className="share-box__title">
        Share
      </h2>
      {token ? (
        <>
          <CopyButton primary label="Copy share link" text={absoluteUrl(sharePath(kind, token))} />
          <p className="small muted">Anyone with this link can watch, but not change anything.</p>
          <details className="quiet-details">
            <summary>Shared it with the wrong person?</summary>
            <p className="small">Replace the link: the old one stops working at once.</p>
            <button
              type="button"
              className="button button--quiet"
              disabled={!shareLink || create.isPending}
              onClick={() => {
                if (shareLink) create.mutate(shareLink.linkUuid);
              }}
            >
              {create.isPending ? "Replacing…" : "Replace share link"}
            </button>
            <WriteError error={create.error} />
          </details>
        </>
      ) : (
        <>
          <p className="small">This browser does not have the share link. Make a new one to share; any older share link stops working.</p>
          <button
            type="button"
            className="button button--primary"
            disabled={!shareLink || create.isPending}
            onClick={() => {
              if (shareLink) create.mutate(shareLink.linkUuid);
            }}
          >
            {create.isPending ? "Making link…" : "Make a share link"}
          </button>
          <WriteError error={create.error} />
        </>
      )}
    </section>
  );
}
