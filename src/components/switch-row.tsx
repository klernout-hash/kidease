/**
 * A labelled on/off row. Only the switch changes the value.
 * The text is a label, not a scrolling button.
 * Converted: meal offerings, financial flags, extra support.
 * Left as chips: search filters, facility type, schedules, openings, programs,
 * curriculum tags, languages, safety features, and the facility catalogue.
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
