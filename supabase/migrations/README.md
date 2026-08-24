# Migrations

This folder is the **chronological log of changes made from this repo**.
It is *not* a complete reproduction of the live schema (see
[../README.md](../README.md) — there is known migration drift between
this repo and the linked Supabase project because the admin app pushes
its own migrations against the same DB).

## Naming

`YYYYMMDDNNNN_<short-name>.sql` — same convention as the rest of this
folder. `NNNN` is a daily counter so multiple migrations on the same
day sort correctly.

## Phase boundary (refactor)

Migration `202605090001_safe_facade.sql` is the boundary between
"pre-modular-refactor" and "post-modular-refactor". Everything after it
should be safe-by-default (additive, with `if not exists` /
`if exists`, no destructive changes to existing columns or RLS).

Destructive migrations live in `_phase10/` until they pass a
pre-flight checklist (additive migrations first; confirm no live
dependents; backup / repair as needed) and are explicitly promoted
into this folder.

## Applying

```sh
npm run supabase -- db push
```

`db push` will refuse to run while the local migration history diverges
from the linked project. If that happens, do **not** run
`migration repair` blindly — open the SQL editor in the Supabase
dashboard and apply the migration body manually instead. Then
`supabase migration list --linked` will keep growing the gap, which is
fine until someone has time to reconcile the histories.

## Rollback notes

Each migration in this folder should include a commented-out rollback
block at the bottom. If you can't roll forward by writing a new
migration, the rollback block is the documented manual recovery path.
