import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Building2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

export function RoleEnrollChooser({
  heading = "h2",
  titleId,
  className,
}: {
  heading?: "h2" | "h3";
  titleId?: string;
  className?: string;
}) {
  const { t } = useCopy();
  const Title = heading;
  const CardTitle = heading === "h2" ? "h3" : "h4";
  return (
    <div className={cn("w-full", className)}>
      <Title
        id={titleId}
        className="text-center text-[clamp(1.35rem,3vw,1.75rem)] text-fg"
      >
        {t("rolePickTitle")}
      </Title>
      <p className="mx-auto mt-2 max-w-md text-center text-sm text-muted md:text-base">{t("rolePickLead")}</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <article className="flex flex-col rounded-xl bg-surface p-5 shadow-card ring-1 ring-border sm:p-6">
          <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Users className="size-6" strokeWidth={1.75} aria-hidden />
          </span>
          <CardTitle className="mt-4 text-xl font-semibold text-fg">{t("roleParentTitle")}</CardTitle>
          <p className="mt-2 flex-1 text-sm leading-6 text-muted">{t("roleParentBody")}</p>
          <Button size="lg" className="mt-6 w-full min-h-12" asChild>
            <Link to="/contact" search={{ intent: "parent" }}>
              <ArrowRight className="size-4" aria-hidden />
              {t("roleParentCta")}
            </Link>
          </Button>
        </article>
        <article className="flex flex-col rounded-xl bg-primary p-5 text-primary-fg shadow-lift ring-1 ring-primary sm:p-6">
          <span className="grid size-12 place-items-center rounded-full bg-primary-fg/15 text-primary-fg">
            <Building2 className="size-6" strokeWidth={1.75} aria-hidden />
          </span>
          <CardTitle className="mt-4 text-xl font-semibold text-primary-fg">{t("roleDaycareTitle")}</CardTitle>
          <p className="mt-2 flex-1 text-sm leading-6 text-primary-fg/85">{t("roleDaycareBody")}</p>
          <Button size="lg" variant="secondary" className="mt-6 w-full min-h-12" asChild>
            <Link to="/claim" hash="enroll">
              <ArrowRight className="size-4" aria-hidden />
              {t("roleDaycareCta")}
            </Link>
          </Button>
        </article>
      </div>
      <p className="mt-5 text-center text-sm text-muted">
        {t("alreadyAccount")}{" "}
        <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("signIn")}
        </Link>
      </p>
    </div>
  );
}

export function RoleEnrollDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useCopy();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-fg/40 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-enroll-title"
        className="relative max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-bg p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-lift ring-1 ring-border sm:rounded-xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 -mx-5 mb-1 flex justify-end bg-bg px-2 sm:-mx-8">
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
            aria-label={t("close")}
          >
            <X className="size-5" />
          </button>
        </div>
        <RoleEnrollChooser heading="h2" titleId="role-enroll-title" />
      </div>
    </div>
  );
}
