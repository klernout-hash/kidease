/** F4: /report checks its own fields so French visitors never see English browser tooltips. */
export type ReportField = "name" | "email" | "body";
export type ReportFieldError = "reportNameRequired" | "reportEmailInvalid" | "reportMessageRequired";

export function reportFormErrors(input: { name: string; email: string; body: string }): Partial<Record<ReportField, ReportFieldError>> {
  const errors: Partial<Record<ReportField, ReportFieldError>> = {};
  if (!input.name.trim()) errors.name = "reportNameRequired";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) errors.email = "reportEmailInvalid";
  if (!input.body.trim()) errors.body = "reportMessageRequired";
  return errors;
}
