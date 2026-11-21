import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useCopy } from "@/lib/use-copy";
import { curriculumUi } from "@/lib/curriculum/text";
import { curriculumStatus } from "@/lib/server/curriculum-pack";

export function CurriculumDeskLink() {
  const { locale } = useCopy();
  const [on, setOn] = useState(false);
  useEffect(() => {
    void curriculumStatus()
      .then((row) => setOn(row.pack))
      .catch(() => setOn(false));
  }, []);
  if (!on) return null;
  return (
    <p className="mb-4">
      <Link to="/provider" search={{ desk: "learning" }} className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
        {curriculumUi(locale, "title")}
      </Link>
    </p>
  );
}

