import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { ProfileAvatar } from "@/components/profile-avatar";
import { MAX_CHILDREN_PER_PARENT } from "@/lib/children-limit";
import type { ProfileChild } from "@/lib/server/profile-desk";
import { formatAgeLabel } from "@/lib/templates";
import { useCopy } from "@/lib/use-copy";

export function ProfileChildren({ children }: { children: ProfileChild[] }) {
  const { t, locale } = useCopy();
  const rows = children.slice(0, MAX_CHILDREN_PER_PARENT);
  const canAdd = rows.length < MAX_CHILDREN_PER_PARENT;
  const ageLocale = locale === "fr" ? "fr" : "en";

  return (
    <section className="mt-4" data-ke="profile-children" aria-labelledby="profile-children-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="profile-children-heading" className="text-sm font-semibold">
          {t("children")}
        </h2>
        {canAdd ? (
          <Link
            to="/parent"
            search={{ tab: "children", child: "new" }}
            data-ke="profile-add-child"
            className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-primary touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {t("profileAddChild")}
          </Link>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted">{t("profileChildrenLead")}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted" data-ke="profile-children-empty">
          {t("profileChildrenEmpty")}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border rounded-[1.25rem] bg-surface ring-1 ring-border">
          {rows.map((child) => {
            const age = /^\d{4}-\d{2}-\d{2}/.test(child.birthdate) ? formatAgeLabel(child.birthdate, ageLocale) : "";
            return (
              <li key={child.id}>
                <Link
                  to="/parent"
                  search={{ tab: "children", child: child.id }}
                  data-ke="profile-child"
                  aria-label={t("profileChildOpen").replace("{name}", child.name)}
                  className="flex min-h-14 items-center gap-3 px-3 py-2 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <ProfileAvatar name={child.name} size="sm" className="size-11" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{child.name}</span>
                    {age ? <span className="block text-sm text-muted">{age}</span> : null}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
