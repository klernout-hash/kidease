import { localePath, stripLocalePrefix } from "../locale-path.ts";

export type HelpDesk = "parent" | "provider" | "staff" | "admin" | "support" | "guest";

export function helpDeskFor(pathname: string, role: string, centreRole?: string | null): HelpDesk {
  if (role === "guest") return "guest";
  const desk = stripLocalePrefix(pathname).split("/")[1];
  const active = ["parent", "provider", "admin", "support"].includes(desk) ? desk : role;
  if (active === "provider") {
    return centreRole === "staff" || centreRole === "read_only" ? "staff" : "provider";
  }
  if (active === "parent" || active === "admin" || active === "support") return active;
  return "guest";
}

const greetings = {
  parent: ["What can I help you do in the parent desk?", "Comment puis-je vous aider dans le bureau des parents?"],
  provider: ["What can I help you do in your daycare desk?", "Comment puis-je vous aider dans le bureau de votre garderie?"],
  staff: ["What can I help you do in the staff desk?", "Comment puis-je vous aider dans le bureau du personnel?"],
  admin: ["What can I help you find in the admin desk?", "Que cherchez-vous dans le bureau d’administration?"],
  support: ["What can I help you find in the support desk?", "Que cherchez-vous dans le bureau de soutien?"],
} as const;

const topics = [
  {
    desks: ["parent"],
    path: "/parent?tab=care",
    match: /report (?:sick|away|absen)|child is sick|signaler (?:une maladie|une absence)|enfant est malade/i,
    en: ["How do I report sick or away?", "Open Daily care and find your child in the attendance section. Choose Report sick or Report away, then confirm."],
    fr: ["Comment signaler une maladie ou une absence?", "Ouvrez Soins du jour et trouvez votre enfant dans la section des présences. Choisissez Signaler une maladie ou Signaler une absence, puis confirmez."],
  },
  {
    desks: ["staff", "provider"],
    path: "/provider?desk=hours",
    match: /clock[ -]?(?:in|out)|point(?:er|age)|vos heures/i,
    en: ["How do I clock in?", "Open Hours. If your centre has given you access, choose your centre, enter your name and select Clock in. At the end of your shift, choose Clock out on your open entry."],
    fr: ["Comment pointer à mon arrivée?", "Ouvrez Heures. Si votre garderie vous a donné accès, choisissez votre garderie, entrez votre nom et pointez votre arrivée. À la fin de votre quart, pointez votre départ dans l’entrée ouverte."],
  },
  {
    desks: ["staff", "provider"],
    path: "/provider?desk=care",
    match: /check[ -]?(?:in|out)|kiosk|kiosque|écran d.arrivée|présences/i,
    en: ["Where is the check-in screen?", "Open Care. Under Fire tablet, select Open the check-in screen to open the kiosk. To record attendance from the desk, use the attendance tools in Care if your centre has given you access."],
    fr: ["Où est l’écran d’arrivée?", "Ouvrez Soins du jour. Sous Tablette Fire, choisissez Ouvrir l’écran d’arrivée pour ouvrir le kiosque. Pour noter les présences dans le bureau, utilisez les outils de présence si votre garderie vous a donné accès."],
  },
] as const satisfies readonly {
  desks: readonly HelpDesk[];
  path: string;
  match: RegExp;
  en: readonly [string, string];
  fr: readonly [string, string];
}[];

export function helpForDesk(desk: HelpDesk, locale: string) {
  const lang = locale === "fr" ? "fr" : "en";
  const entries = topics.filter((topic) => (topic.desks as readonly HelpDesk[]).includes(desk));
  return {
    greeting: desk === "guest" ? null : greetings[desk][lang === "fr" ? 1 : 0],
    starters: entries.map((topic) => topic[lang][0]),
    answer(question: string) {
      const match = entries.find((topic) => topic.match.test(question));
      return match ? { text: match[lang][1], path: localePath(match.path, lang) } : null;
    },
  };
}
