import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { ParentSignupForm } from "@/components/parent-signup-form";
import { parentSignupHead } from "@/lib/parent-sms-consent";
import { loadSignInProviders } from "@/lib/server/sign-in-providers";

export const Route = createFileRoute("/fr/signup")({
  loader: () => loadSignInProviders(),
  head: () => parentSignupHead("fr"),
  component: FrSignupPage,
});

function FrSignupPage() {
  const { providers } = Route.useLoaderData();
  return (
    <Shell>
      <ParentSignupForm providers={providers} />
    </Shell>
  );
}
