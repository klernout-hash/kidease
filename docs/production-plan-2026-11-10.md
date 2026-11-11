# Production plan, 10 Nov 2026

Source list for Phases 1–4. Nothing here ships until Kyle says the phases go out together. No merge, and no production flag or environment change, until then.

Every new feature sits behind a flag that defaults off. Where a Kyle decision is still open, the safe default is no sends, no charges, and nothing a family can see until that flag is on. New screens follow `docs/clean-look/README.md`, in English and French.

## Phase 1

- MKT-04 Search filters (age, schedule, licence)
- MKT-06 Sibling/multi-child search
- MKT-16 Vacancy freshness
- ADM-03 Walk-in lead entry
- ADM-12 Program-specific waitlist
- SEC-01 Audit log
- ADM-13 Waitlist rank
- ADM-14 Waitlist sibling/age/start-date
- ADM-15 Enrol from waitlist
- ADM-22 Form/packet statuses
- ADM-31 Fees hidden until claim
- MSG-12 Photos/video in family comms
- MSG-09 Newsfeed/announcements
- HR-17 Pickup authorized contacts
- ATT-07 Pickup signature/authorized pickup
- ATT-09 Emergency/fire attendance view
- ATT-11 Parent arrival/late note
- DAY-04 Allergens on menus
- DAY-09 Potty logging
- DAY-14 Allergy badges/alerts
- ADM2-13 PDF export
- DAY-17 Incident export
- DAY-16 Incident share controls
- LRN-04 Learning portfolios
- HR-08 Certificate attachments
- HR-09 Credential expiry
- HR-12 Screening doc upload
- HR-13 Screening doc expiry
- ADM2-02 Instant location switching
- ADM2-05 Billing-only role
- ADM2-06 Staff without parent-messaging
- ADM2-10 Revenue reporting
- SEC-02 Security page
- SEC-03 Privacy controls page

## Phase 2

- MKT-05 Start-date availability search
- MKT-10 Reviews with one centre reply and moderation
- ADM-04 Lead CSV import
- ADM-05 Lead email templates EN/FR
- ADM-18 Fillable PDFs
- ADM-20 Admission packets
- ADM2-08 Custom roles
- APP-01 Parent iOS app (store-gated, skip)
- APP-03 Staff mobile experience
- MSG-06 Native push (send-disabled)
- MSG-02 Staff messaging
- ATT-08 Health screen at check-in
- STF-06 PTO tracking
- STF-07 PTO reporting
- BIL-04 Split payers
- BIL-09 Payment reminders (send-disabled)
- BIL-11 Credits
- BIL-17 CWELCC calculation
- BIL-13 Late fees
- BIL-15 Year-end tax receipts
- DAY-10 Medication profile
- DAY-13 Medication permission
- DAY-12 Medication reminders
- DAY-18 Health checks
- LRN-02 Video sharing (interface only)
- LRN-09 Milestones
- HR-10 Credential renewal workflow
- ADM2-03 Transfers between sites

## Phase 3

- MKT-11 Rules-based badge with published method
- LOC-04 Provincial regulatory reports
- MKT-14 Inspection history from public data
- ADM-24 SMS when forms shared (send-disabled)
- MSG-05 Emergency SMS (send-disabled)
- MSG-11 Machine translation (interface only)
- STF-04 Overtime tracking
- BIL-05 Card payments
- BIL-02 Autopay
- BIL-06 PAD
- BIL-03 Mandatory autopay
- BIL-12 Refunds (Stripe in test mode only, no live charges, 3% fee)
- BIL-18 BC CCFRI/ACCB
- BIL-19 Alberta Affordability Grant
- BIL-23 Payout status
- LRN-07 Framework alignment (held, skip)
- ADM2-15 Municipal statistics reports
- LOC-03 Extra languages (held, skip)

## Phase 4

Standing holds, do not build: ADM-02 CRM, MSG-10 bulk email, STF-10/11/12 payroll, DAY-08 sensors, LRN-08/10/12, LRN-13 photo sales, HR-01 through HR-05 handbooks, HR-11, SEC-04, PAY-01/02 in-app purchase and subscriptions, ADM2-16 automations.

Build only:

- ADM2-14 Public developer API, extending the centre API with OAuth scopes
- MSG-13 Design note only
