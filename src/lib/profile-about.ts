export type ProfileAbout = {
  work: string;
  education: string;
  pets: string;
  languages: string;
  interests: string;
  region: string;
};

const EMPTY: ProfileAbout = {
  work: "",
  education: "",
  pets: "",
  languages: "",
  interests: "",
  region: "",
};

function line(value: unknown) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/** Drop anything the person did not type. A client cannot mark themselves verified. */
export function cleanProfileAbout(input: unknown): ProfileAbout {
  const row = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    work: line(row.work),
    education: line(row.education),
    pets: line(row.pets),
    languages: line(row.languages),
    interests: line(row.interests),
    region: line(row.region),
  };
}

export function emptyProfileAbout(): ProfileAbout {
  return { ...EMPTY };
}
