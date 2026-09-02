import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/admin-contracts")({
  component: function AdminContractsRedirect() {
    return <Navigate to="/admin" search={{ tab: "contracts" }} />;
  },
});
