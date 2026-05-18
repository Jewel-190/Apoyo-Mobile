# Apoyo modular platform — master plan

**Goal:** A fully modular catalog (services + requirements + presentation) owned by superadmin, backed by Postgres **rows** (never DDL at runtime), with **one generic request experience** on mobile and parity with today’s eight flows.

**Non‑negotiables:**

1. **Behavior parity** — Same screens, copy, validation outcomes, attachment semantics, status transitions, and deep links after each phase (verified by checklist + automated checks where possible).
2. **Expand → migrate → contract** — Never replace eight tables in one cutover.
3. **Industry standard** — Versioned migrations, RLS, audited admin mutations, config versioning, idempotent mobile sync.

**Companion UI:** `ApoyoAdmin/src/superadmin/modules/ContentManagement/` (`Services.jsx`, `AssistanceCreate.jsx`). Today this is **in‑memory state + hardcoded `mobileAssistances`**. This plan makes that UI persist to the catalog tables below and become the source of truth.

### Implementation status (living)

| Phase | Status | Notes |
|-------|--------|--------|
| **P0 — Catalog DDL + seed + admin read** | **Done (2026-05-10)** | Migration `202605100001_assistance_catalog.sql`: `assistance_categories`, `assistance_services`, `assistance_requirements`, `assistance_requirement_tips`, RLS (`is_superadmin` writes), idempotent seed mirroring `shared/domain/services.ts`. Applied remotely + `migration repair`. Admin: `src/shared/data/assistanceCatalog.js` + `Services.jsx` loads published catalog; on failure falls back to bundled `FALLBACK_MOBILE_ASSISTANCES` (still includes demo Housing/Events rows). Mobile unchanged. |
| **P0.5 — Mobile request modules + unified record mirror** | **Done (2026-05-10)** | All eight `*Req.tsx` route files are **thin re-exports**; implementations live under `shared/request/screens/*RequestScreen.tsx` (same UI/logic as before, paths unchanged). Migration `202605100002_service_request_records.sql`: table `service_request_records` + idempotent backfill from all eight `*_requests` tables (maps each table → canonical `service_key`, preserves `financial_request_type`, `request_code`, status, timestamps, `additional_info`). RLS: users read own rows, superadmin reads all. Helper `listServiceRequestRecordsForUser` in `shared/data/unifiedRequestRecords.ts`. **Legacy tables remain the write path**; attachments stay on `request_attachments` keyed by `request_table` + `request_uid`. |
| P1 — Unified `requests` + pilot dual-write | Not started | |
| P2–P5 | Not started | |

---

## 1. Conceptual split (three layers)

| Layer | What it is | Who changes it | Examples |
|-------|------------|----------------|----------|
| **Catalog (CMS)** | What applicants *see* and what staff *communicates* | Superadmin (CRUD + publish) | Category headline, service title, description HTML, requirement titles/tips, reminder text, hero images, ordering, `active`, `published_version` |
| **Mechanics (platform)** | How uploads, drafts, submit, codes, notifications work | Engineers (migrations) | Storage bucket, `request_attachments` schema, RPCs for submit, enums for status |
| **Runtime (instances)** | Actual applications | Applicants create; staff process | `requests` rows, attachment rows, audit logs |

**Rule:** Superadmin never creates tables/columns. They only mutate **catalog** and **runtime** rows through constrained APIs.

---

## 2. Database — target schema (modular)

### 2.1 Catalog tables (superadmin / ContentManagement)

Normalize what `AssistanceCreate.jsx` already models:

- **`assistance_categories`**  
  `id`, `slug` (e.g. `medical`), `label`, `headline`, `sort_order`, `active`, `created_at`, `updated_at`

- **`assistance_services`**  
  `id`, `category_id` FK, **`service_key`** `text` UNIQUE NOT NULL — stable id used in URLs, mobile, and FK from requests (e.g. `hospital`, `emergency-finance`). Never recycle keys after sunset.

  Presentation (aligned with form state in `makeEmptyServiceForm`):

  - `display_name`, `description_html` (or `description_md` + render rules — pick one and stick to it)
  - `description_font_family` (optional; can default client-side)
  - `mobile_image_url` / `mobile_image_storage_path` (prefer storage path + signed URLs)
  - `reminder_text`, `reminder_font_family`
  - `sample_document_image_url`, `sample_document_name`
  - Web mirrors: `web_hero_image_url`, `web_map_link`, `web_intro_html`, `web_office_title`
  - `sort_order`, `active`

- **`assistance_requirements`**  
  `id`, `service_id` FK, `sort_order`, `title`, **`slot_key`** `text` NOT NULL — binds to attachment mechanics (`letter`, `voterId`, …) OR future field types.

  - `required` boolean  
  - `help_html` optional  
  - `metadata jsonb` default `{}` — validators, max files, MIME hints (keep small and validated server-side)

- **`assistance_requirement_tips`**  
  `id`, `requirement_id` FK, `sort_order`, `title`, `description`

**Versioning (strongly recommended):**

- **`assistance_catalog_versions`** — `id`, `published_at`, `published_by`, optional `label`
- **`assistance_services_snapshot`** / **`assistance_requirements_snapshot`** (or single `catalog_snapshot jsonb` per version) so changing copy doesn’t rewrite history for in-flight requests.

Mobile and admin **read published catalog** by version; draft edits stay in “draft” rows or `draft_*` columns until publish.

### 2.2 Runtime tables (modular requests)

**Target end state — single physical table:**

- **`requests`**  
  `id` uuid PK, `user_id`, **`service_key`** FK → `assistance_services(service_key)`, `status`, `request_code`, `submitted_at`, `case_study_date`, `additional_info`, `financial_request_type` (nullable — only used when service needs it), **`answers jsonb`** default `{}` for dynamic fields later, `catalog_version_id` FK nullable (which rules applied at submit), `created_at`, `updated_at`

**Attachments** (already modular):

- Keep **`request_attachments`** as canonical file store.
- Ensure every row has **`slot_key`** matching `assistance_requirements.slot_key` for that service version (enforced in app + optional DB check via trigger/RPC).

### 2.3 Compatibility — strangler pattern for current eight tables

During migration:

1. Keep existing `*_requests` tables **unchanged** for reads/writes that legacy code paths still use.
2. Add **`requests`** (new) and dual-write **or** sync via trigger/job — pick one strategy per phase:
   - **Recommended:** New code writes **`requests` only**; background sync fills legacy tables for admin screens until they switch — *or* legacy reads go through a **union view** expanded to include `requests` mapped to synthetic `request_table`.

You already have **`requests_v`** over eight tables. Extend the plan with **`requests_v2`** or evolve **`requests_v`** to:

```text
SELECT … FROM requests                    -- new modular
UNION ALL
SELECT … FROM hospitalization_requests AS legacy_mapped …
```

…until legacy tables are drained and dropped (last phase).

### 2.4 Admin RPCs (narrow, audited)

Replace ad hoc superadmin DB access with explicit functions:

- `publish_assistance_catalog(draft_id)` — SECURITY DEFINER, superadmin-only, transactional snapshot.
- `admin_catalog_upsert_service(...)`, `admin_catalog_upsert_requirements(...)` — or one JSON patch RPC with JSON-schema validation.
- Keep **`admin_request_op`** for operational request manipulation; evolve it to target **`requests`** first, then legacy aliases.

All write RPCs: **`audit_logs`** row + stable error codes.

---

## 3. Mobile — modular request module (minimal files, same UX)

### 3.1 Routing — keep URLs stable, shrink implementation

**Keep** existing expo-router paths (`/Home/Hospitalization/HospitalizationReq`, etc.) so bookmarks and notifications don’t break.

**Implementation:** Each route file becomes a **thin re-export** (~15 lines):

```text
app/Home/Hospitalization/HospitalizationReq.tsx
  → imports shared RequestFlowScreen with serviceKey="hospital"
```

No duplicate logic across eight files — **one** screen component:

| Path | Role |
|------|------|
| `app/request/RequestFlowScreen.tsx` | Single orchestrator: loads catalog for `serviceKey`, renders steps matching **today’s** layout |
| `shared/request/engine/useRequestFlow.ts` | Draft, NetInfo, submit, attachment orchestration (extends `useRequestForm`) |
| `shared/request/engine/CatalogProvider.tsx` | Fetches published catalog; caches (React Query or similar) |
| `shared/request/ui/RequirementAttachmentList.tsx` | Renders slots from catalog order |
| `shared/request/ui/ServiceCopyBlocks.tsx` | Description, reminder, tips — HTML/markdown from CMS |

**Optional pre-step routes** (financial subtype, burial details): stay as tiny wrappers that set **route params** then navigate to same `RequestFlowScreen` with combined context.

### 3.2 Catalog consumption

- On mount: `GET` published catalog (Edge Function or Supabase view `published_assistance_catalog_v`).
- **Fallback:** bundle **frozen JSON snapshot** (last published) for offline — matches current static behavior if API fails.
- **Parity guard:** Compare slot keys from API to expected default for known `service_key`; log analytics if mismatch (detect CMS errors early).

### 3.3 Submission path

- Insert into **`requests`** (target) with `service_key` + `catalog_version_id`.
- Attachments: same `request_attachments` rows with `slot_key` from catalog.
- Request code RPC unchanged.

---

## 4. Admin — wiring ContentManagement to Postgres

1. **Replace `useState(mobileAssistances)`** with React Query (or SWR) loading **`assistance_categories` + nested services + requirements + tips**.
2. **Draft vs publish:** Edit forms mutate draft tables or `status='draft'` rows; **Publish** calls `publish_assistance_catalog`.
3. **Media:** Upload images to Supabase Storage; store **path** in catalog columns; mobile uses signed URLs.
4. **Information.jsx** — same pattern for static/info pages if those are also CMS-driven.

Feature parity with current ContentManagement UI is preserved; only the persistence layer changes.

---

## 5. Phased rollout (recommended order)

Each phase ends with: **manual smoke script + optional Detox/E2E stub**.

| Phase | Backend | Mobile | Admin |
|-------|---------|--------|-------|
| **P0** | Create catalog tables + RLS + seed from today’s `services.ts` + snapshots | No change | ContentManagement reads DB read-only mirror of seed |
| **P1** | Add `requests` table + FK `service_key`; triggers or RPC dual-write from one pilot service | Pilot `service_key` uses `RequestFlowScreen` behind feature flag | — |
| **P2** | Migrate remaining services one-by-one | Thin route wrappers + delete duplicated `*Req.tsx` bodies | — |
| **P3** | Expand `requests_v` / routing views; move admin pipeline to unified reads | — | Applications screens use unified list |
| **P4** | Stop dual-write; archive legacy tables (migrate historical rows to `requests`) | — | — |
| **P5** | Drop redundant `*_file` columns (your `_phase10` migration) when attachments-only proven | — | — |

---

## 6. Parity & safety checklist (per service migration)

- [ ] Same attachment slot order and labels (or explicitly documented CMS-driven deltas per version)
- [ ] Same validation: required slots, file types, max size
- [ ] Same draft persistence keys / AsyncStorage behavior (or migration mapping)
- [ ] Same success route + request code display
- [ ] Same status chip mapping in Status tab
- [ ] Admin pipeline sees request in same queues as before
- [ ] RLS: applicant only sees own rows; staff roles unchanged

---

## 7. Minimal file count principle

- **Prefer one generic screen + data** over N copies.
- **Prefer route thin-files** over deleting routes (stable URLs).
- **Prefer DB views + one TS query module** over scattering SQL in components.
- **Cap:** `shared/request/**` as the only home for cross-service request logic; ban new `*Req.tsx` bodies outside migration.

---

## 8. What “done” looks like

1. Superadmin edits **ContentManagement** → publishes → mobile shows new copy/requirements **without app store release** (optional: force refresh or version bump).
2. Adding a **new** service = insert catalog rows + `service_key` + attachment slot definitions — **no new `*Req.tsx`** (only optional asset + thin route if new URL desired).
3. **Runtime** lives in **`requests` + `request_attachments`**; legacy eight tables empty or gone.
4. User-visible flows match today’s golden scenarios.

---

## 9. Immediate next actions (first sprint)

1. **DDL migration:** `assistance_categories`, `assistance_services`, `assistance_requirements`, `assistance_requirement_tips`, `assistance_catalog_versions` (+ snapshots if you want versioning day one).
2. **Seed script:** Export current `services.ts` + `fileTypes` into seed SQL matching ContentManagement shape.
3. **Read API:** `published_assistance_catalog_v` view or Edge Function returning nested JSON.
4. **Admin:** Wire `Services.jsx` load/save to draft tables (read-only publish button stub OK).
5. **Mobile:** Implement `RequestFlowScreen` for **one** pilot `service_key` behind `EXPO_PUBLIC_MODULAR_REQUEST=hospital` flag; compare side-by-side with existing screen until pixel-behavior match.

---

*This plan assumes Postgres + Supabase + expo-router. Adjust naming to taste; keep the separation: **catalog vs mechanics vs runtime**.*
