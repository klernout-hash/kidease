import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { finishListingCopy, requestsWaiting, toursBookedOn } from "../src/lib/host-style-today.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";

test("tours booked today are accepted visits on that date", () => {
  const tours = [
    { id: "a", status: "accepted", preferredTimes: [{ date: "2026-11-16", time: "09:00" }], parentName: "Amina" },
    { id: "b", status: "pending", preferredTimes: [{ date: "2026-11-16", time: "10:00" }] },
    { id: "c", status: "accepted", preferredTimes: [{ date: "2026-11-17", time: "11:00" }] },
  ];
  const booked = toursBookedOn(tours, "2026-11-16");
  assert.deepEqual(booked.map((row) => row.id), ["a"]);
  assert.equal(requestsWaiting([{ status: "requested" }, { status: "confirmed" }], tours), 2);
});

test("the finish card is quiet and owner-only when something is missing", () => {
  assert.equal(finishListingCopy("en", 0), null);
  assert.equal(finishListingCopy("en", 2)?.title, "Finish your listing");
  assert.match(finishListingCopy("fr", 1)?.title || "", /Terminer/);
  assert.equal(FLAG_DEFAULTS.FEATURE_HOST_TODAY, true);
});

test("the owner today screen leads with arrivals and keeps the staff home", () => {
  const provider = readFileSync(new URL("../src/routes/provider.tsx", import.meta.url), "utf8");
  assert.match(provider, /data-ke="host-style-today"|HostStyleToday/);
  assert.match(provider, /provider-setup-reserve/);
  assert.match(provider, /staff-today/);
  assert.match(provider, /staff-hours-link/);
});
