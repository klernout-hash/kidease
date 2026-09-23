import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type InputHTMLAttributes } from "react";
import { useCopy } from "@/lib/use-copy";

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
};

export function PasswordField({
  label,
  className,
  id,
  autoComplete,
  ...props
}: PasswordFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  const { t } = useCopy();

  return (
    <label className="block text-sm" htmlFor={inputId}>
      {label}
      <span className="relative mt-1 block">
        <input
          {...props}
          id={inputId}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          className={`ke-input pr-12 ${className ?? ""}`.trim()}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-fg"
          onClick={() => setVisible((open) => !open)}
          aria-label={visible ? t("hidePassword") : t("showPassword")}
          aria-pressed={visible}
          aria-controls={inputId}
        >
          {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      </span>
    </label>
  );
}
