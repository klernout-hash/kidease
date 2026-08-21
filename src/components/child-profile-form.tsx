import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { emptyChild } from "@/lib/child-profile";
import { addChild, updateChild } from "@/lib/server/family";
import { useCopy } from "@/lib/use-copy";
import type { Child } from "@/lib/types";

type Draft = Omit<Child, "id"> & { id?: string };

export function ChildProfileForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Child | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const { t } = useCopy();
  const [draft, setDraft] = useState<Draft>(initial ?? emptyChild());
  const [busy, setBusy] = useState(false);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.name.trim() || !draft.birthdate) return;
    setBusy(true);
    try {
      if (draft.id) await updateChild({ data: { ...(draft as Child), id: draft.id } });
      else await addChild({ data: draft });
      toast.success(t("profileSaved"));
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("profileSaved"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Section title={t("childIdentity")}>
        <Field label={t("childFullName")}>
          <input
            required
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            className="h-11 w-full rounded-md border border-border bg-bg px-3"
            autoComplete="name"
          />
        </Field>
        <Field label={t("preferredName")}>
          <input
            value={draft.preferredName}
            onChange={(e) => set("preferredName", e.target.value)}
            className="h-11 w-full rounded-md border border-border bg-bg px-3"
          />
        </Field>
        <Field label={t("birthdate")}>
          <input
            required
            type="date"
            value={draft.birthdate}
            onChange={(e) => set("birthdate", e.target.value)}
            className="h-11 w-full rounded-md border border-border bg-bg px-3"
          />
        </Field>
        <Field label={t("homeLanguage")}>
          <input
            value={draft.homeLanguage}
            onChange={(e) => set("homeLanguage", e.target.value)}
            placeholder={t("homeLanguagePh")}
            className="h-11 w-full rounded-md border border-border bg-bg px-3"
          />
        </Field>
      </Section>

      <Section title={t("childHealth")} warn>
        <Field label={t("allergies")}>
          <textarea
            value={draft.allergies}
            onChange={(e) => set("allergies", e.target.value)}
            placeholder={t("allergiesPh")}
            rows={2}
            className="w-full rounded-md border border-border bg-bg px-3 py-2"
          />
        </Field>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={draft.epiPen}
            onChange={(e) => set("epiPen", e.target.checked)}
            className="size-5 accent-primary"
          />
          {t("epiPen")}
        </label>
        <Field label={t("medicalNotes")}>
          <textarea
            value={draft.medicalNotes}
            onChange={(e) => set("medicalNotes", e.target.value)}
            rows={2}
            className="w-full rounded-md border border-border bg-bg px-3 py-2"
          />
        </Field>
        <Field label={t("medications")}>
          <textarea
            value={draft.medications}
            onChange={(e) => set("medications", e.target.value)}
            rows={2}
            className="w-full rounded-md border border-border bg-bg px-3 py-2"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("doctorName")}>
            <input
              value={draft.doctorName}
              onChange={(e) => set("doctorName", e.target.value)}
              className="h-11 w-full rounded-md border border-border bg-bg px-3"
            />
          </Field>
          <Field label={t("doctorPhone")}>
            <input
              type="tel"
              value={draft.doctorPhone}
              onChange={(e) => set("doctorPhone", e.target.value)}
              className="h-11 w-full rounded-md border border-border bg-bg px-3"
            />
          </Field>
        </div>
      </Section>

      <Section title={t("childFood")}>
        <Field label={t("foodsLike")}>
          <textarea
            value={draft.foodsLike}
            onChange={(e) => set("foodsLike", e.target.value)}
            placeholder={t("foodsLikePh")}
            rows={2}
            className="w-full rounded-md border border-border bg-bg px-3 py-2"
          />
        </Field>
        <Field label={t("foodsAvoid")}>
          <textarea
            value={draft.foodsAvoid}
            onChange={(e) => set("foodsAvoid", e.target.value)}
            placeholder={t("foodsAvoidPh")}
            rows={2}
            className="w-full rounded-md border border-border bg-bg px-3 py-2"
          />
        </Field>
        <Field label={t("diet")}>
          <input
            value={draft.diet}
            onChange={(e) => set("diet", e.target.value)}
            placeholder={t("dietPh")}
            className="h-11 w-full rounded-md border border-border bg-bg px-3"
          />
        </Field>
      </Section>

      <Section title={t("childComfort")}>
        <Field label={t("likes")}>
          <textarea
            value={draft.likes}
            onChange={(e) => set("likes", e.target.value)}
            placeholder={t("likesPh")}
            rows={2}
            className="w-full rounded-md border border-border bg-bg px-3 py-2"
          />
        </Field>
        <Field label={t("comfortItem")}>
          <input
            value={draft.comfortItem}
            onChange={(e) => set("comfortItem", e.target.value)}
            placeholder={t("comfortItemPh")}
            className="h-11 w-full rounded-md border border-border bg-bg px-3"
          />
        </Field>
        <Field label={t("napRoutine")}>
          <textarea
            value={draft.napRoutine}
            onChange={(e) => set("napRoutine", e.target.value)}
            placeholder={t("napRoutinePh")}
            rows={2}
            className="w-full rounded-md border border-border bg-bg px-3 py-2"
          />
        </Field>
        <Field label={t("toilet")}>
          <select
            value={draft.toilet}
            onChange={(e) => set("toilet", e.target.value as Draft["toilet"])}
            className="h-11 w-full rounded-md border border-border bg-bg px-3"
          >
            <option value="">{t("toiletUnknown")}</option>
            <option value="diapers">{t("toiletDiapers")}</option>
            <option value="training">{t("toiletTraining")}</option>
            <option value="independent">{t("toiletIndependent")}</option>
          </select>
        </Field>
        <Field label={t("soothes")}>
          <input
            value={draft.soothes}
            onChange={(e) => set("soothes", e.target.value)}
            placeholder={t("soothesPh")}
            className="h-11 w-full rounded-md border border-border bg-bg px-3"
          />
        </Field>
        <Field label={t("fears")}>
          <input
            value={draft.fears}
            onChange={(e) => set("fears", e.target.value)}
            placeholder={t("fearsPh")}
            className="h-11 w-full rounded-md border border-border bg-bg px-3"
          />
        </Field>
      </Section>

      <Section title={t("childPickup")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("emergencyName")}>
            <input
              value={draft.emergencyName}
              onChange={(e) => set("emergencyName", e.target.value)}
              className="h-11 w-full rounded-md border border-border bg-bg px-3"
            />
          </Field>
          <Field label={t("emergencyPhone")}>
            <input
              type="tel"
              value={draft.emergencyPhone}
              onChange={(e) => set("emergencyPhone", e.target.value)}
              className="h-11 w-full rounded-md border border-border bg-bg px-3"
            />
          </Field>
        </div>
        <Field label={t("pickupPeople")}>
          <textarea
            value={draft.pickupPeople}
            onChange={(e) => set("pickupPeople", e.target.value)}
            placeholder={t("pickupPeoplePh")}
            rows={2}
            className="w-full rounded-md border border-border bg-bg px-3 py-2"
          />
        </Field>
      </Section>

      <Section title={t("childPerms")}>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={draft.photoOk}
            onChange={(e) => set("photoOk", e.target.checked)}
            className="size-5 accent-primary"
          />
          {t("photoOk")}
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={draft.sunscreenOk}
            onChange={(e) => set("sunscreenOk", e.target.checked)}
            className="size-5 accent-primary"
          />
          {t("sunscreenOk")}
        </label>
        <Field label={t("extraNotes")}>
          <textarea
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={3}
            className="w-full rounded-md border border-border bg-bg px-3 py-2"
          />
        </Field>
      </Section>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {t("saveProfile")}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("cancel")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function Section({ title, children, warn }: { title: string; children: ReactNode; warn?: boolean }) {
  return (
    <fieldset className={`space-y-3 rounded-xl p-4 ring-1 ${warn ? "bg-danger/5 ring-danger/20" : "bg-surface ring-border"}`}>
      <legend className="px-1 font-display text-lg">{title}</legend>
      {children}
    </fieldset>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
