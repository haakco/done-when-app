import { useRef, useState } from "react";
import { explainError } from "../data";
import { exportFileName, workbookCsv, type Workbook } from "../lib/exports";
import { saveFile, writeXlsx } from "../lib/xlsx";

type DownloadMenuProps = {
  /** The item's name, used for the file name. */
  name: string;
  /** Builds the download from what the page shows, or reads it first (dashboards). */
  build: () => Workbook | Promise<Workbook>;
  /** One line under the choices, e.g. what the file leaves out. */
  note?: string | null;
};

type Format = "xlsx" | "csv";

/** One "Download" menu: Excel with every sheet, or CSV of the main table. */
export function DownloadMenu({ name, build, note = null }: DownloadMenuProps) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; failed: boolean } | null>(null);
  const download = async (format: Format) => {
    setBusy(true);
    setStatus(null);
    try {
      const workbook = await build();
      const now = new Date();
      const file = exportFileName(name, now, format);
      const blob = format === "xlsx" ? await writeXlsx(workbook) : new Blob([workbookCsv(workbook)], { type: "text/csv;charset=utf-8" });
      saveFile(blob, file);
      setStatus({ text: `Downloaded ${file}.`, failed: false });
      if (menu.current) menu.current.open = false;
    } catch (error) {
      setStatus({ text: `Could not make the file. ${explainError(error)}`, failed: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="download">
      <details ref={menu} className="download__menu">
        <summary className="button">
          <span aria-hidden="true">↓</span> Download
        </summary>
        <div className="download__choices">
          <button type="button" className="button" disabled={busy} onClick={() => { void download("xlsx"); }}>
            Excel (.xlsx)
          </button>
          <button type="button" className="button" disabled={busy} onClick={() => { void download("csv"); }}>
            CSV
          </button>
          <p className="small muted">{note ?? "Excel has every sheet; CSV has the main table, ready to import again."}</p>
        </div>
      </details>
      <span className={status?.failed ? "status-line status-line--failed" : "status-line"} role="status">
        {busy ? "Making the file…" : (status?.text ?? "")}
      </span>
    </div>
  );
}
