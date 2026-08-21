import { BadgeCheck, Camera, MapPin, ListChecks } from "lucide-react";
import { useCopy } from "@/lib/use-copy";

const ITEMS = [
  { icon: BadgeCheck, key: "trustLicensedOnly" as const },
  { icon: Camera, key: "trustLiveAvail" as const },
  { icon: MapPin, key: "trustGoogle" as const },
  { icon: ListChecks, key: "trustSecure" as const },
];

export function TrustBar({ compact = false }: { compact?: boolean }) {
  const { t } = useCopy();
  return (
    <ul className={compact ? "flex flex-wrap justify-center gap-2" : "grid grid-cols-2 gap-3 sm:grid-cols-4"}>
      {ITEMS.map((item) => (
        <li
          key={item.key}
          className={
            compact
              ? "inline-flex items-center gap-1.5 rounded-full bg-bg px-3 py-1.5 text-xs font-medium text-fg ring-1 ring-border"
              : "inline-flex items-center justify-center gap-2 rounded-xl bg-bg px-3 py-3 text-sm font-semibold tracking-[-0.015em] text-fg ring-1 ring-border"
          }
        >
          <item.icon className="size-4 text-primary" />
          {t(item.key)}
        </li>
      ))}
    </ul>
  );
}
