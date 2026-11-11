# MSG-13 Family broadcast, design note only

This is a design note. It does not send email, text, or a push, and it does not add a button that sends.

## Who it is for

A centre owner who needs one note to reach the families already linked to that centre.

## What the screen would show later

- One message box, in English and French.
- The list of families already linked. A family who opted out is shown as skipped.
- A line that says nothing has been sent.

## What it must not do

- It must not send while the feature flag is off.
- It must not add families who are not already linked.
- It must not include child health, photos, or payment details in the note.

## Held

Bulk email itself stays on the standing hold (MSG-10). This note does not build that send.
