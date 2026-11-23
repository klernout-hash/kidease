/** Integer cents. Payroll never does money math in floating dollars at the boundary. */

export function cents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function dollars(cents: number): number {
  return cents / 100;
}

/** Round a dollar amount to the nearest cent, half away from zero via Math.round. */
export function roundDollars(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function formatCad(cents: number, locale: "en" | "fr"): string {
  const value = dollars(cents);
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(value);
}

export function sameCents(a: number, b: number): boolean {
  return Math.round(a) === Math.round(b);
}
