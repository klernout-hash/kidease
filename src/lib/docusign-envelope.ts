import {
  packEmailBlurb,
  packEmailSubject,
  parsePackKind,
  templateRoleName,
  type PackKind,
} from "./docusign-packs.ts";

export function docusignBrandId(source: Record<string, string | undefined> = process.env) {
  return (source.DOCUSIGN_BRAND_ID || "").trim();
}

/** Adds `brandId` when DOCUSIGN_BRAND_ID is set. Unset keeps the account default brand. */
export function withEnvelopeBrand<T extends Record<string, unknown>>(
  body: T,
  source: Record<string, string | undefined> = process.env,
): T & { brandId?: string } {
  const brandId = docusignBrandId(source);
  if (!brandId) return { ...body };
  return { ...body, brandId };
}

function appOrigin() {
  return ((process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://www.kidease.ca").trim()).replace(/\/$/, "");
}

function webhookNotification() {
  return {
    url: `${appOrigin()}/api/docusign/webhook`,
    loggingEnabled: "true",
    requireAcknowledgment: "true",
    includeDocuments: "false",
    envelopeEvents: [
      { envelopeEventStatusCode: "sent" },
      { envelopeEventStatusCode: "delivered" },
      { envelopeEventStatusCode: "completed" },
      { envelopeEventStatusCode: "declined" },
      { envelopeEventStatusCode: "voided" },
    ],
    eventData: {
      version: "restv2.1",
      format: "json",
      includeData: ["recipients"],
    },
  };
}

export type EnvelopeSignerInput = {
  email: string;
  name: string;
  recipientId: string;
  routingOrder: string;
  anchorString: string;
  roleName?: string;
};

export type CentreEnvelopeInput = {
  packKind?: PackKind;
  documentName: string;
  body: string;
  signerName: string;
  signerEmail: string;
  templateId?: string | null;
  centreName?: string;
  /** When set, these people sign instead of the single centre signer. */
  signers?: EnvelopeSignerInput[];
  fileExtension?: string;
  emailSubject?: string;
  emailBlurb?: string;
};

export function centreEnvelopeCreateBody(
  input: CentreEnvelopeInput,
  source: Record<string, string | undefined> = process.env,
) {
  const packKind = parsePackKind(input.packKind);
  const subject = (input.emailSubject || packEmailSubject(packKind, input.centreName || input.documentName)).slice(0, 100);
  const blurb = input.emailBlurb || packEmailBlurb(packKind);
  const templateId = (input.templateId || "").trim();
  const signers = input.signers?.length
    ? input.signers
    : [
        {
          email: input.signerEmail,
          name: input.signerName,
          recipientId: "1",
          routingOrder: "1",
          anchorString: "By signing in DocuSign",
          roleName: templateRoleName(source),
        },
      ];
  const definition = templateId
    ? {
        emailSubject: subject,
        emailBlurb: blurb,
        templateId,
        templateRoles: signers.map((signer) => ({
          email: signer.email,
          name: signer.name,
          roleName: signer.roleName || templateRoleName(source),
          routingOrder: signer.routingOrder,
        })),
        eventNotification: webhookNotification(),
        status: "sent",
      }
    : {
        emailSubject: subject,
        emailBlurb: blurb,
        documents: [
          {
            documentBase64: Buffer.from(input.body, "utf8").toString("base64"),
            name: input.documentName,
            fileExtension: input.fileExtension || "txt",
            documentId: "1",
          },
        ],
        recipients: {
          signers: signers.map((signer) => ({
            email: signer.email,
            name: signer.name,
            recipientId: signer.recipientId,
            routingOrder: signer.routingOrder,
            tabs: {
              signHereTabs: [
                {
                  anchorString: signer.anchorString,
                  anchorUnits: "pixels",
                  anchorXOffset: "0",
                  anchorYOffset: "20",
                },
              ],
            },
          })),
        },
        eventNotification: webhookNotification(),
        status: "sent",
      };
  return withEnvelopeBrand(definition, source);
}
