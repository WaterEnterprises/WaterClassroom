# Water Classroom

**A complete AI-powered school for everyone.**

Water Classroom is a full-stack virtual school platform that delivers personalized K-12 education through AI tutoring, gamified learning, proctored exams, and collaborative tools — accessible from any device with a browser.

---

## What is this?

Water Classroom is not just an LMS or a course viewer. It's a **complete school** that adapts to each student's country, grade level, and learning pace. Whether you're a homeschool family seeking accredited credentials, a self-directed learner, or an institution managing thousands of students — this platform covers the entire journey from enrollment to verified certification.

It's part of the broader **Water suite** by the Stellarium Foundation — alongside Water AI, Water Robotics, and Water Gov — aimed at automating labor and unlocking human potential through accessible technology.

---

## The Idea

Traditional education is gated by cost, geography, and rigidity. Water Classroom dismantles these barriers by combining:

- **AI that teaches, not just answers.** A 24/7 Socratic tutor powered by Google Gemini that guides students through problems step-by-step, aligned to their specific curriculum track.
- **Curricula that adapt.** 75+ programs across 28 countries — US Common Core, UK GCSE, IB, Swiss Maturité, and more — automatically matched during onboarding.
- **Exams that mean something.** Camera-proctored, VLM-verified exams produce tamper-proof certificate hashes, giving homeschool families the credentials they need.
- **Learning that's addictive.** XP, streaks, achievement badges, and community leaderboards turn studying into a game you actually want to play.

---

## How it Works

A student signs up, selects their country and grade level, and the system automatically builds a personalized curriculum track. They can then:

1. **Learn** — Interactive lessons, quizzes, and educational games in the Academy
2. **Get help** — Chat with the AI Tutor anytime for real-time Socratic guidance
3. **Collaborate** — Post and work on projects via the Board of Tasks
4. **Discuss** — Join community forums organized by subject and grade
5. **Prove it** — Take camera-proctored exams that produce verified credentials
6. **Track progress** — XP, levels, streaks, and badge unlocks visible on the dashboard

Institutions get an admin layer: roster management, tutor assignment, curriculum overrides, and a bulk cost calculator.

---

## Tech Stack

| Layer | Tech | Why |
|-------|------|-----|
| Runtime | [Bun](https://bun.sh) | Fast JS runtime with built-in bundler |
| Server | [Hono](https://hono.dev) | Lightweight, edge-ready web framework |
| Frontend | [Svelte 5](https://svelte.dev) + [Tailwind CSS 4](https://tailwindcss.com) | Reactive UI with utility-first styling |
| AI | [Google Gemini](https://ai.google.dev) | Real-time tutoring and content generation |
| Database | [Turso / libSQL](https://turso.tech) | Edge-distributed SQLite |
| Payments | [Stripe](https://stripe.com) | Subscriptions and invoicing |
| Icons | [Lucide](https://lucide.dev) | Consistent icon set |

---

## Running Locally

```bash
# Install dependencies
bun install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys (TURSO_DATABASE_URL, GEMINI_API_KEY, STRIPE_SECRET_KEY)

# Start dev server
bun run dev
```

The app runs at `http://localhost:3000`.

---

## Logging In — System / Institution Dashboard

The **Class Studio** (the dashboard where system users create curriculum tracks and classes) is available to **institution accounts**. There are no pre-seeded accounts — create the first one yourself:

### 1. Create the system (institution) account

1. Start the app (`bun run dev`) and open `http://localhost:3000`
2. On the landing page auth card, switch to **Register** and select the **Institution** role
3. Fill in the school name, representative name, email, and a password (min. 6 characters)
4. Submit — you are signed in automatically

### Provisioned system account

A system user has been provisioned in the connected Turso database for immediate Class Studio access:

| Field | Value |
|---|---|
| Email | `system@waterclassroom.app` |
| Passcode | `e8351b0d` *(bcrypt-hashed at rest — rotate after first login if desired)* |
| Account type | `Institution` |
| System permission | ✅ granted (`hasSystemPermission = 1`) |
| Create classes | ✅ full Class Studio access (global K-12 / world curriculum) |

> ⚠️ This credential was generated for development. Before exposing the app publicly, change the passcode (re-register the account or update the hash) and consider removing this table from the README.

To rotate the passcode, delete the account row (or rename its email) and re-register with the same email, then re-grant:

```bash
bun run grant-system system@waterclassroom.app
```

### 2. Log in

- Open `http://localhost:3000` and sign in with your institution email + password (the role is restored from the server — no need to pick it again)
- Institution accounts land on the **School** dashboard and get a **Studio** tab in the navigation
- **No wrong-door dead-ends:** credentials are verified first, and the session role is derived from the **account type** on the server — logging in through either tab (or with no tab) just works, and the correct dashboards/permissions are enforced server-side afterwards

### Role model

| Role | Who | Login door | Dashboards | Permissions |
|---|---|---|---|---|
| **Student** (Water / Independent / School) | Learners | 🎓 Student tab | Dashboard, Academy, AI Tutor, Exams, Tasks, Forums | Join classes via onboarding catalog or class join codes; quiz progress reported per class |
| **Institution** (no system permission) | Schools / orgs | 🏛️ Institution tab | School Dashboard + **Curriculum tab** | Manage **their own** tracks, classes, quizzes, join codes, enrolled students, tutors ↔ classes, student signup code |
| **Institution + system permission** | System owner / admin | 🏛️ Institution tab | School Dashboard + **Studio** tab | Everything above **plus the global system curriculum** (K-12 & world curricula) visible to all students during onboarding |

Enforcement chain (server-side on every protected call): valid session → session role (stamped from the account's **type** at login, not from the door used) → account type check → `hasSystemPermission` for Studio endpoints. The first institution to register on a fresh DB is auto-granted system permission as the bootstrap owner.

### 3. Create tracks & classes (Class Studio)

1. Open the **Studio** tab → **New Track** (name, description, grade, subject)
2. Select the track → **New Class**:
   - Title, description, subject, grade, estimated minutes
   - **Lesson content** with the built-in rich text editor
   - Optional **game upload** — a `.zip` (containing an `index.html`) or a single `.html` file, max 20 MB
3. **Publish** — each class is materialized as a generated Svelte component in `src/curriculum/classes/` and registered in `src/curriculum/registry.ts`
4. Published tracks appear to students as **Available Classes** during onboarding (step 5) — one click to enroll

> Student accounts don't see the Studio tab; they receive classes through onboarding and the Academy.

### 4. Institution curriculum (every institution — no system permission needed)

While the **Class Studio** edits the *global* system curriculum (K-12 & world curricula), **every institution** can manage **its own customized curriculum** from the School Dashboard → **Curriculum** tab:

- **Tracks & classes** — create tracks and author classes with the same rich text editor + game uploader used by the system studio; classes are materialized as generated Svelte components the same way
- **Markdown quizzes** — author a quiz in markdown right on the class; it is parsed into interactive questions (one correct answer, optional explanations) and embedded into the generated Svelte component. Students see score/retake; results are saved per student
- **Class join codes** — every class gets a code (e.g. `WC-7F3K2M`); share it with students, who can enter it in onboarding step 5 ("Have a class code from your school?") to enroll directly. Codes can be rotated; rotation invalidates old codes
- **Enrolled students** — see every student in a class (with XP/level) **and their quiz result for that class** (score, completed ✓ / in progress) and remove them
- **Tutor ↔ class assignment** — in the class's 🔑 panel, click tutors to assign/unassign them; the roster shows each tutor's classes
- **Student signup code** — a per-institution code (e.g. `WC-3AB9CD`) that students enter at registration to affiliate with your institution; rotate it anytime

Guards: the institution curriculum endpoints require an institution account (students get 403), but do **not** require system permission — this is the institution's own content, separate from the system curriculum.

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `TURSO_DATABASE_URL` | Turso database connection URL |
| `TURSO_AUTH_TOKEN` | Turso authentication token |
| `GEMINI_API_KEY` | Google Gemini API key for AI tutoring |
| `STRIPE_SECRET_KEY` | Stripe secret key for payments |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret crediting student spots (`POST /api/stripe/webhook`) |
| `APP_URL` | Base URL for payment redirects and student invite links (`/join/STU-XXXXXX`) |
| `RESEND_API_KEY` | Resend API key for student invite emails (optional — roster falls back to copy-link) |
| `INVITE_FROM_EMAIL` | Sender for invite emails, e.g. `Water Classroom <noreply@waterclassroom.app>` |
| `INVITE_EXPIRY_DAYS` | Days until a student invite code expires (default `14`) |

### Student spots (seat-based billing)

Institutions pay per student spot ($12/month or $144/year). Paid spots live on the institution row (`paid_seats`; new institutions start with their declared plan volume, legacy rows backfilled from it). School → **Settings** shows used/paid spots and a **Buy more spots** form (Stripe checkout, e.g. 32 spots). The Stripe webhook (`POST /api/stripe/webhook`, needs `STRIPE_WEBHOOK_SECRET`) credits spots automatically. Adding a student (School → Student Roster) is rejected with 403 once spots are full — enrolled students + pending invites count as used; tutors are staff and never consume spots.

### Student invites

School Dashboard → **Student Roster** → **Add Student** generates a unique `STU-XXXXXX` code plus a click-to-join link (`{APP_URL}/join/STU-XXXXXX`). Use the ✉️ button to email the code + link (requires `RESEND_API_KEY`), or copy the link manually. Students opening the link land on Register with the code prefilled and validated live; codes are locked to the invited email, expire after `INVITE_EXPIRY_DAYS`, and a typo'd/used code is rejected at signup instead of silently falling through.

### Tutor invites

**Tutors** screen (renamed from AI Tutor) → **Human Tutors** tab (institution only) → **Add Tutor** works exactly like the roster but generates a `TUT-XXXXXX` code. Claiming it creates a **Tutor account** in the system: Academy access like a student, plus a *My Assigned Classes* section in Academy (assigned classes with enrolled students and quiz status) and forum moderation (remove posts). Tutors never appear in the student roster. Assign tutors to **grades** for permission over every class in the grade (with students), or to individual **classes**.

---

## Project Structure

```
src/
  App.svelte              # Root component with routing and nav
  pages/                  # Top-level page views
    LandingPage.svelte    # Public landing with auth
    DashboardPage.svelte  # Student progress dashboard
    AcademyPage.svelte    # Curriculum and lessons
    AITutorPage.svelte    # AI tutoring chat
    ExamsPage.svelte      # Proctored exam system
    TasksPage.svelte      # Board of Tasks
    ForumsPage.svelte     # Community forums
    ProfilePage.svelte    # User profile
  components/             # Shared UI components
    exams/                # Exam proctoring components
    games/                # Interactive learning games
    layout/               # Header, onboarding, layout
    modals/               # Modal dialogs
  school/                 # Institution admin views
  lib/                    # Stores, utilities, constants
server.ts                 # Server entry point
server/
  index.ts                # Hono app assembly (route mounting, SPA fallback)
  db.ts                   # Turso client, schema init, curriculum seeding
  session.ts              # Session management (tokens, cookies)
  ai.ts                   # Gemini client (lazy init)
  routes/                 # Route modules: auth, curriculum, exams, community,
                          # institution, users, progress, tasks, payments, ai
```

---

## License

Stellarium Foundation, Inc. All rights reserved.
