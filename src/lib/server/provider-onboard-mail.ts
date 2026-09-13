import { KIDEASE_OPERATOR_EMAIL } from "@/lib/admin-email";
import { sendTransactionalMail } from "@/lib/transactional-mail";
import {
  PROVIDER_ONBOARD_SUBJECT,
  providerOnboardHtml,
  providerOnboardText,
  signupMailAppOrigin,
} from "@/lib/signup-user-mail";

export function providerOnboardOrigin(): string {
  return signupMailAppOrigin(process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://www.kidease.ca");
}

/** Next steps after emailVerified for a provider. Once-ever lock lives in the caller. */
export async function sendProviderNextStepsMail(input: {
  to: string;
  origin?: string | null;
  name?: string | null;
  listingName?: string | null;
}) {
  const to = input.to.trim().toLowerCase();
  if (!to || !to.includes("@")) throw new Error("A registered email is required.");
  const origin = signupMailAppOrigin(input.origin || providerOnboardOrigin());
  return sendTransactionalMail({
    purpose: "provider_onboard",
    to,
    subject: PROVIDER_ONBOARD_SUBJECT,
    text: providerOnboardText(origin, input.name, input.listingName),
    html: providerOnboardHtml(origin, input.name, input.listingName),
    replyTo: KIDEASE_OPERATOR_EMAIL,
  });
}
