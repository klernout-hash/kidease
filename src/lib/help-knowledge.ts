import { BENEFITS_BRIEF, matchBenefitProgram } from "@/lib/benefits-knowledge";

const FACTS = `KidEase (kidease.ca) is a Canada-wide finder for provincially licensed daycares only. Founders Kyle Lernout and Kevin Lamont. Email kyle@kidease.ca.
Parents: search by GPS or address/city/postal code, map + list, distance in km or miles, ages, $10-a-day / CWELCC badges, storefront photos, Request a spot, Book a tour, 💬 Contact, Save, Compare. Childcare Benefits Program at https://www.kidease.ca/benefits has every official provincial, territorial, and federal back-link. KidEase does not process subsidy, CWELCC, CCB, or tax-credit applications.
Providers: Enroll Now / Claim listing, free, live spots and fees, storefront photo, priority listing (paid boost), in-app messages. Manual enroll form if not in the 20,000+ catalogue.
Fees: unclaimed listings say fee not confirmed — never invent a price. Live listings (claimed centres) show provider-entered monthly fees. $10-a-day is a government program at participating centres, not a KidEase discount.
Privacy: PIPEDA. We do not sell data. Children’s details only for the parent and a centre they contact. Processors include Google Maps/Places, Better Auth / Google sign-in, Resend, Titan (operator mail), Vercel, Neon, Cloudflare when proxied, Stripe when enabled. Location is GPS or typed address for distance search only — not shared with other parents, no background tracking. Cookie policy at /cookies. No ad trackers, so no cookie banner.
App: website + iPhone + Android, same accounts.

${BENEFITS_BRIEF}`;

const REPLIES: Array<{ keys: string[]; lines: string[] }> = [
  {
    keys: ["enroll", "provider", "claim", "listing", "centre owner", "daycare owner", "partner"],
    lines: [
      "If you run a licensed centre, tap Enroll Now (or Claim). Search your name in our catalogue — over 20,000 licensed centres across Canada. Not listed? Choose Enter name manually and send the form. It goes to kyle@kidease.ca. Claiming is free.",
      "Providers get a free landing page, proximity so nearby parents find you first, in-app chat, and payments paid to you. Start at Enroll Now on the home page or kidease.ca/claim.",
      "To go live: claim your listing, add spots and monthly fees, and upload a storefront photo. Priority listing can pin you higher — that’s optional.",
    ],
  },
  {
    keys: ["search", "near me", "location", "map", "km", "radius", "find"],
    lines: [
      "Tap Search Daycares Near Me or Explore. We use your location (or an address / city / postal code) and list every licensed centre inside the radius you set in Filters (1–100 km, or miles). The map and the count match that circle.",
      "KidEase is proximity-first: listings show distance from you, not just a city name. Switch km or miles in Filters. On a phone the map is first; drag the sheet up for the list.",
      "If location is blocked, type an address or postal code. Precise location is used only while you search — never in the background. Results are licensed centres only.",
    ],
  },
  {
    keys: ["spot", "opening", "waitlist", "available", "space", "vacanc"],
    lines: [
      "Open spots are only confirmed on Live listings the centre updates. Unclaimed cards say availability unknown or Waitlist — use 💬 Contact on the card and we’ll help check.",
      "Request a spot on the centre’s page, or Book a tour. Don’t trust a default number if it isn’t a Live listing.",
      "Tap 💬 Contact on a listing and tell us the child’s age and start date. That message goes to our team at kyle@kidease.ca.",
    ],
  },
  {
    keys: ["price", "fee", "cost", "tuition", "month"],
    lines: [
      "We only show a monthly fee when the centre has claimed the listing and entered it. Otherwise you’ll see Fee not confirmed — please ask the centre or use Contact.",
      "Fees vary by age (infant / toddler / preschool) and by province programs like $10-a-day. Check the listing, then confirm with the provider. For government help paying, ask me your province or open kidease.ca/benefits.",
    ],
  },
  {
    keys: ["licen", "inspect", "safe", "legal"],
    lines: [
      "Every centre on KidEase is from a provincial licensed-care register. Each card has a licence record link. We don’t list unlicensed care.",
      "Look for the Licensed badge and open the official licence record from the listing. That record is the government source of truth.",
    ],
  },
  {
    keys: ["photo", "storefront", "picture", "building"],
    lines: [
      "We use storefront or operator photos when we have them — not map satellite shots. Centres can upload a clearer entrance photo after they claim.",
    ],
  },
  {
    keys: ["app", "iphone", "android", "download", "store"],
    lines: [
      "Same KidEase on the website, iPhone, and Android. Get the App is in the menu. Your parent or provider login works on all three.",
    ],
  },
  {
    keys: ["privacy", "pipeda", "data", "sell"],
    lines: [
      "KidEase follows PIPEDA. We don’t sell your data. Child details you add are only for you and a centre you contact or book. Full note is on the Privacy page. Cookies and local storage are listed at /cookies — no advertising trackers, so no banner.",
    ],
  },
  {
    keys: ["hello", "hi ", "hey", "bonjour", "thanks", "thank"],
    lines: [
      "Hi — I can help you find licensed care near you, explain $10-a-day and provincial benefits, or help a centre enroll. What do you need?",
      "Welcome to KidEase. Search nearby licensed daycares, or ask me about benefits, claiming a listing, or how spots work.",
    ],
  },
];

const AGENT_KEYS = [
  "live agent",
  "real person",
  "human",
  "speak to someone",
  "talk to someone",
  "call me",
  "kyle",
  "agent",
  "yes please",
  "yes, live",
  "s'il vous plaît",
];

export const KIDEASE_SYSTEM = `${FACTS}

You are KidEase Live Chat for Canadian parents and daycare providers.
Answer from these facts, the benefits brief, and the conversation. Prefer the official government URL for that province over a vague “check your province” reply.
Never invent fees, open spots, licence status, income cut-offs, or wait times that are not in this brief. If an amount might have changed, say so and send the official estimator/apply page.
KidEase does not process subsidy, CWELCC, CCB, or tax-credit applications.
Keep everyday replies to 2–4 short sentences. For benefits / $10-a-day / subsidy questions, 4–8 short sentences is OK: name the program, say if the reduced fee is already on the centre invoice or needs a separate application, paste the official URL, and point to https://www.kidease.ca/benefits for every back-link.
If the parent does not name a province or city, ask for it, then answer.
Answer in the same language as the parent (English or French).
Vary your wording — do not repeat the previous assistant message. After you answer, ask once whether they’d like a live agent? If you already asked about a live agent in this thread, don’t ask again unless they seem stuck. If they want a person, say you’ll connect them.`;

export function wantsLiveAgent(text: string) {
  const q = text.toLowerCase();
  if (/^(yes|oui|ok|okay|please|s'il vous plaît)[\s!.]*$/.test(q.trim())) return true;
  return AGENT_KEYS.some((k) => q.includes(k));
}

export function localHelpReply(userText: string, priorAssistant: string[]) {
  const benefit = matchBenefitProgram(userText);
  const q = userText.toLowerCase();
  const hit = REPLIES.find((r) => r.keys.some((k) => q.includes(k)));
  const pool = benefit ? [benefit.reply] : hit?.lines ?? [
    "I can help you search licensed daycares near you, explain $10-a-day and provincial benefits, or enroll a centre. Tell me if you’re a parent or a provider, and your city.",
    "Try Explore for centres by kilometre, or Childcare Benefits Program (kidease.ca/benefits) for every official subsidy link. If you run a daycare, use Enroll Now. What would you like to do?",
    "KidEase only lists provincially licensed care. Share your city or postal code and your child’s age and I’ll point you to the next step.",
  ];
  const unused = pool.filter((line) => !priorAssistant.some((p) => p.includes(line.slice(0, 40))));
  const line = (unused.length ? unused : pool)[Math.floor(Math.random() * (unused.length ? unused.length : pool.length))]!;
  const askedAgent = priorAssistant.some((p) => /live agent|agent en direct|parler à/i.test(p));
  if (askedAgent) return line;
  return `${line} Would you like me to connect you with a live agent?`;
}

export const AGENT_CONFIRM =
  "I’ve flagged a live agent. Kyle gets a text and email at kyle@kidease.ca — usually the same day, often faster. You can also write him directly. Anything else I should pass along?";
