import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Red asterisk, screen-reader “Required”, and a full-input error outline. */
export function RequiredMark({ french = false }: { french?: boolean }) {
  return (
    <>
      <span aria-hidden="true" className="text-danger">
        {" "}
        *
      </span>
      <span className="sr-only">{french ? " Obligatoire" : " Required"}</span>
    </>
  );
}

export function fieldErrorClass(invalid: boolean) {
  return invalid
    ? "border-danger bg-danger/10 focus-visible:ring-2 focus-visible:ring-danger focus-visible:outline-none"
    : "";
}

export function RequiredField({
  label,
  required = false,
  french = false,
  error,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  french?: boolean;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block text-sm", className)}>
      <span className="mb-1.5 block font-semibold text-ink">
        {label}
        {required ? <RequiredMark french={french} /> : null}
      </span>
      {children}
      {error ? (
        <span role="alert" className="mt-1 block text-sm text-danger">
          {error}
        </span>
      ) : null}
    </label>
  );
}
