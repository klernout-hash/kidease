import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { CANNED_REPLIES, helpCentreEnabled, searchHelp, supportMail } from "@/lib/help-centre";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/help/articles")({
  head: () => ({
    meta: [
      { title: "Help articles · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: HelpArticlesPage,
});

export function HelpArticlesPage() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const enabled = helpCentreEnabled();
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [body, setBody] = useState("");
  const [canned, setCanned] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const articles = useMemo(() => searchHelp(query, fr ? "fr" : "en"), [fr, query]);

  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-lg py-12">
        <p className="text-sm font-semibold text-primary">KidEase</p>
        <h1 className="mt-2 font-display text-3xl">{fr ? "Centre d’aide" : "Help centre"}</h1>
        <p className="mt-4 text-muted">
          {fr
            ? "Cherchez une réponse courte. Le prochain pas est d’écrire à l’équipe, ou de voir si le site est en ligne."
            : "Search a short answer. The next step is to write the team, or to see if the site is up."}
        </p>
        {!enabled ? (
          <p className="mt-4 text-sm" role="status">
            {fr ? "Le centre d’aide est éteint. La page d’aide habituelle reste ouverte." : "The help centre is off. The usual help page stays open."}
          </p>
        ) : (
          <>
            <label className="mt-6 block text-sm font-medium">
              {fr ? "Chercher" : "Search"}
              <input
                className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
              />
            </label>
            <ul className="mt-4 space-y-3">
              {articles.length === 0 ? (
                <li className="text-sm">{fr ? "Aucun article. Écrivez-nous." : "No article. Write to us."}</li>
              ) : (
                articles.map((article) => {
                  const copy = fr ? article.fr : article.en;
                  return (
                    <li key={article.id} className="rounded-xl bg-surface p-4 ring-1 ring-border">
                      <h2 className="font-medium">{copy.title}</h2>
                      <p className="mt-2 text-sm text-muted">{copy.body}</p>
                    </li>
                  );
                })
              )}
            </ul>
            <form
              className="mt-8 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                const mail = supportMail({
                  enabled: true,
                  name,
                  replyTo: email,
                  body,
                  cannedId: canned || undefined,
                  locale: fr ? "fr" : "en",
                });
                if (!mail) {
                  setSent(fr ? "Ajoutez votre nom, un courriel et un message." : "Add your name, an email, and a message.");
                  return;
                }
                window.location.href = `mailto:${mail.to}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.text)}`;
                setSent(fr ? "Votre appli de courriel s’ouvre vers support@kidease.ca." : "Your email app opens to support@kidease.ca.");
              }}
            >
              <h2 className="font-display text-xl">{fr ? "Écrire au soutien" : "Write to support"}</h2>
              <label className="block text-sm font-medium">
                {fr ? "Nom" : "Name"}
                <input className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" value={name} onChange={(event) => setName(event.target.value)} required />
              </label>
              <label className="block text-sm font-medium">
                {fr ? "Courriel" : "Email"}
                <input type="email" className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </label>
              <label className="block text-sm font-medium">
                {fr ? "Réponse toute faite" : "Canned reply"}
                <select className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" value={canned} onChange={(event) => setCanned(event.target.value)}>
                  <option value="">{fr ? "Aucune" : "None"}</option>
                  {CANNED_REPLIES.map((row) => (
                    <option key={row.id} value={row.id}>
                      {fr ? row.fr : row.en}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                {fr ? "Message" : "Message"}
                <textarea className="mt-1 w-full min-h-24 rounded-xl border border-border bg-surface px-3 py-2" value={body} onChange={(event) => setBody(event.target.value)} required />
              </label>
              <Button type="submit">{fr ? "Envoyer" : "Send"}</Button>
              {sent ? <p role="status">{sent}</p> : null}
            </form>
          </>
        )}
        <p className="mt-8 flex flex-wrap gap-4">
          <Link to={localePath("/help", locale)} className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
            {fr ? "Page d’aide" : "Help page"}
          </Link>
          <Link to={localePath("/status", locale)} className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
            {fr ? "État du système" : "System status"}
          </Link>
        </p>
      </main>
    </Shell>
  );
}
