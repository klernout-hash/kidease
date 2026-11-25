import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { en } from "../../src/lib/copy-en.ts";
import { fr } from "../../src/lib/copy-fr.ts";
import { cn, money } from "../../src/lib/utils.ts";
import { parentDeskPath } from "../../src/lib/desk-nav.ts";
import { localePath } from "../../src/lib/locale-path.ts";
import { showsParentBrowseActions } from "../../src/lib/role-access.ts";
import { parentHomeSectionOrder, parentHomeStage } from "../../src/lib/parent-home-stage.ts";
import { parentHomeCardEligible, showHomeUpgradeCard } from "../../src/lib/upgrade-prompt.ts";
import { isSafeSitemapSlug } from "../../src/lib/sitemap.ts";
import { isLeadStatus, leadStatusCopyKey } from "../../src/lib/lead-requests.ts";
import { spotOfferCopy } from "../../src/lib/spot-offer-copy.ts";
import { billDollars, billIsOpen } from "../../src/lib/bill.ts";
import { failureReasonText } from "../../src/lib/payment-state.ts";
import { attendanceCopy } from "../../src/lib/attendance-handoff.ts";
import { centreClockLabel } from "../../src/lib/parent-arrival.ts";
import { parentHomeCareRows } from "../../src/lib/parent-home-care.ts";
import { isEnrolledBookingStatus } from "../../src/lib/daily-care.ts";
import { useParentRequestScope } from "../../src/lib/use-parent-request-scope.ts";
const require = createRequire(import.meta.url);

function component(path, dependencies) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new vm.Script(code).runInNewContext({
    module,
    exports: module.exports,
    require: (name) => dependencies[name] ?? require(name),
  });
  return module.exports;
}

/** Actual home/care/Button markup; network, router, attention and plan slots are synthetic. */
export function renderParentHomeFixture({
  locale = "en",
  stage = "enrolled",
  extrasState = "ready",
  careState = "ready",
  childCount = 1,
  longNote = false,
} = {}) {
  const copy = locale === "fr" ? fr : en;
  const t = (key) => copy[key];
  const router = {
    useRouterState: ({ select }) =>
      select({ location: { pathname: locale === "fr" ? "/fr/parent" : "/parent" } }),
    Link: ({ to, search, params, hash, activeProps: _activeProps, children, ...props }) => {
      let href = to;
      for (const [key, value] of Object.entries(params ?? {}))
        href = href.replace(`$${key}`, value);
      if (search) href += `?${new URLSearchParams(search)}`;
      if (hash) href += `#${hash}`;
      return createElement("a", { ...props, href }, children);
    },
  };
  const { Button } = component("src/components/ui/button.tsx", { "@/lib/utils": { cn } });
  const { EmptyState } = component("src/components/empty-state.tsx", {
    "@/components/ui/button": { Button },
  });
  const common = {
    "@tanstack/react-router": router,
    "@/components/ui/button": { Button },
    "@/lib/use-copy": { useCopy: () => ({ locale, t }) },
    "@/lib/desk-nav": { parentDeskPath },
    "@/lib/use-parent-request-scope": { useParentRequestScope },
  };
  const billStatus = component("src/components/bill-status.tsx", {
    "@/lib/use-copy": common["@/lib/use-copy"],
    "@/lib/utils": { cn },
  });
  const { ParentHome } = component("src/components/parent-home.tsx", {
    ...common,
    "@/components/bill-status": billStatus,
    "@/lib/payment-state": { failureReasonText },
    "@/lib/locale-path": { localePath },
    "@/lib/parent-home-stage": { parentHomeSectionOrder, parentHomeStage },
    "@/lib/bill": { billDollars, billIsOpen },
    "@/lib/utils": { money },
    "@/lib/sitemap": { isSafeSitemapSlug },
    "@/lib/role-access": { showsParentBrowseActions },
    "@/lib/upgrade-prompt": { parentHomeCardEligible, showHomeUpgradeCard },
    "@/lib/lead-requests": { isLeadStatus, leadStatusCopyKey },
    "@/lib/spot-offer-copy": { spotOfferCopy },
    "@/components/role-chrome": { useRoleChrome: () => ({ role: "parent" }) },
    "@/lib/use-native-shell": { useInNativeShell: () => false },
    "@/components/role-upgrade-card": {
      RoleUpgradeCard: () =>
        createElement("section", { "data-ke": "fixture-plan" }, "Synthetic plan slot"),
    },
    "@/components/area-waitlist-form": {
      AreaWaitlistForm: () =>
        createElement(
          "section",
          { "data-ke": "fixture-area" },
          locale === "fr" ? "Alertes de places · aperçu" : "Area alerts · preview",
        ),
    },
    "@/components/status-badge": {
      StatusBadge: ({ status }) => createElement("span", null, status),
    },
  });
  const { ParentHomeCareContent } = component("src/components/parent-home-care.tsx", {
    ...common,
    "@/lib/attendance-handoff": { attendanceCopy },
    "@/lib/parent-arrival": { centreClockLabel },
    "@/lib/parent-home-care": { parentHomeCareRows },
    "@/lib/daily-care": { isEnrolledBookingStatus },
    "@/lib/server/child-checkin": {},
    "@/lib/server/daily-care": {},
    "@/lib/server/desk-features": {},
    "@/lib/timeout": {},
  });
  const booking = {
    id: "synthetic-booking",
    status: "active",
    daycareId: "synthetic-centre",
    daycareName: "Synthetic Centre",
    childName: "Synthetic Avery",
  };
  const bookings = Array.from({ length: childCount }, (_, index) => ({
    ...booking,
    id: `${booking.id}-${index}`,
    childName: index ? "Synthetic Quinn" : booking.childName,
  }));
  const body =
    locale === "fr"
      ? "Note synthétique : les enfants ont construit une tour avec des blocs, puis ont partagé une histoire avec leur éducatrice. "
      : "Synthetic note: the children built a tower with blocks, then shared a story with their educator. ";
  const state =
    careState === "ready"
      ? {
          kind: "ready",
          snapshot: {
            attendanceEnabled: true,
            journalsEnabled: true,
            attendance: bookings.map((item) => ({
              bookingId: item.id,
              childName: item.childName,
              localDay: "2026-11-17",
              timeZone: "America/Winnipeg",
              status: "here",
              events: [{ action: "check_in" }],
              lastUpdated: { at: "2026-11-17T14:00:00Z", name: "Synthetic educator" },
            })),
            journals: bookings.map((item) => ({
              bookingId: item.id,
              daycareId: item.daycareId,
              day: "2026-11-17",
              createdAt: "2026-11-17T16:00:00Z",
              body: longNote
                ? body.repeat(15)
                : locale === "fr"
                  ? "Note synthétique : Avery a construit une tour avec des blocs."
                  : "Synthetic note: Avery built a tower with blocks.",
            })),
          },
        }
      : { kind: careState };
  return renderToStaticMarkup(
    createElement(ParentHome, {
      saved: [{ id: "synthetic-saved", name: "Synthetic Saved Centre", slug: "synthetic-saved" }],
      bookings: stage === "enrolled" ? bookings : [],
      tours: [],
      leads: [],
      settled: stage !== "pending",
      loadError: stage === "error",
      extrasState,
      dismissed: true,
      onRetry: () => {},
      bills: [
        {
          id: "synthetic-bill",
          status: "sent",
          daycareName: "Synthetic Centre",
          childName: "Synthetic Avery",
          amountCents: 12000,
        },
      ],
      care: createElement(ParentHomeCareContent, { bookings, state, onRetry: () => {} }),
      attention: createElement(
        "section",
        { "data-ke": "attention-list" },
        createElement("h2", { className: "font-display text-xl" }, t("attentionTitle")),
        createElement(
          "p",
          { className: "mt-2 text-sm text-muted" },
          locale === "fr"
            ? "Aperçu synthétique des actions à faire."
            : "Synthetic next-step preview.",
        ),
      ),
      matches: createElement(
        "section",
        { "data-ke": "parent-home-matches" },
        createElement(EmptyState, {
          title: t("parentHomeFindTitle"),
          body: t("parentHomeFindBody"),
        }),
      ),
    }),
  );
}
