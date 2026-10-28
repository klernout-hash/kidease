import { createFileRoute } from "@tanstack/react-router";
import { WaitlistPage, waitlistHead } from "@/routes/waitlist";

export const Route = createFileRoute("/fr/waitlist")({
  head: () => waitlistHead("fr"),
  component: WaitlistPage,
});
