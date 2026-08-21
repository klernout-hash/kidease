import { cn } from "@/lib/utils";

export function BrandMark({
  size = "sm",
  align = "center",
}: {
  size?: "sm" | "md" | "lg";
  align?: "center" | "start";
}) {
  const logo =
    size === "lg" ? "size-24" : size === "md" ? "size-16" : "size-9";
  const name =
    size === "lg"
      ? "mt-2 text-3xl font-semibold tracking-[-0.03em]"
      : size === "md"
        ? "mt-1.5 text-xl font-semibold tracking-[-0.025em]"
        : "mt-0.5 text-xs font-semibold tracking-[-0.01em]";
  return (
    <span className={cn("inline-flex flex-col", align === "start" ? "items-start" : "items-center")}>
      <img
        src="/logo-transparent.png?v=2"
        alt=""
        className={cn(logo, "bg-transparent object-contain")}
      />
      <span className={cn("font-sans text-primary", name)}>KidEase</span>
    </span>
  );
}
