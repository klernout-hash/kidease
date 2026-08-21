import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/privacy")({ component: Privacy });

function Privacy() {
  const { t } = useCopy();
  return (
    <Shell>
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="font-display text-3xl">{t("pipeda")}</h1>
        <p className="mt-4 text-muted">{t("pipedaBody")}</p>
        <ul className="mt-6 list-disc space-y-2 pl-5 text-sm text-muted">
          <li>Account identifiers from Google, X, or email.</li>
          <li>Children you add (first name and birthdate) — only you and centres you contact.</li>
          <li>Messages, enrolment requests, and payment records.</li>
          <li>No sale of personal information. No continuous livestreams of children.</li>
          <li>Production payments would use PCI-compliant processors (Stripe, Interac).</li>
        </ul>
        <h2 className="mt-10 font-display text-2xl">{t("privacyNutrition")}</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted">
          <li>{t("locData")}</li>
          <li>{t("contactData")}</li>
          <li>{t("userContent")}</li>
          <li>{t("identifiers")}</li>
          <li>{t("payData")}</li>
        </ul>
        <p className="mt-8 text-sm text-muted">
          <Link to="/account" className="underline-offset-4 hover:underline">
            {t("deleteAccount")}
          </Link>
          {" · "}
          <Link to="/support" className="underline-offset-4 hover:underline">
            {t("support")}
          </Link>
          {" · "}
          <Link to="/terms" className="underline-offset-4 hover:underline">
            {t("terms")}
          </Link>
        </p>
      </main>
    </Shell>
  );
}
