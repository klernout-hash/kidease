# Audit log and retention

`FEATURE_AUDIT_RETENTION` defaults off. The log is append-only: a database trigger refuses updates. Practice mode lists rows older than the retention date and deletes nothing. `FEATURE_AUDIT_RETENTION_LIVE=1` deletes those rows.

Ontario's three-year minimum is O. Reg. 137/15, s. 82(1). Other provinces use a three-year placeholder.

A government user sees the count for `gov_province` only. The log stores an action and a target id, not a child name.

Pages: `/gov/audit`, `/admin-gov-audit`. The daily job is `/api/compliance/audit`.
