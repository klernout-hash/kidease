import { SwitchRow } from "@/components/switch-row";
import {
  MEAL_DIETS,
  MEAL_DRINKS,
  MEAL_PRICES,
  MEAL_SLOTS,
  MEAL_SOURCES,
  hasNutFreeLegacy,
  mealHint,
  mealLabel,
  mealOfferingsChanged,
  publicMealSummary,
  type MealOfferings,
  type MealPrice,
  type MealSource,
} from "@/lib/meal-offerings";

export function MealsEditor({
  value,
  saved,
  amenities,
  locale,
  onChange,
}: {
  value: MealOfferings;
  saved: MealOfferings;
  amenities: string;
  locale: string;
  onChange: (next: MealOfferings) => void;
}) {
  const fr = locale === "fr";
  const dirty = mealOfferingsChanged(saved, value);
  function setSlot(id: (typeof MEAL_SLOTS)[number], next: boolean) {
    onChange({ ...value, slots: { ...value.slots, [id]: next } });
  }
  function setDrink(id: (typeof MEAL_DRINKS)[number], next: boolean) {
    onChange({ ...value, drinks: { ...value.drinks, [id]: next } });
  }
  function setDiet(id: (typeof MEAL_DIETS)[number], next: boolean) {
    onChange({ ...value, diets: { ...value.diets, [id]: next } });
  }
  return (
    <section data-ke="editor-meals" className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-bold">{fr ? "Repas" : "Meals"}</h2>
        <p className="mt-1 text-sm text-muted">
          {fr
            ? "Activez seulement ce que le centre offre. Rien n'est présumé. Les changements restent ici jusqu'à Enregistrer."
            : "Turn on only what this centre offers. Nothing is assumed. Changes stay here until you save."}
        </p>
        <p className="mt-1 text-sm text-muted" data-ke="meal-allergy-note">
          {fr
            ? "Les allergies se discutent avec chaque famille. KidEase ne garde pas de dossier médical."
            : "Allergies are discussed with each family. KidEase does not keep a medical record."}
        </p>
      </div>
      {dirty ? (
        <p className="text-sm font-medium" role="status" data-ke="meal-dirty">
          {fr ? "Modifications non enregistrées" : "Unsaved changes"}
        </p>
      ) : null}
      {hasNutFreeLegacy(amenities) ? (
        <p className="rounded-xl bg-surface px-3 py-2 text-sm text-muted ring-1 ring-border" data-ke="meal-nut-legacy">
          {fr
            ? "Une ancienne étiquette disait « sans noix ». Ce n'est pas une garantie. Confirmez les besoins de chaque enfant avec la famille."
            : "An older tag said nut-free. That is not a guarantee. Confirm each child's needs with the family."}
        </p>
      ) : null}
      <div>
        {MEAL_SLOTS.map((id) => (
          <SwitchRow
            key={id}
            id={`meal-slot-${id}`}
            label={mealLabel("slot", id, locale)}
            description={mealHint("slot", id, locale)}
            checked={value.slots[id] === true}
            onCheckedChange={(next) => setSlot(id, next)}
            locale={locale}
          />
        ))}
      </div>
      <div>
        <h3 className="text-base font-semibold">{fr ? "Boissons" : "Drinks"}</h3>
        {MEAL_DRINKS.map((id) => (
          <SwitchRow
            key={id}
            id={`meal-drink-${id}`}
            label={mealLabel("drink", id, locale)}
            description={mealHint("drink", id, locale)}
            checked={value.drinks[id] === true}
            onCheckedChange={(next) => setDrink(id, next)}
            locale={locale}
          />
        ))}
        {value.drinks.milk === true ? (
          <label className="mt-2 block text-sm font-medium">
            {fr ? "Détail sur le lait" : "Milk detail"}
            <input
              data-ke="meal-milk-note"
              value={value.milkNote}
              onChange={(event) => onChange({ ...value, milkNote: event.target.value })}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-bg px-3 text-base"
            />
          </label>
        ) : null}
      </div>
      <fieldset>
        <legend className="text-base font-semibold">{fr ? "Préparation" : "How meals are prepared"}</legend>
        <div className="mt-2 grid gap-2">
          {MEAL_SOURCES.map((id) => (
            <label key={id} className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="radio"
                name="meal-source"
                data-ke="meal-source"
                value={id}
                checked={value.source === id}
                onChange={() => onChange({ ...value, source: id as MealSource })}
              />
              {mealLabel("source", id, locale)}
            </label>
          ))}
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="radio" name="meal-source" checked={value.source == null} onChange={() => onChange({ ...value, source: null })} />
            {fr ? "Pas encore indiqué" : "Not set yet"}
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-base font-semibold">{fr ? "Prix" : "Price"}</legend>
        <div className="mt-2 grid gap-2">
          {MEAL_PRICES.map((id) => (
            <label key={id} className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="radio"
                name="meal-price"
                data-ke="meal-price"
                value={id}
                checked={value.price === id}
                onChange={() => onChange({ ...value, price: id as MealPrice })}
              />
              {mealLabel("price", id, locale)}
            </label>
          ))}
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="radio" name="meal-price" checked={value.price == null} onChange={() => onChange({ ...value, price: null })} />
            {fr ? "Pas encore indiqué" : "Not set yet"}
          </label>
        </div>
      </fieldset>
      <div>
        <h3 className="text-base font-semibold">{fr ? "Accommodements confirmés" : "Confirmed accommodations"}</h3>
        <p className="text-sm text-muted">
          {fr ? "Seulement si le centre l'offre vraiment." : "Only if the centre really offers it."}
        </p>
        {MEAL_DIETS.map((id) => (
          <SwitchRow
            key={id}
            id={`meal-diet-${id}`}
            label={mealLabel("diet", id, locale)}
            checked={value.diets[id] === true}
            onCheckedChange={(next) => setDiet(id, next)}
            locale={locale}
          />
        ))}
        <label className="mt-3 block text-sm font-medium">
          {fr ? "Note sur les régimes" : "Diet note"}
          <textarea
            data-ke="meal-diet-note"
            value={value.dietNote}
            onChange={(event) => onChange({ ...value, dietNote: event.target.value })}
            className="mt-1 min-h-20 w-full rounded-xl border border-border bg-bg px-3 py-2 text-base"
          />
        </label>
      </div>
      <label className="block text-sm font-medium">
        {fr ? "Âges concernés" : "Ages this applies to"}
        <input
          data-ke="meal-ages"
          value={value.agesNote}
          onChange={(event) => onChange({ ...value, agesNote: event.target.value })}
          className="mt-1 h-11 w-full rounded-xl border border-border bg-bg px-3 text-base"
        />
      </label>
      <label className="block text-sm font-medium">
        {fr ? "Exemple de menu, si vous en avez un" : "Sample menu, if you have one"}
        <textarea
          data-ke="meal-sample"
          value={value.sampleMenu}
          onChange={(event) => onChange({ ...value, sampleMenu: event.target.value })}
          className="mt-1 min-h-24 w-full rounded-xl border border-border bg-bg px-3 py-2 text-base"
        />
      </label>
      <button
        type="button"
        className="inline-flex min-h-11 items-center text-sm font-semibold"
        data-ke="meal-cancel"
        onClick={() => onChange(saved)}
      >
        {fr ? "Annuler les changements" : "Cancel changes"}
      </button>
    </section>
  );
}

export function MealPublicSummary({
  offerings,
  legacyMeals,
  locale,
}: {
  offerings: MealOfferings;
  legacyMeals: boolean;
  locale: string;
}) {
  const fr = locale === "fr";
  const summary = publicMealSummary(offerings, locale, legacyMeals);
  return (
    <section data-ke="meal-public" data-provider-reported="true">
      <h2 className="font-display text-2xl">{fr ? "Repas" : "Meals"}</h2>
      <p className="mt-1 text-sm text-muted">{fr ? "Déclaré par le centre." : "Provider reported."}</p>
      {summary.lines.length ? (
        <ul className="mt-3 space-y-1 text-sm">
          {summary.lines.map((line) => (
            <li key={line.id} data-ke="meal-public-line">
              {line.label}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted" data-ke="meal-public-empty">
          {summary.legacyOnly
            ? fr
              ? "Repas inclus est indiqué. Le détail des repas n'est pas encore ajouté."
              : "Meals included is listed. Meal details are not added yet."
            : fr
              ? "Ce centre n'a pas encore ajouté le détail des repas."
              : "This centre has not added meal details yet."}
        </p>
      )}
      {offerings.sampleMenu ? <p className="mt-3 text-sm">{offerings.sampleMenu}</p> : null}
      <p className="mt-2 text-sm text-muted">
        {fr
          ? "Parlez au centre des besoins de votre enfant. Ceci n'est pas un dossier d'allergie."
          : "Ask the centre about your child's needs. This is not an allergy record."}
      </p>
    </section>
  );
}
