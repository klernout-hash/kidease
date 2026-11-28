# Child and family row-level security shadow

Use a disposable Neon branch or local PostgreSQL with the KidEase schema through 0236 and synthetic families. Connect as the schema and table owner. Run `001_child_family_role.sql` then `002_child_family_policies.sql` with `psql -v ON_ERROR_STOP=1`. Run `scripts/child-family-rls-shadow.sql` separately for each synthetic parent using `psql --set=parent_id=...`. Discard the branch after review to roll back the experiment.

The restricted role grants read access for the parent flows under review. Centre, delegated family, staff, and write access need application-role parity checks before any rollout. Legacy attendance and medication rows without an owned booking remain hidden in this prototype and must be accounted for in the comparison. Keep the role detached from live application logins.

The server must authenticate the user before setting context. In a single transaction and on the same connection, set the restricted role, set `app.user_id` with parameterized `select set_config('app.user_id', $1, true)`, then read. End the transaction to clear context. The setting is an application assertion and the role must never be made available to a client or exposed through arbitrary SQL.

For C5 and C6, first compare parent, centre, staff, delegated, and service flows on synthetic data. Monitor result-count mismatches and query latency before proposing staged enforcement. Keep the existing access path until parity and rollback have been reviewed and approved by Kyle.
