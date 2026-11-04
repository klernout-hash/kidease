import { celebrateSuccess, confirmSuccess, type SuccessRequest } from "@/lib/success-confirm";
import { useCopy } from "@/lib/use-copy";

/** Imperative confirmation. Call `confirm` or `celebrate` only after the write succeeds. */
export function useSuccessConfirm() {
  const { t } = useCopy();
  return {
    confirm(request: SuccessRequest) {
      confirmSuccess({ kicker: request.kicker ?? t("successKicker"), ...request });
    },
    /** Brief checkmark. The host fills in "Good Job" or "Bravo !". */
    celebrate(title?: string) {
      celebrateSuccess(title);
    },
  };
}
