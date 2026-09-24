import { confirmSuccess, type SuccessRequest } from "@/lib/success-confirm";
import { useCopy } from "@/lib/use-copy";

/** Imperative confirmation. Call `confirm` only after the write succeeds. */
export function useSuccessConfirm() {
  const { t } = useCopy();
  return {
    confirm(request: SuccessRequest) {
      confirmSuccess({ kicker: request.kicker ?? t("successKicker"), ...request });
    },
  };
}
