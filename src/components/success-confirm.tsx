import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  bindSuccessHost,
  SUCCESS_TOAST_MS,
  type SuccessRequest,
} from "@/lib/success-confirm";
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

function displayPhoto(src?: string | null) {
  const photo = (src || "").trim();
  if (!photo || photo.startsWith("data:") || photo.includes("placeholder")) return null;
  return photo;
}

function SuccessMark({ flourish, size }: { flourish: boolean; size: "md" | "sm" }) {
  return (
    <svg
      viewBox="0 0 52 52"
      className={cn(size === "sm" ? "size-8" : "size-12", flourish && "ke-check-pop")}
      aria-hidden="true"
    >
      <circle cx="26" cy="26" r="24" className="ke-check-badge" />
      <circle cx="26" cy="26" r="20" className="ke-check-ring" pathLength={100} />
      <path d="M16.5 27.2 23 33.8 36 18.8" className="ke-check-mark" pathLength={100} />
    </svg>
  );
}

type MarkerProps = {
  "data-ke"?: string;
  "data-request-info-success"?: string;
  "data-request-sent"?: string;
  "data-request-sent-kind"?: string;
};

export type SuccessConfirmProps = MarkerProps & {
  kicker: string;
  title: string;
  body?: string;
  photo?: string | null;
  contextTitle?: string;
  contextMeta?: string;
  contextDetail?: string;
  points?: string[];
  primary?: ReactNode;
  secondary?: ReactNode;
  onClose: () => void;
  closeLabel: string;
};

export function SuccessConfirm({
  kicker,
  title,
  body,
  photo,
  contextTitle,
  contextMeta,
  contextDetail,
  points,
  primary,
  secondary,
  onClose,
  closeLabel,
  ...markers
}: SuccessConfirmProps) {
  const titleId = useId();
  const bodyId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const reducedMotion = usePrefersReducedMotion();
  const flourish = !reducedMotion;
  const thumb = displayPhoto(photo);
  const cardTitle = (contextTitle || "").trim();
  const meta = (contextMeta || "").trim();
  const detail = (contextDetail || "").trim();
  const copy = (body || "").trim();
  const unlocked = (points || []).map((line) => line.trim()).filter(Boolean).slice(0, 3);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const previously = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
        aria-label={closeLabel}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={copy ? bodyId : undefined}
        tabIndex={-1}
        data-success-confirm=""
        data-success-variant="modal"
        data-request-sent-motion={flourish ? "on" : "off"}
        data-ke={markers["data-ke"] ?? "success-confirm"}
        {...(markers["data-request-sent"] !== undefined
          ? { "data-request-sent": markers["data-request-sent"] }
          : {})}
        {...(markers["data-request-sent-kind"] !== undefined
          ? { "data-request-sent-kind": markers["data-request-sent-kind"] }
          : {})}
        {...(markers["data-request-info-success"] !== undefined
          ? { "data-request-info-success": markers["data-request-info-success"] }
          : {})}
        className="relative z-10 w-full max-w-md rounded-t-xl bg-surface px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-lift ring-1 ring-border outline-none md:rounded-xl md:pb-5"
      >
        <p className="sr-only" role="status">
          {kicker} {title}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 grid size-10 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
          aria-label={closeLabel}
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
            <SuccessMark flourish={flourish} size="md" />
          </div>
          <p className="mt-3 text-xs font-semibold text-ok" data-success-kicker="">
            {kicker}
          </p>
          <h2 id={titleId} className="mt-1 px-6 font-display text-xl leading-tight">
            {title}
          </h2>
          {copy ? (
            <p id={bodyId} className="mt-1.5 max-w-sm text-sm leading-5 text-muted">
              {copy}
            </p>
          ) : null}
          {unlocked.length ? (
            <ul className="mt-3 w-full max-w-sm list-disc space-y-1 pl-5 text-left text-sm text-muted" data-ke="upgrade-success-benefits">
              {unlocked.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </div>
        {cardTitle ? (
          <div className="mt-4 flex items-center gap-3 rounded-[14px] bg-bg p-2.5 text-left ring-1 ring-border">
            {thumb ? (
              <img
                src={thumb}
                alt=""
                className="size-14 shrink-0 rounded-[10px] object-cover"
                width={56}
                height={56}
              />
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-5">{cardTitle}</p>
              {meta ? <p className="truncate text-xs leading-4 text-muted">{meta}</p> : null}
              {detail ? <p className="truncate text-xs leading-4 text-muted">{detail}</p> : null}
            </div>
          </div>
        ) : null}
        <div className="mt-4 grid gap-2">
          {primary}
          {secondary}
        </div>
      </div>
    </div>
  );
}

export function SuccessToast({
  kicker,
  title,
  onDismiss,
}: {
  kicker: string;
  title: string;
  onDismiss: () => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const flourish = !reducedMotion;
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const timer = window.setTimeout(() => dismissRef.current(), SUCCESS_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [title]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[80] flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        data-ke="success-toast"
        data-success-variant="toast"
        data-request-sent-motion={flourish ? "on" : "off"}
        className="pointer-events-auto flex max-w-sm items-center gap-2 rounded-full bg-surface py-1.5 pl-1.5 pr-3 shadow-lift ring-1 ring-border"
      >
        <SuccessMark flourish={flourish} size="sm" />
        <p className="min-w-0 truncate text-sm">
          <span className="font-semibold text-ok" data-success-kicker="">
            {kicker}
          </span>{" "}
          <span className="font-medium">{title}</span>
        </p>
      </div>
    </div>
  );
}

export function SuccessConfirmHost() {
  const { t } = useCopy();
  const [modal, setModal] = useState<SuccessRequest | null>(null);
  const [toast, setToast] = useState<SuccessRequest | null>(null);
  const dismissToast = useRef(() => setToast(null));
  dismissToast.current = () => setToast(null);

  useEffect(() => {
    return bindSuccessHost((request) => {
      if (request.variant === "toast") {
        setToast(request);
        return;
      }
      setModal(request);
    });
  }, []);

  function closeModal() {
    const done = modal?.onClose;
    setModal(null);
    done?.();
  }

  const kicker = t("successKicker");

  return (
    <>
      {modal ? (
        <SuccessConfirm
          kicker={modal.kicker || kicker}
          title={modal.title}
          body={modal.body}
          points={modal.points}
          photo={modal.photo}
          contextTitle={modal.contextTitle}
          contextMeta={modal.contextMeta}
          contextDetail={modal.contextDetail}
          onClose={closeModal}
          closeLabel={t("close")}
          primary={
            modal.primaryLabel ? (
              <Button
                type="button"
                onClick={() => {
                  modal.onPrimary?.();
                  closeModal();
                }}
              >
                {modal.primaryLabel}
              </Button>
            ) : null
          }
          secondary={
            <Button type="button" variant={modal.primaryLabel ? "secondary" : "primary"} onClick={closeModal}>
              {modal.secondaryLabel || t("successDone")}
            </Button>
          }
        />
      ) : null}
      {toast ? (
        <SuccessToast
          kicker={toast.kicker || kicker}
          title={toast.title}
          onDismiss={() => dismissToast.current()}
        />
      ) : null}
    </>
  );
}
