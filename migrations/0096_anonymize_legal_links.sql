-- Account hard-wipe may clear the person link on fraud logs.
-- DELETE stays forbidden. Every other column stays insert-only.
-- Invoices and payments are not touched here; the app writes a tombstone id.

create or replace function security_events_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'security_events is insert-only';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.at is distinct from old.at
      or new.kind is distinct from old.kind
      or new.daycare_id is distinct from old.daycare_id
      or new.ip is distinct from old.ip
      or new.user_agent is distinct from old.user_agent
      or new.meta is distinct from old.meta
    then
      raise exception 'security_events is insert-only';
    end if;
    -- Only clearing the account link is allowed. A new user id is not.
    if new.actor_user_id is not null and new.actor_user_id is distinct from old.actor_user_id then
      raise exception 'security_events is insert-only';
    end if;
    if new.target_user_id is not null and new.target_user_id is distinct from old.target_user_id then
      raise exception 'security_events is insert-only';
    end if;
  end if;

  return new;
end;
$$;
