import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROFILE_PHOTO_EVENT, readProfilePhoto } from "@/lib/profile-photo";

export function useLiveProfilePhoto(userId: string | null | undefined, fallback?: string | null) {
  const [src, setSrc] = useState<string | null>(() => readProfilePhoto(userId, fallback));

  useEffect(() => {
    const sync = () => setSrc(readProfilePhoto(userId, fallback));
    sync();
    window.addEventListener(PROFILE_PHOTO_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PROFILE_PHOTO_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [userId, fallback]);

  return src;
}

export function ProfileAvatar({
  userId,
  fallback,
  name,
  size = "md",
  className,
}: {
  userId?: string | null;
  fallback?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const src = useLiveProfilePhoto(userId, fallback);
  const dim = size === "lg" ? "size-28" : size === "sm" ? "size-9" : "size-11";
  const icon = size === "lg" ? "size-12" : size === "sm" ? "size-4" : "size-5";
  const letter = name?.trim().slice(0, 1).toUpperCase();

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface text-primary ring-2 ring-primary/80",
        dim,
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : letter ? (
        <span className={cn("font-semibold", size === "lg" ? "text-3xl" : "text-sm")}>{letter}</span>
      ) : (
        <UserRound className={icon} strokeWidth={1.7} />
      )}
    </span>
  );
}
