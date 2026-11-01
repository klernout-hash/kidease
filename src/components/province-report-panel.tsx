import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PROVINCES } from "@/lib/geo";
import { exportProvinceReport, provinceReportsReady } from "@/lib/server/province-reports";
import { useCopy } from "@/lib/use-copy";

export function ProvinceReportPanel() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [province, setProvince] = useState("MB");
  const [format, setFormat] = useState<"csv" | "pdf">("csv");
  const [busy, setBusy] = useState(false);
  const [on, setOn] = useState(false);

  useEffect(() => {
    let cancel = false;
    void provinceReportsReady()
      .then((res) => {
        if (!cancel) setOn(res.enabled === true);
      })
      .catch(() => {
        if (!cancel) setOn(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  if (!on) return null;

  async function download() {
    setBusy(true);
    try {
      const result = await exportProvinceReport({ data: { province, format } });
      if (!result.ok) {
        if (result.reason === "off") setOn(false);
        else toast.error(fr ? "Choisissez une province." : "Choose a province.");
        return;
      }
      const blob = new Blob([result.body], { type: result.contentType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(fr ? "Le rapport n’a pas pu être préparé." : "The report could not be prepared.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10 rounded-2xl bg-surface p-4 ring-1 ring-border" data-ke="province-reports">
      <h2 className="font-display text-2xl">{fr ? "Rapport de permis" : "Licensing report"}</h2>
      <p className="mt-2 text-sm text-muted">
        {fr
          ? "KidEase exporte les centres enregistrés pour une province. Le Manitoba et l’Ontario ont leurs colonnes. Les autres provinces ont un fichier général."
          : "KidEase exports the saved centres for one province. Manitoba and Ontario have their own columns. Other provinces get a general file."}
      </p>
      <p className="mt-1 text-sm text-muted">
        {fr
          ? "Les places ouvertes viennent des fiches. Une case vide n’était pas au dossier."
          : "Open spots come from the listings. A blank cell was not on file."}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <label className="text-sm">
          {fr ? "Province" : "Province"}
          <select
            className="mt-1 block h-11 min-w-40 rounded-full bg-bg px-3 ring-1 ring-border"
            value={province}
            onChange={(event) => setProvince(event.target.value)}
          >
            {PROVINCES.map((item) => (
              <option key={item.code} value={item.code}>
                {fr ? item.nameFr : item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {fr ? "Fichier" : "File"}
          <select
            className="mt-1 block h-11 min-w-32 rounded-full bg-bg px-3 ring-1 ring-border"
            value={format}
            onChange={(event) => setFormat(event.target.value === "pdf" ? "pdf" : "csv")}
          >
            <option value="csv">CSV</option>
            <option value="pdf">PDF</option>
          </select>
        </label>
      </div>
      <Button type="button" className="mt-4" disabled={busy} onClick={() => void download()}>
        {fr ? "Télécharger le rapport" : "Download report"}
      </Button>
    </section>
  );
}
