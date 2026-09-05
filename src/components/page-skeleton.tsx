export function PageSkeleton({
  hero = false,
  cards = 0,
}: {
  hero?: boolean;
  cards?: number;
}) {
  return (
    <div className="ke-gutter mx-auto max-w-5xl py-8" aria-hidden="true">
      {hero ? <div className="ke-skel aspect-[16/9] w-full rounded-xl" /> : null}
      <div className="mt-6 space-y-3">
        <div className="ke-skel h-8 w-2/3 max-w-sm" />
        <div className="ke-skel h-4 w-full max-w-lg" />
        <div className="ke-skel h-4 w-4/5 max-w-md" />
      </div>
      {cards > 0 ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="ke-skel aspect-[4/3] w-full" />
              <div className="ke-skel h-4 w-3/4" />
              <div className="ke-skel h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DeskSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10" aria-hidden="true">
      <div className="ke-skel h-3 w-20" />
      <div className="ke-skel mt-3 h-9 w-48" />
      <div className="mt-8 space-y-3">
        <div className="ke-skel h-14 w-full rounded-xl" />
        <div className="ke-skel h-14 w-full rounded-xl" />
        <div className="ke-skel h-14 w-full rounded-xl" />
      </div>
    </div>
  );
}
