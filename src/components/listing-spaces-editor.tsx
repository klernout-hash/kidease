import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { BuildingPhoto } from "@/components/building-photo";
import {
  deleteListingSpaceFn,
  listListingSpaces,
  saveListingPhotoListFn,
  saveListingSpaceFn,
  setListingSpacePhotosFn,
} from "@/lib/server/listing-spaces";
import {
  PHOTO_DELETE_CONFIRM,
  SPACE_DELETE_CONFIRM,
  LISTING_SPACE_TYPES,
  spaceTypeLabel,
  type ListingSpace,
  type SpaceGroup,
} from "@/lib/listing-spaces";
import { DaycareFacilitiesPicker } from "@/components/daycare-facilities-picker";
import { facilityById } from "@/lib/daycare-facilities";
import { MAX_LISTING_PHOTOS } from "@/lib/listing-photo";
import { LISTING_PHOTO_ACCEPT, downgradeListingPhotoFile, listingPhotoByteBudget } from "@/lib/listing-photo-downgrade";
import { useCopy } from "@/lib/use-copy";
import type { Daycare } from "@/lib/types";

function copyFor(locale: string) {
  const fr = locale === "fr";
  return {
    rooms: fr ? "Pièces et espaces" : "Rooms and spaces",
    roomsLead: fr
      ? "Groupez les photos du centre. Supprimer une pièce ne supprime pas les photos."
      : "Group this centre's photos. Deleting a room does not delete the photos.",
    allPhotos: fr ? "Toutes les photos" : "All photos",
    addSpace: fr ? "Ajouter une pièce ou un espace" : "Add a room or space",
    spaceName: fr ? "Nom de la pièce" : "Room name",
    spaceType: fr ? "Type d'espace" : "Space type",
    saveSpace: fr ? "Enregistrer la pièce" : "Save room",
    cancel: fr ? "Annuler" : "Cancel",
    amenities: fr ? "Atouts" : "Amenities",
    access: fr ? "Accessibilité" : "Accessibility features",
    accessLead: fr
      ? "Ce que le centre dit de cet espace. Ce n'est pas une certification."
      : "What the centre says about this space. This is not a certification.",
    deleteSpace: fr ? "Supprimer la pièce ou l'espace" : "Delete room or space",
    deleteSpaceLead: fr
      ? "Les photos restent sur la fiche et passent dans Non assignées."
      : "The photos stay on the listing and move to Unassigned.",
    deleteSpaceConfirm: fr ? "Supprimer la pièce" : "Delete room",
    unassigned: fr ? "Non assignées" : "Unassigned",
    manage: fr ? "Gérer les photos" : "Manage photos",
    done: fr ? "Terminé" : "Done",
    addPhoto: fr ? "Ajouter une photo" : "Add a photo",
    child: fr ? "Photo du centre seulement. Pas de photo d'enfant." : "Centre photo only. Do not add a photo of a child.",
    moveUnassigned: fr ? "Mettre dans Non assignées" : "Move to unassigned",
    removePhoto: fr ? "Retirer la photo de la fiche" : "Remove photo from the listing",
    removePhotoLead: fr
      ? "Cette photo quitte la fiche. Ce n'est pas seulement un changement de pièce."
      : "This photo leaves the listing. This is not only a room change.",
    removePhotoConfirm: fr ? "Retirer la photo" : "Remove photo",
    empty: fr ? "Aucune pièce pour l'instant." : "No rooms yet.",
    photoCount: (n: number) => (fr ? `${n} photo${n === 1 ? "" : "s"}` : `${n} photo${n === 1 ? "" : "s"}`),
    earlier: fr ? "Plus tôt" : "Earlier",
    later: fr ? "Plus tard" : "Later",
    cover: fr ? "Couverture" : "Cover",
    inside: fr ? "À l'intérieur du centre" : "Inside the centre",
    makeCover: fr ? "Mettre en couverture" : "Make cover",
    close: fr ? "Fermer" : "Close",
    savedError: fr ? "Enregistrement impossible. Réessayez." : "Could not save. Try again.",
  };
}

export function ListingSpacesEditor({ daycare, onChanged }: { daycare: Daycare; onChanged: () => void }) {
  const { locale } = useCopy();
  const copy = copyFor(locale);
  const [group, setGroup] = useState<SpaceGroup | null>(null);
  const [view, setView] = useState<"grid" | "all" | "room">("grid");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [spaceType, setSpaceType] = useState<(typeof LISTING_SPACE_TYPES)[number]>("play");
  const [manage, setManage] = useState(false);
  const [confirmSpace, setConfirmSpace] = useState(false);
  const [confirmPhoto, setConfirmPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    void listListingSpaces({ data: { daycareId: daycare.id } })
      .then((next) => {
        if (live) setGroup(next);
      })
      .catch(() => {
        if (live) setError(copy.savedError);
      });
    return () => {
      live = false;
    };
  }, [daycare.id, daycare.photos, copy.savedError]);

  const room = group?.spaces.find((row) => row.id === roomId) ?? null;

  async function run(task: () => Promise<SpaceGroup>) {
    setBusy(true);
    setError(null);
    try {
      const next = await task();
      setGroup(next);
      onChanged();
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.savedError);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createSpace() {
    const next = await run(() =>
      saveListingSpaceFn({
        data: { daycareId: daycare.id, name, spaceType, amenities: [], accessibility: [] },
      }),
    );
    if (!next) return;
    const previous = new Set((group?.spaces ?? []).map((row) => row.id));
    const created = next.spaces.find((row) => !previous.has(row.id));
    setCreating(false);
    setName("");
    if (created) {
      setRoomId(created.id);
      setView("room");
    }
  }

  async function patchRoom(next: Partial<Pick<ListingSpace, "name" | "spaceType" | "amenities" | "accessibility">>) {
    if (!room) return;
    await run(() =>
      saveListingSpaceFn({
        data: {
          daycareId: daycare.id,
          id: room.id,
          name: next.name ?? room.name,
          spaceType: next.spaceType ?? room.spaceType,
          amenities: next.amenities ?? room.amenities,
          accessibility: next.accessibility ?? room.accessibility,
        },
      }),
    );
  }

  async function orderRoom(photos: string[]) {
    if (!room) return;
    await run(() => setListingSpacePhotosFn({ data: { daycareId: daycare.id, spaceId: room.id, photoSrcs: photos } }));
  }

  async function addFiles(files: File[]) {
    if (!group || !files.length) return;
    const roomLeft = MAX_LISTING_PHOTOS - group.photos.length;
    if (roomLeft <= 0) {
      setError(copy.savedError);
      return;
    }
    const take = files.slice(0, roomLeft);
    let photos = group.photos.slice();
    for (const file of take) {
      const dataUrl = await downgradeListingPhotoFile(file, { targetBytes: listingPhotoByteBudget(MAX_LISTING_PHOTOS) });
      photos = [...photos, dataUrl];
    }
    const saved = await run(() => saveListingPhotoListFn({ data: { daycareId: daycare.id, photos } }));
    if (!saved || !room) return;
    const added = saved.photos.filter((src) => !group.photos.includes(src));
    if (added.length) await orderRoom([...room.photos, ...added]);
  }

  if (!group) {
    return (
      <p className="text-sm text-muted" role="status">
        {error ?? (locale === "fr" ? "Chargement des photos…" : "Loading photos…")}
      </p>
    );
  }

  return (
    <div data-ke="listing-spaces" className="space-y-4">
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {view === "grid" ? (
        <SpacesGrid
          group={group}
          copy={copy}
          locale={locale}
          creating={creating}
          name={name}
          spaceType={spaceType}
          busy={busy}
          onName={setName}
          onType={setSpaceType}
          onOpenCreate={() => setCreating(true)}
          onCancelCreate={() => setCreating(false)}
          onCreate={() => void createSpace()}
          onAll={() => setView("all")}
          onOpen={(id) => {
            setRoomId(id);
            setManage(false);
            setView("room");
          }}
        />
      ) : null}
      {view === "all" ? (
        <AllPhotos
          group={group}
          copy={copy}
          locale={locale}
          confirmPhoto={confirmPhoto}
          busy={busy}
          onBack={() => setView("grid")}
          onAskRemove={setConfirmPhoto}
          onCancelRemove={() => setConfirmPhoto(null)}
          onRemove={(src) =>
            void run(() =>
              saveListingPhotoListFn({
                data: {
                  daycareId: daycare.id,
                  photos: group.photos.filter((photo) => photo !== src),
                  confirmRemoval: true,
                },
              }),
            ).then(() => setConfirmPhoto(null))
          }
          onOrder={(photos) => void run(() => saveListingPhotoListFn({ data: { daycareId: daycare.id, photos } }))}
        />
      ) : null}
      {view === "room" && room ? (
        <RoomDetail
          room={room}
          group={group}
          copy={copy}
          locale={locale}
          manage={manage}
          confirmSpace={confirmSpace}
          confirmPhoto={confirmPhoto}
          busy={busy}
          fileRef={fileRef}
          onBack={() => {
            setView("grid");
            setConfirmSpace(false);
            setConfirmPhoto(null);
          }}
          onManage={() => setManage((value) => !value)}
          onRename={(value) => void patchRoom({ name: value })}
          onType={(value) => void patchRoom({ spaceType: value })}
          onToggleAmenity={(key) =>
            void patchRoom({
              amenities: room.amenities.includes(key) ? room.amenities.filter((item) => item !== key) : [...room.amenities, key],
            })
          }
          onToggleAccess={(key) =>
            void patchRoom({
              accessibility: room.accessibility.includes(key)
                ? room.accessibility.filter((item) => item !== key)
                : [...room.accessibility, key],
            })
          }
          onOrder={(photos) => void orderRoom(photos)}
          onAskRemove={setConfirmPhoto}
          onCancelRemove={() => setConfirmPhoto(null)}
          onRemove={(src) =>
            void run(() =>
              saveListingPhotoListFn({
                data: {
                  daycareId: daycare.id,
                  photos: group.photos.filter((photo) => photo !== src),
                  confirmRemoval: true,
                },
              }),
            ).then(() => setConfirmPhoto(null))
          }
          onAskDelete={() => setConfirmSpace(true)}
          onCancelDelete={() => setConfirmSpace(false)}
          onDelete={() =>
            void run(() => deleteListingSpaceFn({ data: { daycareId: daycare.id, spaceId: room.id, confirm: true } })).then((next) => {
              if (next) setView("grid");
              setConfirmSpace(false);
            })
          }
        />
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept={LISTING_PHOTO_ACCEPT}
        className="sr-only"
        data-ke="space-photo-input"
        onChange={(event) => {
          const files = event.target.files ? Array.from(event.target.files) : [];
          event.target.value = "";
          void addFiles(files);
        }}
      />
    </div>
  );
}

function SpacesGrid({
  group,
  copy,
  locale,
  creating,
  name,
  spaceType,
  busy,
  onName,
  onType,
  onOpenCreate,
  onCancelCreate,
  onCreate,
  onAll,
  onOpen,
}: {
  group: SpaceGroup;
  copy: ReturnType<typeof copyFor>;
  locale: string;
  creating: boolean;
  name: string;
  spaceType: (typeof LISTING_SPACE_TYPES)[number];
  busy: boolean;
  onName: (value: string) => void;
  onType: (value: (typeof LISTING_SPACE_TYPES)[number]) => void;
  onOpenCreate: () => void;
  onCancelCreate: () => void;
  onCreate: () => void;
  onAll: () => void;
  onOpen: (id: string) => void;
}) {
  const nameId = useId();
  return (
    <section aria-label={copy.rooms}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-2xl font-bold">{copy.rooms}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-ke="space-all-photos"
            onClick={onAll}
          >
            {copy.allPhotos}
          </button>
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-full bg-surface shadow-card ring-1 ring-border touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={copy.addSpace}
            data-ke="space-add"
            onClick={onOpenCreate}
          >
            <Plus className="size-5" aria-hidden />
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted">{copy.roomsLead}</p>
      {creating ? (
        <div className="mt-4 space-y-3 rounded-2xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="space-create">
          <label className="block text-sm font-medium" htmlFor={nameId}>
            {copy.spaceName}
            <input
              id={nameId}
              value={name}
              onChange={(event) => onName(event.target.value)}
              onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-bg px-3 text-base"
            />
          </label>
          <label className="block text-sm font-medium">
            {copy.spaceType}
            <select
              value={spaceType}
              data-ke="space-type"
              onChange={(event) => onType(event.target.value as (typeof LISTING_SPACE_TYPES)[number])}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-bg px-3"
            >
              {LISTING_SPACE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {spaceTypeLabel(type, locale)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={busy || !name.trim()}
              onClick={onCreate}
            >
              {copy.saveSpace}
            </button>
            <button type="button" className="inline-flex min-h-11 items-center px-3 text-sm font-medium" onClick={onCancelCreate}>
              {copy.cancel}
            </button>
          </div>
        </div>
      ) : null}
      {group.spaces.length ? (
        <ul className="mt-4 grid grid-cols-2 gap-3">
          {group.spaces.map((space) => (
            <li key={space.id}>
              <button
                type="button"
                data-ke="space-card"
                data-space={space.id}
                className="w-full text-left touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onOpen(space.id)}
              >
                <span className="relative block overflow-hidden rounded-2xl bg-surface-2">
                  {space.photos[0] ? (
                    <BuildingPhoto src={space.photos[0]} alt="" className="aspect-[4/3] w-full object-cover" width={480} height={360} />
                  ) : (
                    <span className="grid aspect-[4/3] place-items-center px-2 text-center text-xs text-muted">{copy.photoCount(0)}</span>
                  )}
                  <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[12px] font-medium text-white">
                    {copy.photoCount(space.photos.length)}
                  </span>
                </span>
                <span className="mt-2 block truncate text-[15px] font-semibold">{space.name}</span>
                <span className="block truncate text-sm text-muted">{spaceTypeLabel(space.spaceType, locale)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted" data-ke="space-empty">
          {copy.empty}
        </p>
      )}
      {group.unassigned.length ? (
        <p className="mt-3 text-sm text-muted" data-ke="space-unassigned-count">
          {copy.unassigned}: {copy.photoCount(group.unassigned.length)}
        </p>
      ) : null}
    </section>
  );
}

function RoomDetail({
  room,
  group,
  copy,
  locale,
  manage,
  confirmSpace,
  confirmPhoto,
  busy,
  fileRef,
  onBack,
  onManage,
  onRename,
  onType,
  onToggleAmenity,
  onToggleAccess,
  onOrder,
  onAskRemove,
  onCancelRemove,
  onRemove,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  room: ListingSpace;
  group: SpaceGroup;
  copy: ReturnType<typeof copyFor>;
  locale: string;
  manage: boolean;
  confirmSpace: boolean;
  confirmPhoto: string | null;
  busy: boolean;
  fileRef: RefObject<HTMLInputElement | null>;
  onBack: () => void;
  onManage: () => void;
  onRename: (value: string) => void;
  onType: (value: ListingSpace["spaceType"]) => void;
  onToggleAmenity: (key: string) => void;
  onToggleAccess: (key: string) => void;
  onOrder: (photos: string[]) => void;
  onAskRemove: (src: string) => void;
  onCancelRemove: () => void;
  onRemove: (src: string) => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const nameId = useId();
  const [draft, setDraft] = useState(room.name);
  useEffect(() => setDraft(room.name), [room.name]);
  const unassigned = group.unassigned.filter((src) => src !== group.cover || room.photos.includes(group.cover));
  return (
    <section data-ke="space-detail" data-space={room.id} aria-label={room.name}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium" onClick={onBack}>
          <ChevronLeft className="size-5" aria-hidden />
          {copy.cancel}
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold"
            data-ke="space-manage"
            aria-pressed={manage}
            onClick={onManage}
          >
            {manage ? copy.done : copy.manage}
          </button>
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-full bg-surface shadow-card ring-1 ring-border"
            aria-label={copy.addPhoto}
            data-ke="space-photo-add"
            onClick={() => fileRef.current?.click()}
          >
            <Plus className="size-5" aria-hidden />
          </button>
        </div>
      </div>
      <label className="mt-3 block text-sm font-medium" htmlFor={nameId}>
        {copy.spaceName}
        <input
          id={nameId}
          data-ke="space-name"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft.trim() && draft.trim() !== room.name) onRename(draft.trim());
          }}
          onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
          className="mt-1 h-11 w-full rounded-xl border border-border bg-bg px-3 text-base font-semibold"
        />
      </label>
      <label className="mt-3 block text-sm font-medium">
        {copy.spaceType}
        <select
          data-ke="space-type"
          value={room.spaceType}
          onChange={(event) => onType(event.target.value as ListingSpace["spaceType"])}
          className="mt-1 h-11 w-full rounded-xl border border-border bg-bg px-3"
        >
          {LISTING_SPACE_TYPES.map((type) => (
            <option key={type} value={type}>
              {spaceTypeLabel(type, locale)}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-2 text-sm text-muted">{copy.child}</p>
      <ul className="mt-3 grid grid-cols-2 gap-2">
        {room.photos.map((src, index) => (
          <li key={src} data-ke="space-photo" className="rounded-xl bg-surface p-2 ring-1 ring-border">
            <BuildingPhoto src={src} alt={`${room.name} ${index + 1}`} className="aspect-[4/3] w-full rounded-lg object-cover" width={480} height={360} />
            {manage ? (
              <div className="mt-2 flex flex-wrap gap-1">
                <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center" aria-label={copy.earlier} disabled={index === 0} onClick={() => onOrder(swap(room.photos, index, -1))}>
                  <ChevronLeft className="size-4" aria-hidden />
                </button>
                <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center" aria-label={copy.later} disabled={index === room.photos.length - 1} onClick={() => onOrder(swap(room.photos, index, 1))}>
                  <ChevronRight className="size-4" aria-hidden />
                </button>
                <button type="button" className="inline-flex min-h-11 items-center px-2 text-xs font-medium" onClick={() => onOrder(room.photos.filter((photo) => photo !== src))}>
                  {copy.moveUnassigned}
                </button>
                <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center" aria-label={copy.removePhoto} data-ke="space-photo-remove" onClick={() => onAskRemove(src)}>
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {unassigned.filter((src) => !room.photos.includes(src)).length ? (
        <div className="mt-3" data-ke="space-unassigned">
          <h3 className="text-sm font-semibold">{copy.unassigned}</h3>
          <ul className="mt-2 flex gap-2 overflow-x-auto">
            {unassigned
              .filter((src) => !room.photos.includes(src))
              .map((src) => (
                <li key={src}>
                  <button type="button" className="w-24 text-left" aria-label={copy.addPhoto} onClick={() => onOrder([...room.photos, src])}>
                    <BuildingPhoto src={src} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" width={160} height={120} />
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-5" data-ke="space-amenities">
        <DaycareFacilitiesPicker
          scope="room"
          locale={locale}
          selected={[...room.amenities, ...room.accessibility]}
          onToggle={(id, next) => {
            const access = facilityById(id)?.category === "access";
            const current = access ? room.accessibility.includes(id) : room.amenities.includes(id);
            if (current === next) return;
            if (access) onToggleAccess(id);
            else onToggleAmenity(id);
          }}
        />
        <p className="text-sm text-muted" data-ke="space-access">
          {copy.accessLead}
        </p>
      </div>
      <button
        type="button"
        className="mt-8 inline-flex min-h-11 items-center text-sm font-semibold text-danger"
        data-ke="space-delete"
        onClick={onAskDelete}
      >
        {copy.deleteSpace}
      </button>
      {confirmSpace ? (
        <ConfirmDialog
          title={copy.deleteSpace}
          body={copy.deleteSpaceLead}
          confirmLabel={copy.deleteSpaceConfirm}
          cancelLabel={copy.cancel}
          marker="space-delete-confirm"
          busy={busy}
          onCancel={onCancelDelete}
          onConfirm={onDelete}
        />
      ) : null}
      {confirmPhoto ? (
        <ConfirmDialog
          title={copy.removePhoto}
          body={copy.removePhotoLead}
          confirmLabel={copy.removePhotoConfirm}
          cancelLabel={copy.cancel}
          marker="photo-delete-confirm"
          busy={busy}
          onCancel={onCancelRemove}
          onConfirm={() => onRemove(confirmPhoto)}
        />
      ) : null}
      <span className="sr-only">{SPACE_DELETE_CONFIRM} {PHOTO_DELETE_CONFIRM}</span>
    </section>
  );
}

function AllPhotos({
  group,
  copy,
  locale,
  confirmPhoto,
  busy,
  onBack,
  onAskRemove,
  onCancelRemove,
  onRemove,
  onOrder,
}: {
  group: SpaceGroup;
  copy: ReturnType<typeof copyFor>;
  locale: string;
  confirmPhoto: string | null;
  busy: boolean;
  onBack: () => void;
  onAskRemove: (src: string) => void;
  onCancelRemove: () => void;
  onRemove: (src: string) => void;
  onOrder: (photos: string[]) => void;
}) {
  return (
    <section data-ke="space-all" aria-label={copy.allPhotos}>
      <button type="button" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium" onClick={onBack}>
        <ChevronLeft className="size-5" aria-hidden />
        {copy.rooms}
      </button>
      <h2 className="mt-2 font-display text-2xl font-bold">{copy.allPhotos}</h2>
      <p className="text-sm text-muted">{copy.photoCount(group.photos.length)} / {MAX_LISTING_PHOTOS}</p>
      <p className="mt-1 text-sm text-muted">{copy.child}</p>
      <div className="mt-3 grid grid-cols-2 gap-2" data-ke="photo-groups">
        {group.photos.map((src, index) => (
          <div key={src} data-ke="listing-photo-card" data-photo-group={index === 0 ? "cover" : "inside"} className="rounded-xl bg-surface p-2 ring-1 ring-border">
            {index === 0 ? <h3 className="mb-1 text-sm font-semibold">{copy.cover}</h3> : null}
            {index === 1 ? <h3 className="mb-1 text-sm font-semibold">{copy.inside}</h3> : null}
            <BuildingPhoto src={src} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" width={480} height={360} />
            <div className="mt-2 flex flex-wrap gap-1">
              <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center" aria-label={copy.earlier} disabled={index === 0} onClick={() => onOrder(swap(group.photos, index, -1))}>
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center" aria-label={copy.later} disabled={index === group.photos.length - 1} onClick={() => onOrder(swap(group.photos, index, 1))}>
                <ChevronRight className="size-4" aria-hidden />
              </button>
              {index > 0 ? (
                <button type="button" className="inline-flex min-h-11 items-center px-2 text-xs font-medium" onClick={() => onOrder([src, ...group.photos.filter((photo) => photo !== src)])}>
                  {copy.makeCover}
                </button>
              ) : null}
              <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center" aria-label={copy.removePhoto} data-ke="listing-photo-delete" onClick={() => onAskRemove(src)}>
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        ))}
      </div>
      {confirmPhoto ? (
        <ConfirmDialog
          title={copy.removePhoto}
          body={copy.removePhotoLead}
          confirmLabel={copy.removePhotoConfirm}
          cancelLabel={copy.cancel}
          marker="photo-delete-confirm"
          busy={busy}
          onCancel={onCancelRemove}
          onConfirm={() => onRemove(confirmPhoto)}
        />
      ) : null}
      <span className="sr-only">{locale}</span>
    </section>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  marker,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  marker: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    root?.querySelector<HTMLElement>("button")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="presentation">
      <button type="button" className="absolute inset-0 bg-fg/40" aria-label={cancelLabel} onClick={onCancel} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-ke={marker}
        className="relative z-10 w-full max-w-md rounded-t-2xl bg-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-card ring-1 ring-border sm:rounded-2xl"
      >
        <h2 id={titleId} className="font-display text-xl font-bold">
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted">{body}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-full bg-[var(--color-danger)] px-4 text-sm font-semibold text-white"
            data-ke={`${marker}-yes`}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          <button type="button" className="inline-flex min-h-11 items-center px-3 text-sm font-medium" data-ke={`${marker}-no`} onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function swap(list: string[], index: number, dir: -1 | 1): string[] {
  const next = list.slice();
  const target = index + dir;
  if (target < 0 || target >= next.length) return next;
  const current = next[index];
  next[index] = next[target] ?? current;
  next[target] = current;
  return next;
}
