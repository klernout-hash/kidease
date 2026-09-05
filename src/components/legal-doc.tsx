import { Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site-footer";
import { Shell } from "@/components/shell";
import { useCopy } from "@/lib/use-copy";
import type { LegalDoc, LegalBlock } from "@/lib/legal-copy";

function Block({ block }: { block: LegalBlock }) {
  if (block.type === "p") {
    return <p className="mt-2 text-sm leading-6 text-muted">{block.text}</p>;
  }
  if (block.type === "ul") {
    return (
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  if (block.type === "link") {
    return (
      <p className="mt-3 text-sm">
        <Link to={block.to} className="font-medium text-primary underline-offset-4 hover:underline">
          {block.label}
        </Link>
      </p>
    );
  }
  if (block.type === "processors") {
    return (
      <ul className="mt-3 list-disc space-y-3 pl-5 text-sm leading-6 text-muted">
        {block.items.map((item) => (
          <li key={item.name}>
            <span className="font-medium text-fg">{item.name}.</span> {item.purpose}
            {item.href ? (
              <>
                {" "}
                <a href={item.href} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                  {item.hrefLabel ?? "Privacy notice"} ↗
                </a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="mt-3 overflow-x-auto">
      {block.caption ? <p className="text-sm font-medium text-fg">{block.caption}</p> : null}
      <table className="mt-2 w-full min-w-[28rem] border-collapse text-left text-sm text-muted">
        <thead>
          <tr>
            {block.headers.map((h) => (
              <th key={h} className="border-b border-border py-2 pr-3 font-medium text-fg">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row.join("|")}>
              {row.map((cell, i) => (
                <td key={`${row[0]}-${i}`} className="border-b border-border/80 py-2 pr-3 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const { t } = useCopy();
  return (
    <Shell bare>
      <main className="ke-gutter mx-auto max-w-2xl py-10 md:py-14">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">{doc.kicker}</p>
        <h1 className="mt-2 font-display text-3xl md:text-4xl">{doc.title}</h1>
        <p className="mt-2 text-sm text-subtle">{doc.updated}</p>
        {doc.intro.map((p) => (
          <p key={p} className="mt-4 text-muted">
            {p}
          </p>
        ))}

        <nav className="mt-6 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted" aria-label={t("privacy")}>
          <Link to="/privacy" className="underline-offset-4 hover:underline">
            {t("privacy")}
          </Link>
          <span aria-hidden>·</span>
          <Link to="/terms" className="underline-offset-4 hover:underline">
            {t("terms")}
          </Link>
          <span aria-hidden>·</span>
          <Link to="/cookies" className="underline-offset-4 hover:underline">
            {t("cookies")}
          </Link>
        </nav>

        <div className="mt-8 space-y-8">
          {doc.sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2 className="font-display text-xl">{section.title}</h2>
              {section.blocks.map((block, i) => (
                <Block key={`${section.id}-${i}`} block={block} />
              ))}
            </section>
          ))}
        </div>

        {doc.storeLabel ? (
          <>
            <h2 className="mt-12 font-display text-2xl">{doc.storeLabel}</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted">
              {doc.storeItems?.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </>
        ) : null}

        {doc.officialHref ? (
          <a
            href={doc.officialHref}
            target="_blank"
            rel="noreferrer"
            className="mt-8 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {doc.officialLabel} ↗
          </a>
        ) : null}

        <p className="mt-8 text-sm text-muted">
          {doc.contactLead}{" "}
          <a href="mailto:kyle@kidease.ca" className="text-primary underline-offset-4 hover:underline">
            kyle@kidease.ca
          </a>
          {" · "}
          <Link to="/account" className="underline-offset-4 hover:underline">
            {t("deleteAccount")}
          </Link>
          {" · "}
          <Link to="/help" className="underline-offset-4 hover:underline">
            {t("support")}
          </Link>
        </p>
        <p className="mt-6 text-xs text-subtle">{doc.disclaimer}</p>
      </main>
      <SiteFooter />
    </Shell>
  );
}
