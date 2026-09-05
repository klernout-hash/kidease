export type LegalProcessor = {
  name: string;
  purpose: string;
  href?: string;
  hrefLabel?: string;
};

export type LegalPath = "/privacy" | "/terms" | "/cookies" | "/account" | "/help" | "/support";

export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "processors"; items: LegalProcessor[] }
  | { type: "table"; caption?: string; headers: string[]; rows: string[][] }
  | { type: "link"; to: LegalPath; label: string };

export type LegalSection = {
  id: string;
  title: string;
  blocks: LegalBlock[];
};

export type LegalDoc = {
  kicker: string;
  title: string;
  updated: string;
  intro: string[];
  sections: LegalSection[];
  storeLabel?: string;
  storeItems?: string[];
  officialHref?: string;
  officialLabel?: string;
  contactLead: string;
  disclaimer: string;
};

const UPDATED_EN = "Effective 4 September 2026 · KidEase · Winnipeg, Manitoba";
const UPDATED_FR = "En vigueur le 4 septembre 2026 · KidEase · Winnipeg (Manitoba)";

const DISCLAIMER_EN =
  "This page explains how KidEase handles personal information and how the service works. It is draft copy for Kyle and counsel to review. It is not legal advice. Official PIPEDA text lives on the Privacy Commissioner of Canada website.";
const DISCLAIMER_FR =
  "Cette page décrit le traitement des renseignements personnels et le fonctionnement du service. Il s’agit d’un brouillon pour Kyle et les conseillers juridiques. Ce n’est pas un avis juridique. Le texte officiel de la LPRPDE est sur le site du Commissariat à la protection de la vie privée du Canada.";

export const PRIVACY_EN: LegalDoc = {
  kicker: "Privacy",
  title: "PIPEDA & child safety",
  updated: UPDATED_EN,
  intro: [
    "KidEase is a Canadian directory and enrolment tool for provincially licensed childcare. Parents search nearby centres. Directors claim listings. We are not the care provider. Your care agreement is with the centre.",
    "We follow PIPEDA’s consent, limiting-collection, and safeguarding principles. We do not sell or rent personal information. Children’s details are used only to help a parent and a centre they choose. KidEase is a parent-and-director tool — not a children’s app.",
  ],
  sections: [
    {
      id: "collect",
      title: "What we collect",
      blocks: [
        {
          type: "ul",
          items: [
            "Account: name, email, password or sign-in provider, optional phone and profile photo, role (parent or centre director).",
            "Child profiles you add: first or full name, birthdate, allergies, epi-pen flag, medical notes, medications, doctor, foods, routines, comfort items, emergency contacts, pickup people, and care notes.",
            "Search location you choose: a GPS fix while you search, or a typed address, city, or postal code.",
            "Requests and messages: inquire, book-a-tour, and request-a-spot fields, plus in-app chat with that centre.",
            "Claim and enrol (directors): centre identity, licence photo, verification code, and the enrol form (name, email, centre, city, phone, message).",
            "Payments: amount, method, status, and a KidEase reference — only if a deposit is recorded in-app. We do not store full card numbers.",
            "Technical: session cookies, device/browser needed to run the site, and first-party search telemetry (a coarse geohash, not a street address).",
          ],
        },
      ],
    },
    {
      id: "use",
      title: "How we use it",
      blocks: [
        {
          type: "ul",
          items: [
            "Show licensed centres near the place you chose and let you filter by distance.",
            "Send your inquiry, tour, or enrolment request to that centre and keep the conversation.",
            "Let a claimed director manage spots, fees, photos, and family messages.",
            "Notify kyle@kidease.ca of new accounts, claims, and requests so we can run the service.",
            "Send transactional email (sign-in codes, password reset, claim codes, request notices).",
            "Record a deposit when in-app payment is used, and improve search quality.",
            "We do not use children’s profiles for advertising or to train public machine-learning models.",
          ],
        },
      ],
    },
    {
      id: "processors",
      title: "Who processes data for us",
      blocks: [
        {
          type: "p",
          text: "KidEase is the organization responsible for personal information on kidease.ca. These companies process data only to run the named job. Some are in the United States. We give them only what that job needs.",
        },
        {
          type: "processors",
          items: [
            {
              name: "Google Maps, Places, and Geocoding",
              purpose:
                "Map tiles, place suggestions, and turning an address or postal code into a search point. If you allow precise location, we may send a nearby coordinate so suggestions are local. Google does not get your child profiles.",
              href: "https://policies.google.com/privacy",
              hrefLabel: "Google Privacy Policy",
            },
            {
              name: "Google sign-in (OAuth), when you use it",
              purpose:
                "If you tap Continue with Google, Google shares the name and email on that Google account so we can create or open your KidEase session. We do not receive your Google password.",
              href: "https://policies.google.com/privacy",
              hrefLabel: "Google Privacy Policy",
            },
            {
              name: "Better Auth (software we host)",
              purpose:
                "Session and password sign-in run on KidEase’s own servers (Vercel + Neon). Better Auth is the library we use — not a separate company that holds a copy of your account.",
            },
            {
              name: "Apple or Facebook sign-in, only when those buttons are on",
              purpose:
                "If a Continue with Apple or Facebook button is shown and you use it, that provider shares the name and email they allow for sign-in. If the button is not shown, we are not using that provider.",
            },
            {
              name: "Resend",
              purpose:
                "Transactional email we send today: password reset, sign-in verification codes, claim codes, and service notices (new request, claim, support).",
              href: "https://resend.com/legal/privacy-policy",
              hrefLabel: "Resend Privacy Policy",
            },
            {
              name: "Titan Email, when the kyle@kidease.ca inbox is connected",
              purpose:
                "Receiving and sending operator mail for kyle@kidease.ca (support, claims, and replies). If Titan is not connected, those messages still go through Resend or stay in the app.",
              href: "https://www.titan.email/privacy/",
              hrefLabel: "Titan Privacy Policy",
            },
            {
              name: "Vercel",
              purpose: "Hosts the KidEase website and server functions (project kidease-git).",
              href: "https://vercel.com/legal/privacy-policy",
              hrefLabel: "Vercel Privacy Policy",
            },
            {
              name: "Neon",
              purpose: "Postgres database for accounts, listings, messages, child profiles, and payment records.",
              href: "https://neon.tech/privacy-policy",
              hrefLabel: "Neon Privacy Policy",
            },
            {
              name: "Cloudflare, when traffic is proxied through it",
              purpose:
                "DNS or edge protection in front of the site. If a request is not proxied, Cloudflare does not see it.",
              href: "https://www.cloudflare.com/privacypolicy/",
              hrefLabel: "Cloudflare Privacy Policy",
            },
            {
              name: "Stripe, when card payments are enabled",
              purpose:
                "Card, Apple Pay, and Google Pay for a first-month deposit after a centre offers a spot. We send amount, currency (CAD), and a booking reference — not full card numbers and not medical notes. Until a live Stripe key is on, charges stay on KidEase’s internal ledger and are not taken from a card.",
              href: "https://stripe.com/en-ca/privacy",
              hrefLabel: "Stripe Privacy Policy",
            },
            {
              name: "PostHog, when product analytics is on",
              purpose:
                "Page views, in-app clicks, feature flags, and privacy-masked session replay so we can improve KidEase. We send a random visitor id or your account id — not your password, email, or child-profile fields. Session replay masks form inputs and on-screen text. PostHog is not an advertising or remarketing pixel.",
              href: "https://posthog.com/privacy",
              hrefLabel: "PostHog Privacy Policy",
            },
            {
              name: "Sentry, when error monitoring is on",
              purpose:
                "Crash and performance reports so we can fix production bugs. We send stack traces and a route tag — not cookies, Authorization headers, emails, tokens, or child names. Sentry is not an advertising pixel.",
              href: "https://sentry.io/privacy/",
              hrefLabel: "Sentry Privacy Policy",
            },
          ],
        },
        {
          type: "p",
          text: "A centre you contact is not our processor. They receive what you send so they can reply, tour, or enrol. After that, they are responsible for how their staff handle it.",
        },
      ],
    },
    {
      id: "location",
      title: "Location",
      blocks: [
        {
          type: "p",
          text: "Location is for distance search only — licensed centres near the point you chose. We do not share your location with other parents.",
        },
        {
          type: "ul",
          items: [
            "GPS (precise location): we ask once. The prompt says we use precise location only while you search, and we never request background location. “Use precise location” allows a when-in-use fix. “Not now” leaves you on a typed city, address, or postal code.",
            "While Explore or Search is open and you have allowed when-in-use location, the map can update as you move. We do not request always-on or background location, and we do not track you after you leave the app.",
            "Typed address, city, or postal code: we send that text to Google Places / Geocoding to get a map point. If you also allowed GPS, we may send a nearby coordinate so suggestions are local.",
            "The map itself loads Google Maps in your browser (tiles and the map script).",
            "What we keep: your last search point and a yes/no location choice in this browser (local storage). First-party telemetry may store a coarse geohash (about neighbourhood scale) to improve search — not a street address and not a continuous trail.",
            "Raw GPS used to draw the map stays in that browsing session.",
            "Turn it off in your phone or browser location settings, tap “Not now” / change location in the app, or clear this site’s data. That stops new GPS use. It does not delete a request you already sent to a centre.",
          ],
        },
      ],
    },
    {
      id: "cookies",
      title: "Cookies and local storage",
      blocks: [
        {
          type: "p",
          text: "We use cookies and similar storage to keep you signed in and remember search settings. We do not use advertising pixels or ad-tech trackers. There is no cookie banner because we do not run non-essential marketing cookies.",
        },
        { type: "link", to: "/cookies", label: "Read the Cookie Policy" },
      ],
    },
    {
      id: "sharing",
      title: "What a parent shares with a centre",
      blocks: [
        {
          type: "p",
          text: "Nothing goes to a centre until you contact that centre. We do not put your child on a public board or show them to other parents.",
        },
        {
          type: "ul",
          items: [
            "Inquire (💬 Contact): your name, email, and message, plus the listing name and link. That form goes to KidEase (kyle@kidease.ca) so we can help; we may pass it to the centre.",
            "Book a tour: parent name, child name, preferred date, optional note. This opens an in-app conversation with that centre. Birthdate is included if you enter it.",
            "Request a spot / enrol: parent name, child’s name, birthdate, start date, schedule, days, and optional message.",
            "Saved child profile: if you attach a profile that already has care details, that centre can also see allergies, epi-pen, medical notes, medications, doctor, foods, routines, emergency contacts, pickup people, and notes — because those fields help them offer safe care.",
            "Reuse: profiles stay on your account. We send them only to centres you contact. We do not reuse them for ads or for other families.",
            "Once a centre has the details, its staff are responsible for how they store and use them (their own privacy duties). Use KidEase messages for placement and care — not for marketing lists.",
          ],
        },
      ],
    },
    {
      id: "centres",
      title: "What we expect of centres",
      blocks: [
        {
          type: "p",
          text: "Directors and staff who claim a listing are running an organization, not a personal hobby page. When a parent sends you family or child details, treat them as that child’s information — not KidEase’s to resell, and not yours to use for ads.",
        },
        {
          type: "ul",
          items: [
            "Use parent and child details only to reply, book a tour, enrol, and care for that child.",
            "Limit staff access to people who need it for that job.",
            "Do not post a child’s name, photo, or medical notes on a public listing or social page unless the parent has clearly agreed with you.",
            "Keep licence, spots, hours, and fees truthful. A false claim can get the listing paused.",
            "If a parent asks you to correct or delete what they sent, handle that request. Deleting a KidEase account does not pull copies off your own paper files or inbox.",
            "You remain responsible for your own PIPEDA (or provincial) duties as a childcare operator. KidEase is the platform, not the provider.",
          ],
        },
      ],
    },
    {
      id: "payments",
      title: "Payments (Stripe when enabled)",
      blocks: [
        {
          type: "ul",
          items: [
            "Roles: a parent may pay a first-month deposit after the centre offers a spot. KidEase records the payment. The care contract stays between the parent and the centre. Childcare is a real-world service, not a digital in-app purchase.",
            "When Stripe is live: Stripe processes the card, Apple Pay, or Google Pay. KidEase never stores the full card number. We may send Stripe the amount, CAD, payment method type, and identifiers for the booking, parent, and centre — not allergy or medical notes.",
            "When Stripe is not live: the app can still show a receipt on an internal ledger. No card is charged.",
            "Interac e-Transfer and other bank methods may be added later. We will say so on the pay screen when they are on.",
            "Refunds follow the centre’s policy. Chargebacks, when Stripe is on, go through Stripe. Email kyle@kidease.ca if a deposit looks wrong.",
          ],
        },
      ],
    },
    {
      id: "children",
      title: "Sensitive child data and adults-only accounts",
      blocks: [
        {
          type: "ul",
          items: [
            "Allergies, epi-pen, medical notes, medications, doctor contacts, and emergency contacts are sensitive. We collect them only to help you and a centre you contact keep that child safe.",
            "Purpose limit: placement and care — not advertising, not sale, not training public or advertising machine-learning models.",
            "Only add a child you have the legal right to enrol (parent or guardian).",
            "Accounts are for adults 18 or older — parents, guardians, and centre directors. KidEase is not a children’s app and is not directed at children.",
            "We do not livestream children. Video or voice check-in, if offered, is started by the parent.",
            "Providers must be provincially or territorially licensed before they can claim and edit a listing.",
          ],
        },
      ],
    },
    {
      id: "matrix",
      title: "Purpose and category",
      blocks: [
        {
          type: "table",
          caption: "What each kind of information is for",
          headers: ["Category", "Examples", "Purpose"],
          rows: [
            ["Account", "Name, email, sign-in, role", "Create a session; parent or director desk"],
            ["Location", "GPS or typed place", "Distance search only"],
            ["Child profile", "Name, birthdate, allergies, emergency", "You, plus a centre you contact"],
            ["Requests & chat", "Tour, spot request, messages", "Connect that family and that centre"],
            ["Claim docs", "Licence photo, claim code", "Verify the director runs that centre"],
            ["Payments", "Amount, method, reference", "Hold a spot when payment is used"],
            ["Technical", "Session cookie, coarse geohash, product analytics id", "Stay signed in; improve search and the product"],
          ],
        },
      ],
    },
    {
      id: "border",
      title: "Storage and transfers outside Canada",
      blocks: [
        {
          type: "p",
          text: "KidEase is based in Winnipeg, Manitoba. Hosting and processors above may store or see data in the United States (Google, Vercel, Resend, Neon, Stripe when enabled, Cloudflare when proxied, PostHog when analytics is on, Sentry when error monitoring is on). We use them only to run this service and rely on their contracts and safeguards. We do not sell the data because it sits on a US server.",
        },
      ],
    },
    {
      id: "email",
      title: "Email, CASL, and future alerts",
      blocks: [
        {
          type: "ul",
          items: [
            "Transactional mail we send without a marketing opt-in: sign-in codes, password reset, claim codes, request and support notices, and similar service mail. These are not promotional.",
            "We do not send promotional KidEase campaigns today. If we ever do, we will include an unsubscribe and send only to people who consented, as CASL requires.",
            "Push or lock-screen alerts, when we enable them, will be opt-in on the device. You can turn them off in the operating system. We will not use push for ads.",
          ],
        },
      ],
    },
    {
      id: "keep",
      title: "Retention, deletion, and security",
      blocks: [
        {
          type: "ul",
          items: [
            "We keep account, request, message, and payment records while the account is open.",
            "Delete my account (in the app) removes your children, messages, bookings, payments, saved centres, director links, profile, and sign-in rows on KidEase. This cannot be undone.",
            "Deletion does not erase copies a centre already received, emails already sitting in kyle@kidease.ca or Titan, or records a law or chargeback requires us to keep for a time.",
            "You can also email kyle@kidease.ca to access, correct, or delete.",
            "Security we actually use: HTTPS in transit; signed-in sessions in first-party cookies; OAuth tokens encrypted at rest; email sign-in codes; access checks on parent and director desks; payment card data (when Stripe is on) stays with Stripe; audit events do not store card numbers or medical notes.",
            "We do not claim the internet is risk-free. If a breach creates a real risk of significant harm, we will notify affected people and the Office of the Privacy Commissioner of Canada as PIPEDA requires.",
          ],
        },
      ],
    },
    {
      id: "rights",
      title: "Your rights",
      blocks: [
        {
          type: "p",
          text: "You can access, correct, or delete your account and child profiles in the app, or email kyle@kidease.ca. You can withdraw consent by closing the account or by turning off location in the OS. For a PIPEDA complaint you can also contact the Office of the Privacy Commissioner of Canada.",
        },
      ],
    },
    {
      id: "changes",
      title: "Changes to this page",
      blocks: [
        {
          type: "p",
          text: "We will post a new effective date here when the policy changes. If a change is material and we have your email, we will also send a short notice.",
        },
      ],
    },
  ],
  storeLabel: "What the stores ask us to disclose",
  storeItems: [
    "Location — to search nearby centres. Not shared with other parents.",
    "Contact info — email and name from sign-in.",
    "User content — messages, enrolment notes, child name and birthdate, and care details you add (only you and the centre you contact).",
    "Identifiers — account id for sign-in.",
    "Payment records — deposit amount and method. Card numbers are never stored here.",
  ],
  officialHref:
    "https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/",
  officialLabel: "Read PIPEDA on the Privacy Commissioner site",
  contactLead: "Privacy questions:",
  disclaimer: DISCLAIMER_EN,
};

export const PRIVACY_FR: LegalDoc = {
  kicker: "Confidentialité",
  title: "LPRPDE et sécurité des enfants",
  updated: UPDATED_FR,
  intro: [
    "KidEase est un répertoire et un outil d’inscription pour des centres de garde permis. Les parents cherchent près d’eux. Les directions réclament leur fiche. Nous ne sommes pas le fournisseur de garde. Le contrat de service est entre vous et le centre.",
    "Nous suivons le consentement, la limitation de la collecte et les mesures de protection de la LPRPDE. Nous ne vendons ni ne louons les renseignements personnels. Les détails sur les enfants servent seulement au parent et au centre qu’il choisit. KidEase est un outil pour parents et directions — pas une appli pour enfants.",
  ],
  sections: [
    {
      id: "collect",
      title: "Ce que nous recueillons",
      blocks: [
        {
          type: "ul",
          items: [
            "Compte : nom, courriel, mot de passe ou fournisseur de connexion, téléphone et photo facultatifs, rôle (parent ou direction).",
            "Profils d’enfants que vous ajoutez : prénom ou nom, date de naissance, allergies, stylo épinéphrine, notes médicales, médicaments, médecin, aliments, routines, contacts d’urgence, personnes autorisées au ramassage et notes de garde.",
            "Lieu de recherche : position GPS pendant la recherche, ou une adresse, une ville ou un code postal saisi.",
            "Demandes et messages : inquiry, visite et demande de place, plus le clavardage avec ce centre.",
            "Revendication et inscription (directions) : identité du centre, photo du permis, code de vérification, et le formulaire (nom, courriel, centre, ville, téléphone, message).",
            "Paiements : montant, mode, statut et une référence KidEase — seulement si un dépôt est inscrit. Nous ne conservons pas les numéros de carte complets.",
            "Technique : témoins de session, données du navigateur nécessaires au site, et télémétrie de recherche (géohachage grossier, pas une adresse municipale).",
          ],
        },
      ],
    },
    {
      id: "use",
      title: "Utilisation",
      blocks: [
        {
          type: "ul",
          items: [
            "Afficher les centres permis près du lieu choisi et filtrer par distance.",
            "Transmettre la demande de renseignement, de visite ou d’inscription à ce centre.",
            "Laisser une direction réclamée gérer places, tarifs, photos et messages.",
            "Aviser kyle@kidease.ca des nouveaux comptes, revendications et demandes.",
            "Envoyer des courriels transactionnels (codes, réinitialisation, avis de demande).",
            "Enregistrer un dépôt lorsque le paiement dans l’appli est utilisé, et améliorer la recherche.",
            "Nous n’utilisons pas les profils d’enfants pour la publicité ni pour entraîner des modèles d’apprentissage automatique publics.",
          ],
        },
      ],
    },
    {
      id: "processors",
      title: "Qui traite les données pour nous",
      blocks: [
        {
          type: "p",
          text: "KidEase est responsable des renseignements personnels sur kidease.ca. Ces entreprises ne traitent les données que pour la tâche nommée. Certaines sont aux États-Unis.",
        },
        {
          type: "processors",
          items: [
            {
              name: "Google Maps, Places et géocodage",
              purpose:
                "Tuiles de carte, suggestions de lieux et conversion d’une adresse ou d’un code postal en point de recherche. Si vous autorisez la position précise, nous pouvons envoyer une coordonnée proche. Google ne reçoit pas les profils d’enfants.",
              href: "https://policies.google.com/privacy",
              hrefLabel: "Politique de confidentialité Google",
            },
            {
              name: "Connexion Google (OAuth), si vous l’utilisez",
              purpose:
                "Si vous choisissez Continuer avec Google, Google partage le nom et le courriel de ce compte. Nous ne recevons pas votre mot de passe Google.",
              href: "https://policies.google.com/privacy",
              hrefLabel: "Politique de confidentialité Google",
            },
            {
              name: "Better Auth (logiciel que nous hébergeons)",
              purpose:
                "La session et le mot de passe tournent sur nos serveurs (Vercel + Neon). Better Auth est la bibliothèque — pas une entreprise distincte qui garde une copie de votre compte.",
            },
            {
              name: "Apple ou Facebook, seulement si ces boutons sont actifs",
              purpose:
                "Si un bouton Continuer avec Apple ou Facebook est affiché et que vous l’utilisez, ce fournisseur partage le nom et le courriel permis. Sinon, nous ne l’utilisons pas.",
            },
            {
              name: "Resend",
              purpose:
                "Courriels transactionnels : réinitialisation, codes de connexion, codes de revendication et avis de service.",
              href: "https://resend.com/legal/privacy-policy",
              hrefLabel: "Politique de confidentialité Resend",
            },
            {
              name: "Titan Email, lorsque la boîte kyle@kidease.ca est liée",
              purpose:
                "Courrier de l’opérateur pour kyle@kidease.ca. Si Titan n’est pas lié, ces messages passent par Resend ou restent dans l’appli.",
              href: "https://www.titan.email/privacy/",
              hrefLabel: "Politique de confidentialité Titan",
            },
            {
              name: "Vercel",
              purpose: "Héberge le site et les fonctions serveur (projet kidease-git).",
              href: "https://vercel.com/legal/privacy-policy",
              hrefLabel: "Politique de confidentialité Vercel",
            },
            {
              name: "Neon",
              purpose: "Base Postgres : comptes, fiches, messages, profils d’enfants et paiements.",
              href: "https://neon.tech/privacy-policy",
              hrefLabel: "Politique de confidentialité Neon",
            },
            {
              name: "Cloudflare, lorsque le trafic y est proxifié",
              purpose: "DNS ou protection en bordure. Si la requête n’est pas proxifiée, Cloudflare ne la voit pas.",
              href: "https://www.cloudflare.com/privacypolicy/",
              hrefLabel: "Politique de confidentialité Cloudflare",
            },
            {
              name: "Stripe, lorsque les paiements par carte sont activés",
              purpose:
                "Carte, Apple Pay et Google Pay pour un dépôt du premier mois. Nous envoyons le montant, le CAD et une référence — pas le numéro de carte complet ni les notes médicales. Tant qu’aucune clé Stripe en direct n’est en place, aucun prélèvement sur carte.",
              href: "https://stripe.com/en-ca/privacy",
              hrefLabel: "Politique de confidentialité Stripe",
            },
            {
              name: "PostHog, lorsque l’analytique produit est active",
              purpose:
                "Pages vues, clics, drapeaux de fonctionnalité et replay de session masqué pour améliorer KidEase. Nous envoyons un identifiant anonyme ou l’identifiant de compte — pas le mot de passe, le courriel ni les profils d’enfants. Les champs de formulaire et le texte à l’écran sont masqués. Ce n’est pas un pixel publicitaire.",
              href: "https://posthog.com/privacy",
              hrefLabel: "Politique de confidentialité PostHog",
            },
            {
              name: "Sentry, lorsque le suivi des erreurs est actif",
              purpose:
                "Rapports de plantage et de performance pour corriger la production. Nous envoyons des traces et une route — pas les témoins, les en-têtes Authorization, les courriels, les jetons ni les noms d’enfants. Sentry n’est pas un pixel publicitaire.",
              href: "https://sentry.io/privacy/",
              hrefLabel: "Politique de confidentialité Sentry",
            },
          ],
        },
        {
          type: "p",
          text: "Un centre contacté n’est pas notre sous-traitant. Il reçoit ce que vous envoyez pour répondre, visiter ou inscrire. Ensuite, son personnel en est responsable.",
        },
      ],
    },
    {
      id: "location",
      title: "Position",
      blocks: [
        {
          type: "p",
          text: "La position sert seulement à la recherche par distance. Nous ne la partageons pas avec d’autres parents.",
        },
        {
          type: "ul",
          items: [
            "GPS (position précise) : nous demandons une fois. Le texte indique une utilisation seulement pendant la recherche, jamais en arrière-plan. « Utiliser la position précise » autorise une position pendant l’usage. « Pas maintenant » vous laisse sur une ville, une adresse ou un code postal saisi.",
            "Tant que Explorer ou Recherche est ouvert et que vous avez autorisé la position, la carte peut se mettre à jour. Nous ne demandons pas une position permanente en arrière-plan et nous ne vous suivons pas après la fermeture de l’appli.",
            "Adresse, ville ou code postal saisi : nous l’envoyons à Google Places / géocodage. Si le GPS est aussi autorisé, nous pouvons envoyer une coordonnée proche pour des suggestions locales.",
            "La carte charge Google Maps dans le navigateur.",
            "Conservation : dernier point de recherche et choix oui/non dans ce navigateur. La télémétrie peut garder un géohachage grossier — pas une adresse municipale.",
            "Le GPS brut servant à dessiner la carte reste dans la session.",
            "Désactivez la position dans le système ou le navigateur, choisissez « Pas maintenant », ou effacez les données du site.",
          ],
        },
      ],
    },
    {
      id: "cookies",
      title: "Témoins et stockage local",
      blocks: [
        {
          type: "p",
          text: "Nous utilisons des témoins et un stockage similaire pour vous garder connecté et mémoriser la recherche. Pas de pixels publicitaires. Pas de bannière de témoins, car nous n’avons pas de témoins marketing non essentiels.",
        },
        { type: "link", to: "/cookies", label: "Lire la politique sur les témoins" },
      ],
    },
    {
      id: "sharing",
      title: "Ce qu’un parent partage avec un centre",
      blocks: [
        {
          type: "p",
          text: "Rien n’est envoyé à un centre tant que vous ne le contactez pas. Nous n’affichons pas votre enfant aux autres parents.",
        },
        {
          type: "ul",
          items: [
            "Renseignement (💬) : nom, courriel, message, nom et lien de la fiche. Le formulaire va à KidEase (kyle@kidease.ca); nous pouvons le transmettre au centre.",
            "Visite : nom du parent, nom de l’enfant, date souhaitée, note facultative. La date de naissance est incluse si vous la saisissez.",
            "Demande de place : nom du parent, nom de l’enfant, date de naissance, date de début, horaire, jours et message facultatif.",
            "Profil enregistré : si vous joignez un profil déjà rempli, le centre peut aussi voir allergies, notes médicales, médicaments, médecin, aliments, routines, contacts d’urgence et personnes au ramassage.",
            "Réutilisation : les profils restent sur votre compte. Nous les envoyons seulement aux centres que vous contactez. Pas pour la publicité.",
            "Une fois les détails reçus, le personnel du centre en est responsable. Servez-vous des messages KidEase pour le placement et la garde — pas pour des listes marketing.",
          ],
        },
      ],
    },
    {
      id: "centres",
      title: "Ce que nous attendons des centres",
      blocks: [
        {
          type: "p",
          text: "Les directions qui réclament une fiche gèrent une organisation. Les détails familiaux ou d’enfant que vous recevez ne sont pas à revendre ni à utiliser pour de la publicité.",
        },
        {
          type: "ul",
          items: [
            "Utilisez-les seulement pour répondre, visiter, inscrire et soigner cet enfant.",
            "Limitez l’accès au personnel qui en a besoin.",
            "N’affichez pas le nom, la photo ou les notes médicales d’un enfant sur une fiche publique sans accord clair du parent.",
            "Gardez permis, places, heures et tarifs exacts. Une fausse revendication peut faire suspendre la fiche.",
            "Si un parent demande une correction ou une suppression, traitez la demande. Supprimer un compte KidEase n’efface pas vos dossiers papier.",
            "Vous restez responsable de vos obligations LPRPDE (ou provinciales) comme service de garde. KidEase est la plateforme, pas le fournisseur.",
          ],
        },
      ],
    },
    {
      id: "payments",
      title: "Paiements (Stripe lorsque activé)",
      blocks: [
        {
          type: "ul",
          items: [
            "Rôles : un parent peut verser un dépôt du premier mois après une offre de place. Le contrat de garde reste entre le parent et le centre. Ce n’est pas un achat numérique.",
            "Lorsque Stripe est en direct : Stripe traite la carte, Apple Pay ou Google Pay. KidEase ne conserve pas le numéro complet. Nous pouvons envoyer le montant, le CAD et des identifiants de réservation — pas les notes médicales.",
            "Lorsque Stripe n’est pas en direct : un reçu interne peut s’afficher. Aucune carte n’est débitée.",
            "Le virement Interac et d’autres modes bancaires pourront s’ajouter plus tard.",
            "Les remboursements suivent la politique du centre. Les rétrofacturations, si Stripe est actif, passent par Stripe.",
          ],
        },
      ],
    },
    {
      id: "children",
      title: "Données sensibles et comptes pour adultes",
      blocks: [
        {
          type: "ul",
          items: [
            "Allergies, épinéphrine, notes médicales, médicaments, médecin et contacts d’urgence sont sensibles. Ils servent à la sécurité de l’enfant auprès du centre contacté.",
            "Limitation : placement et garde — pas de publicité, pas de vente, pas d’entraînement de modèles publicitaires ou publics.",
            "N’ajoutez qu’un enfant dont vous avez la charge.",
            "Les comptes sont pour les personnes de 18 ans et plus. KidEase n’est pas une appli pour enfants.",
            "Pas de diffusion continue d’enfants. Une visio, le cas échéant, est lancée par le parent.",
            "Un fournisseur doit être permis pour revendiquer et modifier une fiche.",
          ],
        },
      ],
    },
    {
      id: "matrix",
      title: "Fins et catégories",
      blocks: [
        {
          type: "table",
          caption: "À quoi sert chaque type de renseignement",
          headers: ["Catégorie", "Exemples", "Fin"],
          rows: [
            ["Compte", "Nom, courriel, connexion, rôle", "Session; espace parent ou direction"],
            ["Position", "GPS ou lieu saisi", "Recherche par distance seulement"],
            ["Profil d’enfant", "Nom, naissance, allergies, urgence", "Vous, plus le centre contacté"],
            ["Demandes et messages", "Visite, place, clavardage", "Relier cette famille et ce centre"],
            ["Pièces de revendication", "Photo du permis, code", "Vérifier que la direction exploite le centre"],
            ["Paiements", "Montant, mode, référence", "Retenir une place si un dépôt est utilisé"],
            ["Technique", "Témoin de session, géohachage, identifiant d’analytique", "Rester connecté; améliorer la recherche et le produit"],
          ],
        },
      ],
    },
    {
      id: "border",
      title: "Stockage et transferts hors Canada",
      blocks: [
        {
          type: "p",
          text: "KidEase est à Winnipeg (Manitoba). Les sous-traitants ci-dessus peuvent traiter des données aux États-Unis (Google, Vercel, Resend, Neon, Stripe si activé, Cloudflare si proxifié, PostHog si l’analytique est active, Sentry si le suivi des erreurs est actif). Nous les utilisons seulement pour le service. Nous ne vendons pas les données parce qu’elles passent par un serveur américain.",
        },
      ],
    },
    {
      id: "email",
      title: "Courriel, LCAP et alertes futures",
      blocks: [
        {
          type: "ul",
          items: [
            "Courriels transactionnels sans consentement marketing : codes, réinitialisation, codes de revendication, avis de demande et de soutien.",
            "Nous n’envoyons pas de campagnes promotionnelles aujourd’hui. Le cas échéant, un désabonnement et un consentement LCAP s’appliqueront.",
            "Les notifications push, lorsqu’elles seront activées, seront facultatives sur l’appareil. Pas de publicité par push.",
          ],
        },
      ],
    },
    {
      id: "keep",
      title: "Conservation, suppression et sécurité",
      blocks: [
        {
          type: "ul",
          items: [
            "Nous gardons le compte, les demandes, les messages et les paiements tant que le compte est ouvert.",
            "Supprimer mon compte efface enfants, messages, demandes, paiements, centres enregistrés, liens de direction, profil et sessions. Irréversible.",
            "La suppression n’efface pas les copies déjà reçues par un centre, les courriels déjà reçus, ni les dossiers qu’une loi ou une rétrofacturation exige.",
            "Vous pouvez aussi écrire à kyle@kidease.ca.",
            "Sécurité réelle : HTTPS; sessions en témoins internes; jetons OAuth chiffrés; codes par courriel; contrôles d’accès; les cartes (si Stripe) restent chez Stripe; les journaux d’audit ne stockent pas les numéros de carte ni les notes médicales.",
            "Si une atteinte crée un risque réel de préjudice important, nous aviserons les personnes concernées et le Commissariat, comme l’exige la LPRPDE.",
          ],
        },
      ],
    },
    {
      id: "rights",
      title: "Vos droits",
      blocks: [
        {
          type: "p",
          text: "Vous pouvez consulter, corriger ou supprimer votre compte dans l’appli, ou écrire à kyle@kidease.ca. Vous pouvez retirer votre consentement en fermant le compte ou en coupant la position. Une plainte LPRPDE peut aussi aller au Commissariat à la protection de la vie privée du Canada.",
        },
      ],
    },
    {
      id: "changes",
      title: "Modifications",
      blocks: [
        {
          type: "p",
          text: "Nous afficherons une nouvelle date ici. Si le changement est important et que nous avons votre courriel, nous enverrons un court avis.",
        },
      ],
    },
  ],
  storeLabel: "Ce que les boutiques nous demandent de déclarer",
  storeItems: [
    "Position — pour chercher des centres près de vous. Non partagée avec d’autres parents.",
    "Coordonnées — courriel et nom à la connexion.",
    "Contenu — messages, notes d’inscription, nom et date de naissance, et détails de garde (vous et le centre contacté).",
    "Identifiants — identifiant de compte.",
    "Paiements — montant et mode du dépôt. Aucun numéro de carte ici.",
  ],
  officialHref:
    "https://www.priv.gc.ca/fr/sujets-lies-a-la-protection-de-la-vie-privee/lois-sur-la-protection-des-renseignements-personnels-au-canada/la-loi-sur-la-protection-des-renseignements-personnels-et-les-documents-electroniques-lprpde/",
  officialLabel: "Lire la LPRPDE sur le site du Commissariat",
  contactLead: "Questions de confidentialité :",
  disclaimer: DISCLAIMER_FR,
};

export const COOKIES_EN: LegalDoc = {
  kicker: "Cookies",
  title: "Cookie Policy",
  updated: UPDATED_EN,
  intro: [
    "This page lists the cookies and similar storage KidEase uses. It is part of our Privacy notice.",
    "We do not use advertising cookies, ad pixels, or third-party marketing trackers. Because those non-essential trackers are not present, KidEase does not show a cookie banner.",
  ],
  sections: [
    {
      id: "essential",
      title: "Essential cookies (required to run the site)",
      blocks: [
        {
          type: "ul",
          items: [
            "Signed-in session cookies from Better Auth on this site (first-party, Secure). They keep you logged in as a parent or director. Names look like a host-only session cookie.",
            "A short-lived two-factor cookie after email sign-in, when that check is on.",
            "These are strictly necessary. Turning them off in the browser will sign you out.",
          ],
        },
      ],
    },
    {
      id: "local",
      title: "Local storage and session storage (this device)",
      blocks: [
        {
          type: "p",
          text: "The browser can also keep small settings on this device. They are not ad profiles.",
        },
        {
          type: "ul",
          items: [
            "Language, distance unit (km or miles), map style, and whether you prefer live listings.",
            "Location choice (precise location allowed or not) and your last search point.",
            "Whether you last used KidEase as a parent or a director.",
            "Recent centres you opened, and a short-lived search cache.",
            "A random session id for first-party search telemetry (coarse geohash only).",
            "A sign-in token in session storage on some preview hosts — not used for ads.",
            "When product analytics is on, PostHog may keep a first-party visitor id so page views and masked session replay stay on one browser.",
          ],
        },
      ],
    },
    {
      id: "google",
      title: "Google Maps (functional, not an ad tracker we set)",
      blocks: [
        {
          type: "p",
          text: "When a map is shown, Google’s Maps script may set its own cookies in your browser. We load the map so you can see centres on a street map. We do not use Google Ads tags or remarketing pixels. See Google’s privacy policy for cookies Google sets.",
        },
      ],
    },
    {
      id: "posthog",
      title: "PostHog (product analytics, not ads)",
      blocks: [
        {
          type: "p",
          text: "When analytics is enabled in production, PostHog records page views, in-app clicks, and privacy-masked session replay so we can see how KidEase is used. It may set a first-party cookie on this site and talk to us.i.posthog.com / us-assets.i.posthog.com. Passwords and form fields are masked. This is not an advertising or remarketing cookie.",
        },
      ],
    },
    {
      id: "optional",
      title: "Optional / advertising",
      blocks: [
        {
          type: "p",
          text: "KidEase does not set advertising, social, or cross-site marketing cookies. We do not run a Facebook pixel, Google Ads tag, or similar. If that ever changes, we will update this page before turning it on — and we would then need a consent banner for those non-essential cookies.",
        },
      ],
    },
    {
      id: "control",
      title: "How to control them",
      blocks: [
        {
          type: "ul",
          items: [
            "Browser settings: block or delete cookies and site data for kidease.ca.",
            "Location: OS or browser permission, or “Not now” in the app. Details are in Privacy → Location.",
            "Account: Delete my account removes server-side data; it does not clear cookies already on this phone until you sign out or clear site data.",
            "Google Maps: use the browser’s site settings for maps.googleapis.com if you want to limit Google’s cookies. The map may not load.",
          ],
        },
      ],
    },
  ],
  contactLead: "Cookie questions:",
  disclaimer: DISCLAIMER_EN,
};

export const COOKIES_FR: LegalDoc = {
  kicker: "Témoins",
  title: "Politique sur les témoins",
  updated: UPDATED_FR,
  intro: [
    "Cette page dresse la liste des témoins et du stockage similaire. Elle complète l’avis de confidentialité.",
    "Nous n’utilisons pas de témoins publicitaires, de pixels ni de traceurs marketing. Comme ces témoins non essentiels sont absents, KidEase n’affiche pas de bannière de témoins.",
  ],
  sections: [
    {
      id: "essential",
      title: "Témoins essentiels (nécessaires au site)",
      blocks: [
        {
          type: "ul",
          items: [
            "Témoins de session Better Auth sur ce site (première partie, Secure). Ils vous gardent connecté.",
            "Un témoin de vérification en deux étapes, lorsque cette étape est active.",
            "Ils sont strictement nécessaires. Les bloquer vous déconnecte.",
          ],
        },
      ],
    },
    {
      id: "local",
      title: "Stockage local et de session (cet appareil)",
      blocks: [
        {
          type: "p",
          text: "Le navigateur peut aussi garder de petits réglages. Ce ne sont pas des profils publicitaires.",
        },
        {
          type: "ul",
          items: [
            "Langue, unité de distance, style de carte, préférence pour les fiches en direct.",
            "Choix de position et dernier point de recherche.",
            "Dernier rôle utilisé (parent ou direction).",
            "Centres récemment ouverts et cache de recherche temporaire.",
            "Un identifiant de session pour la télémétrie de recherche (géohachage grossier seulement).",
            "Un jeton de connexion en stockage de session sur certains hôtes d’aperçu.",
            "Lorsque l’analytique produit est active, PostHog peut garder un identifiant de visiteur pour relier les pages vues et le replay masqué.",
          ],
        },
      ],
    },
    {
      id: "google",
      title: "Google Maps (fonctionnel)",
      blocks: [
        {
          type: "p",
          text: "Quand une carte s’affiche, le script Google Maps peut déposer ses propres témoins. Nous chargeons la carte pour montrer les centres. Nous n’utilisons pas les balises Google Ads. Voir la politique de Google pour les témoins qu’il dépose.",
        },
      ],
    },
    {
      id: "posthog",
      title: "PostHog (analytique produit, pas de publicité)",
      blocks: [
        {
          type: "p",
          text: "Lorsque l’analytique est active en production, PostHog enregistre les pages vues, les clics et un replay de session masqué. Il peut déposer un témoin de première partie et parler à us.i.posthog.com / us-assets.i.posthog.com. Les mots de passe et les champs de formulaire sont masqués. Ce n’est pas un témoin publicitaire.",
        },
      ],
    },
    {
      id: "optional",
      title: "Facultatif / publicité",
      blocks: [
        {
          type: "p",
          text: "KidEase ne dépose pas de témoins publicitaires, sociaux ou marketing intersites. Pas de pixel Facebook ni de balise Google Ads. Si cela change, nous mettrons cette page à jour avant — et une bannière de consentement serait alors nécessaire.",
        },
      ],
    },
    {
      id: "control",
      title: "Comment les contrôler",
      blocks: [
        {
          type: "ul",
          items: [
            "Réglages du navigateur : bloquer ou supprimer les témoins de kidease.ca.",
            "Position : permission du système ou « Pas maintenant ». Détails dans Confidentialité → Position.",
            "Compte : supprimer le compte efface les données côté serveur; les témoins sur cet appareil restent jusqu’à la déconnexion ou l’effacement du site.",
            "Google Maps : réglages du site pour maps.googleapis.com. La carte peut ne plus s’afficher.",
          ],
        },
      ],
    },
  ],
  contactLead: "Questions sur les témoins :",
  disclaimer: DISCLAIMER_FR,
};

export const TERMS_EN: LegalDoc = {
  kicker: "Terms",
  title: "Terms of use",
  updated: UPDATED_EN,
  intro: [
    "These terms cover kidease.ca and the KidEase app. They are a two-sided marketplace: parents look for licensed care; centre directors list and manage a centre. KidEase is the platform, not the childcare provider.",
  ],
  sections: [
    {
      id: "role",
      title: "KidEase’s role",
      blocks: [
        {
          type: "ul",
          items: [
            "We run a directory and enrolment tool for provincially or territorially licensed centres.",
            "We are not the care provider, employer, or insurer. Your service agreement, ratios, programming, and daily care are with the centre.",
            "Unclaimed cards may show public-registry facts and a storefront photo. Live (claimed) listings show spots and fees the director entered. Always confirm with the centre before you enrol.",
            "We may approve, pause, or remove a listing if a centre is unlicensed, a licence lapses, or these terms are broken.",
          ],
        },
      ],
    },
    {
      id: "accounts",
      title: "Accounts — 18 and over",
      blocks: [
        {
          type: "ul",
          items: [
            "You must be 18 or older to create an account (parent, guardian, or centre director).",
            "Keep your email and password to yourself. You are responsible for activity on your account.",
            "Only add children you have the legal right to enrol. You are responsible for the accuracy of those details.",
          ],
        },
      ],
    },
    {
      id: "listings",
      title: "Listing accuracy and licence claims",
      blocks: [
        {
          type: "ul",
          items: [
            "Directors who claim a listing warrant that they operate that licensed centre and that the licence photo and licence number are genuine.",
            "Spots, hours, fees, photos, and amenities must stay reasonably current. Do not invent a fee or an open spot.",
            "KidEase may check a claim against the provincial or territorial registry. A false claim, a borrowed licence, or an unlicensed operation can lead to immediate suspension of the listing and the director account.",
            "Parents: registry data and Google bits can lag. Treat KidEase as a starting point, not a government certificate.",
          ],
        },
      ],
    },
    {
      id: "use",
      title: "Acceptable use",
      blocks: [
        {
          type: "ul",
          items: [
            "Do not scrape the directory, overload the service, or bypass sign-in.",
            "Do not harass families or staff, post other people’s children, or send illegal or sexual content.",
            "Do not use parent or child details you receive for advertising lists or resale.",
            "Do not pretend to be another centre or a licensing officer.",
            "We may remove content or close an account that breaks these rules.",
          ],
        },
      ],
    },
    {
      id: "photos",
      title: "Photos and content licence",
      blocks: [
        {
          type: "p",
          text: "If you upload a storefront photo, interior photos, a licence image, a profile photo, or listing text, you keep ownership. You grant KidEase a non-exclusive licence to host, display, and resize that content so the listing and the app work in Canada. You confirm you have the right to upload it (including any faces of staff or children). We may refuse or take down a photo that is misleading, unsafe, or not yours.",
        },
      ],
    },
    {
      id: "pay",
      title: "Deposits and refunds",
      blocks: [
        {
          type: "ul",
          items: [
            "In-app deposits, when offered, hold a spot after the centre accepts a request. Refunds follow that centre’s policy.",
            "When Stripe is enabled, cards are processed by Stripe. KidEase does not store full card numbers. Until Stripe is live, on-screen payments may be an internal record only.",
            "Interac or other bank methods may be added later and will be labelled on the pay screen.",
          ],
        },
      ],
    },
    {
      id: "liability",
      title: "Liability and indemnity (small business)",
      blocks: [
        {
          type: "ul",
          items: [
            "The platform is provided as a directory and messaging tool. We do not warrant that a listing is complete, that a spot is still open, or that a centre will accept your child.",
            "To the extent Canadian law allows, KidEase is not liable for care incidents, waitlists, fees charged by a centre, or decisions a centre or parent makes after they meet.",
            "If we are liable for something we control (for example a confirmed billing error on our side), our aggregate responsibility is limited to the fees you actually paid to KidEase in the twelve months before the claim — or fifty Canadian dollars if you paid us nothing. This does not limit liability that Manitoba or Canada does not let us limit (including fraud or bodily injury we cause).",
            "You agree to indemnify KidEase against claims that arise from content you upload, a false licence claim, or misuse of family information you received on the platform.",
            "Parents and centres remain responsible for their own insurance, licensing, and duty of care.",
          ],
        },
      ],
    },
    {
      id: "suspend",
      title: "Suspension",
      blocks: [
        {
          type: "p",
          text: "We may suspend a listing or account for a false claim, an expired or missing licence, abuse, or a serious privacy breach. We will email the address on the account when we can. Repeat or serious cases may be closed without a further listing.",
        },
      ],
    },
    {
      id: "law",
      title: "Manitoba and Canada",
      blocks: [
        {
          type: "p",
          text: "These terms are governed by the laws of Manitoba and Canada. Courts in Manitoba have venue, except where a consumer-protection rule in your province requires otherwise.",
        },
      ],
    },
    {
      id: "changes",
      title: "Changes",
      blocks: [
        {
          type: "p",
          text: "We will post a new effective date on this page when the terms change. Continued use after that date means you accept the update. For a material change we will also email the address on the account when we have one.",
        },
      ],
    },
  ],
  contactLead: "Terms questions:",
  disclaimer: DISCLAIMER_EN,
};

export const TERMS_FR: LegalDoc = {
  kicker: "Conditions",
  title: "Conditions d’utilisation",
  updated: UPDATED_FR,
  intro: [
    "Ces conditions couvrent kidease.ca et l’appli KidEase. Il s’agit d’une place de marché à deux côtés : les parents cherchent une garde permise; les directions publient et gèrent un centre. KidEase est la plateforme, pas le fournisseur de garde.",
  ],
  sections: [
    {
      id: "role",
      title: "Rôle de KidEase",
      blocks: [
        {
          type: "ul",
          items: [
            "Nous tenons un répertoire et un outil d’inscription pour des centres permis.",
            "Nous ne sommes pas le fournisseur, l’employeur ni l’assureur. Le contrat de garde est avec le centre.",
            "Les fiches non réclamées peuvent montrer des faits de registre public. Les fiches en direct montrent les places et tarifs saisis par la direction. Vérifiez toujours auprès du centre.",
            "Nous pouvons approuver, suspendre ou retirer une fiche si le centre n’est pas permis, si le permis expire ou si ces conditions sont rompues.",
          ],
        },
      ],
    },
    {
      id: "accounts",
      title: "Comptes — 18 ans et plus",
      blocks: [
        {
          type: "ul",
          items: [
            "Vous devez avoir 18 ans ou plus pour créer un compte (parent, tuteur ou direction).",
            "Gardez votre courriel et votre mot de passe pour vous. Vous êtes responsable de l’activité sur le compte.",
            "N’ajoutez que des enfants dont vous avez la charge. Vous êtes responsable de l’exactitude de ces renseignements.",
          ],
        },
      ],
    },
    {
      id: "listings",
      title: "Exactitude des fiches et permis",
      blocks: [
        {
          type: "ul",
          items: [
            "La direction qui revendique une fiche déclare exploiter ce centre permis et que la photo et le numéro de permis sont authentiques.",
            "Places, heures, tarifs, photos et services doivent rester raisonnablement à jour. N’inventez pas un tarif ni une place.",
            "KidEase peut vérifier une revendication auprès du registre. Une fausse revendication, un permis emprunté ou un service sans permis peut entraîner la suspension immédiate de la fiche et du compte.",
            "Parents : les registres et les données Google peuvent être en retard. KidEase est un point de départ, pas un certificat gouvernemental.",
          ],
        },
      ],
    },
    {
      id: "use",
      title: "Usage acceptable",
      blocks: [
        {
          type: "ul",
          items: [
            "Ne moissonnez pas le répertoire, ne surchargez pas le service et ne contournez pas la connexion.",
            "Pas de harcèlement, pas de publication d’enfants d’autrui, pas de contenu illégal ou sexuel.",
            "N’utilisez pas les détails familiaux reçus pour des listes publicitaires ou la revente.",
            "Ne vous faites pas passer pour un autre centre ou un agent de permis.",
            "Nous pouvons retirer du contenu ou fermer un compte qui enfreint ces règles.",
          ],
        },
      ],
    },
    {
      id: "photos",
      title: "Photos et licence de contenu",
      blocks: [
        {
          type: "p",
          text: "Si vous téléversez une devanture, des photos intérieures, une image de permis, une photo de profil ou du texte, vous en restez titulaire. Vous accordez à KidEase une licence non exclusive pour héberger, afficher et redimensionner ce contenu afin que la fiche et l’appli fonctionnent au Canada. Vous confirmez avoir le droit de le téléverser. Nous pouvons refuser ou retirer une photo trompeuse, non sécuritaire ou qui ne vous appartient pas.",
        },
      ],
    },
    {
      id: "pay",
      title: "Dépôts et remboursements",
      blocks: [
        {
          type: "ul",
          items: [
            "Les dépôts dans l’appli, le cas échéant, retiennent une place après acceptation. Les remboursements suivent la politique du centre.",
            "Lorsque Stripe est activé, les cartes passent par Stripe. KidEase ne conserve pas les numéros complets. Tant que Stripe n’est pas en direct, l’écran peut n’être qu’un registre interne.",
            "Le virement Interac ou d’autres modes pourront s’ajouter plus tard.",
          ],
        },
      ],
    },
    {
      id: "liability",
      title: "Responsabilité et indemnisation (PME)",
      blocks: [
        {
          type: "ul",
          items: [
            "La plateforme est un répertoire et un outil de messages. Nous ne garantissons pas qu’une fiche est complète, qu’une place est encore ouverte ou qu’un centre acceptera votre enfant.",
            "Dans la mesure permise par le droit canadien, KidEase n’est pas responsable des incidents de garde, des listes d’attente, des tarifs du centre, ni des décisions prises après une rencontre.",
            "Si nous sommes responsables de quelque chose que nous contrôlons (par exemple une erreur de facturation confirmée de notre côté), notre responsabilité globale est limitée aux frais que vous nous avez réellement versés au cours des douze mois précédents — ou cinquante dollars canadiens si vous ne nous avez rien versé. Cela ne limite pas la responsabilité que le Manitoba ou le Canada nous interdit de limiter.",
            "Vous indemnisez KidEase contre les réclamations liées au contenu que vous téléversez, à une fausse revendication de permis ou à l’usage abusif de renseignements familiaux reçus sur la plateforme.",
            "Parents et centres restent responsables de leurs assurances, permis et devoir de diligence.",
          ],
        },
      ],
    },
    {
      id: "suspend",
      title: "Suspension",
      blocks: [
        {
          type: "p",
          text: "Nous pouvons suspendre une fiche ou un compte pour une fausse revendication, un permis expiré ou manquant, un abus ou une atteinte grave à la vie privée. Nous écrirons à l’adresse du compte lorsque c’est possible.",
        },
      ],
    },
    {
      id: "law",
      title: "Manitoba et Canada",
      blocks: [
        {
          type: "p",
          text: "Le droit du Manitoba et du Canada s’applique. Les tribunaux du Manitoba sont compétents, sauf si une règle de protection du consommateur de votre province l’exige autrement.",
        },
      ],
    },
    {
      id: "changes",
      title: "Modifications",
      blocks: [
        {
          type: "p",
          text: "Nous afficherons une nouvelle date ici. Continuer d’utiliser le service après cette date vaut acceptation. Pour un changement important, nous enverrons aussi un courriel si nous avons une adresse.",
        },
      ],
    },
  ],
  contactLead: "Questions sur les conditions :",
  disclaimer: DISCLAIMER_FR,
};
