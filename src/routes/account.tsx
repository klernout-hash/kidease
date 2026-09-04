import { useEffect, useRef, useState } from "react";
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
import { getMyContact, saveMyContact } from "@/lib/server/profile-contact";

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

  if (search.tab === "profile" || !search.tab) {
    return <ProfilePane />;
  }

  if (!user) {
    return (
      <Shell>
        <main className="ke-gutter mx-auto max-w-lg py-12 text-center">
          <h1 className="font-display text-3xl">{search.tab === "enrolled" ? t("enrolled") : t("saved")}</h1>
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
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(user?.displayName ?? "");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(user?.primaryEmail ?? "");
  const [bio, setBio] = useState("");

  useEffect(() => {
    if (!user) return;
    setName(user.displayName ?? "");
    setEmail(user.primaryEmail ?? "");
    void getMyContact()
      .then((row) => {
        setName(row.name || user.displayName || "");
        setPhone(row.phone);
        setEmail(row.email || user.primaryEmail || "");
        setBio(row.bio);
      })
      .catch(() => {
        /* keep session name/email */
      });
  }, [user?.id]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const saved = await saveMyContact({ data: { name, phone, bio } });
      setName(saved.name);
      setPhone(saved.phone);
      setEmail(saved.email || email);
      setBio(saved.bio);
      if (saved.name) {
        try {
          await authClient.updateUser({ name: saved.name });
        } catch {
          /* profiles row is the source of truth */
        }
      }
      toast.success("Contact details saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save details");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Shell>
      <main className="ke-gutter mx-auto max-w-lg pb-10 pt-6">
        <h1 className="font-display text-[1.75rem] tracking-[-0.03em]">{t("profile")}</h1>
        <div className="mt-8 flex flex-col items-center text-center">
          <ProfileAvatar userId={user?.id} fallback={user?.profileImageUrl} name={name || user?.displayName} size="lg" />
          <p className="mt-4 text-lg font-semibold">{name || user?.displayName || t("profile")}</p>
          {email || user?.primaryEmail ? (
            <p className="mt-1 text-sm text-muted">{email || user?.primaryEmail}</p>
          ) : null}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (!user) return;
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
          {user ? (
            <Button className="mt-6" size="lg" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? t("loading") : "Add or change photo"}
            </Button>
          ) : (
            <Button className="mt-6" size="lg" asChild>
              <Link to="/login" search={{ role: "parent", intent: "in", next: "/account?tab=profile" }}>
                Sign in to add a photo
              </Link>
            </Button>
          )}
        </div>

        {user ? (
          <form onSubmit={onSave} className="mt-8 space-y-3 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border">
            <h2 className="font-display text-lg tracking-[-0.02em]">Contact details</h2>
            <p className="text-[13px] text-muted">Shown on Parent, Daycare, and Admin — this is your KidEase account.</p>
            <label className="block text-sm">
              Name
              <input className="ke-input mt-1" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
            </label>
            <label className="block text-sm">
              Phone number
              <input className="ke-input mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" maxLength={32} placeholder="204-555-0100" />
            </label>
            <label className="block text-sm">
              Email
              <input className="ke-input mt-1 bg-bg" value={email} readOnly autoComplete="email" />
            </label>
            <p className="text-[12px] text-subtle">Email is the address you sign in with. Use Forgot password on the login page to recover it.</p>
            <label className="block text-sm">
              Bio
              <textarea
                className="ke-input mt-1 min-h-24 resize-y"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={400}
                placeholder="A short note about you or your family."
              />
            </label>
            <p className="text-right text-[12px] text-subtle">{bio.length}/400</p>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? t("loading") : "Save details"}
            </Button>
          </form>
        ) : (
          <p className="mt-8 text-center text-sm text-muted">Sign in as a parent, daycare, or admin to add your contact details.</p>
        )}
      </main>
    </Shell>
  );
}
