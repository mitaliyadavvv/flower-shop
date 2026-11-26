# posy — flowers, made by you

A tiny flower studio on the internet. Arrange a hand-drawn bouquet with hand gestures (or a mouse/finger), write a little note, and send it as a link. The recipient gets a small, unhurried reveal: an envelope moment, the bouquet blooming stem by stem, then the card.

- **Next.js 16 (App Router) + React 19 + TypeScript**
- **SVG illustrations** generated from seeded, jittered Catmull-Rom curves, with a light pencil-displacement filter. Each flower stays the same everywhere it's drawn.
- **MediaPipe HandLandmarker** (`@mediapipe/tasks-vision`) for webcam hand tracking, running entirely in the browser
- **Cloud Firestore** for saved bouquets, protected by security rules, so no secret keys are needed
- No sign-up, analytics or third-party UI kits

---

## Running it locally

```bash
npm install          # also copies MediaPipe's wasm into public/mediapipe/wasm
npm run dev          # http://localhost:3000
```

Local development saves to the same Firestore project, so set up the rules below first.

> Camera access needs a secure context. `localhost` counts. On another device on your network, use HTTPS (e.g. a Vercel preview).

---

## Firebase setup (one-time, about 2 minutes)

Bouquets are stored in **Cloud Firestore** in the Firebase project `posy-17da6`. The site calls Firestore's REST API from its own server like any public client, so **there are no secret keys and no Vercel environment variables to set**. The security rules decide what's allowed.

1. Open the [Firebase console](https://console.firebase.google.com/) and select **posy-17da6**. Then go to **Build → Firestore Database → Rules**.
2. Add the rules from [`firebase/firestore.rules`](firebase/firestore.rules):
   - This project is only for posy, so replace everything in the editor with the whole file.
3. Click **Publish**.
4. Check it: open `https://<your-site>/api/health`. `"reads": "allowed"` means you're done.

What the rules allow:

- Anyone with a link can **get** that one bouquet.
- Nobody can **list** or browse bouquets.
- New bouquets must be well-formed: a 10-character id, a message of 1–800 characters, names of 60 characters or fewer, and a bounded composition.
- Bouquets can **never be edited or deleted** through the site.

To use a different Firebase project, set `FIREBASE_PROJECT_ID` (see [`.env.example`](.env.example)).

### Data model — collection `bouquets`, document id = share id

| field            | type      | notes                                                                         |
| ---------------- | --------- | ----------------------------------------------------------------------------- |
| `composition`    | string    | JSON `{ version: 1, flowers: Flower[] }`                                      |
| `message`        | string    | 1–800 characters                                                              |
| `recipient_name` | string    | may be empty                                                                  |
| `sender_name`    | string    | may be empty                                                                  |
| `created_at`     | timestamp |                                                                               |

Each `Flower` is `{ kind, color, petals, x, y, rotation, scale, seed }`. Positions use a fixed 600 × 800 bouquet coordinate space, so the composition renders identically at any screen size. The `seed` gives every petal and leaf its exact wobble. The server validates and clamps everything (`sanitizeComposition` / `sanitizeNote` in `lib/flowers.ts`) before saving, and again when reading.

---

## Deploying to Vercel

1. Import the GitHub repository in Vercel. Framework preset: **Next.js**; no build settings or environment variables needed.
2. In **Settings → Deployment Protection**, turn off **Vercel Authentication**. Otherwise recipients hit a Vercel login page.
3. Optional: set `NEXT_PUBLIC_SITE_URL` to your public address so share links always use it.

Every push to `main` redeploys automatically.

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
- The stretch is measured relative to where your hands were when it started, so it doesn't matter how far apart you begin. It uses the horizontal distance between the index knuckles, so curling your fingers or lowering your hands doesn't count as stretching. A dead zone stops the count flickering between two numbers.
- **Hold still to set.** Once the count hasn't changed for about 0.45 s, it locks in (the ring fills and turns green). The count only moves while *both* hands are clearly in an L. When you leave the pose (closing a fist, pulling one hand away, dropping your hands), any change made since the last lock is undone.
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
  api/health/route.ts      setup check: can this deployment read bouquets?
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
  store.ts                 Firestore storage (REST), server-only
firebase/firestore.rules
```

The hand-tracking model (`hand_landmarker.task`, about 7.8 MB) is loaded from Google's MediaPipe model storage the first time someone turns on the camera. To self-host it, download it into `public/mediapipe/` and change `MODEL_URL` in `lib/hands/tracker.ts`.
