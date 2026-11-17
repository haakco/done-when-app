import { useState } from "react";
import { copyLink, type CopyResult } from "../lib/links";

const MESSAGE: Record<CopyResult["status"], string> = {
  copied: "Link copied.",
  failed: "Could not copy. Select the link above and copy it yourself.",
};

export function CopyLinkButton({ url, label }: { url: string; label: string }) {
  const [result, setResult] = useState<CopyResult | null>(null);
  return (
    <div>
      <code className="link-text">{url}</code>
      <button
        type="button"
        className="button"
        onClick={() => {
          void copyLink(url, navigator.clipboard as Clipboard | undefined).then(setResult);
        }}
      >
        {label}
      </button>
      <p className={`status-line ${result?.status === "failed" ? "status-line--failed" : ""}`} role="status">
        {result === null ? "" : MESSAGE[result.status]}
      </p>
    </div>
  );
}
