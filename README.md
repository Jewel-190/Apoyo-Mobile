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

## 3. Whole-system technology stack — how and why

### 3.1 Why Expo / React Native (not a mobile website, not Flutter)

Registration needs **camera frames**, **OS-backed secret storage**, and an installable **Android** package. A **PWA in Chrome** cannot meet that bar (background camera + hardware-backed session). **Flutter** would split the team across Dart vs the React used in Admin/Web. **Expo 54** ships **React Native 0.81** with **New Architecture** (Fabric/TurboModules) so camera and SecureStore talk to native modules efficiently.

**expo-router** maps files under `app/` to screens and to **deep links** (`apoyo://…`). Email confirmation from Resend must open **this app**, not the public website. That is why Auth `additional_redirect_urls` in Apoyo-Admin includes the `apoyo://` and `apoyocapstone://` schemes.

**expo-camera** (`CameraView`) streams frames for liveness. **expo-image-picker** / **document-picker** are for **ID stills** and **request PDFs/images** — different threat: ID can be a photo of a card; liveness cannot.

**@supabase/supabase-js** is the same protocol as the web apps (Auth + REST + Storage + `functions.invoke`). One backend, three clients. Public env: `EXPO_PUBLIC_*` or `app.json` `expo.extra` (**anon key only**).

### 3.2 Why the MPIN is a GoTrue password

Citizens will not maintain a 12-character password. Implementing `users.mpin_hash` ourselves means we re-implement **hashing, timing-safe compare, reset, lockout**. **GoTrue** already does that if the PIN **is** `signUp`/`signInWithPassword`’s `password` field. Postgres never stores the PIN in `public.users`. Apoyo-Admin sets **`minimum_password_length = 6`** so GoTrue does not reject sign-up. Staff passwords are a **different** code path (8+ in superadmin credential APIs).

**expo-secure-store** (chunked): the session JSON exceeds SecureStore’s per-key size on some devices, so it is split. Fallback **AsyncStorage** is only for web/dev where the OS keystore API does not exist.

### 3.3 Why the phone never calls CompreFace

If the APK contained `http://office-pc:8090`, (1) the verifier would have to be **on the tunnel** (faces on the public internet), and (2) the **API key** would ship in the binary. Instead:

1. Phone sends frames to **Edge Functions** over HTTPS (`api.apoyo-dasma.online`).
2. Deno validates a **registration-attempt token** (pre-auth).
3. Deno calls **`http://face-verifier:8080`** on Docker’s **internal network**, with `FACE_VERIFY_SERVICE_KEY` from server env.

| Technology | Applied to | Why not the alternative |
|------------|------------|-------------------------|
| **CompreFace** | 1:1 face **verification** (selfie vs ID), threshold ~0.85 | Cloud Face APIs (AWS/Azure) export **biometrics** and add a vendor. CompreFace is Dockerized 1:1 verification, which is the actual problem (not 1:N search of all citizens). |
| **DeepFace anti-spoof** | “Is this frame a live face or a print/screen?” | Matching ≠ anti-spoof. Without this, a printed ID photo held to the camera can still **match** CompreFace. |
| **MediaPipe** | Blink (EAR) + head pose across **several** frames | One still image is not liveness. MediaPipe is CPU-feasible inside the verifier container. |
| **Frame hashing (SHA-256 / aHash)** | Reject duplicate/near-duplicate frames | Stops “same JPEG uploaded 4 times” from counting as multi-frame liveness. |
| **EasyOCR + RapidFuzz** | ID text vs voter registry fields | No guaranteed MRZ/barcode on all PH IDs. Fuzzy match absorbs OCR errors. |
| **FastAPI** | `/verify`, `/verify-id`, `/warmup`, `/health` | ML stack is Python. Deno should not load PyTorch. Warmup avoids cold-start timeouts through Kong. |

### 3.4 Backend and hosting (shared with Admin/Web)

**PostgreSQL + RLS:** the phone uses the **anon key** (public) plus a **user JWT** after login. RLS is what stops client A from reading client B’s `assistance_requests` even if they call PostgREST directly.

**Kong** on `api.apoyo-dasma.online`: one hostname for Auth, REST, Storage, Functions so the app’s `supabaseUrl` is a single HTTPS origin (certificate via Cloudflare).

**Private Storage + signed URLs:** `request-documents` is not a public bucket. A leaked object path should not download medical files. The app uploads with the user JWT; viewing uses short-lived signed URLs.

**Cloudflare Tunnel:** the office PC usually has **no stable public IP**. The phone on cellular still reaches Auth because Cloudflare is the public anycast front; `cloudflared` on the PC is **outbound-only**.

**Resend:** GoTrue SMTP for confirmation/recovery. The app does not embed the Resend key.

**nginx** serves **Web and Admin only**. The APK does not go through nginx.

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

## 6. Face and ID verification — full pipeline and why Docker

Registration is not “upload a selfie and hope.” Apoyo must answer **three different questions**:

1. **Is this ID the voter we looked up?** (OCR vs `registered_voters` / registration profile)
2. **Is a live person in front of the camera?** (liveness + anti-spoof)
3. **Is that live person the same face as the ID photo?** (1:1 verification)

Those questions use **different models**. One cloud Face API cannot replace the stack without sending **biometrics off the office PC** and adding a fourth paid vendor. Implementation: `deploy/face-verification/`.

### 6.1 End-to-end path (phone → models)

The **APK never talks to Docker**. If it did, port 8090 would have to be public and the verifier API key would sit inside the binary.

```
Citizen (expo-camera)
    |  HTTPS  POST /functions/v1/id-document-verification
    |  HTTPS  POST /functions/v1/facial-verification
    |  body: images + registration-attempt token (not a logged-in JWT yet)
    v
Kong :54321  (api.apoyo-dasma.online via Cloudflare)
    v
Edge Function (Deno, Apoyo-Admin)
    |  checks registration-attempt token
    |  adds x-api-key (FACE_VERIFY_SERVICE_KEY from supabase/.env)
    |  HTTP to http://face-verifier:8080   <-- Docker DNS, not the internet
    v
apoyo-face-verifier  (FastAPI, this repo)
    |  /verify-id  --> EasyOCR + RapidFuzz
    |  /verify     --> liveness pipeline, then CompreFace
    v
CompreFace API / core  (Java + ML containers)
```

`FACE_VERIFY_SERVICE_URL` for Edge must be **`http://face-verifier:8080`**. `127.0.0.1:8090` is the **Windows host** loopback. Inside the Edge container, `127.0.0.1` is **that container**, so Deno cannot reach the verifier that way. Compose attaches the verifier to `supabase_network_ApoyoAdmin` with alias `face-verifier` so functions can resolve it.

### 6.2 What the citizen does on device

Registration is ordered (see `app/phase1/register.tsx`):

1. Voter lookup (Postgres) — who they claim to be.
2. **ID still** (`expo-image-picker`) → Edge `id-document-verification` → verifier **`POST /verify-id`**.
3. **Live capture** (`expo-camera`): several frames (straight / left / right / blink as the UI prompts) → Edge `facial-verification` → verifier **`POST /verify`**.
4. Only then MPIN + email. Face success is bound to a **registration-attempt token**, not to a finished Auth user.

ID capture and liveness capture are **different APIs** on purpose. A gallery photo of a card is valid for OCR. A gallery photo is **not** valid as liveness (that is a classic spoof).

### 6.3 POST /verify-id — ID document vs profile

Code: `deploy/face-verification/verifier/id_match.py`.

- Decode the ID image (OpenCV), cap long side (~1600 px) so OCR stays fast.
- **EasyOCR** (`en`, CPU) reads text lines.
- **RapidFuzz** compares that text to the registration profile (name tokens, birth date patterns, etc.). Thresholds (e.g. name >= 72) absorb OCR noise; PH IDs are not a guaranteed MRZ/barcode we control.
- Pass/fail scores go back through the Edge Function to the app.

This is **not** face matching. It is “does this plastic match the voter row?”

### 6.4 POST /verify — liveness then 1:1 face match

Code: `deploy/face-verification/verifier/main.py`. Gate: header **`x-api-key`** must equal `FACE_VERIFY_SERVICE_KEY`.

Default knobs (compose `.env`): at least **4** frames, similarity **>= 0.85**, anti-spoof on, blink on.

Pipeline (fail closed — any stage can reject):

| Stage | Mechanism | Attack it stops |
|-------|-----------|-----------------|
| 1. Enough frames | `LIVENESS_MIN_FRAMES` (default 4) | Single JPEG pretending to be a session |
| 2. Frame diversity | SHA-256 of bytes + **aHash Hamming** distance | Same file uploaded four times; tiny crops of one photo |
| 3. Pose (optional) | MediaPipe Face Mesh **yaw**; left / right / front | Holding a phone still on a printed photo |
| 4. Blink (optional) | Eye aspect ratio (**EAR**) delta across frames | Open-eye printout with no blink |
| 5. Anti-spoof | **DeepFace** `extract_faces(..., anti_spoofing=True)` | Screen replay / paper face that still “looks like” a face |
| 6. 1:1 match | **CompreFace** `POST /api/v1/verification/verify` ID vs a live frame | Sibling / random person who passed liveness |

**Why both DeepFace and CompreFace?** CompreFace answers *similarity of two faces*. DeepFace answers *is this a real capture*. A printed ID held to the camera can **match** the ID photo on CompreFace and still be a spoof; anti-spoof is a separate classifier.

**Why MediaPipe in Docker, not only on the phone?** The UI already prompts pose/blink, but **enforcement** must happen on the server. A patched APK could skip the UI and POST four identical frames. Hash + EAR + yaw run where the attacker does not control the code.

**Warmup:** PyTorch / DeepFace / EasyOCR / CompreFace are slow on first load. FastAPI **`/warmup`** and startup tasks load weights so Kong does not 504 the first registrant. **`GET /health`** reports `ok` vs `warming`.

### 6.5 Docker Compose topology

File: `deploy/face-verification/docker-compose.yml`. Project name: `apoyo-face-verification`.

```
                    [host loopback only]
  127.0.0.1:8000 --> compreface-fe          operator UI (NOT on Cloudflare)
  127.0.0.1:8090 --> apoyo-face-verifier    health/debug (NOT on Cloudflare)

  Docker network "default" (face stack)
    compreface-postgres-db     CompreFace's own Postgres volume
    compreface-api             verification HTTP API
    compreface-admin           apps / API keys
    compreface-core            embeddings / detect (ML)
    compreface-fe              UI in front of admin+api
    apoyo-face-verifier        our FastAPI (build ./verifier)

  Docker network "supabase_network_ApoyoAdmin" (external)
    alias face-verifier --> same apoyo-face-verifier
    (Kong / edge-runtime already live here after npx supabase start)
```

CompreFace is **several containers** because upstream designed it that way (API, admin, ML core, UI, DB). We did not reimplement embeddings; we **wrap** their verification API after our liveness gates.

Logs are capped (`json-file` max 10m x 3) so debug output cannot fill the disk.

**Start order:** `npx supabase start` first (creates `supabase_network_ApoyoAdmin`), then `docker compose up` in this folder. After `supabase stop`, compose must be run again so the verifier **re-joins** that network.

### 6.6 Why this is on Docker

| Reason | What that means technically |
|--------|-----------------------------|
| **Linux ML stack on a Windows PC** | CompreFace images, PyTorch/DeepFace, EasyOCR, Java APIs are **Linux**. Docker Desktop (WSL2) is the ABI. Native Windows Python would fight wheels and would not match another office PC. |
| **Isolation** | Models and CompreFace Postgres are **not** mixed into Supabase’s Postgres. A face-stack wipe does not drop `assistance_requests`. |
| **Reproducibility** | Image tags `exadel/compreface-*:1.2.0` + `build: ./verifier` pin versions. Cutover is `compose up`, not “install CUDA by hand.” |
| **Private network** | Edge Functions reach `face-verifier` **without a public hostname**. That is why compose declares `networks.supabase`. |
| **Resource control** | Java heap (`-Xmx1g`), CompreFace `uwsgi` processes, `restart: unless-stopped` — knobs we lose if models run loose on the host. |
| **No extra vendor** | AWS Rekognition / Azure Face would be a **fourth subscription** and **PII leaving Dasmariñas**. Docker keeps inference on the city’s disk. |
| **Not in the APK** | Phones have uneven CPUs. On-device DeepFace+CompreFace would drain battery, skip server-side enforcement, and ship weights to every citizen. |
| **Not on the tunnel** | Cloudflare ingress is only `:4173`, `:4174`, `:54321`. `:8000` and `:8090` bind **`127.0.0.1`**. Operators can still open CompreFace locally to paste `COMPREFACE_API_KEY`. |

**Why not one mega-container?** CompreFace already splits API/core/DB. FastAPI is a **small** policy layer (liveness + OCR + auth header). Merging them would make CompreFace upgrades harder and mix Python with Java.

**Why not a GPU requirement?** Defaults assume **CPU** (EasyOCR `gpu=False`, CompreFace core on CPU). The office PC must run without a datacenter GPU. Timeouts (`VERIFY_TIMEOUT_SEC`, Kong/edge) are sized for that.

### 6.7 What is not face verification

- Logging in with MPIN later does **not** re-run liveness.
- Assistance **document uploads** go to Storage (`request-documents`), not through CompreFace.
- Superadmin **does not** need the face stack to review a case; they see submitted files. Face is a **registration gate** only.

Do **not** add `8090` or `8000` to `cloudflared` config.

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
