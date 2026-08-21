import { Link } from "@tanstack/react-router";
import { hasCareDetails } from "@/lib/child-profile";
import { formatAgeLabel } from "@/lib/templates";
import { useCopy } from "@/lib/use-copy";
import type { Child } from "@/lib/types";

export function ChildCareCard({
  child,
  showCompleteLink,
}: {
  child: Child;
  showCompleteLink?: boolean;
}) {
  const { t, locale } = useCopy();
  const thin = !hasCareDetails(child);

  function row(label: string, value: string | boolean | undefined, hideEmpty = false) {
    if (typeof value === "boolean") {
      return (
        <p className="flex justify-between gap-3 text-sm">
          <span className="text-muted">{label}</span>
          <span>{value ? t("yes") : t("no")}</span>
        </p>
      );
    }
    if (hideEmpty && !value) return null;
    return (
      <p className="text-sm">
        <span className="text-muted">{label}</span>
        <br />
        {value || t("noneListed")}
      </p>
    );
  }

  return (
    <section className="rounded-lg bg-surface ring-1 ring-border">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-3 py-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("childCareCard")}</p>
          <p className="font-medium">
            {child.name}
            {child.preferredName ? <span className="text-muted"> ({child.preferredName})</span> : null}
          </p>
          <p className="text-xs text-muted">{formatAgeLabel(child.birthdate, locale)}</p>
        </div>
        {child.epiPen ? (
          <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger ring-1 ring-danger/20">
            {t("epiPenBadge")}
          </span>
        ) : null}
      </div>
      <div className="space-y-2 px-3 py-3">
        <p className={`rounded-md px-2 py-2 text-sm ${child.allergies ? "bg-danger/10 text-danger" : "bg-surface-2 text-muted"}`}>
          <span className="font-medium">{t("allergies")}: </span>
          {child.allergies || t("noAllergies")}
        </p>
        {row(t("medicalNotes"), child.medicalNotes, true)}
        {row(t("medications"), child.medications, true)}
        {row(t("foodsLike"), child.foodsLike, true)}
        {row(t("foodsAvoid"), child.foodsAvoid, true)}
        {row(t("diet"), child.diet, true)}
        {row(t("likes"), child.likes, true)}
        {row(t("comfortItem"), child.comfortItem, true)}
        {row(t("napRoutine"), child.napRoutine, true)}
        {child.toilet
          ? row(
              t("toilet"),
              child.toilet === "diapers"
                ? t("toiletDiapers")
                : child.toilet === "training"
                  ? t("toiletTraining")
                  : t("toiletIndependent"),
            )
          : null}
        {row(t("soothes"), child.soothes, true)}
        {row(t("fears"), child.fears, true)}
        {row(t("homeLanguage"), child.homeLanguage, true)}
        {child.emergencyName || child.emergencyPhone
          ? row(t("emergencyName"), [child.emergencyName, child.emergencyPhone].filter(Boolean).join(" · "))
          : null}
        {row(t("pickupPeople"), child.pickupPeople, true)}
        {row(t("photoOk"), child.photoOk)}
        {row(t("sunscreenOk"), child.sunscreenOk)}
        {row(t("extraNotes"), child.notes, true)}
        {thin && showCompleteLink ? (
          <Link to="/account" className="inline-block pt-1 text-sm text-primary underline">
            {t("completeProfile")}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
