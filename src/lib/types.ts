export type Locale =
  | "en"
  | "fr"
  | "zh"
  | "yue"
  | "pa"
  | "es"
  | "ar"
  | "tl"
  | "it"
  | "de";
export type AgeGroup = "infant" | "toddler" | "preschool";
export type Schedule = "full" | "part" | "custom";
export type BookingStatus =
  | "requested"
  | "under_review"
  | "waitlist"
  | "accepted"
  | "declined"
  | "active"
  | "cancelled";
export type PayMethod =
  | "card"
  | "apple"
  | "google"
  | "apple_pay"
  | "google_pay"
  | "link"
  | "paypal"
  | "amazon_pay"
  | "cashapp"
  | "interac"
  | "acss_debit"
  | "customer_balance"
  | "us_bank_account"
  | "afterpay_clearpay"
  | "klarna"
  | "affirm"
  | "alipay"
  | "wechat_pay"
  | "sepa_debit"
  | "ideal";

export type Daycare = {
  id: string;
  slug: string;
  name: string;
  nameFr: string;
  tagline: string;
  taglineFr: string;
  description: string;
  descriptionFr: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  lat: number;
  lng: number;
  phone: string | null;
  hours: string;
  hoursFr: string;
  ageMinMonths: number;
  ageMaxMonths: number;
  infantMonthly: number | null;
  toddlerMonthly: number | null;
  preschoolMonthly: number | null;
  partTimeMonthly: number | null;
  spotsInfant: number;
  spotsToddler: number;
  spotsPreschool: number;
  waitlist: number;
  ratingX10: number;
  reviewCount: number;
  parentRatingX10?: number;
  parentReviewCount?: number;
  qualityScore?: number;
  guestFavorite?: boolean;
  matchScore?: number;
  urgencyScore?: number;
  replyMedianHours?: number | null;
  replySample?: number;
  googlePlaceId?: string | null;
  licenseNumber: string | null;
  /** True when a provincial licence scan is on file. Never the file bytes. */
  licensePhotoOnFile?: boolean;
  languages: string;
  /** Languages spoken by staff. Optional; empty = hidden on the public listing. */
  staffLanguages?: string[];
  /** Cultural programs / strengths. Optional; empty = hidden. Never racial categories. */
  culturalPrograms?: string[];
  /** Optional public team note (languages/programs only). Max ~280 chars. */
  culturalTeamNote?: string | null;
  amenities: string;
  photos: string[];
  verified: boolean;
  contactEmail?: string | null;
  claimed?: boolean;
  claimedAt?: string | null;
  claimStatus?: string | null;
  listingActive?: boolean;
  pauseCode?: string | null;
  pauseReason?: string | null;
  live: boolean;
  feeConfirmed?: boolean;
  /** Sourced provincial fee program code, e.g. mb-10-day. Not a monthly amount. */
  feeProgram?: string | null;
  /** Operator citation for a sourced age, fee, or photo. Not shown raw. */
  factSource?: string | null;
  availabilityKnown?: boolean;
  spotsUpdatedAt?: string | null;
  lastVacancyUpdatedAt?: string | null;
  lastPhotoUpdatedAt?: string | null;
  detailsReady?: boolean;
  completenessMissing?: Array<"fees" | "ages" | "hours" | "license" | "photo">;
  licenseStatus?: "unverified" | "matched" | "expired" | "suspended" | "active" | "unknown";
  licenseExpiry?: string | null;
  licensedCapacity?: number | null;
  registryMatchState?: "unmatched" | "pending" | "matched" | "mismatch";
  licenseVerifiedAt?: string | null;
  licenseVerificationSource?: string | null;
  staffScreeningAttested?: boolean;
  staffScreeningAttestedAt?: string | null;
  staffScreeningAttestedBy?: string | null;
  screeningOnFile?: boolean;
  screeningOnFileAt?: string | null;
  screeningOnFileBy?: string | null;
  stripeIdentityVerified?: boolean;
  priority?: boolean;
  priorityUntil?: string | null;
  /** Paid placement pin (Pro / featured-city add-on). Never part of quality score. */
  featuredCity?: boolean;
  agesKnown?: boolean;
  visibility?: "public" | "admin_only";
  isTest?: boolean;
  /** Provider-set Canada facility class. Null = derive from amenities (never a name guess). */
  facilityType?:
    | "child_care_centre"
    | "family_home"
    | "group_home"
    | "nursery_preschool"
    | "school_age"
    | null;
  /** Provider-set FT/PT/flexible offers. Empty = hidden from parent schedule chips. */
  scheduleOptions?: Array<"full" | "part" | "flexible">;
  /** Provider vacancy window. Public Immediate still requires honest fresh spots. */
  openingWindow?: "immediate" | "upcoming" | "none" | null;
  /** Structured age programs. Empty falls back to confirmed age/fee columns. */
  programs?: Array<{
    band: "infant" | "toddler" | "preschool" | "school-age";
    ageMinMonths: number;
    ageMaxMonths: number;
    schedules: Array<"full" | "part" | "flexible">;
    monthlyFee: number | null;
  }>;
  financial?: {
    subsidy: boolean;
    sliding: boolean;
    sibling: boolean;
    meals: boolean;
  };
  curriculumTags?: string[];
  /** Optional values / faith note. Hidden when empty. Not a US religion list. */
  valuesNote?: string | null;
  safetyFeatures?: string[];
  /** Optional public promo blurb from the daycare desk. */
  promoText?: string | null;
  /** Centre timezone for posted tour times. Default America/Winnipeg. */
  timezone?: string;
  /** Claimed + centre inbox + transactional mail configured. */
  inboxMailReady?: boolean;
};

export type DaycareCard = Daycare & {
  distanceKm: number;
  spotsTotal: number;
  fromPrice: number;
  catchmentKm?: number;
  inCatchment?: boolean;
};

export type ReviewStatus = "pending" | "published" | "hidden" | "approved" | "rejected";
export type ReviewGateReason = "enrolment" | "attendance" | "grant";

export type Review = {
  id: string;
  daycareId: string;
  author: string;
  rating: number;
  body: string;
  bodyFr: string;
  createdAt: string;
  status?: ReviewStatus;
  userId?: string | null;
  gateReason?: ReviewGateReason | null;
};

export type AvailabilityRow = {
  month: string;
  infant: number;
  toddler: number;
  preschool: number;
};

export type ToiletStatus = "" | "diapers" | "training" | "independent";

export type Child = {
  id: string;
  name: string;
  preferredName: string;
  birthdate: string;
  allergies: string;
  epiPen: boolean;
  medicalNotes: string;
  medications: string;
  doctorName: string;
  doctorPhone: string;
  foodsLike: string;
  foodsAvoid: string;
  diet: string;
  likes: string;
  comfortItem: string;
  napRoutine: string;
  toilet: ToiletStatus;
  homeLanguage: string;
  soothes: string;
  fears: string;
  emergencyName: string;
  emergencyPhone: string;
  pickupPeople: string;
  photoOk: boolean;
  sunscreenOk: boolean;
  notes: string;
};

export type Booking = {
  id: string;
  daycareId: string;
  daycareName: string;
  daycareSlug: string;
  childId: string | null;
  childName: string | null;
  startMonth: string;
  startDate: string | null;
  schedule: Schedule;
  days: string | null;
  parentNote: string | null;
  parentName: string | null;
  conversationId: string | null;
  ageGroup: AgeGroup;
  status: BookingStatus;
  monthlyAmount: number;
  createdAt: string;
  paymentStatus?: string | null;
};

export type Conversation = {
  id: string;
  daycareId: string;
  daycareName: string;
  daycareSlug: string;
  photo: string;
  lastAt: string;
  lastBody: string;
  status: BookingStatus | null;
  tourStatus?: TourStatus | null;
  phone: string | null;
  unread?: boolean;
};

export type TourStatus = "pending" | "accepted" | "completed" | "enrolled" | "declined" | "lost" | "expired";

export type PreferredTime = {
  date: string;
  time: string;
};

export type TourRequest = {
  id: string;
  conversationId: string;
  daycareId: string;
  daycareName: string;
  daycareSlug: string;
  childId: string | null;
  childName: string | null;
  parentName: string | null;
  preferredTimes: PreferredTime[];
  parentNote: string | null;
  status: TourStatus;
  centreNote: string | null;
  createdAt: string;
  respondedAt: string | null;
  windowId?: string | null;
  holdExpiresAt?: string | null;
  parentPhone?: string | null;
  parentEmail?: string | null;
};

export type Message = {
  id: string;
  sender: "parent" | "provider" | "system";
  body: string;
  createdAt: string;
  kind: "chat" | "system" | "notify" | "status";
};

export type Payment = {
  id: string;
  daycareId: string;
  daycareName: string;
  amount: number;
  method: PayMethod;
  status: string;
  reference: string | null;
  createdAt: string;
  invoiceId?: string | null;
  period?: string | null;
};

export type { Bill, BillStatus, BillParty } from "./bill";

export type SpotRequest = Booking & {
  birthdate: string | null;
  allergies?: string;
  epiPen?: boolean;
  child?: Child | null;
};
