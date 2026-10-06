import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { AI_FLAGS } from "@/lib/ai/flags";
import { helpBubbleDistinctId } from "@/lib/ai/help-bubble";
import { parentHelperEventProps } from "@/lib/ai/parent-helper";
import { useAiFeatureFlag } from "@/lib/ai/use-ai-flag";
import { capturePostHogEvent } from "@/lib/posthog";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

type ChatMsg = { role: "user" | "assistant"; text: string; path?: string | null };
type AskError = "off" | "turnstile" | "rate_limited" | "ticket";

export function HelpBot() {
  const { t, locale } = useCopy();
  const { user } = useCurrentUserState();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [msgs, setMsgs] = useState<ChatMsg[]>([{ role: "assistant", text: t("helpBotHello") }]);
  const [handedOff, setHandedOff] = useState(false);
  const [needChallenge, setNeedChallenge] = useState(false);
  const { onToken, takeChallenge, resetSignal, reset } = useTurnstileToken();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  function replyFor(error: AskError) {
    if (error === "turnstile") return t("helpBotChallenge");
    if (error === "rate_limited") return t("helpBotLimited");
    if (error === "ticket") return t("helpBotFail");
    return t("parentHelperUnknown");
  }

  async function sendText(text: string, agent = false) {
    const trimmed = text.trim();
    if (busy) return;
    if (!agent && !trimmed) return;
    const token = takeChallenge();
    if (needChallenge && !token) {
      setMsgs((m) => [...m, { role: "assistant", text: t("helpBotChallenge") }]);
      return;
    }
    const next: ChatMsg[] = agent ? msgs : [...msgs, { role: "user", text: trimmed }];
    if (!agent) setMsgs(next);
    setDraft("");
    setBusy(true);
    const distinctId = helpBubbleDistinctId(user?.id);
    try {
      if (agent) {
        const { requestParentHelperAgent } = await import("@/lib/server/parent-helper");
        const last = [...msgs].reverse().find((m) => m.role === "user")?.text || trimmed;
        const res = await requestParentHelperAgent({
          data: { question: last, distinctId, turnstileToken: token, locale },
        });
        if ("error" in res) {
          if (res.error === "turnstile") setNeedChallenge(true);
          setMsgs((m) => [...m, { role: "assistant", text: replyFor(res.error) }]);
          return;
        }
        setNeedChallenge(false);
        reset();
        setHandedOff(true);
        setMsgs((m) => [...m, { role: "assistant", text: t("helpBotTicket") }]);
        return;
      }
      const { askParentHelper } = await import("@/lib/server/parent-helper");
      const res = await askParentHelper({ data: { question: trimmed, distinctId, turnstileToken: token, locale } });
      if ("error" in res) {
        if (res.error === "turnstile") setNeedChallenge(true);
        setMsgs((m) => [...m, { role: "assistant", text: replyFor(res.error) }]);
        return;
      }
      setNeedChallenge(false);
      reset();
      capturePostHogEvent(res.known ? "parent_helper_asked" : "parent_helper_unknown", parentHelperEventProps({ path: res.path || "" }));
      setMsgs((m) => [...m, { role: "assistant", text: res.answer, path: res.path }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: t("helpBotFail") }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ke-help-bot">
      {open ? (
        <div className="mb-3 flex h-[min(28rem,70dvh)] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl bg-surface shadow-lift ring-1 ring-border">
          <div className="flex items-center justify-between gap-2 bg-primary px-4 py-3 text-primary-fg">
            <div className="flex min-w-0 items-center gap-2">
              <img
                src="/logo-transparent.svg?v=17"
                alt=""
                width={32}
                height={32}
                className="size-8 shrink-0 rounded-full bg-surface object-contain p-0.5"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{t("helpBot")}</p>
                <p className="text-[11px] leading-4 text-primary-fg/80">{t("helpBotLead")}</p>
              </div>
            </div>
            <button
              type="button"
              className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-white/10"
              onClick={() => setOpen(false)}
              aria-label={t("close")}
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
            {msgs.map((m, i) => (
              <p
                key={`${i}-${m.role}`}
                className={cn(
                  "max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-5",
                  m.role === "user" ? "ml-auto bg-primary text-primary-fg" : "bg-bg text-fg ring-1 ring-border",
                )}
              >
                {m.text}
                {m.path ? (
                  <>
                    {" "}
                    <a href={m.path} className="font-medium text-primary underline">
                      {t("parentHelperCite").replace("{path}", m.path)}
                    </a>
                  </>
                ) : null}
              </p>
            ))}
            {busy ? <p className="text-xs text-muted">{t("helpBotTyping")}</p> : null}
            <div ref={end} />
          </div>
          {needChallenge ? (
            <div className="border-t border-border px-3 py-2">
              <p className="mb-2 text-sm">{t("helpBotChallenge")}</p>
              <TurnstileField onToken={onToken} resetSignal={resetSignal} />
            </div>
          ) : null}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendText(draft);
            }}
            className="flex gap-2 border-t border-border p-2"
          >
            <label className="sr-only" htmlFor="help-bot-q">
              {t("helpBotPh")}
            </label>
            <input
              id="help-bot-q"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest" })}
              placeholder={t("helpBotPh")}
              className="h-11 min-w-0 flex-1 rounded-full bg-bg px-3 text-base outline-none ring-1 ring-border"
            />
            <Button type="submit" disabled={busy || !draft.trim()} className="min-w-11 shrink-0 px-4">
              {t("send")}
            </Button>
          </form>
          {handedOff ? null : (
            <div className="px-2 pb-2">
              <Button
                type="button"
                variant="secondary"
                className="h-auto min-h-11 w-full whitespace-normal px-3 text-center"
                disabled={busy}
                onClick={() => void sendText(t("helpBotAgent"), true)}
              >
                {t("helpBotAgent")}
              </Button>
            </div>
          )}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 min-w-11 select-none flex-col items-center gap-1 rounded-2xl bg-surface px-2.5 py-2 shadow-lift ring-1 ring-border"
        aria-label={t("helpBot")}
        aria-expanded={open}
      >
        {open ? (
          <X className="size-7 text-primary" />
        ) : (
          <img
            src="/logo-transparent.svg?v=17"
            alt=""
            width={44}
            height={44}
            className="size-11 object-contain"
            style={{ width: 44, height: 44, maxWidth: 44, maxHeight: 44, objectFit: "contain" }}
          />
        )}
        <span className="text-[11px] font-semibold leading-none text-primary">{t("helpBot")}</span>
      </button>
    </div>
  );
}

/** Mount after hydration. Hidden unless the parent-helper flag is on for this visitor. */
export function LiveChatSlot() {
  const helperOn = useAiFeatureFlag(AI_FLAGS.parentHelper);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const idle = window.setTimeout(() => setReady(true), 2500);
    return () => window.clearTimeout(idle);
  }, []);
  if (!ready || !helperOn) return null;
  return <HelpBot />;
}
