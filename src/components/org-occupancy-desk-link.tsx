import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useCopy } from "@/lib/use-copy";
import { orgCopy } from "@/lib/org-occupancy-copy";
import { orgDeskStatus } from "@/lib/server/org-occupancy";

export function OrgDeskLink() {
  const { locale } = useCopy();
  const copy = orgCopy(locale);
  const [on, setOn] = useState(false);
  useEffect(() => {
    void orgDeskStatus().then((row) => setOn(row.enabled)).catch(() => setOn(false));
  }, []);
  if (!on) return null;
  return (
    <p className="mb-4">
      <Link to="/provider" search={{ desk: "sites" }} className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
        {copy.title}
      </Link>
    </p>
  );
}

