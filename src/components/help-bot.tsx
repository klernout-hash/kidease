import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { AGENT_CONFIRM } from "@/lib/help-knowledge";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

type ChatMsg = { role: "user" | "assistant"; text: string };

export function HelpBot() {
  const { t } = useCopy();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [msgs, setMsgs] = useState<ChatMsg[]>([{ role: "assistant", text: t("helpBotHello") }]);
  const [handedOff, setHandedOff] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  async function sendText(text: string, agent = false) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const next: ChatMsg[] = [...msgs, { role: "user", text: trimmed }];
    setMsgs(next);
    setDraft("");
    setBusy(true);
    try {
      const { askKidEase } = await import("@/lib/server/ai");
      const res = await askKidEase({ data: { messages: next } });
      const reply = res?.reply?.trim() || (agent ? AGENT_CONFIRM : t("helpBotFail"));
      setMsgs((m) => [...m, { role: "assistant", text: reply }]);
      if (agent) setHandedOff(true);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: agent ? AGENT_CONFIRM : t("helpBotFail") }]);
      if (agent) setHandedOff(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ke-help-bot">
      {open ? (
        <div className="mb-3 flex h-[min(28rem,70dvh)] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl bg-surface shadow-lift ring-1 ring-border">
          <div className="flex items-center justify-between bg-primary px-4 py-3 text-primary-fg">
            <div className="flex items-center gap-2">
              <img src="/logo-transparent.png?v=2" alt="" className="size-8 rounded-full bg-surface object-contain p-0.5" />
              <div>
                <p className="text-sm font-semibold">{t("liveChat")}</p>
                <p className="text-[11px] text-primary-fg/80">{t("helpBotLead")}</p>
              </div>
            </div>
            <button type="button" className="grid size-8 place-items-center rounded-full hover:bg-white/10" onClick={() => setOpen(false)} aria-label={t("close")}>
              <X className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {msgs.map((m, i) => (
              <p
                key={`${i}-${m.role}`}
                className={cn(
                  "max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-5",
                  m.role === "user" ? "ml-auto bg-primary text-primary-fg" : "bg-bg text-fg ring-1 ring-border",
                )}
              >
                {m.text}
              </p>
            ))}
            {busy ? <p className="text-xs text-muted">{t("helpBotTyping")}</p> : null}
            {!busy && !handedOff && msgs.some((m) => m.role === "user") ? (
              <button type="button" className="rounded-full bg-fg px-3 py-1.5 text-xs font-semibold text-bg" onClick={() => void sendText("I'd like a live agent please", true)}>
                {t("helpBotAgent")}
              </button>
            ) : null}
            <div ref={end} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendText(draft);
            }}
            className="flex gap-2 border-t border-border p-2"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("helpBotPh")}
              className="h-11 min-w-0 flex-1 rounded-full bg-bg px-3 text-sm outline-none ring-1 ring-border"
            />
            <button type="submit" disabled={busy || !draft.trim()} className="h-11 rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg disabled:opacity-50">
              {t("send")}
            </button>
          </form>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex flex-col items-center gap-1 rounded-2xl bg-surface px-2.5 py-2 shadow-lift ring-1 ring-border"
        aria-label={t("liveChat")}
      >
        {open ? (
          <X className="size-7 text-primary" />
        ) : (
          <img src="/logo-transparent.png?v=2" alt="" className="size-11 object-contain" />
        )}
        <span className="text-[11px] font-semibold leading-none text-primary">{t("liveChat")}</span>
      </button>
    </div>
  );
}

/** Mount after hydration so SSR never loads the chat server module. */
export function LiveChatSlot() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const idle = window.setTimeout(() => setReady(true), 2500);
    return () => window.clearTimeout(idle);
  }, []);
  if (!ready) return null;
  return <HelpBot />;
}
