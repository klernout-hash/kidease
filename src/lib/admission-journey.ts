/**
 * Parent-facing admissions step for one centre.
 * Derived from a real tour, waitlist, or offer. Never a queue number.
 * The centre confirms enrolment. A decline stays a decline.
 */

export const ADMISSION_STEPS = [
  "asked",
  "visit_booked",
  "visit_declined",
  "waitlist",
  "offer",
  "offer_declined",
  "forms",
  "enrolled",
] as const;

export type AdmissionStep = (typeof ADMISSION_STEPS)[number];

export type AdmissionFacts = {
  tourStatus?: string | null;
  bookingStatus?: string | null;
  offerStatus?: string | null;
  /** Ignored. A waitlist has no exact place in line. */
  queuePosition?: number | null;
};

const COPY: Record<AdmissionStep, "admissionAsked" | "admissionVisitBooked" | "admissionVisitDeclined" | "admissionWaitlist" | "admissionOffer" | "admissionOfferDeclined" | "admissionForms" | "admissionEnrolled"> = {
  asked: "admissionAsked",
  visit_booked: "admissionVisitBooked",
  visit_declined: "admissionVisitDeclined",
  waitlist: "admissionWaitlist",
  offer: "admissionOffer",
  offer_declined: "admissionOfferDeclined",
  forms: "admissionForms",
  enrolled: "admissionEnrolled",
};

export function admissionJourney(input: AdmissionFacts): { step: AdmissionStep; queuePosition: null; copyKey: (typeof COPY)[AdmissionStep] } {
  const tour = String(input.tourStatus || "").trim().toLowerCase();
  const booking = String(input.bookingStatus || "").trim().toLowerCase();
  const offer = String(input.offerStatus || "").trim().toLowerCase();

  let step: AdmissionStep = "asked";
  if (booking === "accepted" || booking === "active" || offer === "accepted" || tour === "enrolled") step = "enrolled";
  else if (offer === "forms" || booking === "forms") step = "forms";
  else if (offer === "declined") step = "offer_declined";
  else if (offer === "pending" || offer === "sent") step = "offer";
  else if (booking === "waitlist") step = "waitlist";
  else if (tour === "declined" || tour === "lost" || tour === "expired" || tour === "no_show") step = "visit_declined";
  else if (tour === "accepted" || tour === "completed") step = "visit_booked";
  else step = "asked";

  return { step, queuePosition: null, copyKey: COPY[step] };
}
