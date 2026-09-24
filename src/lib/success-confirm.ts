import type { CopyKey } from "./copy.ts";

/** Compact toast lifetime. Milestone dialogs stay until dismissed. */
export const SUCCESS_TOAST_MS = 2500;

export type SuccessVariant = "modal" | "toast";

export type SuccessActionId =
  | "info"
  | "tour"
  | "spot"
  | "message"
  | "accountCreated"
  | "childAdded"
  | "childSaved"
  | "profileSaved"
  | "alertsSaved"
  | "searchSaved"
  | "listingSaved"
  | "listingRemoved"
  | "waitlistJoined"
  | "waitlistLeft"
  | "reviewSubmitted"
  | "contactSent"
  | "resetRequested"
  | "claimSubmitted"
  | "applicationSubmitted"
  | "listingEdits"
  | "photoUploaded"
  | "licenceUploaded"
  | "screeningUploaded"
  | "replySent"
  | "tourAccepted"
  | "tourDeclined"
  | "openingsUpdated"
  | "feesUpdated"
  | "stepCompleted"
  | "daycareApproved"
  | "unlive"
  | "licenceAttached"
  | "screeningAttested"
  | "photoStraightened"
  | "editsSaved"
  | "noticeSent"
  | "markedRead"
  | "waiting";

export type SuccessAction = {
  variant: SuccessVariant;
  titleKey: CopyKey;
  bodyKey?: CopyKey;
};

/**
 * One map for every milestone and quick confirmation.
 * Titles stay specific. The "Good job!" kicker is shared and not stored here.
 */
export const SUCCESS_ACTIONS: Record<SuccessActionId, SuccessAction> = {
  info: { variant: "modal", titleKey: "requestSentHeadline", bodyKey: "requestSentBodyInfo" },
  tour: { variant: "modal", titleKey: "requestSentHeadlineTour", bodyKey: "requestSentBodyTour" },
  spot: { variant: "modal", titleKey: "requestSentHeadline", bodyKey: "requestSentBodySpot" },
  message: { variant: "modal", titleKey: "requestSentHeadline", bodyKey: "requestSentBodyMessage" },
  accountCreated: { variant: "modal", titleKey: "successAccountCreated", bodyKey: "successAccountCreatedBody" },
  childAdded: { variant: "toast", titleKey: "successChildAdded", bodyKey: "successSavedBody" },
  childSaved: { variant: "toast", titleKey: "profileSaved", bodyKey: "successSavedBody" },
  profileSaved: { variant: "toast", titleKey: "successProfileSaved", bodyKey: "successSavedBody" },
  alertsSaved: { variant: "toast", titleKey: "alertPrefsSaved", bodyKey: "successSavedBody" },
  searchSaved: { variant: "modal", titleKey: "saveSearchSaved", bodyKey: "successSearchSavedBody" },
  listingSaved: { variant: "toast", titleKey: "savedToShortlist" },
  listingRemoved: { variant: "toast", titleKey: "removedFromShortlist" },
  waitlistJoined: { variant: "modal", titleKey: "successWaitlistJoined", bodyKey: "waitlistRequestSaved" },
  waitlistLeft: { variant: "toast", titleKey: "successWaitlistLeft" },
  reviewSubmitted: { variant: "modal", titleKey: "successReviewSubmitted", bodyKey: "reviewSent" },
  contactSent: { variant: "modal", titleKey: "successMessageSent", bodyKey: "successContactBody" },
  resetRequested: { variant: "modal", titleKey: "successResetSent", bodyKey: "successResetBody" },
  claimSubmitted: { variant: "modal", titleKey: "successClaimSubmitted", bodyKey: "claimVerified" },
  applicationSubmitted: { variant: "modal", titleKey: "successApplicationSubmitted", bodyKey: "successApplicationBody" },
  listingEdits: { variant: "toast", titleKey: "successListingSaved", bodyKey: "successListingSavedBody" },
  photoUploaded: { variant: "toast", titleKey: "successPhotoUploaded", bodyKey: "successListingSavedBody" },
  licenceUploaded: { variant: "modal", titleKey: "successLicenceUploaded", bodyKey: "licenceOnFile" },
  screeningUploaded: { variant: "modal", titleKey: "successDocumentUploaded", bodyKey: "successSavedBody" },
  replySent: { variant: "toast", titleKey: "successReplySent", bodyKey: "successReplyBody" },
  tourAccepted: { variant: "toast", titleKey: "tourAccepted" },
  tourDeclined: { variant: "toast", titleKey: "tourDeclined" },
  openingsUpdated: { variant: "toast", titleKey: "successOpeningsUpdated", bodyKey: "vacancyRefreshed" },
  feesUpdated: { variant: "toast", titleKey: "successFeesUpdated", bodyKey: "successSavedBody" },
  stepCompleted: { variant: "modal", titleKey: "successStepCompleted", bodyKey: "successAttestBody" },
  daycareApproved: { variant: "modal", titleKey: "successDaycareApproved" },
  unlive: { variant: "modal", titleKey: "successUnlive", bodyKey: "successUnliveBody" },
  licenceAttached: { variant: "toast", titleKey: "successLicenceAttached" },
  screeningAttested: { variant: "toast", titleKey: "successScreeningAttested", bodyKey: "successAttestBody" },
  photoStraightened: { variant: "toast", titleKey: "successPhotoStraightened" },
  editsSaved: { variant: "toast", titleKey: "successChangesSaved", bodyKey: "successSavedBody" },
  noticeSent: { variant: "toast", titleKey: "successNoticeSent" },
  markedRead: { variant: "toast", titleKey: "successMarkedRead" },
  waiting: { variant: "toast", titleKey: "successWaiting" },
};

export function successAction(id: SuccessActionId): SuccessAction {
  return SUCCESS_ACTIONS[id];
}

/**
 * Approve → Live only celebrates when the decision write and every health
 * check passed. A thrown error or a failed downstream check stays a failure.
 */
export function approvalSuccessReady(
  result: { ok?: boolean; health?: { ok?: boolean } | null } | null | undefined,
): boolean {
  return Boolean(result?.ok && result.health?.ok);
}

export type SuccessRequest = {
  variant: SuccessVariant;
  title: string;
  body?: string;
  kicker?: string;
  photo?: string | null;
  contextTitle?: string;
  contextMeta?: string;
  contextDetail?: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onClose?: () => void;
};

type Deliver = (request: SuccessRequest) => void;

let deliver: Deliver | null = null;

export function bindSuccessHost(next: Deliver | null) {
  deliver = next;
  return () => {
    if (deliver === next) deliver = null;
  };
}

/** Show a confirmation. Call only after the write has succeeded. */
export function confirmSuccess(request: SuccessRequest) {
  deliver?.(request);
}

/** Map a catalog action through the active locale, then show it. */
export function confirmAction(
  t: (key: CopyKey) => string,
  id: SuccessActionId,
  extra?: Partial<SuccessRequest>,
) {
  const action = SUCCESS_ACTIONS[id];
  const { variant, title, body, ...rest } = extra ?? {};
  confirmSuccess({
    variant: variant ?? action.variant,
    title: title ?? t(action.titleKey),
    body: body ?? (action.bodyKey ? t(action.bodyKey) : undefined),
    ...rest,
  });
}
