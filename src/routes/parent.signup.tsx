import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { ParentSignupForm } from "@/components/parent-signup-form";
import { parentSignupHead } from "@/lib/parent-sms-consent";
import { loadSignInProviders } from "@/lib/server/sign-in-providers";

export const Route = createFileRoute("/parent/signup")({
  loader: () => loadSignInProviders(),
  head: () => parentSignupHead("en"),
  component: ParentSignupPage,
});

function ParentSignupPage() {
  const { providers } = Route.useLoaderData();
  return (
    <Shell>
      <ParentSignupForm providers={providers} />
    </Shell>
  );
}
