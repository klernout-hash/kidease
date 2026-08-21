import type { Child } from "./types";

export type ChildRow = {
  id: string;
  name: string;
  preferred_name: string | null;
  birthdate: string;
  allergies: string | null;
  epi_pen: boolean | number | string | null;
  medical_notes: string | null;
  medications: string | null;
  doctor_name: string | null;
  doctor_phone: string | null;
  foods_like: string | null;
  foods_avoid: string | null;
  diet: string | null;
  likes: string | null;
  comfort_item: string | null;
  nap_routine: string | null;
  toilet: string | null;
  home_language: string | null;
  soothes: string | null;
  fears: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  pickup_people: string | null;
  photo_ok: boolean | number | string | null;
  sunscreen_ok: boolean | number | string | null;
  notes: string | null;
};

function flag(v: boolean | number | string | null | undefined) {
  if (v === true || v === 1 || v === "t" || v === "true") return true;
  return false;
}

function text(v: string | null | undefined) {
  return (v ?? "").trim();
}

export function emptyChild(): Omit<Child, "id"> {
  return {
    name: "",
    preferredName: "",
    birthdate: "",
    allergies: "",
    epiPen: false,
    medicalNotes: "",
    medications: "",
    doctorName: "",
    doctorPhone: "",
    foodsLike: "",
    foodsAvoid: "",
    diet: "",
    likes: "",
    comfortItem: "",
    napRoutine: "",
    toilet: "",
    homeLanguage: "",
    soothes: "",
    fears: "",
    emergencyName: "",
    emergencyPhone: "",
    pickupPeople: "",
    photoOk: false,
    sunscreenOk: true,
    notes: "",
  };
}

export function mapChild(row: ChildRow): Child {
  return {
    id: row.id,
    name: row.name,
    preferredName: text(row.preferred_name),
    birthdate: row.birthdate,
    allergies: text(row.allergies),
    epiPen: flag(row.epi_pen),
    medicalNotes: text(row.medical_notes),
    medications: text(row.medications),
    doctorName: text(row.doctor_name),
    doctorPhone: text(row.doctor_phone),
    foodsLike: text(row.foods_like),
    foodsAvoid: text(row.foods_avoid),
    diet: text(row.diet),
    likes: text(row.likes),
    comfortItem: text(row.comfort_item),
    napRoutine: text(row.nap_routine),
    toilet: (row.toilet as Child["toilet"]) || "",
    homeLanguage: text(row.home_language),
    soothes: text(row.soothes),
    fears: text(row.fears),
    emergencyName: text(row.emergency_name),
    emergencyPhone: text(row.emergency_phone),
    pickupPeople: text(row.pickup_people),
    photoOk: flag(row.photo_ok),
    sunscreenOk: row.sunscreen_ok == null ? true : flag(row.sunscreen_ok),
    notes: text(row.notes),
  };
}

export function hasCareDetails(child: Pick<Child, "allergies" | "likes" | "foodsLike" | "emergencyName" | "medicalNotes">) {
  return Boolean(child.allergies || child.likes || child.foodsLike || child.emergencyName || child.medicalNotes);
}