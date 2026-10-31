import { useRef } from "react";
import type { GovLocale } from "@/lib/gov/aggregate";
import { govCopy } from "@/lib/gov/copy";

export function GovHelp({ locale }: { locale: GovLocale }) {
  const copy = govCopy(locale);
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border bg-surface px-4 text-sm font-medium touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => dialog.current?.showModal()}
      >
        {copy.help}
      </button>
      <dialog
        ref={dialog}
        className="w-[min(100%,36rem)] rounded-2xl bg-surface p-5 text-fg shadow-card"
        aria-labelledby="gov-help-title"
      >
        <h2 id="gov-help-title" className="font-display text-2xl">
          {copy.helpTitle}
        </h2>
        <div className="mt-3 space-y-3 text-sm leading-6">
          {copy.helpBody.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <button
          type="button"
          className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-fg touch-manipulation"
          onClick={() => dialog.current?.close()}
        >
          {copy.close}
        </button>
      </dialog>
    </>
  );
}
