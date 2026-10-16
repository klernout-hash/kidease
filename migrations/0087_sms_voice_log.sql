-- Delivery status for Twilio SMS, plus voicemail recording ids.
-- Phone numbers stay in the delivery row so support can match a STOP.
-- Recording URLs are not stored. Fetch them from Twilio with the recording SID.

create table if not exists sms_delivery_status (
  message_sid text primary key,
  message_status text not null,
  to_e164 text,
  from_e164 text,
  error_code text,
  keyword text,
  updated_at timestamptz not null default now()
);

create table if not exists voice_recordings (
  recording_sid text primary key,
  call_sid text,
  created_at timestamptz not null default now()
);
