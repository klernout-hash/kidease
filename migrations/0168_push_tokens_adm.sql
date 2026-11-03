-- Amazon Device Messaging tokens (Fire devices). FEATURE_AMAZON_ADM defaults off.
-- Registration is refused unless the Amazon Appstore build runs on an Amazon device.
alter table push_device_tokens drop constraint if exists push_device_tokens_provider_chk;
alter table push_device_tokens
  add constraint push_device_tokens_provider_chk
  check (provider in ('fcm', 'apns', 'adm'));
