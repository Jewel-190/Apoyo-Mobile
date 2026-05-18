# scripts/

Cross-cutting tooling for the modular refactor.

| Script | Purpose |
| --- | --- |
| `sync-shared.ps1` | Regenerate `shared/types/database.types.ts` from the linked Supabase project, then verify that the canonical `shared/domain/` mirrors `ApoyoAdmin/src/shared/domain/`. |

## sync-shared.ps1

```pwsh
# from ApoyoMobile/
pwsh -File scripts/sync-shared.ps1
```

Optional flags:

- `-AdminPath <path>` — point at a non-default ApoyoAdmin checkout.
  Defaults to `../ApoyoAdmin`.
- `-SkipTypes` — skip the Supabase types regeneration (faster local
  iteration when you only edited domain files).
- `-Force` — overwrite admin shared/domain/ even if there are
  uncommitted changes there.

The script intentionally does **not** rewrite `.js` siblings of `.ts`
files: each `.ts` in `ApoyoMobile/shared/domain/` has a hand-maintained
JS twin in `ApoyoAdmin/src/shared/domain/`. The two must be kept in
lock-step by hand. If you add a new file or constant on the mobile
side, mirror it manually on the admin side and run the sync to
verify.
