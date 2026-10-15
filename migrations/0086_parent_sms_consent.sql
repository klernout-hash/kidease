-- Optional parent SMS opt-in captured at sign-up.
-- A phone on profiles is not consent. sms_consent is the unchecked-by-default box.
-- sms_consent_at is set only when that box is ticked.

alter table profiles add column if not exists sms_consent int not null default 0;
alter table profiles add column if not exists sms_consent_at timestamptz;

alter table profiles drop constraint if exists profiles_sms_consent_chk;
alter table profiles
  add constraint profiles_sms_consent_chk check (
    sms_consent in (0, 1)
    and (
      (sms_consent = 0 and sms_consent_at is null)
      or (sms_consent = 1 and sms_consent_at is not null)
    )
  );
