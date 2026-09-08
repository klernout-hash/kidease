-- Documented stub adapters for ON, AB, BC, SK, QC.
-- Fail closed to operator manual review. Not live registry matches.
-- Manitoba stays adapter_ready (local catalogue only — see 0034).

update ca_jurisdictions
set adapter_status = 'manual',
    adapter_notes = 'Adapter stub. No official open-data feed or documented public API. Fail closed to operator manual review against Ontario licensed child care. Not a live registry match.',
    updated_at = now()
where code = 'ON';

update ca_jurisdictions
set adapter_status = 'manual',
    adapter_notes = 'Adapter stub. No official open-data feed or documented public API. Fail closed to operator manual review against Alberta Lookup Child Care. Not a live registry match.',
    updated_at = now()
where code = 'AB';

update ca_jurisdictions
set adapter_status = 'manual',
    adapter_notes = 'Adapter stub. No official open-data feed or documented public API. Fail closed to operator manual review against the BC childcare finder. Not a live registry match.',
    updated_at = now()
where code = 'BC';

update ca_jurisdictions
set adapter_status = 'manual',
    adapter_notes = 'Adapter stub. No official open-data feed or documented public API. Fail closed to operator manual review against the Saskatchewan child care pages. Not a live registry match.',
    updated_at = now()
where code = 'SK';

update ca_jurisdictions
set adapter_status = 'manual',
    adapter_notes = 'Adapter stub. No official open-data feed or documented public API. Fail closed to operator manual review against Québec services de garde. Not a live registry match.',
    updated_at = now()
where code = 'QC';

-- Remaining jurisdictions stay adapter stubs. Clearer fail-closed notes; no live match.

update ca_jurisdictions
set adapter_status = 'stub',
    adapter_notes = 'Adapter stub. Fail closed to operator manual review against New Brunswick ELCC. No official open-data feed. Not a live registry match.',
    updated_at = now()
where code = 'NB';

update ca_jurisdictions
set adapter_status = 'stub',
    adapter_notes = 'Adapter stub. Fail closed to operator manual review against Child Care Nova Scotia. No official open-data feed. Not a live registry match.',
    updated_at = now()
where code = 'NS';

update ca_jurisdictions
set adapter_status = 'stub',
    adapter_notes = 'Adapter stub. Fail closed to operator manual review against PEI licensed ELCC. No official open-data feed. Not a live registry match.',
    updated_at = now()
where code = 'PE';

update ca_jurisdictions
set adapter_status = 'stub',
    adapter_notes = 'Adapter stub. Fail closed to operator manual review against NL child care. No official open-data feed. Not a live registry match.',
    updated_at = now()
where code = 'NL';

update ca_jurisdictions
set adapter_status = 'stub',
    adapter_notes = 'Adapter stub. Fail closed to operator manual review against Yukon Find child care. No official open-data feed. Not a live registry match.',
    updated_at = now()
where code = 'YT';

update ca_jurisdictions
set adapter_status = 'stub',
    adapter_notes = 'Adapter stub. Fail closed to operator manual review against NWT early learning and child care. No official open-data feed. Not a live registry match.',
    updated_at = now()
where code = 'NT';

update ca_jurisdictions
set adapter_status = 'stub',
    adapter_notes = 'Adapter stub. Fail closed to operator manual review against Nunavut early learning and child care. No official open-data feed. Subsidy URL left null rather than guess a dead path. Not a live registry match.',
    updated_at = now()
where code = 'NU';
