import { createFileRoute } from "@tanstack/react-router";
import {
  AccountPage,
  accountBeforeLoad,
  accountHead,
  accountLoader,
  accountValidateSearch,
} from "@/routes/account";

export const Route = createFileRoute("/fr/account")({
  beforeLoad: accountBeforeLoad,
  head: accountHead,
  loader: accountLoader,
  validateSearch: accountValidateSearch,
  component: AccountPage,
});
