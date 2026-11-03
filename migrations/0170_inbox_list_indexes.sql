-- Inbox list: latest chat line, parent threads, and centre threads.
create index if not exists messages_convo_chat_created_idx
  on messages (conversation_id, created_at desc);

create index if not exists conversations_user_last_idx
  on conversations (user_id, last_at desc);

create index if not exists conversations_daycare_last_idx
  on conversations (daycare_id, last_at desc);

create index if not exists provider_daycares_user_daycare_idx
  on provider_daycares (user_id, daycare_id);

create index if not exists centre_members_user_active_idx
  on centre_members (user_id, daycare_id)
  where status = 'active';

create index if not exists lead_requests_convo_info_idx
  on lead_requests (conversation_id)
  where kind = 'info';
