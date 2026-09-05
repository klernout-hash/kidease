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
  if (compact) {
    return (
      <ul className="flex flex-wrap justify-center gap-2">
        {ITEMS.map((item) => (
          <li
            key={item.key}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-bg px-3 py-1.5 text-xs font-medium text-fg ring-1 ring-border"
          >
            <item.icon className="size-4 text-primary" />
            {t(item.key)}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
      {ITEMS.map((item) => (
        <li
          key={item.key}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-bg px-3 py-3 text-center text-sm font-semibold tracking-[-0.015em] text-fg ring-1 ring-border"
        >
          <item.icon className="size-4 shrink-0 text-primary" />
          {t(item.key)}
        </li>
      ))}
    </ul>
  );
}
