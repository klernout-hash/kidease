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
