/** Read the live form value. A vault fill can set the field without updating React state. */
export function loginSubmittedText(
  form: { get(name: string): unknown },
  name: string,
  fallback: string,
  trim: boolean,
): string {
  const raw = form.get(name);
  const fromForm = typeof raw === "string" ? raw : "";
  const value = fromForm || fallback || "";
  return trim ? value.trim() : value;
}
