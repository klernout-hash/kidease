import type { PickupContact } from "./desk-features";
import type { Child } from "./types";

export type ChildDraft = Omit<Child, "id"> & { id?: string };

type Snapshot = {
  draft: ChildDraft;
  contacts: readonly PickupContact[];
};

/** Compare in memory only: child health drafts must not be written to browser storage. */
export function childProfileHasChanges(initial: Snapshot, current: Snapshot): boolean {
  const fields = new Set([
    ...Object.keys(initial.draft),
    ...Object.keys(current.draft),
  ]) as Set<keyof ChildDraft>;
  for (const field of fields) {
    if (initial.draft[field] !== current.draft[field]) return true;
  }
  if (initial.contacts.length !== current.contacts.length) return true;
  return initial.contacts.some((person, index) => {
    const other = current.contacts[index];
    return person.name !== other.name || person.phone !== other.phone ||
      person.relationship !== other.relationship || person.note !== other.note ||
      person.restricted !== other.restricted;
  });
}

export function confirmChildProfileDiscard(
  dirty: boolean,
  french: boolean,
  confirm: (message: string) => boolean,
): boolean {
  return !dirty || confirm(
    french
      ? "Quitter sans enregistrer? Les changements non enregistrés seront perdus."
      : "Leave without saving? Unsaved changes will be lost.",
  );
}

/** A completed editor must not be reopened by its old child/focus deep link. */
export function completedChildProfileSearch<T extends Record<string, unknown>>(
  search: T,
): Omit<T, "child" | "focus"> {
  const { child: _child, focus: _focus, ...next } = search;
  return next;
}

const CHILD_PROFILE_FOCUS_FIELDS = new Set([
  "name", "birthdate", "health", "emergency", "pickup", "immunization", "doctor", "address",
]);

/** Router location can advance before the route's validated search props do. */
export function childProfileEntryIntent(
  href: string,
  child: string | null,
  focus: string | null,
): string | null {
  if (!child) return null;
  const search = new URL(href, "http://localhost").searchParams;
  const rawFocus = search.getAll("focus").length === 1 ? search.get("focus") : null;
  const currentFocus = rawFocus && CHILD_PROFILE_FOCUS_FIELDS.has(rawFocus) ? rawFocus : null;
  if (search.getAll("child").length !== 1 || search.get("child") !== child || currentFocus !== focus) return null;
  // Unrelated query changes must not reapply an already consumed editor intent.
  return JSON.stringify([child, focus]);
}
