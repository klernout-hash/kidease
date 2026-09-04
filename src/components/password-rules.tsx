import { passwordChecks } from "@/lib/password-policy";

export function PasswordRules({ password }: { password: string }) {
  const checks = passwordChecks(password);
  return (
    <ul className="mt-2 space-y-1.5 rounded-md bg-bg px-3 py-2.5 ring-1 ring-border" aria-live="polite">
      {checks.map((item) => (
        <li key={item.id} className="flex items-center gap-2 text-[12px] leading-none">
          <span
            className={`grid size-4 shrink-0 place-items-center rounded-full ${
              item.ok ? "bg-primary text-primary-fg" : "bg-surface ring-1 ring-border text-transparent"
            }`}
            aria-hidden="true"
          >
            <CheckMark />
          </span>
          <span className={item.ok ? "text-fg" : "text-muted"}>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

function CheckMark() {
  return (
    <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M2.2 6.2 4.8 8.7 9.8 3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
