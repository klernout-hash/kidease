import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { parentLoginSearch } from "@/lib/auth/parent-login";
import { signOut } from "@/lib/auth/client";
import { deleteAccount } from "@/lib/server/family";
import { useCopy } from "@/lib/use-copy";

export function DeleteAccountPanel({ signedIn }: { signedIn: boolean }) {
  const { t } = useCopy();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!signedIn) {
    return (
      <div className="mt-8 space-y-4 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border">
        <p className="text-sm text-muted">{t("deleteAccountGuestLead")}</p>
        <Button size="lg" className="h-14 min-h-14 w-full px-7 text-base" asChild>
          <Link to="/login" search={parentLoginSearch("/delete-account")}>
            {t("deleteAccountSignIn")}
          </Link>
        </Button>
        <p className="text-xs text-subtle">
          <Link to="/unsubscribe" className="underline-offset-4 hover:underline">
            {t("unsubscribe")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border">
      <p className="text-sm text-muted">{t("deleteAccountLead")}</p>
      {confirmDelete ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="danger"
            disabled={deleting}
            onClick={() => {
              setDeleting(true);
              void deleteAccount()
                .then(() => signOut("/"))
                .catch(() => setDeleting(false));
            }}
          >
            {t("deleteAccountConfirm")}
          </Button>
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
            {t("back")}
          </Button>
        </div>
      ) : (
        <Button variant="ghost" className="mt-4 text-danger" onClick={() => setConfirmDelete(true)}>
          {t("deleteAccount")}
        </Button>
      )}
    </div>
  );
}
