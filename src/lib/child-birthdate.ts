/** Child birthdate rules. Age 18 is allowed. Future dates and ages over 18 are not. */

export function childBirthdateProblem(value: string, now = new Date()): "missing" | "invalid" | "future" | "too_old" | null {
  const raw = value.trim().slice(0, 10);
  if (!raw) return "missing";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "invalid";
  const [year, month, day] = raw.split("-").map(Number);
  const born = new Date(year, month - 1, day);
  if (born.getFullYear() !== year || born.getMonth() !== month - 1 || born.getDate() !== day) return "invalid";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (born.getTime() > today.getTime()) return "future";
  let age = today.getFullYear() - born.getFullYear();
  const monthDelta = today.getMonth() - born.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < born.getDate())) age -= 1;
  if (age < 0) return "future";
  if (age > 18) return "too_old";
  return null;
}

export function childBirthdateMessage(problem: ReturnType<typeof childBirthdateProblem>, french = false): string {
  if (problem === "future") {
    return french ? "La date de naissance ne peut pas être dans le futur." : "Birthdate cannot be in the future.";
  }
  if (problem === "too_old") {
    return french ? "L’enfant doit avoir 18 ans ou moins." : "Child must be 18 or younger.";
  }
  if (problem === "missing") {
    return french ? "Entrez la date de naissance." : "Enter a birthdate.";
  }
  if (problem === "invalid") {
    return french ? "Entrez une vraie date de naissance." : "Enter a real birthdate.";
  }
  return "";
}
