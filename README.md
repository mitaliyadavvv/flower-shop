# posy — flowers, made by you

A tiny flower studio on the internet. Arrange a hand-drawn bouquet with hand gestures (or a mouse/finger), write a little note, and send it as a link. The recipient gets a small, unhurried reveal: an envelope moment, the bouquet blooming stem by stem, then the card.

- **Next.js 16 (App Router) + React 19 + TypeScript**
- **SVG illustrations** generated from seeded, jittered Catmull-Rom curves, with a light pencil-displacement filter. Each flower stays the same everywhere it's drawn.
- **MediaPipe HandLandmarker** (`@mediapipe/tasks-vision`) for webcam hand tracking, running entirely in the browser
- **Supabase** (Postgres) for saved bouquets, accessed **only from the server**
- No sign-up, analytics or third-party UI kits

---

## Running it locally

```bash
npm install          # also copies MediaPipe's wasm into public/mediapipe/wasm
npm run dev          # http://localhost:3000
```

With no Supabase variables set, development stores bouquets as JSON files in `./.data/bouquets/`, so you can try the full flow (make → send → open link) right away.

> Camera access needs a secure context. `localhost` counts. On another device on your network, use HTTPS (e.g. a Vercel preview).

---

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates the `bouquets` table and enables Row Level Security with **no public policies**, so the anon key can't read or write it.
3. Under **Project Settings → API keys**, copy:
   - the **Project URL** → `SUPABASE_URL`
   - a **secret key** (`sb_secret_…`), or the legacy `service_role` key → `SUPABASE_SECRET_KEY`
4. Put them in `.env.local` (see [`.env.example`](.env.example)):

```bash
SUPABASE_URL=https://abcd1234.supabase.co
SUPABASE_SECRET_KEY=sb_secret_xxx
```

Both variables are **server-only**: they're read in `lib/store.ts`, which imports `server-only`, and used only by the `POST /api/bouquets` route and the server-rendered `/bouquet/[id]` page. Never give them a `NEXT_PUBLIC_` prefix.

### Data model

| column           | type        | notes                                                                 |
| ---------------- | ----------- | --------------------------------------------------------------------- |
| `id`             | text, PK    | 10-character random id (unambiguous alphabet), used in the share URL |
| `composition`    | jsonb       | `{ version: 1, flowers: Flower[] }`                                   |
| `recipient_name` | text?       | optional                                                              |
| `message`        | text        | up to 800 characters                                                  |
| `sender_name`    | text?       | optional                                                              |
| `created_at`     | timestamptz | defaults to `now()`                                                   |

Each `Flower` is `{ kind, color, petals, x, y, rotation, scale, seed }`. Positions use a fixed 600 × 800 bouquet coordinate space, so the composition renders identically at any screen size. The `seed` gives every petal and leaf its exact wobble. The server validates and clamps everything (`sanitizeComposition` / `sanitizeNote` in `lib/flowers.ts`) before saving.

---

## Deploying to Vercel

1. Push this folder to a Git repository and import it in Vercel. Framework preset: **Next.js**; no build settings to change.
2. In **Settings → Environment Variables**, add `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (Production and Preview).
3. Optional: set `NEXT_PUBLIC_SITE_URL` to your public domain (e.g. `https://posy.example.com`). It's used for share links and Open Graph metadata. If it isn't set, share links use the current origin.
4. Deploy.

In production without Supabase variables, the API returns a clear "storage is not configured" error rather than failing silently, because Vercel's filesystem is read-only.

---

## How the gestures work

Gesture recognition is deliberately limited to four reliable movements (`lib/hands/tracker.ts`):

| gesture    | detection                                                                                                                       | used for                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Point**  | the thumb/index midpoint blended with the index knuckle, smoothed with a One Euro filter. The pinch aims with where your hand was about 140 ms earlier, and grabs the nearest flower within reach. | moving the cursor; hovering over a button for 0.8 s selects it |
| **Pinch**  | thumb-to-index distance (3D) ÷ palm size. It starts on one clear frame or two close ones, and lets go only after three open frames, so held flowers don't slip                          | picking up the next flower or a placed one; releasing to drop it; instant click on buttons |
| **Twist**  | wrist → middle-knuckle angle, relative to the angle when the pinch started                                                     | rotating the flower you're holding                           |
| **Stretch** | both hands in an "L" (thumb and index out, other fingers folded) for a few frames                                  | pulling the hands apart adds petals and pushing them together removes them, on the selected flower or the next one |

Some details that keep it calm:

- The camera frame's central area is mapped to the whole window, so you don't have to reach to the edges.
- The stretch is measured relative to where your hands were when it started, so it doesn't matter how far apart you begin. A big flower and petal count appear between your hands while you stretch.
- If the hand disappears for about 0.45 s, any flower you're holding is placed where it is.
- Dropping onto the "remove" tray (shown while you're holding a flower) deletes it.
- The video never leaves the device. The camera runs only on the arranging step and stops while you write the card.

**Mouse/touch fallback:** drag from the bench into the wrap. Tap a flower to select it, drag the small yellow handle to rotate it (or use the scroll wheel, or the ↺ ↻ buttons), and drag it to the tray or press Delete to remove it. On phones and tablets, touch is the default and the camera is optional.

---

## Project map

```
app/
  page.tsx                 homepage
  studio/page.tsx          the maker (intro → arrange → write → send)
  bouquet/[id]/page.tsx    recipient reveal (server-fetched)
  api/bouquets/route.ts    POST: validate + save, returns { id }
  globals.css              the whole visual system
components/
  Flower.tsx               FlowerArt (a single illustrated head) + positioned, swaying head
  Bouquet.tsx              stems, leaves, wrapping paper, ribbon, heads
  Reveal.tsx               three-stage recipient experience
  studio/                  Studio, Intro, CameraChip, WriteStep, SentStep, gesture icons
lib/
  flowers.ts               model, palette, drawing recipes, validation
  paths.ts / rng.ts        hand-drawn geometry helpers, seeded RNG
  hands/                   MediaPipe tracker + One Euro filter
  store.ts                 Supabase (or local dev) storage, server-only
supabase/schema.sql
```

The hand-tracking model (`hand_landmarker.task`, about 7.8 MB) is loaded from Google's MediaPipe model storage the first time someone turns on the camera. To self-host it, download it into `public/mediapipe/` and change `MODEL_URL` in `lib/hands/tracker.ts`.
