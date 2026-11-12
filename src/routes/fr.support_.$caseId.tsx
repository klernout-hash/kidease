import { createFileRoute } from "@tanstack/react-router";
import { SupportCaseScreen } from "@/routes/support_.$caseId";
import { beforeLoadSupportDesk } from "@/lib/server/support-route";

export const Route = createFileRoute("/fr/support_/$caseId")({
  beforeLoad: ({ params }) => beforeLoadSupportDesk(`/fr/support/${params.caseId}`),
  head: () => ({
    meta: [
      { title: "Dossier · Soutien · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FrSupportCaseRoute,
});

function FrSupportCaseRoute() {
  const { caseId } = Route.useParams();
  return <SupportCaseScreen caseId={caseId} next={`/fr/support/${caseId}`} />;
}
