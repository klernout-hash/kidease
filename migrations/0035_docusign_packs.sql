-- DocuSign packs: provider agreement + enrolment paperwork on daycare_contracts.
-- Signed PDFs land at R2 key contracts/{daycare_id}/{contract_id}.pdf (or on-demand from DocuSign).

alter table daycare_contracts add column if not exists pack_kind text not null default 'provider_agreement';
alter table daycare_contracts add column if not exists template_id text;
alter table daycare_contracts add column if not exists signed_pdf_key text;
alter table daycare_contracts add column if not exists signed_pdf_bytes integer;

update daycare_contracts
   set pack_kind = 'provider_agreement'
 where pack_kind is null or pack_kind = '';

create index if not exists daycare_contracts_pack
  on daycare_contracts (daycare_id, pack_kind, created_at desc);
