import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { ParentSignupForm } from "@/components/parent-signup-form";
import { parentSignupHead } from "@/lib/parent-sms-consent";

export const Route = createFileRoute("/fr/signup")({
  head: () => parentSignupHead("fr"),
  component: FrSignupPage,
});

function FrSignupPage() {
  return (
    <Shell>
      <ParentSignupForm />
    </Shell>
  );
}
