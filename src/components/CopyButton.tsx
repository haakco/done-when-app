import { useState } from "react";
import { copyText, type CopyResult } from "../lib/links";

const MESSAGE: Record<CopyResult["status"], string> = {
  copied: "Copied.",
  failed: "Could not copy. Select the text and copy it yourself.",
};

type CopyButtonProps = { text: string; label: string; primary?: boolean; showText?: boolean };

/** Copies text with one press; the result is announced politely and the text stays visible to select. */
export function CopyButton({ text, label, primary = false, showText = true }: CopyButtonProps) {
  const [result, setResult] = useState<CopyResult | null>(null);
  return (
    <div className="copy">
      <div className="copy__row">
        <button
          type="button"
          className={primary ? "button button--primary" : "button"}
          onClick={() => {
            void copyText(text, navigator.clipboard as Clipboard | undefined).then(setResult);
          }}
        >
          {label}
        </button>
        <span className={`status-line ${result?.status === "failed" ? "status-line--failed" : ""}`} role="status">
          {result === null ? "" : MESSAGE[result.status]}
        </span>
      </div>
      {showText ? <code className="link-text">{text}</code> : null}
    </div>
  );
}
