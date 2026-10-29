import { Button } from "@/components/ui/button";
import type { GrokProvider } from "@/lib/auth/providers";
import { useCopy } from "@/lib/use-copy";

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
      <path d="M16.365 12.74c-.024 2.607 2.258 3.476 2.284 3.488-.019.06-.357 1.23-1.177 2.437-.71 1.044-1.447 2.083-2.607 2.106-1.14.024-1.505-.681-2.81-.681-1.303 0-1.712.657-2.79.705-1.12.048-1.973-1.13-2.69-2.17-1.463-2.124-2.582-6.004-1.08-8.625.746-1.305 2.078-2.132 3.524-2.156 1.1-.024 2.138.747 2.81.747.67 0 1.926-.923 3.247-.787.553.023 2.107.224 3.106 1.686-.08.05-1.855 1.09-1.817 3.25m-1.686-5.01c.595-.722 1.002-1.725.891-2.73-.862.035-1.905.576-2.52 1.298-.553.64-1.037 1.663-.906 2.64.958.074 1.94-.487 2.535-1.208" />
    </svg>
  );
}

function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
      <path d="M13.5 21v-7.2h2.42l.36-2.8H13.5V9.22c0-.81.22-1.36 1.39-1.36H16.4V5.36A18.7 18.7 0 0 0 13.96 5C11.54 5 9.9 6.48 9.9 9v2h-2.3v2.8H9.9V21h3.6Z" />
    </svg>
  );
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
          {p.idp === "apple" ? <AppleMark /> : p.idp === "facebook" ? <FacebookMark /> : null}
          {p.idp === "apple"
            ? t("continueApple")
            : p.idp === "google"
              ? t("continueGoogle")
              : p.idp === "facebook"
                ? t("continueFacebook")
                : p.label}
        </Button>
      ))}
    </div>
  );
}
