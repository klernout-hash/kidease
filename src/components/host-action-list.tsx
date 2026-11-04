import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
  hostActionItems,
  hostActionLabel,
  hostActionSentence,
  type HostActionItem,
} from "@/lib/host-action";
import { hostCopy } from "@/lib/host-listing-copy";
import { getHostActionEmailPref, setHostActionEmailPref } from "@/lib/server/host-action";
import { useCopy } from "@/lib/use-copy";
import type { Daycare } from "@/lib/types";

/** Amber and red that stay above 4.5:1 on their pale fills. Icon and a word carry the state too. */
const TONE = {
  warning: {
    box: "border-[#9a3412] bg-[#fffbeb] text-[#7c2d12]",
    icon: "text-[#9a3412]",
  },
  danger: {
    box: "border-[#b42318] bg-[#fff5f5] text-[#7f1d1d]",
    icon: "text-[#b42318]",
  },
} as const;

export function HostActionList({ listings }: { listings: Daycare[] }) {
  const { locale } = useCopy();
  const copy = hostCopy(locale);
  const items = hostActionItems(listings);
  if (!items.length) return null;

  return (
    <section className="rounded-xl bg-surface p-4 ring-1 ring-border" data-ke="host-actions" aria-labelledby="host-actions-title">
      <h2 id="host-actions-title" className="font-display text-xl">
        {copy.actionRequired}
      </h2>
      <p className="mt-1 text-sm text-muted">{copy.actionLead}</p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <ActionRow key={item.id} item={item} locale={locale} fixLabel={copy.actionFix} />
        ))}
      </ul>
    </section>
  );
}

export function HostActionEmailPref() {
  const { locale } = useCopy();
  const copy = hostCopy(locale);
  const [email, setEmail] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    void getHostActionEmailPref()
      .then((row) => {
        if (!live || !row.enabled) return;
        setEmail(row.email);
        setReady(true);
      })
      .catch(() => {
        if (live) setReady(false);
      });
    return () => {
      live = false;
    };
  }, []);

  if (!ready) return null;

  return (
    <label className="mt-4 flex min-h-11 items-start gap-3 rounded-xl bg-surface px-4 py-3 text-sm ring-1 ring-border" data-ke="host-action-email">
      <input
        type="checkbox"
        className="mt-1 size-5"
        checked={email}
        onChange={(event) => {
          const next = event.target.checked;
          setEmail(next);
          void setHostActionEmailPref({ data: { email: next } }).catch(() => {
            setEmail(!next);
            toast.error(copy.saveFailed);
          });
        }}
      />
      <span>
        <span className="font-medium">{copy.actionEmail}</span>
        <span className="mt-1 block text-muted">{copy.actionEmailLead}</span>
      </span>
    </label>
  );
}

function ActionRow({ item, locale, fixLabel }: { item: HostActionItem; locale: string; fixLabel: string }) {
  const tone = TONE[item.tone];
  const Icon = item.tone === "danger" ? ShieldAlert : AlertTriangle;
  const label = hostActionLabel(item.code, locale);
  const sentence = hostActionSentence(item.code, item.daycareName, locale);
  return (
    <li className={`rounded-xl border px-3 py-3 ${tone.box}`} data-ke="host-action" data-code={item.code} data-tone={item.tone}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 size-5 shrink-0 ${tone.icon}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
          <p className="mt-1 text-sm">{sentence}</p>
          <Link
            to="/provider"
            search={{
              desk: item.fix.desk,
              section: item.fix.section,
              focus: item.fix.focus,
              centre: item.daycareId,
            }}
            className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
          >
            {fixLabel}
          </Link>
        </div>
      </div>
    </li>
  );
}
