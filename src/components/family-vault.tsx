import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { FamilyDocKind } from "@/lib/family-vault";
import { parentLoginSearch } from "@/lib/auth/parent-login";
import type { CopyKey } from "@/lib/copy";
import { useCopy } from "@/lib/use-copy";
import { toast } from "sonner";

type Share = {
  id: string;
  daycareId: string;
  daycareName: string;
  revokedAt: string | null;
};

type Doc = {
  id: string;
  kind: FamilyDocKind;
  fileName: string;
  createdAt: string;
  shares: Share[];
};

type Centre = { id: string; name: string };

const KIND_KEY: Record<FamilyDocKind, CopyKey> = {
  immunization: "familyDocsImmunization",
  subsidy: "familyDocsSubsidy",
};

function vaultError(code: string, t: (key: CopyKey) => string) {
  if (code === "bad_kind") return t("familyDocsKind");
  if (code === "bad_file") return t("familyDocsBadFile");
  if (code === "too_many") return t("familyDocsTooMany");
  if (code === "centre_not_chosen") return t("familyDocsNoCentre");
  if (code === "not_found") return t("familyDocsMissing");
  return t("familyDocsFailed");
}

export function FamilyVaultPanel({ signedIn }: { signedIn: boolean }) {
  const { t } = useCopy();
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [centres, setCentres] = useState<Centre[]>([]);
  const [kind, setKind] = useState<FamilyDocKind>("immunization");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(!signedIn);

  const load = useCallback(async () => {
    if (!signedIn) return;
    const res = await fetch("/api/family-documents", { credentials: "same-origin" });
    const body = (await res.json().catch(() => null)) as { documents?: Doc[]; centres?: Centre[]; error?: string } | null;
    if (!res.ok) {
      toast.error(vaultError(body?.error || "", t));
      setLoaded(true);
      return;
    }
    setDocuments(body?.documents ?? []);
    setCentres(body?.centres ?? []);
    setLoaded(true);
  }, [signedIn, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const file = new FormData(form).get("file");
    if (!(file instanceof File) || !file.size) {
      toast.error(t("familyDocsBadFile"));
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.set("kind", kind);
      body.set("file", file, file.name);
      const res = await fetch("/api/family-documents", { method: "POST", body, credentials: "same-origin" });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(vaultError(payload?.error || "", t));
        return;
      }
      form.reset();
      toast.success(t("familyDocsSaved"));
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function act(payload: Record<string, string>, okKey: CopyKey) {
    setBusy(true);
    try {
      const res = await fetch("/api/family-documents", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(vaultError(body?.error || "", t));
        return;
      }
      toast.success(t(okKey));
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border" data-ke="family-vault">
      <h2 className="font-display text-xl">{t("familyDocsTitle")}</h2>
      <p className="mt-2 text-sm text-muted">{t("familyDocsLead")}</p>
      <p className="mt-2 text-sm text-muted">{t("familyDocsPrivate")}</p>
      {!signedIn ? (
        <Button className="mt-4" asChild>
          <Link to="/login" search={parentLoginSearch("/account?tab=profile&section=documents")}>
            {t("familyDocsSignIn")}
          </Link>
        </Button>
      ) : (
        <>
          <form className="mt-5 space-y-3" onSubmit={(e) => void onUpload(e)}>
            <label className="block text-sm font-medium" htmlFor="family-doc-kind">
              {t("familyDocsKind")}
            </label>
            <select
              id="family-doc-kind"
              className="min-h-11 w-full rounded-xl bg-surface px-3 ring-1 ring-border"
              value={kind}
              onChange={(e) => setKind(e.target.value === "subsidy" ? "subsidy" : "immunization")}
            >
              <option value="immunization">{t("familyDocsImmunization")}</option>
              <option value="subsidy">{t("familyDocsSubsidy")}</option>
            </select>
            <label className="block text-sm font-medium" htmlFor="family-doc-file">
              {t("familyDocsFile")}
            </label>
            <input
              id="family-doc-file"
              name="file"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              required
              className="block w-full text-sm"
              onFocus={(e) => e.currentTarget.scrollIntoView({ block: "center" })}
            />
            <Button type="submit" disabled={busy}>
              {t("familyDocsUpload")}
            </Button>
          </form>
          {!loaded ? <p className="mt-4 text-sm text-muted">{t("familyDocsLoading")}</p> : null}
          {loaded && documents.length === 0 ? <p className="mt-4 text-sm text-muted">{t("familyDocsEmpty")}</p> : null}
          <ul className="mt-4 space-y-3">
            {documents.map((doc) => (
              <li key={doc.id} className="rounded-xl p-3 ring-1 ring-border">
                <p className="text-sm font-medium">{t(KIND_KEY[doc.kind])}</p>
                <p className="mt-1 text-sm text-muted">{doc.fileName}</p>
                <a className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary" href={`/api/family-documents/${doc.id}`}>
                  {t("familyDocsOpen")}
                </a>
                {doc.shares.filter((share) => !share.revokedAt).length ? (
                  <ul className="mt-2 space-y-1 text-sm">
                    {doc.shares
                      .filter((share) => !share.revokedAt)
                      .map((share) => (
                        <li key={share.id} className="flex flex-wrap items-center gap-2">
                          <span>
                            {t("familyDocsShared")} {share.daycareName}
                          </span>
                          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void act({ action: "revoke", shareId: share.id }, "familyDocsRevoked")}>
                            {t("familyDocsRevoke")}
                          </Button>
                        </li>
                      ))}
                  </ul>
                ) : null}
                {centres.length ? (
                  <form
                    className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const daycareId = String(new FormData(e.currentTarget).get("daycareId") || "");
                      void act({ action: "share", documentId: doc.id, daycareId }, "familyDocsShared");
                    }}
                  >
                    <label className="sr-only" htmlFor={`share-${doc.id}`}>
                      {t("familyDocsShare")}
                    </label>
                    <select id={`share-${doc.id}`} name="daycareId" className="min-h-11 min-w-0 flex-1 rounded-xl bg-surface px-3 ring-1 ring-border">
                      {centres.map((centre) => (
                        <option key={centre.id} value={centre.id}>
                          {centre.name}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" variant="secondary" disabled={busy}>
                      {t("familyDocsShare")}
                    </Button>
                  </form>
                ) : (
                  <p className="mt-2 text-sm text-muted">{t("familyDocsNoCentre")}</p>
                )}
                <Button className="mt-3" type="button" variant="secondary" disabled={busy} onClick={() => void act({ action: "delete", documentId: doc.id }, "familyDocsDeleted")}>
                  {t("familyDocsDelete")}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function CentreFamilyDocs() {
  const { t } = useCopy();
  const [documents, setDocuments] = useState<
    Array<{
      documentId: string;
      kind: FamilyDocKind;
      fileName: string;
      daycareName: string;
      parentName: string;
    }>
  >([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancel = false;
    void fetch("/api/family-documents?desk=centre", { credentials: "same-origin" })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { documents?: typeof documents } | null;
        if (!cancel && res.ok) setDocuments(body?.documents ?? []);
      })
      .finally(() => {
        if (!cancel) setLoaded(true);
      });
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <section className="rounded-xl bg-surface p-5 shadow-card ring-1 ring-border" data-ke="centre-family-docs">
      <h2 className="font-display text-xl">{t("familyDocsCentreTitle")}</h2>
      <p className="mt-2 text-sm text-muted">{t("familyDocsCentreLead")}</p>
      {loaded && documents.length === 0 ? <p className="mt-3 text-sm text-muted">{t("familyDocsCentreEmpty")}</p> : null}
      <ul className="mt-3 space-y-3">
        {documents.map((doc) => (
          <li key={doc.documentId} className="text-sm">
            <p className="font-medium">
              {t(KIND_KEY[doc.kind])} · {doc.parentName}
            </p>
            <p className="text-muted">{doc.daycareName}</p>
            <a className="inline-flex min-h-11 items-center font-medium text-primary" href={`/api/family-documents/${doc.documentId}`}>
              {t("familyDocsOpen")}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
