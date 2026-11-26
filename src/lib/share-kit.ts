/**
 * Listing share kit: ready-to-post copy and the social image layout.
 * Canadian wording, EN and FR. Nothing here posts anywhere.
 */

export type ShareKitLocale = "en" | "fr";

export type ShareKitInput = {
  name: string;
  city?: string | null;
  url: string;
  locale: ShareKitLocale;
};

export type ShareKitPost = { id: "short" | "facebook" | "instagram"; label: string; text: string };

function place(name: string, city?: string | null): string {
  const c = String(city || "").trim();
  return c ? `${name} (${c})` : name;
}

export function shareKitPosts(input: ShareKitInput): ShareKitPost[] {
  const name = String(input.name || "").trim() || "KidEase";
  const where = place(name, input.city);
  if (input.locale === "fr") {
    return [
      {
        id: "short",
        label: "Message court",
        text: `Voyez les places, les tarifs et les visites de ${where} sur KidEase : ${input.url}`,
      },
      {
        id: "facebook",
        label: "Facebook",
        text: `Vous cherchez une garderie? ${where} est sur KidEase. Consultez les places libres par âge, posez une question, réservez une visite ou inscrivez-vous sur la liste d'attente, gratuitement : ${input.url}`,
      },
      {
        id: "instagram",
        label: "Instagram",
        text: `Places, visites et liste d'attente de ${where}, au même endroit. Lien dans la bio : ${input.url}\n#garderie #servicedegarde #famille`,
      },
    ];
  }
  return [
    {
      id: "short",
      label: "Short message",
      text: `See open spots, fees and tours for ${where} on KidEase: ${input.url}`,
    },
    {
      id: "facebook",
      label: "Facebook",
      text: `Looking for child care? ${where} is on KidEase. Check open spots by age, ask a question, book a tour or join the waitlist, free: ${input.url}`,
    },
    {
      id: "instagram",
      label: "Instagram",
      text: `Open spots, tours and our waitlist for ${where}, all in one place. Link in bio: ${input.url}\n#childcare #daycare #ECE`,
    },
  ];
}

/** Text for the 1200×630 social image. Long names wrap to at most three lines. */
export function socialImageLines(
  input: ShareKitInput,
  maxChars = 26,
): {
  title: string[];
  subtitle: string;
  footer: string;
} {
  const words = (String(input.name || "").trim() || "KidEase").split(/\s+/);
  const title: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      title.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) title.push(line);
  if (title.length > 3) {
    title.length = 3;
    title[2] = `${title[2].slice(0, maxChars - 1)}…`;
  }
  const city = String(input.city || "").trim();
  const fr = input.locale === "fr";
  return {
    title,
    subtitle: fr
      ? `${city ? `${city} · ` : ""}Places, visites et liste d'attente`
      : `${city ? `${city} · ` : ""}Open spots, tours and waitlist`,
    footer: input.url.replace(/^https?:\/\//, ""),
  };
}

export function shareKitFileName(slug: string, kind: "qr" | "social"): string {
  const clean =
    String(slug || "listing")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "listing";
  return kind === "qr" ? `${clean}-qr.svg` : `${clean}-kidease.png`;
}
