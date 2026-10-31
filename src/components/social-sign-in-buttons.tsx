import { Button } from "@/components/ui/button";
import type { GrokProvider } from "@/lib/auth/providers";
import { useCopy } from "@/lib/use-copy";

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="currentColor" aria-hidden="true">
      <path d="M16.365 12.74c-.024 2.607 2.258 3.476 2.284 3.488-.019.06-.357 1.23-1.177 2.437-.71 1.044-1.447 2.083-2.607 2.106-1.14.024-1.505-.681-2.81-.681-1.303 0-1.712.657-2.79.705-1.12.048-1.973-1.13-2.69-2.17-1.463-2.124-2.582-6.004-1.08-8.625.746-1.305 2.078-2.132 3.524-2.156 1.1-.024 2.138.747 2.81.747.67 0 1.926-.923 3.247-.787.553.023 2.107.224 3.106 1.686-.08.05-1.855 1.09-1.817 3.25m-1.686-5.01c.595-.722 1.002-1.725.891-2.73-.862.035-1.905.576-2.52 1.298-.553.64-1.037 1.663-.906 2.64.958.074 1.94-.487 2.535-1.208" />
    </svg>
  );
}

/** Official multicolour Google G. Same box as Apple and Facebook. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="currentColor" aria-hidden="true">
      <path d="M13.5 21v-7.2h2.42l.36-2.8H13.5V9.22c0-.81.22-1.36 1.39-1.36H16.4V5.36A18.7 18.7 0 0 0 13.96 5C11.54 5 9.9 6.48 9.9 9v2h-2.3v2.8H9.9V21h3.6Z" />
    </svg>
  );
}

function HuaweiMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="#CF0A2C" />
      <path fill="#fff" d="M8 7h2.2v4.1h3.6V7H16v10h-2.2v-4.1H10.2V17H8V7z" />
    </svg>
  );
}

function AmazonMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden="true">
      <path fill="#111" d="M4.5 16.8c3.2 2.1 7.1 2.6 10.6 1.4 1.3-.4 2.5-1 3.5-1.7l.9 1.5c-1.2.9-2.7 1.6-4.3 2-4.1 1.1-8.6.3-12.2-2.2l1.5-1z" />
      <path fill="#FF9900" d="M14.2 7.4c.2-1.3 1.3-2.1 2.6-2.1h.3V4c-1.4 0-2.7.5-3.6 1.4-.9.9-1.4 2.2-1.4 3.5 0 2.6 2 3.9 3.8 3.9 1.6 0 2.6-.7 3.3-1.7l-1.4-1c-.4.5-1 .9-1.8.9-1 0-1.7-.7-1.8-1.5h3.3V8.2h-3.3z" />
    </svg>
  );
}

function socialLabel(idp: string, label: string, t: (key: "continueApple" | "continueGoogle" | "continueFacebook" | "continueHuawei" | "continueAmazon") => string): string {
  if (idp === "apple") return t("continueApple");
  if (idp === "google") return t("continueGoogle");
  if (idp === "facebook") return t("continueFacebook");
  if (idp === "huawei") return t("continueHuawei");
  if (idp === "amazon") return t("continueAmazon");
  return label;
}

/** Apple, then Google, then Facebook. Same size on every sign-in and sign-up screen. */
export function SocialSignInButtons({
  providers,
  disabled,
  onSocial,
}: {
  providers: GrokProvider[];
  disabled?: boolean;
  onSocial: (providerId: string) => void;
}) {
  const { t } = useCopy();
  if (!providers.length) return null;
  return (
    <div className="space-y-2" data-ke="social-sign-in">
      {providers.map((p) => (
        <Button
          key={p.providerId}
          type="button"
          variant="secondary"
          size="md"
          className={
            p.idp === "apple"
              ? "ke-social-button ke-apple-button w-full font-normal"
              : "ke-social-button w-full font-normal"
          }
          data-ke="social-secondary"
          data-provider={p.idp}
          disabled={disabled}
          onClick={() => onSocial(p.providerId)}
        >
          {p.idp === "apple" ? (
            <AppleMark />
          ) : p.idp === "google" ? (
            <GoogleMark />
          ) : p.idp === "facebook" ? (
            <FacebookMark />
          ) : p.idp === "huawei" ? (
            <HuaweiMark />
          ) : p.idp === "amazon" ? (
            <AmazonMark />
          ) : null}
          {socialLabel(p.idp, p.label, t)}
        </Button>
      ))}
    </div>
  );
}
