@AGENTS.md

# Dog Adventure Hikes — Session Summary

**Brand:** Tails to Trails
**Purpose:** Dog hiking service based in Ulaanbaatar, Mongolia. Staff manage bookings, approvals, and hike days. Clients book hikes for their dogs.

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16.2.6 (App Router, `'use client'` throughout) |
| Language | TypeScript 5 |
| Database / Auth | Supabase (`@supabase/supabase-js` 2.x, plain `createClient` — NOT SSR) |
| Styling | Inline React styles for brand tokens; Tailwind 4 for layout utilities |
| Drag-and-drop | `@hello-pangea/dnd` 18 (React-compatible fork of react-beautiful-dnd) |
| Excel export | `exceljs` |
| Images | Next.js `<Image>` component, `images: { unoptimized: true }` in `next.config.ts` |
| Auth method | Supabase phone OTP (`signInWithOtp` / `verifyOtp`, SMS) |
| Route guard | `proxy.ts` (Next.js 16 convention — replaces `middleware.ts`, named export `proxy`) |

> **AGENTS.md rule:** Read `node_modules/next/dist/docs/` before writing any Next.js code. APIs and conventions differ from training data.

---

## Design Tokens

Apply these values everywhere via inline styles. Never use Tailwind color classes for brand colors.

### Colors

| Token | Hex | Usage |
|---|---|---|
| `forest` | `#26452B` | Primary action, borders, selected states, buttons |
| `moss` | `#4D6B46` | Secondary text, zone labels, icons |
| `bg` | `#F5F0E8` | Page background (all pages) |
| `brown` | `#3B2A1F` | Primary text, headings |
| `muted` | `#8A7E72` | Secondary text, subtitles, labels |
| `cardBorder` | `#E8E2D9` | Card and input borders |
| `badgeBg` | `#EEE9E0` | Unselected chips, blocked calendar cells |
| `sand` | `#E6C89A` | Accent text on dark backgrounds |
| `orange` | `#E08A3E` | Today indicator, warning states, "Today" badge |
| `completeBg` | `#E8F0E5` | Open/approved/success backgrounds |
| `inputText` | `#171717` | Input text color (always pair with `WebkitTextFillColor`) |
| `red` | `#ef4444` | Error messages |

### Typography

| Usage | Size | Weight | Color |
|---|---|---|---|
| Page title (large) | 26px | 700 | `#3B2A1F` |
| Page title (medium) | 20–22px | 700 | `#3B2A1F` |
| Section title | 18px | 700 | `#3B2A1F` |
| Card title / dog name | 16px | 700 | `#3B2A1F` |
| Body / label | 14px | 400–700 | `#3B2A1F` |
| Secondary / subtitle | 14px | 400 | `#8A7E72` |
| Small label | 12–13px | 400–600 | `#8A7E72` |
| Micro | 10–11px | 400 | `#8A7E72` |
| Font stack | `'Noto Sans', system-ui, sans-serif` | — | — |

### Inputs (all text inputs and textareas)

```tsx
style={{
  borderRadius: 10,
  border: '1px solid #E8E2D9',
  padding: '12px',
  fontSize: 14,
  color: '#171717',
  backgroundColor: 'white',
  WebkitTextFillColor: '#171717',  // required — prevents invisible text on iOS/Safari
  outline: 'none',
  fontFamily: FONT,
  boxSizing: 'border-box',
}}
```

### Buttons

```tsx
// Primary (forest green)
{ backgroundColor: '#26452B', color: 'white', borderRadius: 12, fontWeight: 600, padding: '14px', border: 'none' }

// Secondary / cancel
{ backgroundColor: 'white', border: '1px solid #E8E2D9', color: '#3B2A1F', borderRadius: 12, padding: '12px 24px' }

// Back button (circle)
{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#E8E2D9', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
// Contains: chevron-left SVG, stroke '#26452B', strokeWidth 2.5
```

### Cards

```tsx
{ backgroundColor: 'white', border: '1px solid #E8E2D9', borderRadius: 16, padding: 16 }
```

### Status badges / pills

| Status | Background | Text |
|---|---|---|
| Active / Approved | `#E8F0E5` | `#26452B` (or `text-green-700`) |
| Pending | `bg-amber-100` | `text-amber-700` |
| Rejected / Declined | `bg-red-100` | `text-red-700` |
| Incomplete | `bg-gray-100` | `text-gray-500` |
| Today | `#E08A3E` | white |

### Section headers (with accent bar)

```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
  <div style={{ width: 3, height: 16, backgroundColor: '#26452B', borderRadius: 2 }} />
  <h2 style={{ fontSize: 14, fontWeight: 700, color: '#3B2A1F' }}>Title</h2>
</div>
```

---

## Auth Flow

**Onboarding (new users):**
1. `/onboarding` — collect name, language, address → `localStorage('onboarding_profile')`
2. `/onboarding/dog` — collect dog info + photo → `localStorage('onboarding_dog')` (photo stored as base64 data URL)
3. `/onboarding/contract` — accept service agreement → `localStorage('onboarding_contract')`
4. `/login` — phone OTP auth
5. After OTP verified: `verifyOtp()` checks `localStorage('onboarding_profile')`. If present, writes all data to Supabase (`users` upsert + `dogs` insert + photo upload), clears localStorage, redirects to `/onboarding/pending`

**Returning users:**
- `/login` OTP → `getUserState()` → `landingRoute()` → appropriate page

**`landingRoute()` logic** (`lib/userState.ts`):
- No profile → `/onboarding`
- `role === 'staff'` → `/staff`
- Any dog with `approval_status = 'approved' | 'approved_with_conditions'` → `/client`
- Dogs exist but none approved → `/onboarding/pending`
- Profile but no dogs → `/onboarding/dog`

**`/onboarding/pending`** polls Supabase every 10s, queries `dogs` table directly for approved status. On approval detected: stops polling, sets `redirecting = true`, pushes to `/client`.

**`/client/page.tsx`** — redirect shim only, immediately calls `router.replace('/client/home')`.

**`proxy.ts`** — Next.js 16 route guard. Currently passes everything through (public routes list exists but both branches return `NextResponse.next()`). Auth is enforced client-side via `supabase.auth.getSession()` in each page's `useEffect`.

---

## Database Schema (Supabase)

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Supabase auth UID |
| `name` | text | |
| `phone` | text | |
| `address` | text | Pickup address |
| `language` | text | `'mn'` or `'en'` |
| `role` | text | `'client'` or `'staff'` |
| `zone_id` | uuid FK → zones | Assigned hiking zone |
| `approved_at` | timestamptz | Set when zone is assigned (legacy — approval status now driven by `dogs.approval_status`) |
| `training_interest` | boolean | |
| `created_at` | timestamptz | |

### `dogs`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `owner_id` | uuid FK → users | |
| `name` | text | |
| `breed` | text | |
| `age_years` | integer | |
| `weight_kg` | numeric | |
| `sex` | text | `'male'` or `'female'` |
| `neutered` | boolean | |
| `recall_score` | integer | 1–5 |
| `car_score` | integer | 1–5 |
| `social_score` | integer | 1–5 |
| `known_aggression` | boolean | |
| `airtag_confirmed` | boolean | |
| `ecollar` | boolean | |
| `disposition_notes` | text | |
| `other_notes` | text | |
| `photo_url` | text | Full URL from Supabase Storage |
| `approval_status` | text | `'pending' \| 'approved' \| 'approved_with_conditions' \| 'declined'` |
| `approval_conditions` | text | Only when `approved_with_conditions` |
| `decline_reason` | text | Only when `declined` |
| `approved_at` | timestamptz | Set on approval |
| `approved_by` | uuid FK → users | Staff member who approved |
| `created_at` | timestamptz | |

### `zones`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | e.g. "Zone A" |
| `description` | text | |

### `hike_days`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `date` | date | YYYY-MM-DD |
| `status` | text | `'open' \| 'full' \| 'blocked' \| 'cancelled'` |
| `capacity` | integer | Default 10 |
| `allow_over_capacity` | boolean | |
| `zones` | uuid[] | Array of zone IDs running that day |
| `destination_override` | text | Location name shown to clients |
| `client_note` | text | Visible to clients at booking |
| `created_by` | uuid FK → users | |

### `bookings`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `owner_id` | uuid FK → users | |
| `dog_id` | uuid FK → dogs | |
| `hike_day_id` | uuid FK → hike_days | |
| `status` | text | `'pending_payment' \| 'confirmed' \| 'cancelled' \| 'no_show'` |
| `pickup_method` | text | `'curbside' \| 'home'` |
| `dropoff_method` | text | `'curbside' \| 'home'` |
| `amount_charged` | integer | In MNT (₮) |
| `credit_used` | integer | Credits applied |
| `dropped_off_at` | timestamptz | Set during hike run |
| `pickup_order` | integer | **Added this session** — 0-based index for draggable pickup order on hike detail page |
| `created_at` | timestamptz | |

### `trail_pack_credits`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `owner_id` | uuid FK → users | |
| `credits_remaining` | integer | |
| `purchase_amount` | integer | |
| `expires_at` | timestamptz | 6 months from purchase |

### `hike_photos`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `hike_day_id` | uuid FK → hike_days | |
| `dog_id` | uuid FK → dogs | nullable (group photos) |
| `uploaded_by` | uuid FK → users | Staff member |
| `storage_path` | text | Path in `dog-photos` Supabase Storage bucket |
| `caption` | text | |
| `taken_at` | timestamptz | |
| `created_at` | timestamptz | |

### Supabase RPC functions
- `hike_day_booked_counts()` — returns `{ hike_day_id, confirmed }` rows for all days; SECURITY DEFINER so clients can't read others' bookings

### Migrations applied
- `pickup_order integer` column added to `bookings` — run manually in Supabase. Hike detail page drag-to-reorder is working correctly.

---

## File Structure

### App pages

```
app/
├── page.tsx                        Landing page (hero image, logo, CTA buttons)
├── login/page.tsx                  Phone OTP auth + post-auth localStorage flush
├── client/
│   ├── page.tsx                    Redirect shim → /client/home
│   ├── home/page.tsx               Client dashboard
│   ├── book/page.tsx               Booking flow
│   ├── book/payment/page.tsx       Payment step
│   ├── bookings/[id]/page.tsx      Booking detail
│   ├── history/page.tsx            Booking history
│   └── profile/page.tsx            Client profile
├── onboarding/
│   ├── page.tsx                    Step 1: name, language, address
│   ├── dog/page.tsx                Step 2: dog profile (3-step internal)
│   ├── contract/page.tsx           Step 3: service agreement
│   └── pending/page.tsx            Waiting for approval (polls every 10s)
└── staff/
    ├── page.tsx                    Staff dashboard (metrics, quick actions)
    ├── approvals/page.tsx          Dog approval queue (drag-resolved)
    ├── calendar/page.tsx           2-week calendar + day editor
    ├── clients/
    │   ├── page.tsx                Client list with search
    │   └── [userId]/page.tsx       Client detail (dogs, zone, bookings, credits)
    ├── hikes/
    │   ├── page.tsx                Upcoming hike list
    │   ├── [date]/page.tsx         Hike detail (draggable dog cards)
    │   └── [date]/run/page.tsx     Live hike run (drop-off tracking)
    ├── zones/[userId]/page.tsx     Zone assignment (post-approval)
    ├── revenue/page.tsx            Revenue detail
    └── exceptions/page.tsx         Cancellations, no-shows, holding fees
```

### Lib modules

```
lib/
├── supabase.ts       Supabase client (plain createClient, not SSR)
├── userState.ts      getUserState(), landingRoute() — routing source of truth
├── adminData.ts      Staff data fetchers: clients, metrics, hike details, summaries
├── booking.ts        Types, date helpers, pricing constants, Trail Pack helpers
├── photos.ts         uploadDogProfilePhoto(), uploadHikePhoto(), getPhotoUrl()
└── excelExport.ts    Export all client+booking data to .xlsx
```

### Key root files
```
proxy.ts              Next.js 16 route middleware (named export 'proxy')
next.config.ts        images: { unoptimized: true }
public/images/
  landing-hero.jpg    Hero image for landing page
  logo.png            Tails to Trails logo (280×200 display, objectFit: contain)
```

---

## UI Polish — Completed This Session

All staff-facing pages below have been converted from default Tailwind to brand tokens.

| Page | Status |
|---|---|
| Landing page (`/`) | ✅ Hero image, logo, gradient overlay, typography |
| Login (`/login`) | ✅ Full token pass, OTP focus state, logo |
| Onboarding welcome (`/onboarding`) | ✅ Logo, language toggles, typography |
| Onboarding dog (`/onboarding/dog`) | ✅ 3-step form, ScoreSelector, YesNo, photo picker |
| Onboarding contract (`/onboarding/contract`) | ✅ Section cards, checkbox, submit button |
| Onboarding pending (`/onboarding/pending`) | ✅ Status checklist, polling redirect |
| Staff dashboard (`/staff`) | ✅ Full token pass (separate earlier session) |
| Staff approvals (`/staff/approvals`) | ✅ Resolved-status badge, "Assign zone →" CTA |
| Staff client list (`/staff/clients`) | ✅ Per-client cards, search, status badges |
| Staff client detail (`/staff/clients/[userId]`) | ✅ Inline approval editor, status badge from dogs |
| Staff calendar (`/staff/calendar`) | ✅ Calendar grid + expanded day editor panel |
| Staff hikes list (`/staff/hikes`) | ✅ Individual cards, Today badge, dog thumbnails |
| Staff hike detail (`/staff/hikes/[date]`) | ✅ Draggable cards, dog photos, notification placeholder |
| Staff zones (`/staff/zones/[userId]`) | ✅ Back button → /staff/clients |
| Staff hike run (`/staff/hikes/[date]/run`) | ✅ Draggable pickup queue, hero card, brand tokens |
| Staff revenue (`/staff/revenue`) | ✅ Brand tokens applied |
| Staff exceptions (`/staff/exceptions`) | ✅ Real DB query + brand token polish |
| Client dashboard (`/client/home`) | ✅ Brand tokens applied |
| Client booking flow (`/client/book`) | ✅ Brand tokens applied |
| Client payment step (`/client/book/payment`) | ✅ Brand tokens applied |
| Client booking history (`/client/history`) | ✅ Brand tokens applied |
| Client dog profile (`/client/profile`) | ✅ Brand tokens applied |

### Not yet polished
- `/client/book/payment` confirmation screen (post-payment)

---

## Known Bugs / Issues

### Active (unresolved)

1. **`landingRoute()` uses stale approval check** — `lib/userState.ts` still checks `users.approved_at && users.zone_id` instead of `dogs.approval_status`. Approved users without a zone assignment may get routed to `/onboarding/pending` instead of `/client`. The fix was written but reverted when it caused a 404 on `/client` (now resolved — `app/client/page.tsx` exists as a redirect shim to `/client/home`). Safe to re-apply, but carefully: only change the approval detection logic, do not change the redirect target away from `/client`.

2. **RLS blocks "Add dog" on run page** — `handleAddDog()` in `/staff/hikes/[date]/run/page.tsx` inserts into `bookings` with `staff_added: true`. This fails with a row-level security error because the RLS policy on `bookings` only allows inserts by the row's `owner_id`. Fix: add a Supabase RLS policy allowing staff role to insert into `bookings`, or use a SECURITY DEFINER RPC function for the insert.

4. **Onboarding localStorage-deferred flow needs re-applying** — The localStorage-deferred auth flow (onboarding stores data client-side, flushed to Supabase after OTP) was implemented but the commits were hard-reset to `37b3346`. Needs clean re-implementation. `app/client/page.tsx` now exists so the 404 that triggered the revert won't recur.

3. **Payment confirmation screen** — Post-payment success screen after booking completes has no brand token styling.

5. **Notification sending deferred** — "ETA for pickup / ETA for drop-off" buttons on both the pre-hike and run pages are placeholders (`cursor: not-allowed`, "Coming soon" note). Implementation deferred.

6. **`proxy.ts` auth not enforced** — Both branches of the proxy return `NextResponse.next()`. Auth is enforced client-side only. Acceptable for now; harden before public launch.

### Known working
- Drag reorder on both pre-hike (`/staff/hikes/[date]`) and run (`/staff/hikes/[date]/run`) pages saves `pickup_order` to Supabase correctly
- Auto-advance to Hike tab when all pending dogs are confirmed or marked no-show
- Booking gate blocks dates where a hike has already started (run page active)
- `pickup_order` column exists in `bookings` table — migration applied manually

### Resolved
- Exceptions page showing 0 — page was a placeholder with hardcoded empty array; now queries `bookings WHERE status IN ('no_show', 'cancelled')` joined with dogs/users/hike_days
- `/client` route 404 — added `app/client/page.tsx` as redirect shim to `/client/home`
- Invisible input text on mobile/Safari — `WebkitTextFillColor: '#171717'` applied to all inputs
- Hike detail "No confirmed bookings" — was caused by missing `pickup_order` column; migration applied
- Staff approvals badge not updating — `resolvedStatus` local state
- Active client count wrong — `clientStatus()` now reads `dogs.approval_status`
- Back button on zones page going to approvals — fixed to `/staff/clients`
- Client detail status badge stale after inline approval edit — `isActive` derived from `dogs` state
- Gana 2 accidental pickup — nulled via `UPDATE bookings SET picked_up_at = NULL WHERE dog_id = (SELECT id FROM dogs WHERE name = 'Gana 2') AND picked_up_at IS NOT NULL`

---

## Recent Commits (newest first)

```
40d2af0  Fix exceptions page: implement real DB query + full UI polish
fb5974f  Hike run page: drag-to-reorder pickup queue, remove action buttons from list
a9bd812  Hike run page: full UI redesign + pickup_order sort + dog photos
533e7cf  Landing page: remove tagline text, responsive logo size on desktop
375207e  Landing page: move logo to top, letterbox on desktop
4498565  Update CLAUDE.md with corrections and remaining polish list
0750496  UI polish pass on calendar expanded day panel
40839e4  UI polish pass on staff upcoming hikes list page
9b345eb  Fix pickup/dropoff pills to always display inline on dog cards
136fe48  Staff hike detail: UI redesign + draggable card order
2457e38  UI polish pass on staff calendar page
ecdc5d9  Add /client redirect page to /client/home
37b3346  Fix staff approvals: real-time badge update + correct active client status
```

---

## Pricing / Business Rules

- Hike price: ₮50,000 per dog per session
- Trail Pack: 4 hikes for ₮180,000 (saves ₮20,000) — client gets 3 banked credits immediately
- Trail Pack credits expire 6 months after purchase
- Cancellation before 5pm day prior: credit held as Trail Pack credit (valid 60 days)
- Cancellation after 5pm or same-day: fee forfeited
- Holding fee applies if dog not present within 10 minutes of arrival notification
- Client is "Active" as soon as any dog has `approval_status = 'approved' | 'approved_with_conditions'`
- Client is "Rejected" if any dog is `declined` and none are approved

---

## Collaboration Notes

- All pages are `'use client'` — no server components in use
- Supabase auth is phone-only (no email/password)
- `@supabase/ssr` is installed but not used — use plain `createClient` from `@supabase/supabase-js`
- Do not use `router.back()` — always use explicit `router.push()` paths
- Input text visibility fix: always include both `color: '#171717'` AND `WebkitTextFillColor: '#171717'` on inputs/textareas
- Inline styles preferred over Tailwind for any brand-specific value; Tailwind fine for structural layout (flex, grid, min-h-screen, etc.)
