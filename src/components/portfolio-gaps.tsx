import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { portfolioCopy, portfolioFocusPath } from "@/lib/child-portfolio-copy";
import { portfolioGaps, type PortfolioGap } from "@/lib/child-portfolio";
import { loadDeskFeatureFlags } from "@/lib/server/desk-features";
import { useCopy } from "@/lib/use-copy";
import type { Child } from "@/lib/types";

export function PortfolioGaps({ children }: { children: Child[] }) {
  const { locale } = useCopy();
  const copy = portfolioCopy(locale);
  const [on, setOn] = useState(false);
  useEffect(() => {
    void loadDeskFeatureFlags().then(
      (flags) => setOn(flags.portfolioGate === true),
      () => setOn(false),
    );
  }, []);
  if (!on) return null;
  const rows = children
    .map((child) => ({ child, gaps: portfolioGaps(child) }))
    .filter((row) => row.gaps.length);
  if (!rows.length) return null;
  const french = locale === "fr";
  return (
    <section className="rounded-xl bg-danger/5 p-4 ring-1 ring-danger/30" role="status">
      <h2 className="font-display text-xl">{copy.actionTitle}</h2>
      <p className="mt-1 text-sm">{copy.actionBody}</p>
      <ul className="mt-3 space-y-3">
        {rows.map(({ child, gaps }) => (
          <li key={child.id}>
            <p className="font-medium">{child.name || copy.gaps.name}</p>
            <ul className="mt-1 space-y-1">
              {gaps.map((gap) => (
                <li key={gap}>
                  <Link
                    to={french ? "/fr/parent" : "/parent"}
                    search={{ tab: "children", child: child.id, focus: gap }}
                    className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {copy.gaps[gap as PortfolioGap]}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="sr-only">{portfolioFocusPath(child.id, gaps[0], french)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
