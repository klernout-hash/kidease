import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Shell } from "@/components/shell";
import { ParentDesk } from "@/components/parent-desk";
import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "@/components/profile-avatar";
import { TwoFactorGate } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCopy } from "@/lib/use-copy";
import { compressProfileFile, writeProfilePhoto } from "@/lib/profile-photo";
import { authClient } from "@/lib/auth/client";

export const Route = createFileRoute("/account")({
  validateSearch: (s: Record<string, unknown>) => {
    const tab = s.tab;
    if (tab === "saved" || tab === "enrolled" || tab === "profile") return { tab };
    return {};
  },
  component: AccountPage,
});

function AccountPage() {
  const { user, isPending } = useCurrentUserState();
  const { t } = useCopy();
  const search = Route.useSearch();

  if (isPending) {
    return (
      <Shell>
        <p className="p-8 text-muted">{t("loading")}</p>
      </Shell>
    );
  }
  if (!user) {
    return (
      <Shell>
        <main className="ke-gutter mx-auto max-w-lg py-12 text-center">
          <h1 className="font-display text-3xl">{search.tab === "enrolled" ? t("enrolled") : search.tab === "saved" ? t("saved") : t("profile")}</h1>
          <p className="mt-3 text-muted">{t("loginLead")}</p>
          <div className="mt-8 flex flex-col gap-3">
            <Button size="lg" className="h-14 min-h-14 w-full px-7 text-base" asChild>
              <Link to="/login" search={{ role: "parent", intent: "in", next: "/account?tab=profile" }}>
                {t("parentSignIn")}
              </Link>
            </Button>
            <Button size="lg" variant="secondary" className="h-14 min-h-14 w-full px-7 text-base" asChild>
              <Link to="/search">{t("heroCta")}</Link>
            </Button>
          </div>
        </main>
      </Shell>
    );
  }

  if (search.tab === "profile" || !search.tab) {
    return (
      <TwoFactorGate next="/account?tab=profile">
        <ProfilePane />
      </TwoFactorGate>
    );
  }

  const initialTab = search.tab === "saved" ? "saved" : search.tab === "enrolled" ? "bookings" : "children";
  return (
    <TwoFactorGate next="/parent">
      <ParentDesk initialTab={initialTab} />
    </TwoFactorGate>
  );
}

function ProfilePane() {
  const { user } = useCurrentUserState();
  const { t } = useCopy();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  return (
    <Shell>
      <main className="ke-gutter mx-auto max-w-lg pb-10 pt-6">
        <h1 className="font-display text-[1.75rem] tracking-[-0.03em]">{t("profile")}</h1>
        <div className="mt-8 flex flex-col items-center text-center">
          <ProfileAvatar userId={user.id} fallback={user.profileImageUrl} name={user.displayName} size="lg" />
          <p className="mt-4 text-lg font-semibold">{user.displayName ?? t("profile")}</p>
          {user.primaryEmail ? <p className="mt-1 text-sm text-muted">{user.primaryEmail}</p> : null}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setBusy(true);
              void compressProfileFile(file)
                .then(async (dataUrl) => {
                  writeProfilePhoto(user.id, dataUrl);
                  try {
                    await authClient.updateUser({ image: dataUrl });
                  } catch {
                    /* local photo still shows */
                  }
                  toast.success("Profile photo updated");
                })
                .catch((err) => toast.error(err instanceof Error ? err.message : "Could not add photo"))
                .finally(() => setBusy(false));
            }}
          />
          <Button className="mt-6" size="lg" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? t("loading") : "Add profile picture"}
          </Button>
        </div>
      </main>
    </Shell>
  );
}
