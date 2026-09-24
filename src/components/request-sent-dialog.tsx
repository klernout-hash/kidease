import { useEffect, useId, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestSentBodyKey, requestSentTitleKey, type RequestSentKind } from "@/lib/request-sent";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

const CONFETTI = [
  { x: "-22px", y: "-18px", delay: "0ms", color: "var(--color-ok)" },
  { x: "24px", y: "-14px", delay: "40ms", color: "var(--color-primary)" },
  { x: "-16px", y: "16px", delay: "70ms", color: "var(--color-primary)" },
  { x: "18px", y: "14px", delay: "20ms", color: "var(--color-ok)" },
  { x: "0px", y: "-26px", delay: "90ms", color: "var(--color-warn)" },
  { x: "28px", y: "2px", delay: "55ms", color: "var(--color-ok)" },
] as const;

type MarkerProps = {
  "data-ke"?: string;
  "data-request-info-success"?: string;
};

type Props = MarkerProps & {
  kind: RequestSentKind;
  listingName: string;
  city?: string | null;
  photo?: string | null;
  /** Tour date/time already chosen on the form. Omitted when we don't have one. */
  detail?: string | null;
  conversationId?: string | null;
  /** Signed-in parents can open Messages. Guest inquiries cannot. */
  canOpenMessages?: boolean;
  onClose: () => void;
};

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return reduced;
}

export function RequestSentDialog({
  kind,
  listingName,
  city,
  photo,
  detail,
  conversationId,
  canOpenMessages = false,
  onClose,
  ...markers
}: Props) {
  const { t } = useCopy();
  const titleId = useId();
  const bodyId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const reducedMotion = usePrefersReducedMotion();
  const flourish = !reducedMotion;
  const title = t(requestSentTitleKey(kind));
  const body = t(requestSentBodyKey(kind)).replace("{name}", listingName);
  const place = (city || "").trim();
  const when = (detail || "").trim();
  const showMessages = Boolean(canOpenMessages);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const previously =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.focus();

    function focusables() {
      if (!panel) return [];
      return [
        ...panel.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      ].filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const nodes = focusables();
      if (!nodes.length) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const active = document.activeElement;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const outside = active !== panel && !panel.contains(active);
      if (e.shiftKey) {
        if (active === first || active === panel || outside) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || active === panel || outside) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      previously?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center md:items-center"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-fg/50"
        aria-label={t("close")}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        data-request-sent=""
        data-request-sent-kind={kind}
        data-request-sent-motion={flourish ? "on" : "off"}
        data-ke={markers["data-ke"] ?? "request-sent"}
        {...(markers["data-request-info-success"] !== undefined
          ? { "data-request-info-success": markers["data-request-info-success"] }
          : {})}
        className="relative z-10 w-full max-w-md rounded-t-xl bg-surface px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-lift ring-1 ring-border outline-none md:rounded-xl md:pb-5"
      >
        <p className="sr-only" role="status">
          {title}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 grid size-10 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
          aria-label={t("close")}
        >
          <X className="size-5" />
        </button>
        <div className="flex flex-col items-center px-6 text-center">
          <div className="relative grid size-14 place-items-center">
            {flourish ? (
              <span className="pointer-events-none absolute inset-0" aria-hidden="true">
                {CONFETTI.map((bit) => (
                  <span
                    key={`${bit.x}-${bit.y}`}
                    className="ke-confetti-bit absolute left-1/2 top-1/2 size-1.5 rounded-full"
                    style={{
                      background: bit.color,
                      ["--x" as string]: bit.x,
                      ["--y" as string]: bit.y,
                      animationDelay: bit.delay,
                    }}
                  />
                ))}
              </span>
            ) : null}
            <svg
              viewBox="0 0 52 52"
              className={cn("size-12", flourish && "ke-check-pop")}
              aria-hidden="true"
            >
              <circle cx="26" cy="26" r="24" className="ke-check-badge" />
              <circle cx="26" cy="26" r="20" className="ke-check-ring" pathLength={100} />
              <path d="M16.5 27.2 23 33.8 36 18.8" className="ke-check-mark" pathLength={100} />
            </svg>
          </div>
          <h2 id={titleId} className="mt-3 px-6 font-display text-xl leading-tight">
            {title}
          </h2>
          <p id={bodyId} className="mt-1.5 max-w-sm text-sm leading-5 text-muted">
            {body}
          </p>
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-[14px] bg-bg p-2.5 text-left ring-1 ring-border">
          {photo ? (
            <img
              src={photo}
              alt=""
              className="size-14 shrink-0 rounded-[10px] object-cover"
              width={56}
              height={56}
            />
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-5">{listingName}</p>
            {place ? <p className="truncate text-xs leading-4 text-muted">{place}</p> : null}
            {when ? <p className="truncate text-xs leading-4 text-muted">{when}</p> : null}
          </div>
        </div>
        <div className="mt-4 grid gap-2">
          {showMessages ? (
            <Button asChild>
              {conversationId ? (
                <Link to="/inbox/$id" params={{ id: conversationId }}>
                  {t("requestSentViewMessages")}
                </Link>
              ) : (
                <Link to="/inbox">{t("requestSentViewMessages")}</Link>
              )}
            </Button>
          ) : null}
          <Button type="button" variant={showMessages ? "secondary" : "primary"} onClick={onClose}>
            {t("requestSentBackToListing")}
          </Button>
        </div>
      </div>
    </div>
  );
}
