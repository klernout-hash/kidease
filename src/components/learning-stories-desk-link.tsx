import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useCopy } from "@/lib/use-copy";
import { storiesCopy } from "@/lib/learning-stories-copy";
import { storiesStatus } from "@/lib/server/learning-stories";

export function StoriesDeskLink({ forParent = false }: { forParent?: boolean }) {
  const { locale } = useCopy();
  const copy = storiesCopy(locale);
  const [on, setOn] = useState(false);
  useEffect(() => {
    void storiesStatus().then((row) => setOn(row.enabled)).catch(() => setOn(false));
  }, []);
  if (!on) return null;
  if (forParent) {
    return (
      <p className="px-4 pt-4">
        <Link to="/parent" search={{ tab: "stories" }} className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
          {copy.title}
        </Link>
      </p>
    );
  }
  return (
    <p className="mb-4">
      <Link to="/provider" search={{ desk: "stories" }} className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
        {copy.title}
      </Link>
    </p>
  );
}

