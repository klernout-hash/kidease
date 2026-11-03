import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { listingJsonLd } from "../src/lib/listing-seo.ts";
import {
  addressLineForViewer,
  approximateDistanceKm,
  bookingUnlocksHomeAddress,
  enrolmentUnlocksHomeAddress,
  homeConnectionUnlocked,
  isHomeDaycare,
  maySeeHomeAddress,
  postalFsa,
  providerReplyUnlocksAddress,
  publicHomePlace,
  tourUnlocksHomeAddress,
  verifiedOwnerClaim,
  waitlistUnlocksHomeAddress,
} from "../src/lib/home-address-privacy.ts";
import { copy } from "../src/lib/copy.ts";
import { HELP_ARTICLES } from "../src/lib/help-centre.ts";
import { encodeMapPinWire } from "../src/lib/map-cluster.ts";
import {
  approximateHomePoint,
  presentMapView,
  presentPin,
  protectHomeRecord,
  sealHomeRecords,
} from "../src/lib/home-address-seal.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (path) => readFileSync(join(root, path), "utf8");

const HOME = {
  id: "home-1",
  name: "Maple Family Care",
  facilityType: "family_home",
  amenities: "licensed,home",
  address: "123 Secret Lane",
  city: "Winnipeg",
  province: "MB",
  postalCode: "R3C 1A1",
  lat: 49.8951,
  lng: -97.1384,
  slug: "maple-family-care",
  description: "Care at 123 Secret Lane, R3C 1A1.",
  descriptionFr: "Soin au 123 Secret Lane.",
  googlePlaceId: "places/secret",
  distanceKm: 2.2,
};

const CENTRE = {
  id: "centre-1",
  name: "Oak Child Care Centre",
  facilityType: "child_care_centre",
  amenities: "licensed",
  address: "500 Portage Avenue",
  city: "Winnipeg",
  province: "MB",
  postalCode: "R3C 0E1",
  lat: 49.89,
  lng: -97.14,
};

function kmBetween(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

const guest = { userId: null, revealAll: false, revealIds: new Set() };

test("centres stay public and home categories are protected", () => {
  assert.equal(isHomeDaycare(CENTRE), false);
  assert.equal(isHomeDaycare({ ...CENTRE, name: "Home Sweet Daycare" }), false);
  assert.equal(isHomeDaycare(HOME), true);
  assert.equal(isHomeDaycare({ facilityType: "group_home" }), true);
  assert.equal(isHomeDaycare({ amenities: "licensed,home" }), true);
  assert.equal(isHomeDaycare({ amenities: "licensed,group-home" }), true);
  assert.equal(isHomeDaycare({ facility_type: "home" }), true);
  assert.equal(isHomeDaycare({ kidease_category: "home-based", facilityType: "child_care_centre" }), true);
  assert.equal(isHomeDaycare({ provider_type: "milieu_familial_reconnu" }), true);
  assert.equal(isHomeDaycare({ care_type: "RSGE" }), true);
  assert.equal(isHomeDaycare({ facilityType: "nursery_preschool", amenities: "home" }), false);
});

test("area circle is stable, inside 500 m to 1 km, and not the door", () => {
  const first = approximateHomePoint(HOME.id, HOME.lat, HOME.lng);
  const second = approximateHomePoint(HOME.id, HOME.lat, HOME.lng);
  assert.deepEqual(first, second);
  assert.ok(first.radiusM >= 500 && first.radiusM <= 1000);
  const metres = kmBetween(HOME, first) * 1000;
  assert.ok(metres > 100, `offset ${metres} m is too close to the door`);
  assert.ok(metres < first.radiusM, `door is outside the circle (${metres} vs ${first.radiusM})`);
  const other = approximateHomePoint("home-2", HOME.lat, HOME.lng);
  assert.notEqual(other.lat, first.lat);
});

test("guests lose the street and exact coordinates", () => {
  const hidden = protectHomeRecord(HOME, false);
  const packed = JSON.stringify(hidden);
  assert.equal(hidden.address, "");
  assert.equal(hidden.postalCode, "R3C");
  assert.equal(hidden.addressProtected, true);
  assert.ok(hidden.mapRadiusM >= 500);
  assert.equal(hidden.addressPlace, "Winnipeg · R3C");
  assert.equal(hidden.googlePlaceId, null);
  assert.equal(hidden.distanceKm, 2);
  assert.equal(packed.includes("123 Secret Lane"), false);
  assert.equal(packed.includes("R3C 1A1"), false);
  assert.equal(packed.includes("R3C1A1"), false);
  assert.equal(packed.includes(String(HOME.lat)), false);
  assert.equal(packed.includes(String(HOME.lng)), false);
  const shown = protectHomeRecord(CENTRE, false);
  assert.equal(shown.address, CENTRE.address);
  assert.equal(shown.lat, CENTRE.lat);
  assert.equal(shown.addressProtected, false);
});

test("opt-in, owner, admin, and a connection reveal the street", () => {
  const opted = protectHomeRecord({ ...HOME, showPublicAddress: true }, true);
  assert.equal(opted.address, HOME.address);
  assert.equal(
    maySeeHomeAddress({ home: true, publicOptIn: true, audience: "guest" }),
    true,
  );
  assert.equal(maySeeHomeAddress({ home: true, audience: "guest" }), false);
  assert.equal(maySeeHomeAddress({ home: true, audience: "admin" }), true);
  assert.equal(maySeeHomeAddress({ home: true, audience: "government" }), true);
  assert.equal(maySeeHomeAddress({ home: true, audience: "owner" }), true);
  assert.equal(maySeeHomeAddress({ home: true, audience: "parent", connected: { tourAccepted: true } }), true);
  assert.equal(maySeeHomeAddress({ home: true, audience: "parent", connected: { tourBooked: true } }), true);
  assert.equal(maySeeHomeAddress({ home: true, audience: "parent", connected: { enrolled: true } }), true);
  assert.equal(maySeeHomeAddress({ home: true, audience: "parent", connected: { waitlistAccepted: true } }), true);
  assert.equal(maySeeHomeAddress({ home: true, audience: "parent", connected: { daycareReplied: true } }), true);
  assert.equal(maySeeHomeAddress({ home: true, audience: "parent", connected: {} }), false);
  assert.equal(homeConnectionUnlocked({ tourAccepted: false }), false);
});

test("automatic unlock rules", () => {
  assert.equal(tourUnlocksHomeAddress({ status: "pending" }), false);
  assert.equal(tourUnlocksHomeAddress({ status: "pending", windowId: "slot-1" }), true);
  assert.equal(tourUnlocksHomeAddress({ status: "accepted" }), true);
  assert.equal(tourUnlocksHomeAddress({ status: "declined" }), false);
  assert.equal(enrolmentUnlocksHomeAddress("draft"), false);
  assert.equal(enrolmentUnlocksHomeAddress("sent"), true);
  assert.equal(enrolmentUnlocksHomeAddress("completed"), true);
  assert.equal(waitlistUnlocksHomeAddress("waiting"), false);
  assert.equal(waitlistUnlocksHomeAddress("offered"), false);
  assert.equal(waitlistUnlocksHomeAddress("accepted"), true);
  assert.equal(bookingUnlocksHomeAddress("requested"), false);
  assert.equal(bookingUnlocksHomeAddress("accepted"), true);
  assert.equal(bookingUnlocksHomeAddress("active"), true);
  assert.equal(providerReplyUnlocksAddress("We received your request for Sam and will review it shortly."), false);
  assert.equal(providerReplyUnlocksAddress("Nous avons bien reçu la demande pour Sam."), false);
  assert.equal(providerReplyUnlocksAddress("The door is the blue house. See you at 10."), true);
  assert.equal(verifiedOwnerClaim("pending", "2026-01-01"), false);
  assert.equal(verifiedOwnerClaim("verified", ""), false);
  assert.equal(verifiedOwnerClaim("verified", "2026-01-01"), true);
  assert.equal(approximateDistanceKm(2.2), 2);
  assert.equal(approximateDistanceKm(0.4), 1);
  assert.match(addressLineForViewer({ ...HOME, seeExact: false }), /Winnipeg · R3C/);
  assert.equal(addressLineForViewer({ ...HOME, seeExact: false }).includes("Secret"), false);
  assert.match(addressLineForViewer({ ...HOME, seeExact: true }), /123 Secret Lane/);
  assert.equal(publicHomePlace({ city: "Montréal", neighbourhood: "Plateau", postalCode: "H2X 1A1" }), "Montréal · Plateau · H2X");
  assert.equal(postalFsa("not a postal"), "");
});

test("public payloads from search, listing, seo, and the map hide the door", () => {
  const search = sealHomeRecords([HOME, CENTRE], guest);
  const packed = JSON.stringify(search);
  assert.equal(packed.includes("123 Secret Lane"), false);
  assert.equal(packed.includes("500 Portage Avenue"), true);
  assert.equal(packed.includes(String(HOME.lat)), false);
  const listing = sealHomeRecords(
    {
      daycare: HOME,
      nearby: [CENTRE],
      reviews: [{ body: "Lovely visits at 123 Secret Lane." }],
    },
    guest,
  );
  const listingJson = JSON.stringify(listing);
  assert.equal(listingJson.includes("123 Secret Lane"), false);
  assert.equal(listing.daycare.addressProtected, true);
  assert.equal(listing.nearby[0].address, CENTRE.address);
  const seo = sealHomeRecords(HOME, guest);
  const jsonLd = JSON.stringify(listingJsonLd(seo));
  assert.equal(jsonLd.includes("streetAddress"), false);
  assert.equal(jsonLd.includes("Secret"), false);
  assert.match(jsonLd, /R3C/);
  const revealed = sealHomeRecords([HOME], { userId: "parent", revealAll: false, revealIds: new Set([HOME.id]) });
  assert.equal(revealed[0].address, HOME.address);
  assert.equal(revealed[0].lat, HOME.lat);
});

test("map pins and pin detail use an area circle for guests", () => {
  const pin = {
    id: HOME.id,
    slug: "maple",
    name: HOME.name,
    nameFr: "",
    lat: HOME.lat,
    lng: HOME.lng,
    address: HOME.address,
    city: HOME.city,
    province: "MB",
    postalCode: HOME.postalCode,
    protectedHome: true,
  };
  const hidden = presentPin(pin, guest);
  const wire = encodeMapPinWire(hidden);
  assert.equal(wire.length, 5);
  assert.ok(wire[4] >= 500);
  assert.notEqual(wire[1], Math.round(HOME.lat * 1e5) / 1e5);
  assert.equal(JSON.stringify(wire).includes("Secret"), false);
  const centrePin = presentPin({ ...pin, id: CENTRE.id, protectedHome: false, address: CENTRE.address, lat: CENTRE.lat, lng: CENTRE.lng }, guest);
  assert.equal(encodeMapPinWire(centrePin).length, 4);
  assert.equal(centrePin.lat, CENTRE.lat);
  const view = presentMapView(
    {
      mode: "clusters",
      clusters: [{ lat: HOME.lat, lng: HOME.lng, count: 1, minLat: HOME.lat, maxLat: HOME.lat, minLng: HOME.lng, maxLng: HOME.lng, pin }],
      total: 1,
      truncated: false,
      bbox: { minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 },
      zoom: 7,
    },
    guest,
  );
  assert.notEqual(view.clusters[0].lat, HOME.lat);
  assert.ok(view.clusters[0].maxLat > view.clusters[0].minLat);
  const unlocked = presentPin(pin, { userId: "p", revealAll: false, revealIds: new Set([HOME.id]) });
  assert.equal(unlocked.lat, HOME.lat);
  assert.equal(unlocked.address, HOME.address);
  assert.equal(unlocked.radiusM, undefined);
});

test("connected parents still receive the street in tour, invoice, and agreement paths", () => {
  const tour = src("src/lib/server/tour-calendar.ts");
  assert.match(tour, /location: \[d\.address, d\.city, d\.province\]/);
  const contracts = src("src/lib/server/contracts.ts");
  assert.match(contracts, /d\.address, d\.province, d\.license_number as licence/);
  const invoices = src("src/lib/server/wiring/enrolment-handoff.ts");
  assert.match(invoices, /d\.address, d\.city/);
  assert.match(addressLineForViewer({ ...HOME, seeExact: true }), /123 Secret Lane/);
});

test("the note is in all 10 languages, the privacy policy, and the help centre", () => {
  assert.match(copy.en.homeAddressNote, /exact address is shared after you book a tour/);
  assert.match(copy.fr.homeAddressNote, /adresse exacte/);
  for (const locale of ["zh", "yue", "pa", "es", "ar", "tl", "it", "de"]) {
    const pack = JSON.parse(src(`src/lib/i18n/${locale}.json`));
    assert.equal(typeof pack.homeAddressNote, "string");
    assert.ok(pack.homeAddressNote.length > 20, locale);
    assert.equal(pack.homeAddressAbout.includes("{n}"), true, locale);
  }
  const privacy = src("src/lib/legal-copy.ts");
  assert.match(privacy, /Home daycare addresses/);
  assert.match(privacy, /Licensed child care centres keep their street address/);
  assert.match(privacy, /Adresses des garderies en milieu familial/);
  const help = HELP_ARTICLES.find((article) => article.id === "home-address");
  assert.ok(help);
  assert.match(help.en.body, /first three letters of the postal code/);
  assert.match(help.fr.body, /trois premières lettres/);
});

test("client screens do not import the offset function", () => {
  const dirs = ["src/components", "src/routes"];
  const hits = [];
  for (const dir of dirs) {
    const walk = (path) => {
      for (const name of readdirSync(path, { withFileTypes: true })) {
        const next = join(path, name.name);
        if (name.isDirectory()) walk(next);
        else if (/\.(ts|tsx)$/.test(name.name)) {
          const text = readFileSync(next, "utf8");
          if (text.includes("approximateHomePoint")) hits.push(next);
        }
      }
    };
    walk(join(root, dir));
  }
  assert.deepEqual(hits, []);
});
