import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { ParentSignupForm } from "@/components/parent-signup-form";
import { parentSignupHead } from "@/lib/parent-sms-consent";

export const Route = createFileRoute("/parent/signup")({
  head: parentSignupHead,
  component: ParentSignupPage,
});

function ParentSignupPage() {
  return (
    <Shell>
      <ParentSignupForm />
    </Shell>
  );
}
