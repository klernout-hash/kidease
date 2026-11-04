import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { custodyCopy } from "@/lib/custody-copy";
import { portfolioCopy } from "@/lib/child-portfolio-copy";
import type { PortfolioGap } from "@/lib/child-portfolio";
import { saveCustodyRestriction, verifyCoparent, liftCustodyRestriction } from "@/lib/server/coparent-email";
import { useCopy } from "@/lib/use-copy";
import type { SpotRequest } from "@/lib/types";

export function CentreRequestGuard({
  request,
  onChanged,
}: {
  request: SpotRequest;
  onChanged: () => void;
}) {
  const { locale } = useCopy();
  const portfolio = portfolioCopy(locale);
  const copy = custodyCopy(locale);
  const [busy, setBusy] = useState(false);
  const [guardianId, setGuardianId] = useState(request.guardians?.[0]?.userId || "");
  const [mode, setMode] = useState<"restrict" | "block">("restrict");
  const [note, setNote] = useState("");
  const gaps = request.portfolioGaps || [];
  const showPortfolio = request.portfolioComplete != null;
  const showCustody = request.custodyOn === true;

  if (!showPortfolio && !showCustody) return null;

  return (
    <div className="mt-3 space-y-3">
      {showPortfolio && request.portfolioComplete === false ? (
        <div className="rounded-lg bg-danger/5 p-3 ring-1 ring-danger/30" role="status">
          <p className="font-medium">{portfolio.incomplete}</p>
          <p className="mt-1 text-sm">{portfolio.incompleteBody}</p>
          {gaps.length ? (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {gaps.map((gap) => (
                <li key={gap}>{portfolio.gaps[gap as PortfolioGap] || gap}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {request.familyBlocked ? (
        <p className="text-sm text-danger" role="status">
          {copy.blockedFamily}
        </p>
      ) : null}
      {showCustody && request.guardians?.length ? (
        <div className="space-y-2">
          <ul className="space-y-2">
            {request.guardians.map((person) => (
              <li key={person.userId} className="rounded-lg bg-bg p-3 text-sm ring-1 ring-border">
                <p className="font-medium">{person.name}</p>
                <p className="text-muted">{person.role === "owner" ? copy.mainParent : copy.otherParent}</p>
                {person.role === "member" ? <p>{person.verified ? copy.verified : copy.notVerified}</p> : null}
                <p>{person.pickup ? copy.pickupYes : copy.pickupNo}</p>
                {person.restriction ? <p>{person.restriction === "block" ? copy.block : copy.restrict}</p> : null}
                {person.restrictionId ? (
                  <Button
                    type="button"
                    size="sm"
                    className="mt-2"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void liftCustodyRestriction({ data: { id: person.restrictionId || "" } })
                        .then(() => {
                          toast.success(copy.saved);
                          onChanged();
                        })
                        .catch(() => toast.error(copy.bad))
                        .finally(() => setBusy(false));
                    }}
                  >
                    {copy.lift}
                  </Button>
                ) : null}
                {person.linkId && person.role === "member" && !person.verified ? (
                  <Button
                    type="button"
                    size="sm"
                    className="mt-2"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void verifyCoparent({ data: { linkId: person.linkId || "", daycareId: request.daycareId } })
                        .then(() => {
                          toast.success(copy.confirmed);
                          onChanged();
                        })
                        .catch(() => toast.error(copy.bad))
                        .finally(() => setBusy(false));
                    }}
                  >
                    {copy.confirm}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {request.childId ? (
            <form
              className="space-y-2 rounded-lg p-3 ring-1 ring-border"
              onSubmit={(event) => {
                event.preventDefault();
                const file = (event.currentTarget.elements.namedItem("order") as HTMLInputElement | null)?.files?.[0];
                setBusy(true);
                const send = (dataUrl?: string, filename?: string) =>
                  saveCustodyRestriction({
                    data: {
                      daycareId: request.daycareId,
                      childId: request.childId || "",
                      guardianUserId: guardianId,
                      mode,
                      note,
                      dataUrl,
                      filename,
                    },
                  })
                    .then(() => {
                      toast.success(copy.saved);
                      setNote("");
                      onChanged();
                    })
                    .catch(() => toast.error(copy.bad))
                    .finally(() => setBusy(false));
                if (!file) {
                  void send();
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => void send(String(reader.result || ""), file.name);
                reader.onerror = () => {
                  setBusy(false);
                  toast.error(copy.bad);
                };
                reader.readAsDataURL(file);
              }}
            >
              <p className="font-medium">{copy.restrictTitle}</p>
              <p className="text-sm text-muted">{copy.restrictLead}</p>
              <p className="text-sm text-muted">{copy.staffOnly}</p>
              <label className="block text-sm">
                {copy.otherParent}
                <select className="ke-input mt-1 min-h-11 w-full" value={guardianId} onChange={(event) => setGuardianId(event.target.value)}>
                  {request.guardians.map((person) => (
                    <option key={person.userId} value={person.userId}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                {copy.mode}
                <select
                  className="ke-input mt-1 min-h-11 w-full"
                  value={mode}
                  onChange={(event) => setMode(event.target.value === "block" ? "block" : "restrict")}
                >
                  <option value="restrict">{copy.restrict}</option>
                  <option value="block">{copy.block}</option>
                </select>
              </label>
              <label className="block text-sm">
                {copy.note}
                <textarea className="mt-1 min-h-11 w-full rounded-md border border-border bg-bg px-3 py-2" value={note} onChange={(event) => setNote(event.target.value)} />
              </label>
              <label className="block text-sm">
                {copy.file}
                <input name="order" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="mt-1 block w-full text-sm" />
              </label>
              <Button type="submit" variant="secondary" disabled={busy || !guardianId}>
                {copy.save}
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
