/** Link a specific child's record to an open share in one statement. */
export const SHARE_IMMUNIZATION_SQL = `
  with eligible as (
    select children.id
    from children
    join family_documents document on document.id = $1
      and document.user_id = children.user_id
      and document.kind = 'immunization'
    where children.id = $4 and children.user_id = $3
  ), shared as (
    insert into family_document_shares (id, document_id, daycare_id)
    select $5, $1, $2 from eligible
    on conflict (document_id, daycare_id) where revoked_at is null
    do update set document_id = excluded.document_id
    returning id
  )
  insert into immunization_files (id, child_id, owner_user_id, daycare_id, kind)
  select shared.id, eligible.id, $3, $2, 'record'
  from shared cross join eligible
  on conflict (id) do update set child_id = excluded.child_id
    where immunization_files.child_id = excluded.child_id
      and immunization_files.owner_user_id = excluded.owner_user_id
      and immunization_files.daycare_id = excluded.daycare_id
  returning id
`;

/** Only a live share at an enrolled centre may inform the centre health view. */
export const SHARED_IMMUNIZATION_RECORDS_SQL = `
  select distinct file.child_id
  from immunization_files file
  join family_document_shares share on share.id = file.id
    and share.daycare_id = file.daycare_id and share.revoked_at is null
  join family_documents document on document.id = share.document_id
    and document.user_id = file.owner_user_id and document.kind = 'immunization'
  join children child on child.id = file.child_id and child.user_id = file.owner_user_id
  where file.child_id = any($1::text[]) and file.kind = 'record'
    and (
      file.owner_user_id = $2
      or (
        exists (
          select 1 from bookings booking where booking.child_id = file.child_id
            and booking.daycare_id = file.daycare_id and booking.status in ('accepted', 'active')
        )
        and file.daycare_id = any($3::text[])
      )
    )
`;
