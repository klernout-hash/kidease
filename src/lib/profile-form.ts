/** Move to the first field this save marked invalid. */
export function focusFirstInvalid(root: ParentNode | null | undefined) {
  const el = root?.querySelector<HTMLElement>("[aria-invalid='true']");
  if (!el) return;
  el.scrollIntoView({ block: "center" });
  el.focus();
}
