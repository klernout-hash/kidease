import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { parentLoginSearch } from "@/lib/auth/parent-login";
import { signOut } from "@/lib/auth/client";
import { DELETE_CONFIRM_PHRASE } from "@/lib/account-delete";
import { deleteAccount } from "@/lib/server/family";
import { useCopy } from "@/lib/use-copy";

export function DeleteAccountPanel({ signedIn }: { signedIn: boolean }) {
  const { t } = useCopy();
  const [phrase, setPhrase] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const ready = phrase.trim() === DELETE_CONFIRM_PHRASE;

  if (!signedIn) {
    return (
      <div className="mt-8 space-y-4 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border">
        <p className="text-sm text-muted">{t("deleteAccountGuestLead")}</p>
        <Button size="lg" className="h-14 min-h-14 w-full px-7 text-base" asChild>
          <Link to="/login" search={parentLoginSearch("/account?tab=profile&section=delete")}>
            {t("deleteAccountSignIn")}
          </Link>
        </Button>
        <p className="text-xs text-subtle">
          <Link to="/unsubscribe" search={{ token: undefined, channel: undefined }} className="underline-offset-4 hover:underline">
            {t("unsubscribe")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border" data-ke="account-delete">
      <h2 className="font-display text-xl">{t("deleteAccount")}</h2>
      <p className="mt-2 text-sm text-muted">{t("deleteAccountLead")}</p>
      <p className="mt-2 text-sm text-muted">{t("deleteAccountRestoreNote")}</p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
        <li>{t("deleteAccountKeepBilling")}</li>
        <li>{t("deleteAccountKeepLogs")}</li>
      </ul>
      <label className="mt-4 block text-sm">
        {t("deleteAccountType")}
        <input
          data-ke="delete-confirm"
          className="ke-input mt-1"
          value={phrase}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setPhrase(e.target.value);
            setError("");
          }}
        />
      </label>
      {error ? (
        <p className="mt-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        variant="danger"
        className="mt-4"
        disabled={!ready || deleting}
        onClick={() => {
          setDeleting(true);
          void deleteAccount()
            .then(() => signOut("/"))
            .catch((err) => {
              setDeleting(false);
              setError(err instanceof Error ? err.message : t("deleteAccount"));
            });
        }}
      >
        {t("deleteAccountConfirm")}
      </Button>
    </div>
  );
}
