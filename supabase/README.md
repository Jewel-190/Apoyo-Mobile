# Supabase backend

This folder mirrors the Supabase project state for the Apoyo mobile app.

```
supabase/
  config.toml          # Local CLI config
  functions/           # Edge functions deployed to the project
    _shared/           # Shared helpers (CORS, JSON responses)
    notifications/
    request-code-generator/
    storage-cleanup/
  migrations/          # Tracked SQL migrations (apply in chronological order)
  sql/                 # Ad-hoc / one-shot scripts (see "SQL scripts" below)
```

## Working with the CLI

The Supabase CLI binary is vendored under `Frontend/.tools/supabase/` and
is wired into `package.json`:

```sh
npm run supabase -- --version
npm run supabase:login              # Once per machine
npm run supabase:link -- yrlkynetbegvwmqaiuvr
```

Edge function deploy helpers:

```sh
npm run supabase:functions:deploy:notifications
npm run supabase:functions:deploy:cleanup
```

## Migration drift (read this first)

`supabase migration list --linked` shows two-way drift between this
repo and the linked project:

- **Remote-only** (applied on the project, no file in this repo):
  `202604080001`, `202604080007–9`, `202604130012–14`,
  `202604250015–16`, `202604260001–5`, `202605030002–3`. These were
  applied from another source (probably the admin dashboard repo) and
  cover admin-side features.
- **Local-only** (file in this repo, never pushed): `202604150001`,
  `202604160001`, `202604170001–4`, `202605010001–2`,
  `202605020001–2`. These were committed locally but never pushed —
  status unknown, possibly applied via the SQL editor outside the CLI.

**Implications:**

- `supabase db pull` will refuse to run until the histories are
  reconciled.
- `supabase db push` will refuse for the same reason; even if forced,
  it would attempt to apply all 8+ older local-only migrations in
  chronological order, which is risky.
- The local `migrations/` folder is **not a complete reproduction** of
  the live schema. Treat it as a chronological log of changes made from
  this repo, not the source of truth.

### How to apply a single new migration without resolving the drift

This is the procedure that was used to apply
`202605090001_safe_facade.sql` on 2026-05-10:

```pwsh
# 1. Pre-flight: read-only checks against the live DB to verify every
#    table / column the migration references exists. Use one .sql file
#    per check and run via:
supabase db query --linked --file <check>.sql --output json

# 2. Apply the migration via the Management API (bypasses the local
#    migration tracking and therefore does NOT cascade into older
#    un-pushed local migrations):
supabase db query --linked --file supabase/migrations/<timestamp>_<name>.sql --output json

# 3. Verify the new objects on remote (enums, views, functions...).

# 4. Record it in the migration tracking table so `migration list`
#    reflects reality:
supabase migration repair --status applied <timestamp> --linked
```

This procedure is safe **only** for migrations that are fully
idempotent (e.g. `do $$ if not exists ... create type`,
`create or replace view`, `create or replace function`). For
non-idempotent migrations, resolve the drift first by contacting
whoever owns the admin repo so we can merge histories.

When you need to reconcile fully, contact whoever owns the admin
repo. Until then, do not run `migration repair --status reverted` or
`db push` blindly.

## SQL scripts

Files in `supabase/sql/` are ad-hoc scripts. They are NOT migrations:
running them via `supabase db push` will not work and they are not
re-applied automatically.

| Script | Purpose |
|---|---|
| `request-code-system.sql` | Original DDL for the `request_code` system. The bulk of this is now superseded by tracked migrations, but the file is kept for historical reference. |
| `normalize-requester-info.sql` | One-off normalization helper. Apply manually if needed. |
| `storage-orphan-auto-sweep.sql` | Scheduled cleanup helper that complements the `storage-cleanup` edge function. Contains placeholders (`YOUR_PROJECT_REF`, `YOUR_LONG_RANDOM_SECRET`) that must be replaced before running in the SQL Editor. |
| `remote-public-schema.sql` | Empty placeholder (kept as a marker). |

If you are about to run any of these, double-check whether the
operation is already covered by a migration in `migrations/`.

## Edge functions

| Function | Purpose | Auth |
|---|---|---|
| `notifications` | Read-only notifications list / unread count / mark-read for the current user. | Bearer (Supabase user JWT) |
| `request-code-generator` | Issue the human-readable request code at submission time via the `generate_request_code_for_service` RPC. | Optional `x-request-code-secret` header |
| `storage-cleanup` | DB webhook + manual cleanup that removes orphaned files from the `request-documents` bucket. | Optional `x-cleanup-secret` header |

Shared helpers (`functions/_shared/cors.ts`) keep CORS headers and
`Response` shaping consistent across functions invoked from the mobile
client.
