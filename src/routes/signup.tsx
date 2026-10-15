import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { ParentSignupForm } from "@/components/parent-signup-form";
import { parentSignupHead } from "@/lib/parent-sms-consent";

export const Route = createFileRoute("/signup")({
  head: parentSignupHead,
  component: SignupPage,
});

function SignupPage() {
  return (
    <Shell>
      <ParentSignupForm />
    </Shell>
  );
}
