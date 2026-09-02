export const CENTRE_AGREEMENT_TITLE = "KidEase Licensed Centre Agreement";

export function centreAgreementBody(input: {
  centreName: string;
  address?: string;
  city?: string;
  province?: string;
  licence?: string;
  signerName?: string;
  signerEmail?: string;
}) {
  const where = [input.address, input.city, input.province].filter(Boolean).join(", ") || "the listed address";
  return `KIDEASE LICENSED CENTRE AGREEMENT

This agreement is between KidEase (operated from Winnipeg, Manitoba) and the licensed childcare centre named below.

Centre: ${input.centreName}
Location: ${where}
Licence number: ${input.licence || "to be confirmed"}
Authorized signer: ${input.signerName || "Centre operator"}
Signer email: ${input.signerEmail || "—"}

1. Listing. The centre asks KidEase to show its listing to parents searching for care. KidEase may approve, pause, or remove a listing if the centre is unlicensed, the licence expires, ratings fall below 3.5 stars with at least three reviews, or the centre breaks these terms.

2. Accuracy. The centre will keep name, address, licence, fees, ages, photos, and contact details true. Fake photos or invented licence numbers are grounds for immediate removal.

3. Enrolment. Parents request spots through KidEase. The centre decides accept, waitlist, or decline. KidEase does not guarantee enrolment numbers.

4. Fees. Parent payments and centre payouts follow the KidEase ledger and posted platform fee. The centre will not ask parents to bypass KidEase payment for spots that started on the platform.

5. Messages. After a parent requests a spot, the parent and the centre share one in-app thread. The centre will answer in a reasonable time during operating hours.

6. Privacy. Child profiles and parent messages stay inside KidEase tools and are used only to place and care for that child.

7. Term. Either side may end this agreement with 14 days written notice. KidEase may end it immediately for licence, safety, or fraud issues.

8. Law. This agreement is governed by the laws of Manitoba, Canada.

By signing in DocuSign, the signer confirms they can bind the centre.

KidEase operator: Kyle Lernout · kyle@kidease.ca
`;
}
