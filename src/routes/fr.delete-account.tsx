import { createFileRoute } from "@tanstack/react-router";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";
import { DeleteAccountPage } from "@/routes/delete-account";

export const Route = createFileRoute("/fr/delete-account")({
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.deleteAccount),
  component: DeleteAccountPage,
});
