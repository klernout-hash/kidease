import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** 44px chip: WCAG 2.5.5-ish target + AA text on surface (`--color-fg` / `--color-bg`). */
function chipClass(on = false) {
  return cn("ke-chip", on && "ke-chip-on");
}

export function ChipButton({
  on = false,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) {
  return <button type={type} className={cn(chipClass(on), className)} {...props} />;
}
