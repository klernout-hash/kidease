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
export type PayMethod = "card" | "apple" | "google" | "paypal" | "interac";

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
  googlePlaceId?: string | null;
  licenseNumber: string | null;
  languages: string;
  amenities: string;
  photos: string[];
  verified: boolean;
  contactEmail?: string | null;
  claimed?: boolean;
  live: boolean;
  feeConfirmed?: boolean;
  availabilityKnown?: boolean;
  spotsUpdatedAt?: string | null;
  licenseStatus?: "active" | "unknown";
  priority?: boolean;
  priorityUntil?: string | null;
  agesKnown?: boolean;
};

export type DaycareCard = Daycare & {
  distanceKm: number;
  spotsTotal: number;
  fromPrice: number;
};

export type Review = {
  id: string;
  daycareId: string;
  author: string;
  rating: number;
  body: string;
  bodyFr: string;
  createdAt: string;
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
  phone: string | null;
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
};

export type SpotRequest = Booking & {
  birthdate: string | null;
  allergies?: string;
  epiPen?: boolean;
};
