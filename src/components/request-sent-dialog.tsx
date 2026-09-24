import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SuccessConfirm } from "@/components/success-confirm";
import { requestSentBodyKey, requestSentTitleKey, type RequestSentKind } from "@/lib/request-sent";
import { useCopy } from "@/lib/use-copy";

type MarkerProps = {
  "data-ke"?: string;
  "data-request-info-success"?: string;
};

type Props = MarkerProps & {
  kind: RequestSentKind;
  listingName: string;
  city?: string | null;
  photo?: string | null;
  /** Tour date/time already chosen on the form. Omitted when we don't have one. */
  detail?: string | null;
  conversationId?: string | null;
  /** Signed-in parents can open Messages. Guest inquiries cannot. */
  canOpenMessages?: boolean;
  onClose: () => void;
};

export function RequestSentDialog({
  kind,
  listingName,
  city,
  photo,
  detail,
  conversationId,
  canOpenMessages = false,
  onClose,
  ...markers
}: Props) {
  const { t } = useCopy();
  const title = t(requestSentTitleKey(kind));
  const body = t(requestSentBodyKey(kind)).replace("{name}", listingName);
  const showMessages = Boolean(canOpenMessages);

  return (
    <SuccessConfirm
      kicker={t("successKicker")}
      title={title}
      body={body}
      photo={photo}
      contextTitle={listingName}
      contextMeta={city || undefined}
      contextDetail={detail || undefined}
      onClose={onClose}
      closeLabel={t("close")}
      data-ke={markers["data-ke"]}
      data-request-sent=""
      data-request-sent-kind={kind}
      data-request-info-success={markers["data-request-info-success"]}
      primary={
        showMessages ? (
          <Button asChild>
            {conversationId ? (
              <Link to="/inbox/$id" params={{ id: conversationId }}>
                {t("requestSentViewMessages")}
              </Link>
            ) : (
              <Link to="/inbox">{t("requestSentViewMessages")}</Link>
            )}
          </Button>
        ) : null
      }
      secondary={
        <Button type="button" variant={showMessages ? "secondary" : "primary"} onClick={onClose}>
          {t("requestSentBackToListing")}
        </Button>
      }
    />
  );
}
