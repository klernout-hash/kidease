# Redesign review history — 13 November 2026

The [current release review](redesign-release-review-20261113.md) contains the implementation checklist, validation scope and remaining limitations. The [blocker follow-up](redesign-local-blockers-20261113.md) explains subsequent corrections.

The initial reviewed layout was based on main `9d9838ec` and application source `fd2747fbd246317b1588341d65ae91ef4b9aa389`. Commit `c27a475d954b5cd1f29d81c173f112f1b0c3d821` added review documentation without changing that source.

That checkpoint passed 3,033 local tests, typecheck, a credential-free build and guest smoke shard 1/8 (34/34). ESLint reported zero errors and 128 warnings. It was not release acceptance: English detail captures recorded hydration error #418, a desktop search scenario recorded four map-worker errors, and claimed availability enrichment stopped at 192 candidates.

Those three issues were subsequently corrected in `960da0f4d0aedaf195d2e714f3b10264baad383c`. The current review records the later 3,057-test result and limits of that evidence. Historical captures predate those corrections and do not prove final-revision behavior. Other e2e shards, signed-in CI, physical-device testing and production acceptance are not established by this checkpoint.
