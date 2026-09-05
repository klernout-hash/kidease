export type Decision = "approve" | "decline" | "waiting" | "info";

export function decisionCopy(decision: Decision, name: string, note?: string) {
  const noteBlock = note?.trim() ? `\n\nA note from KidEase:\n${note.trim()}` : "";
  if (decision === "approve") {
    return {
      subject: `${name} is live on KidEase`,
      text: `Hi,\n\nYour listing for ${name} has been approved and is now live on KidEase.\nParents can find you in search, request a spot, and message you in-app.\n\nOpen your dashboard: https://kidease.ca/provider${noteBlock}\n\nIf anything on the listing needs a correction, reply to this email or update it from the provider dashboard.`,
    };
  }
  if (decision === "decline") {
    return {
      subject: `Update on ${name} — KidEase listing`,
      text: `Hi,\n\nWe reviewed the claim for ${name} and are not able to publish it on KidEase at this time.\nThe listing is not live for parent requests.\n\nIf you think this is a mistake, or you have a licence document to send, reply to this email and we will take another look.${noteBlock}`,
    };
  }
  if (decision === "info") {
    return {
      subject: `We need a bit more on ${name}`,
      text: `Hi,\n\nThanks for claiming ${name}. We need a little more before we can publish the listing.${noteBlock || "\n\nPlease reply with your current provincial licence or the details we asked for."}\n\nYou can update the listing from https://kidease.ca/provider`,
    };
  }
  return {
    subject: `${name} is in review at KidEase`,
    text: `Hi,\n\nYour listing for ${name} is on the KidEase review list.\nIt is not live for parent requests yet. We will email you as soon as it is approved or if we need anything else.${noteBlock}\n\nYou can still open the provider dashboard: https://kidease.ca/provider`,
  };
}
