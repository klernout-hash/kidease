import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { safetyText } from "@/lib/safety";
import { clearMyBlock, setDaycareBlock, setFamilyBlock, setMessageBlock } from "@/lib/server/safety";
import { useCopy } from "@/lib/use-copy";

function BlockDialog({
  title,
  body,
  confirm,
  cancel,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirm: string;
  cancel: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-end bg-black/40 p-4 sm:place-items-center" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="block-dialog-title"
        className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-lift ring-1 ring-border"
        data-ke="block-confirm"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="block-dialog-title" className="font-display text-xl">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" data-ke="block-confirm-go" disabled={busy} onClick={onConfirm}>
            {confirm}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            {cancel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function BlockDaycareButton({ daycareId, appearance = "menu" }: { daycareId: string; appearance?: "menu" | "text" }) {
  const { locale } = useCopy();
  const text = safetyText(locale);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const className =
    appearance === "menu"
      ? "flex min-h-11 w-full items-center rounded-[10px] px-3 text-left text-sm font-medium text-fg hover:bg-surface-2"
      : "inline-flex min-h-11 items-center text-sm font-medium text-fg underline-offset-4 hover:underline";

  return (
    <>
      <button type="button" role={appearance === "menu" ? "menuitem" : undefined} data-ke="block-daycare" className={className} onClick={(event) => { event.stopPropagation(); setOpen(true); }}>
        {text.blockDaycare}
      </button>
      {open ? (
        <BlockDialog
          title={text.blockConfirmTitle}
          body={text.blockConfirmBody}
          confirm={text.blockConfirm}
          cancel={text.cancel}
          busy={busy}
          onClose={() => setOpen(false)}
          onConfirm={() => {
            setBusy(true);
            void setDaycareBlock({ data: { daycareId, blocked: true } })
              .then(() => {
                toast.success(text.blockedNow);
                setOpen(false);
              })
              .catch(() => toast.error(text.failed))
              .finally(() => setBusy(false));
          }}
        />
      ) : null}
    </>
  );
}

export function BlockFamilyButton({
  parentUserId,
  daycareId,
  appearance = "text",
}: {
  parentUserId: string;
  daycareId: string;
  appearance?: "menu" | "text";
}) {
  const { locale } = useCopy();
  const text = safetyText(locale);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!parentUserId) return null;
  const className =
    appearance === "menu"
      ? "flex min-h-11 w-full items-center rounded-[10px] px-3 text-left text-sm font-medium text-fg hover:bg-surface-2"
      : "inline-flex min-h-11 items-center text-sm font-medium text-fg underline-offset-4 hover:underline";

  return (
    <>
      <button type="button" role={appearance === "menu" ? "menuitem" : undefined} data-ke="block-family" className={className} onClick={(event) => { event.stopPropagation(); setOpen(true); }}>
        {text.blockFamily}
      </button>
      {open ? (
        <BlockDialog
          title={text.blockConfirmTitle}
          body={text.blockConfirmBody}
          confirm={text.blockConfirm}
          cancel={text.cancel}
          busy={busy}
          onClose={() => setOpen(false)}
          onConfirm={() => {
            setBusy(true);
            void setFamilyBlock({ data: { parentUserId, daycareId, blocked: true } })
              .then(() => {
                toast.success(text.blockedNow);
                setOpen(false);
              })
              .catch(() => toast.error(text.failed))
              .finally(() => setBusy(false));
          }}
        />
      ) : null}
    </>
  );
}

/** Existing chat control. A block is the full safety block, not messages only. */
export function BlockThreadButton({
  conversationId,
  side,
}: {
  conversationId: string;
  side: "daycare" | "family";
}) {
  const { locale } = useCopy();
  const text = safetyText(locale);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const label = side === "family" ? text.blockFamily : text.blockDaycare;

  return (
    <>
      <button
        type="button"
        data-ke="safety-block"
        className="inline-flex min-h-11 items-center text-sm font-medium text-fg underline-offset-4 hover:underline"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open ? (
        <BlockDialog
          title={text.blockConfirmTitle}
          body={text.blockConfirmBody}
          confirm={text.blockConfirm}
          cancel={text.cancel}
          busy={busy}
          onClose={() => setOpen(false)}
          onConfirm={() => {
            setBusy(true);
            void setMessageBlock({ data: { conversationId, blocked: true } })
              .then(() => {
                toast.success(text.blockedNow);
                setOpen(false);
              })
              .catch(() => toast.error(text.failed))
              .finally(() => setBusy(false));
          }}
        />
      ) : null}
    </>
  );
}

export function UnblockButton({
  daycareId,
  blockedUserId,
  onDone,
}: {
  daycareId: string | null;
  blockedUserId: string | null;
  onDone: () => void;
}) {
  const { locale } = useCopy();
  const text = safetyText(locale);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      data-ke="unblock"
      disabled={busy}
      className="inline-flex min-h-11 items-center text-sm font-semibold text-primary touch-manipulation disabled:opacity-50"
      onClick={() => {
        setBusy(true);
        void clearMyBlock({ data: { daycareId: daycareId || undefined, blockedUserId: blockedUserId || undefined } })
          .then(() => {
            toast.success(text.unblocked);
            onDone();
          })
          .catch(() => toast.error(text.failed))
          .finally(() => setBusy(false));
      }}
    >
      {text.unblockPerson}
    </button>
  );
}
