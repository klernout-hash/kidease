import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { getSignInProviders } from "@/lib/server/sign-in-providers";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { Shell } from "@/components/shell";
import { rememberRole } from "@/components/role-boot";
import { setRole } from "@/lib/server/family";
import { useCopy } from "@/lib/use-copy";

type Role = "parent" | "provider";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => {
    const out: { next?: string; role?: Role; intent?: "in" | "up" } = {};
    if (typeof s.next === "string" && s.next.startsWith("/")) out.next = s.next;
    if (s.role === "parent" || s.role === "provider") out.role = s.role;
    if (s.intent === "in" || s.intent === "up") out.intent = s.intent;
    return out;
  },
  loader: async () => {
    const providers = await getSignInProviders().catch(() => [...GROK_PROVIDERS]);
    return { providers };
  },
  component: Login,
});

function Login() {
  const { t } = useCopy();
  const { providers } = Route.useLoaderData();
  const search = Route.useSearch();
  const role = search.role;
  const dest = search.next && search.next.startsWith("/")
    ? search.next
    : role === "provider"
      ? "/provider"
      : role === "parent"
        ? "/search"
        : "/";
  const [mode, setMode] = useState<"in" | "up">(search.intent === "up" ? "up" : "in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (role) rememberRole(role);
  }, [role]);

  async function finish() {
    try {
      await authClient.getSession();
    } catch {
      /* session store will catch up */
    }
    if (role) {
      try {
        await setRole({ data: role });
      } catch {
        /* RoleBoot will retry once the session is visible */
      }
    }
    const destUrl = dest.startsWith("/") ? dest : "/";
    window.location.assign(destUrl);
  }

  async function onEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "up") {
        const res = await authClient.signUp.email({
          email,
          password,
          name: name || email.split("@")[0],
        });
        if (res.error) throw new Error(friendlyAuthError(res.error.message));
        rememberToken(res.data);
      } else {
        const res = await authClient.signIn.email({ email, password });
        if (res.error) throw new Error(friendlyAuthError(res.error.message));
        rememberToken(res.data);
      }
      await finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSocial(providerId: string) {
    setBusy(true);
    setError(null);
    if (role) rememberRole(role);
    try {
      await signIn(providerId, { callbackURL: dest, errorCallbackURL: "/login" });
    } catch (err) {
      setError(err instanceof Error ? friendlyAuthError(err.message) : "Sign-in failed");
      setBusy(false);
    }
  }

  const title = role === "provider" ? t("providerSignIn") : role === "parent" ? t("parentSignIn") : t("signIn");
  const lead = role === "provider" ? t("loginLeadProvider") : role === "parent" ? t("loginLeadParent") : t("loginLead");

  return (
    <Shell bare>
      <main className="mx-auto grid min-h-[calc(100dvh-4.5rem)] max-w-5xl md:grid-cols-2">
        <div className="relative hidden overflow-hidden md:block">
          <img src="/photos/community.jpg" alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-fg/70 to-fg/10" />
          <p className="absolute bottom-10 left-10 right-10 font-display text-3xl text-primary-fg">{t("tagline")}</p>
        </div>
        <div className="grid place-items-center px-[clamp(1rem,4vw,2rem)] py-10">
          <div className="w-full max-w-md rounded-xl bg-surface p-8 shadow-card ring-1 ring-border">
            <div className="flex justify-center">
              <BrandMark size="md" />
            </div>
            <h1 className="mt-6 font-display text-3xl">{mode === "up" && role ? t("createAccount") : title}</h1>
            <p className="mt-2 text-sm text-muted">{lead}</p>
          <div className="mt-6 space-y-2">
            {authEnabled ? (
              providers.map((p) => (
                <Button
                  key={p.providerId}
                  type="button"
                  variant={p.idp === "apple" ? "apple" : "secondary"}
                  className="w-full"
                  disabled={busy}
                  onClick={() => void onSocial(p.providerId)}
                >
                  {p.idp === "apple" ? <AppleMark /> : null}
                  {p.idp === "apple" ? t("continueApple") : p.idp === "google" ? t("continueGoogle") : t("continueX")}
                </Button>
              ))
            ) : (
              <p className="text-sm text-muted">Sign-in is disabled.</p>
            )}
          </div>
          <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wider text-subtle">
            <span className="h-px flex-1 bg-border" />
            {t("orEmail")}
            <span className="h-px flex-1 bg-border" />
          </div>
          <form onSubmit={onEmail} className="space-y-3">
            {mode === "up" ? (
              <label className="block text-sm">
                {t("name")}
                <input
                  className="ke-input mt-1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </label>
            ) : null}
            <label className="block text-sm">
              {t("email")}
              <input
                type="email"
                required
                className="ke-input mt-1"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
            <label className="block text-sm">
              {t("password")}
              <input
                type="password"
                required
                minLength={8}
                className="ke-input mt-1"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "up" ? "new-password" : "current-password"}
              />
            </label>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {mode === "up" ? t("createAccount") : t("signIn")}
            </Button>
          </form>
          <button
            type="button"
            className="mt-4 text-sm text-muted underline-offset-4 hover:underline"
            onClick={() => setMode(mode === "up" ? "in" : "up")}
          >
            {mode === "up" ? t("haveAccount") : t("needAccount")}
          </button>
          <p className="mt-6 text-center text-xs text-subtle">
            <Link to="/" className="underline-offset-4 hover:underline">
              {t("back")}
            </Link>
            {" · "}
            <Link to="/privacy" className="underline-offset-4 hover:underline">
              {t("privacy")}
            </Link>
            {" · "}
            <Link to="/terms" className="underline-offset-4 hover:underline">
              {t("terms")}
            </Link>
          </p>
          </div>
        </div>
      </main>
    </Shell>
  );
}

function friendlyAuthError(message?: string | null) {
  const raw = (message || "").toLowerCase();
  if (raw.includes("invalid origin") || raw.includes("invalid_origin")) {
    return "This sign-in page needs a refresh — try again, or use email.";
  }
  if (raw.includes("invalid password") || raw.includes("invalid_password") || raw.includes("invalid email")) {
    return "Email or password is incorrect.";
  }
  if (raw.includes("user already exists") || raw.includes("already exists")) {
    return "An account with that email already exists. Sign in instead.";
  }
  if (raw.includes("popup")) {
    return "Pop-up blocked — allow pop-ups for KidEase, then try again.";
  }
  if (raw.includes("client_id") || raw.includes("apple") && raw.includes("secret") || raw.includes("provider") && raw.includes("not found")) {
    return "Social sign-in is not configured on this host. Set GOOGLE_CLIENT_* or TWITTER_CLIENT_* (server env), or use email.";
  }
  return message || "Sign-in failed";
}

function rememberToken(data: { token?: string | null } | null | undefined) {
  const token = data?.token;
  if (!token || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem("grok-auth.bearer-token", token);
  } catch {
    /* ignore */
  }
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
      <path d="M16.365 12.74c-.024 2.607 2.258 3.476 2.284 3.488-.019.06-.357 1.23-1.177 2.437-.71 1.044-1.447 2.083-2.607 2.106-1.14.024-1.505-.681-2.81-.681-1.303 0-1.712.657-2.79.705-1.12.048-1.973-1.13-2.69-2.17-1.463-2.124-2.582-6.004-1.08-8.625.746-1.305 2.078-2.132 3.524-2.156 1.1-.024 2.138.747 2.81.747.67 0 1.926-.923 3.247-.787.553.023 2.107.224 3.106 1.686-.08.05-1.855 1.09-1.817 3.25m-1.686-5.01c.595-.722 1.002-1.725.891-2.73-.862.035-1.905.576-2.52 1.298-.553.64-1.037 1.663-.906 2.64.958.074 1.94-.487 2.535-1.208" />
    </svg>
  );
}
