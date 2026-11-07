/**
 * A labelled on/off row. Only the switch changes the value.
 * The text is a label, not a scrolling button.
 * Converted: meal offerings, financial flags, extra support, parent alerts, notice prefs.
 * Checkbox rows: centre and room facilities. Unchecked means not confirmed.
 * Left as chips: search filters, facility type, schedules, openings, programs,
 * curriculum tags, languages, and safety claims.
 */

export function SwitchRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  locale = "en",
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  locale?: string;
}) {
  const onText = locale === "fr" ? "Oui" : "On";
  const offText = locale === "fr" ? "Non" : "Off";
  const hintId = description ? `${id}-hint` : undefined;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-3" data-ke="switch-row">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-[15px] font-semibold leading-5">
          {label}
        </label>
        {description ? (
          <p id={hintId} className="mt-0.5 text-sm leading-5 text-muted">
            {description}
          </p>
        ) : null}
      </div>
      <span className="flex shrink-0 items-center gap-2">
        <span className="w-8 text-right text-xs font-semibold text-muted" aria-hidden>
          {checked ? onText : offText}
        </span>
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="ke-switch"
          checked={checked}
          aria-checked={checked}
          aria-describedby={hintId}
          onChange={(event) => onCheckedChange(event.target.checked)}
        />
      </span>
    </div>
  );
}

/** A facility or room feature. Unchecked is not a stored "no". The control stays a checkbox. */
export function CheckRow({
  id,
  label,
  checked,
  disabled = false,
  locale = "en",
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  locale?: string;
  onCheckedChange: (next: boolean) => void;
}) {
  const add = locale === "fr" ? "Ajouter" : "Add";
  const remove = locale === "fr" ? "Retirer" : "Remove";
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border py-3" data-ke="check-row">
      <label htmlFor={id} className="min-w-0 flex-1 text-[15px] leading-5">
        {label}
      </label>
      <input
        id={id}
        type="checkbox"
        className="ke-check"
        checked={checked}
        disabled={disabled}
        aria-checked={checked}
        aria-label={`${checked ? remove : add}, ${label}`}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
    </div>
  );
}
