import { Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { localeLine } from "@/lib/french-type";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";
import type { LegalDoc, LegalBlock } from "@/lib/legal-copy";
import { companyAddress, companyOperatorLine, privacyOfficerLine } from "@/lib/company";
import { SUPPORT_INBOX_EMAIL } from "@/lib/support";

function line(locale: string, text: string) {
  return localeLine(locale, text);
}

function Block({ block, locale }: { block: LegalBlock; locale: string }) {
  if (block.type === "p") {
    return <p className="mt-2 text-sm leading-6 text-muted">{line(locale, block.text)}</p>;
  }
  if (block.type === "ul") {
    return (
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted">
        {block.items.map((item) => (
          <li key={item}>{line(locale, item)}</li>
        ))}
      </ul>
    );
  }
  if (block.type === "link") {
    return (
      <p className="mt-3 text-sm">
        <Link to={block.to} className="font-medium text-primary underline-offset-4 hover:underline">
          {line(locale, block.label)}
        </Link>
      </p>
    );
  }
  if (block.type === "processors") {
    return (
      <ul className="mt-3 list-disc space-y-3 pl-5 text-sm leading-6 text-muted">
        {block.items.map((item) => (
          <li key={item.name}>
            {item.purpose.startsWith(item.name) ? (
              <span className="font-medium text-fg">{line(locale, item.purpose)}</span>
            ) : (
              <>
                <span className="font-medium text-fg">{line(locale, item.name)}.</span> {line(locale, item.purpose)}
              </>
            )}
            {item.href ? (
              <>
                {" "}
                <a href={item.href} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                  {line(locale, item.hrefLabel ?? "Privacy notice")} ↗
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
      {block.caption ? <p className="text-sm font-medium text-fg">{line(locale, block.caption)}</p> : null}
      <table className="mt-2 w-full min-w-[28rem] border-collapse text-left text-sm text-muted">
        <thead>
          <tr>
            {block.headers.map((h) => (
              <th key={h} className="border-b border-border py-2 pr-3 font-medium text-fg">
                {line(locale, h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row.join("|")}>
              {row.map((cell, i) => (
                <td key={`${row[0]}-${i}`} className="border-b border-border/80 py-2 pr-3 align-top">
                  {line(locale, cell)}
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
  const { t, locale } = useCopy();
  return (
    <Shell>
      <main className="ke-gutter mx-auto max-w-2xl py-10 md:py-14">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">{line(locale, doc.kicker)}</p>
        <h1 className="mt-2 font-display text-3xl md:text-4xl">{line(locale, doc.title)}</h1>
        <p className="mt-2 text-sm text-subtle">{line(locale, doc.updated)}</p>
        {doc.intro.map((p) => (
          <p key={p} className="mt-4 text-muted">
            {line(locale, p)}
          </p>
        ))}

        <nav className="mt-6 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted" aria-label={t("privacy")}>
          <Link to={localePath("/privacy", locale)} className="underline-offset-4 hover:underline">
            {t("privacy")}
          </Link>
          <span aria-hidden>·</span>
          <Link to={localePath("/terms", locale)} className="underline-offset-4 hover:underline">
            {t("terms")}
          </Link>
          <span aria-hidden>·</span>
          <Link to={localePath("/cookies", locale)} className="underline-offset-4 hover:underline">
            {t("cookies")}
          </Link>
        </nav>

        <div className="mt-8 space-y-8">
          {doc.sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2 className="font-display text-xl">{line(locale, section.title)}</h2>
              {section.blocks.map((block, i) => (
                <Block key={`${section.id}-${i}`} block={block} locale={locale} />
              ))}
            </section>
          ))}
        </div>

        {doc.storeLabel ? (
          <>
            <h2 className="mt-12 font-display text-2xl">{line(locale, doc.storeLabel)}</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted">
              {doc.storeItems?.map((item) => (
                <li key={item}>{line(locale, item)}</li>
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
            {line(locale, doc.officialLabel ?? "")} ↗
          </a>
        ) : null}

        {doc.showOperator ? (
          <div className="mt-8 space-y-2 text-sm text-muted" data-ke="privacy-operator">
            <p>{companyOperatorLine(locale === "fr" ? "fr" : "en")}</p>
            {companyAddress(locale === "fr" ? "fr" : "en") ? (
              <p>{companyAddress(locale === "fr" ? "fr" : "en")}</p>
            ) : null}
            <p>
              {privacyOfficerLine(locale === "fr" ? "fr" : "en")}
            </p>
          </div>
        ) : null}

        <p className="mt-8 text-sm text-muted">
          {line(locale, doc.contactLead)}{" "}
          <a href={`mailto:${doc.contactEmail || SUPPORT_INBOX_EMAIL}`} className="text-primary underline-offset-4 hover:underline">
            {doc.contactEmail || SUPPORT_INBOX_EMAIL}
          </a>
          {" · "}
          <Link to={localePath("/delete-account", locale)} className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
            {t("deleteAccount")}
          </Link>
          {" · "}
          <Link to={localePath("/help", locale)} className="underline-offset-4 hover:underline">
            {t("support")}
          </Link>
        </p>
        <p className="mt-6 text-xs text-subtle">{line(locale, doc.disclaimer)}</p>
      </main>
    </Shell>
  );
}
