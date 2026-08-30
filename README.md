# Apoyo Mobile

Citizen **Android** application for **Apoyo**, the City of Dasmariñas digital social-welfare assistance platform. Registered voters create an account (email + **6-digit MPIN**), prove identity with a **valid ID** and **liveness/face match**, then apply for catalogued assistance programs.

This README documents **this app**, the **on-PC face stack**, and the **whole Apoyo system**, so the repository can stand alone in a thesis defense.

Sibling repositories:

| Repo | Role | GitHub |
|------|------|--------|
| **Apoyo-Admin** | Postgres, Auth, Storage, Edge Functions, staff UI | https://github.com/Jewel-190/Apoyo-Admin |
| **Apoyo-Web** | Public marketing site | https://github.com/Jewel-190/Apoyo-Web |
| **Apoyo-Mobile** (this repo) | Expo app + face-verification compose | https://github.com/Jewel-190/Apoyo-Mobile |

---

## 1. What Apoyo is (defense one-liner)

Apoyo is a **self-hosted, three-application system**:

- **Mobile** (this repo) — the citizen product.
- **Web** — public information (no login).
- **Admin** — city staff process cases; superadmins run CMS, voters, and settings.

The phone talks only to **`https://api.apoyo-dasma.online`**. That hostname is a **Cloudflare Tunnel** into a **Windows office PC** running local **Supabase** (Postgres, GoTrue, Storage, Edge Functions). Face-matching models run in **Docker on that same PC** and are **not** published to the internet.

Paid third parties: **Cloudflare**, **Resend** (email), **Hostinger** (domain). There is no hosted Supabase cloud project in the production path.

---

## 2. Whole-system architecture

```
  Citizen phone (this app)
           |
           |  HTTPS  (anon key + user JWT after login)
           v
  api.apoyo-dasma.online     Cloudflare Tunnel
           |
           v
  Kong :54321 on the office PC
     ├── GoTrue          email + MPIN-as-password
     ├── PostgREST       users, requests, catalog, RPCs
     ├── Storage         request-documents, avatars
     └── Edge Functions
            ├── facial-verification
            └── id-document-verification
                     |
                     |  Docker network (not tunneled)
                     v
            face-verifier :8080
               ├── DeepFace anti-spoof
               ├── MediaPipe blink / pose
               ├── EasyOCR + RapidFuzz (ID text)
               └── CompreFace (selfie vs ID photo)
```

**Defense talking point:** biometric and ID images used during registration are processed **inside the city’s machine**. The app never opens a public face-AI URL.

---

## 3. Whole-system technology stack

| Layer | Technology | Where |
|-------|------------|--------|
| Citizen UI | **Expo ~54**, **React 19.1**, **React Native 0.81**, **expo-router 6**, New Architecture | this repo |
| Navigation | File-based routes in `app/` + bottom tabs | this repo |
| Session | **expo-secure-store** (chunked) + AsyncStorage fallback | `AppCore/SecureAuthStorage.ts` |
| Camera / files | **expo-camera**, image/document pickers, **expo-file-system** | registration + requests |
| Backend | **Supabase local**: PostgreSQL 17, GoTrue, PostgREST, Storage, Deno Edge, Kong | Apoyo-Admin |
| Staff UI | React 19 + Vite 7 + Tailwind 4 | Apoyo-Admin |
| Public site | React 19 + Vite 7 + Tailwind 4 | Apoyo-Web |
| Face stack | CompreFace 1.2, FastAPI, DeepFace, MediaPipe, EasyOCR | `deploy/face-verification/` |
| Hosting | Docker Desktop, nginx (web/admin), Cloudflare Tunnel, Resend, Hostinger | office PC |

Client library: **`@supabase/supabase-js`**. Config: `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`, with fallbacks in `app.json` `expo.extra` (public anon key only).

---

## 4. What the citizen app does

| Flow | What happens |
|------|----------------|
| Splash / onboarding | Branding, then login or register |
| Register | Voter lookup → profile from `registered_voters` → contact/address → **ID photo** → **multi-frame face/liveness** → MPIN × 2 → email OTP / magic link → `finalize_registration_profile` |
| Login | Email + 6-digit MPIN (`signInWithPassword`). UI lockout after 5 failures (5 minutes). Email must be confirmed and a `public.users` row must exist. |
| Home | CMS-driven service catalog; start a draft request |
| Apply | Request info → requester confirm → requirement fields/uploads → `submit_assistance_request` |
| Status | Track pipeline, timelines, **action required** resubmits |
| Notifications | In-app inbox (edge function `notifications`) |
| Account | Profile, avatar, legal, contact, change MPIN, forgot-MPIN |

Deep links: scheme **`apoyo`** (also `apoyocapstone` allowed in Auth redirect list) for email confirmation callbacks.

---

## 5. Authentication design (MPIN)

GoTrue’s **password is the 6-digit MPIN**. That is a product decision, not a bug:

- Citizens remember a PIN, not a long password.
- GoTrue still **hashes** it (bcrypt/Argon via Auth). The PIN is **not** a column in `public.users`.
- Apoyo-Admin sets `minimum_password_length = 6` so sign-up is not rejected.
- **Staff** accounts in Admin still require **8+** characters when superadmins create them.

Change MPIN: re-auth with current PIN, then `auth.updateUser({ password })`. Forgot MPIN: Resend recovery email + OTP.

Sessions on device: **SecureStore** (encrypted OS storage), chunked because of size limits.

---

## 6. Face and ID verification (this repo’s Docker stack)

Compose file: `deploy/face-verification/docker-compose.yml`.

| Service | Job |
|---------|-----|
| `compreface-*` | Exadel CompreFace 1.2 (API, admin UI on `127.0.0.1:8000`, ML core, its own Postgres) |
| `apoyo-face-verifier` | Custom **FastAPI** app on `127.0.0.1:8090` |

Verifier endpoints (shared secret header `x-api-key`, **not** called from the phone):

| Path | Purpose |
|------|---------|
| `GET /health` | Models warming vs ready |
| `POST /warmup` | Load MediaPipe / DeepFace / OCR / CompreFace |
| `POST /verify-id` | OCR + fuzzy match vs registration profile |
| `POST /verify` | Multi-frame liveness, then selfie↔ID similarity (threshold ~0.85) |

`/verify` rejects static replays (hash / aHash), optional pose sequence, blink (EAR), then DeepFace anti-spoof, then CompreFace.

The verifier joins Docker network `supabase_network_ApoyoAdmin` as alias **`face-verifier`**. Edge functions use `FACE_VERIFY_SERVICE_URL=http://face-verifier:8080`.

**Do not** put `:8090` on the Cloudflare tunnel.

---

## 7. App structure

```
app/
  index.tsx                 splash
  _layout.tsx               fonts, gates, tabs host
  phase1/                   onboarding, login, register, forgot-pin, legal
  Home/                     catalog, ApprovedAssistance, request wizard
  Status/                   list + details + action-required
  Notification/
  Account/                  profile, contact, legal, ChangePin
AppCore/                    Supabase client, auth, uploads, snapshots, routes
deploy/face-verification/   Docker stack + Python verifier
```

**Tabs:** Home · Status · Notifications · Account.

Registration step index (see `phase1/register.tsx`): register → extra info → mobile/address → ID → face → MPIN → confirm MPIN → email → success.

---

## 8. Data the phone is allowed to touch

- **Anon key + user JWT** after login.
- RPCs such as `begin_registration_attempt`, `finalize_registration_profile`, `submit_assistance_request`.
- Storage bucket **`request-documents`** (private, signed URLs to view; ~5 MB images/PDF).
- Bucket **`avatars`** for profile photos.
- Applicant **identity snapshot** on submitted requests: historical screens (e.g. `ApprovedAssistance`) prefer `applicant_*` columns so a later profile edit does not rewrite old cases. The request **form** still autofills from live `users`.

Privileged staff operations are **not** in this app; they live in Apoyo-Admin.

---

## 9. How this app is built and shipped

```bash
cp .env.example .env     # EXPO_PUBLIC_SUPABASE_URL + anon key
npm install
npx expo start
```

Android package id: `com.anonymous.APOYOCAPSTONE` (see `app.json`). EAS project id is in `expo.extra.eas`. Producing an APK/AAB is **separate** from turning over the Windows server.

The running API URL in production is **`https://api.apoyo-dasma.online`**. If the tunnel and local Supabase are up, existing installs keep working without a store release.

---

## 10. Security story (mobile + system)

1. Phone never holds the service role or Resend key.
2. Face/ID traffic: phone → edge function → localhost Docker (not a public ML API).
3. SecureStore for sessions.
4. Registration gated by voter registry + registration-attempt tokens on face/ID functions.
5. HTTPS via Cloudflare; office origin is loopback.
6. Document bucket is private; guessing URLs does not leak files.
7. Snapshots protect historical applicant identity on cases.

---

## 11. Defense map (question → this repo vs others)

| Question | Answer |
|----------|--------|
| Where is the citizen UX? | This repo `app/` |
| Where is MPIN defined? | GoTrue password; policy in Apoyo-Admin `supabase/config.toml` |
| Where are the neural nets? | `deploy/face-verification` |
| Who calls CompreFace? | Python verifier, then edge functions in **Apoyo-Admin** (canonical) / copies under this repo’s `supabase/functions` for local experiments |
| Where do staff approve? | Apoyo-Admin |
| Where is the public website? | Apoyo-Web |

Canonical edge functions and migrations for production are maintained in **Apoyo-Admin**. This repo’s face compose is what the office PC runs beside that backend.
