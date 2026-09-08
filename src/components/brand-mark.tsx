import { cn } from "@/lib/utils";

const MARK_PX = { sm: 36, md: 64, lg: 80 } as const;

/**
 * Logo is a vector mark. Tailwind size classes vanish if CSS fails to load
 * (root pending replacing the document, SW serving HTML as CSS). Always pin
 * width/height in attributes + inline style so it cannot cover the page.
 */
export function BrandMark({
  size = "sm",
  align = "center",
}: {
  size?: "sm" | "md" | "lg";
  align?: "center" | "start";
}) {
  const px = MARK_PX[size];
  const logo =
    size === "lg" ? "h-20 w-20" : size === "md" ? "h-16 w-16" : "h-9 w-9";
  const name =
    size === "lg"
      ? "mt-2 text-3xl font-semibold tracking-[-0.03em]"
      : size === "md"
        ? "mt-1.5 text-xl font-semibold tracking-[-0.025em]"
        : "mt-0.5 text-xs font-semibold tracking-[-0.01em]";
  return (
    <span
      data-ke-mark={size}
      className={cn("inline-flex flex-col", align === "start" ? "items-start" : "items-center")}
      style={{ display: "inline-flex", flexDirection: "column", alignItems: align === "start" ? "flex-start" : "center" }}
    >
      <img
        src="/logo-transparent.svg?v=17"
        alt=""
        width={px}
        height={px}
        className={cn(logo, "bg-transparent object-contain")}
        style={{ width: px, height: px, maxWidth: px, maxHeight: px, objectFit: "contain" }}
      />
      <span className={cn("font-sans text-primary", name)}>KidEase</span>
    </span>
  );
}
