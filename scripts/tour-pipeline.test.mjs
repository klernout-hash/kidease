import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  bookingToPipelineStage,
  canAdvanceTour,
  nextTourPipeline,
  threadPipelineStage,
  tourStatusFromBooking,
  tourToPipelineStage,
} from "../src/lib/tour-pipeline.ts";
import { nextTourStatus, tourStatusBody } from "../src/lib/threads.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("tour display maps to Requested → Confirmed → Completed → Enrolled / Lost", () => {
  assert.equal(tourToPipelineStage("pending"), "requested");
  assert.equal(tourToPipelineStage("accepted"), "confirmed");
  assert.equal(tourToPipelineStage("completed"), "completed");
  assert.equal(tourToPipelineStage("enrolled"), "enrolled");
  assert.equal(tourToPipelineStage("declined"), "lost");
  assert.equal(tourToPipelineStage("lost"), "lost");
  assert.equal(tourToPipelineStage(null), null);
});

test("booking accepted/active is Enrolled; declined/cancelled is Lost; no invent", () => {
  assert.equal(bookingToPipelineStage("accepted"), "enrolled");
  assert.equal(bookingToPipelineStage("active"), "enrolled");
  assert.equal(bookingToPipelineStage("declined"), "lost");
  assert.equal(bookingToPipelineStage("cancelled"), "lost");
  assert.equal(bookingToPipelineStage("requested"), "requested");
  assert.equal(bookingToPipelineStage(null), null);
  assert.equal(tourStatusFromBooking("accepted"), "enrolled");
  assert.equal(tourStatusFromBooking("requested"), null);
});

test("thread pipeline prefers a real enrolment or loss over an earlier tour step", () => {
  assert.equal(threadPipelineStage({ tourStatus: "accepted", bookingStatus: "accepted" }), "enrolled");
  assert.equal(threadPipelineStage({ tourStatus: "completed", bookingStatus: null }), "completed");
  assert.equal(threadPipelineStage({ tourStatus: "pending", bookingStatus: "requested" }), "requested");
  assert.equal(threadPipelineStage({}), null);
});

test("tour advances only along the real pipeline", () => {
  assert.equal(nextTourStatus("pending", "accepted"), "accepted");
  assert.equal(nextTourPipeline("accepted", "completed"), "completed");
  assert.equal(nextTourPipeline("completed", "enrolled"), "enrolled");
  assert.equal(nextTourPipeline("completed", "lost"), "lost");
  assert.equal(nextTourPipeline("enrolled", "lost"), null);
  assert.equal(nextTourPipeline("pending", "enrolled"), null);
  assert.equal(canAdvanceTour("accepted", "completed"), true);
  const body = tourStatusBody({ status: "completed", daycareName: "Bright Start" });
  assert.match(body, /completed|Bright Start/i);
});

test("pipeline is visible on parent shortlist, inbox, and centre desk", () => {
  const mig = src("migrations/0032_tour_pipeline_photo_freshness.sql");
  assert.match(mig, /completed.*enrolled.*lost/s);
  assert.match(mig, /Never invented/);

  assert.match(src("src/components/tour-card.tsx"), /advanceTourRequest/);
  assert.match(src("src/components/tour-card.tsx"), /PipelineBadge/);
  assert.match(src("src/components/inbox-list.tsx"), /PipelineBadge/);
  assert.match(src("src/routes/inbox.\\$id.tsx"), /PipelineBadge/);
  assert.match(src("src/components/parent-desk.tsx"), /PipelineBadge/);
  assert.match(src("src/lib/server/tours.ts"), /advanceTourRequest/);
  assert.match(src("src/lib/server/family.ts"), /syncToursFromBooking/);
  assert.match(src("src/lib/server/inbox.ts"), /tour_status/);
  assert.doesNotMatch(src("src/lib/tour-pipeline.ts"), /invent/);
});
