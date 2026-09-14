import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteChild } from "@/lib/server/family";
import { useCopy } from "@/lib/use-copy";

export function DeleteChildControl({
  child,
  onDeleted,
}: {
  child: { id: string; name: string };
  onDeleted: () => void;
}) {
  const { t } = useCopy();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const lead = t("deleteChildLead").replace("{name}", child.name || t("child"));

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      await deleteChild({ data: { id: child.id } });
      toast.success(t("deleteChildSuccess"));
      setOpen(false);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("deleteChildError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-danger"
        data-ke="delete-child"
        onClick={() => setOpen(true)}
      >
        {t("deleteChild")}
      </Button>
      {open ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 md:items-center" role="presentation">
          <button type="button" className="absolute inset-0 bg-fg/40" aria-label={t("cancel")} onClick={() => !busy && setOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            data-ke="delete-child-dialog"
            className="relative z-10 w-full max-w-md rounded-xl bg-surface p-5 shadow-card ring-1 ring-border"
          >
            <h2 id={titleId} className="font-display text-xl tracking-[-0.02em]">
              {t("deleteChildTitle")}
            </h2>
            <p className="mt-2 text-sm text-muted">{lead}</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
                {t("cancel")}
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={busy}
                data-ke="delete-child-confirm"
                onClick={() => void confirm()}
              >
                {t("deleteChildConfirm")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
