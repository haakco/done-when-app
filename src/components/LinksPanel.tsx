import type { ItemKind, ItemLinks } from "../data";
import { itemUrl } from "../lib/links";
import { CopyLinkButton } from "./CopyLinkButton";

export function LinksPanel({ kind, links }: { kind: ItemKind; links: ItemLinks }) {
  const origin = window.location.origin;
  return (
    <section className="section card" aria-labelledby="links-heading">
      <h2 id="links-heading">Links</h2>
      <ul className="links-list">
        <li>
          <h3>Share link (view only)</h3>
          <CopyLinkButton url={itemUrl(origin, kind, "share", links.shareToken)} label="Copy share link" />
        </li>
        <li>
          <h3>Owner link</h3>
          <p className="small muted">Anyone with this link can change this {kind}. Keep it private.</p>
          <CopyLinkButton url={itemUrl(origin, kind, "owner", links.ownerToken)} label="Copy owner link" />
        </li>
      </ul>
    </section>
  );
}
