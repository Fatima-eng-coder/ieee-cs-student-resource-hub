# IEEE CS Student Resource Hub

A modern, animated, fully-responsive site for a university IEEE Computer Society Student Branch
Chapter, with a public-facing site and a companion admin panel. Content, submissions,
authentication and file storage all run on Supabase — nothing the site shows is held in the
visitor's browser.

**Live demo:** https://ieee-cs-student-resource-hub.vercel.app
**Repository:** https://github.com/Muhammad-Ahsan-001/ieee-cs-student-resource-hub

## Tech Stack

- **React 19 + Vite + TypeScript**
- **React Router v7** (data-router / `createBrowserRouter`)
- **Tailwind CSS v4** (via `@tailwindcss/vite`)
- **Framer Motion** for animation (page transitions, reveals, SVG route drawing, counters, etc.)
- A small hand-rolled SVG icon set (`src/components/ui/Icon.tsx`) — no emoji or external icon
  package is used anywhere in the UI
- **Supabase** for auth and the content modules that have been migrated off dummy data
- Dummy JSON data modules under `src/data` for everything not yet migrated
- A self-contained indoor wayfinding engine under `src/lib/navigation` (Dijkstra routing,
  turn-by-turn direction generation, fuzzy place search) driving an SVG floor-plan renderer

## Getting Started

```bash
npm install
```

Copy the environment template and fill in the two Supabase values (Supabase dashboard →
Project Settings → API). Both are safe to expose in the browser bundle — the anon key is the
public/publishable key, and row-level security is what protects the data.

```bash
cp .env.example .env.local
```

The database schema lives in `supabase/migrations/` and is applied with the Supabase CLI. If you
are joining an already-provisioned project, everything is applied already and you need only the
two environment values above; run this to confirm you are in step:

```bash
npx supabase link --project-ref <your-project-ref>
```

```bash
npx supabase migration list
```

Applying to a fresh project builds the whole database from nothing — the first migration is a
complete schema, and the rest add the forms, hierarchy, gallery, submission and content tables in
order:

```bash
npx supabase db push
```

```bash
npm run dev
```

The app runs at `http://localhost:5180` (pinned in `vite.config.ts` with `strictPort`, so it never silently drifts onto a neighbouring port when another Vite project is running). Without the Supabase variables the app
still boots and the wayfinding map works, but Supabase-backed pages show empty states.

Other scripts:

```bash
npm run build      # type-check + production build to dist/
npm run preview    # preview the production build locally
```

## Project Structure

```
docs/
└── mermaid_diagrams/  # Workflow / sitemap diagrams for the public site and admin panel
src/
├── components/
│   ├── layout/       # PublicLayout, AdminLayout, Footer, HeroSection, QuickLinkGrid, BannerCarousel
│   ├── navigation/    # Header, AnnouncementBar, RouteMap, RouteStepList
│   ├── cards/         # EventCard, PaperCard, CourseCard, TeacherCard, ProjectCard, GalleryAlbumCard,
│   │                   # FAQAccordion, DeveloperCard
│   ├── forms/         # (form field primitives live in components/ui, reused across all forms)
│   ├── admin/         # AdminSidebar, AdminTopbar, AdminMetricCard, AdminTable, AdminEditDrawer
│   └── ui/            # StatusBadge, VerificationBadge, SearchBar, FilterPanel, FormShell, FormField,
│                       # FileUploadBox, Stepper, EmptyState, ConfirmModal, SuccessState, Icon
├── data/              # Dummy data: announcements, banners, events, papers, courses, teachers,
│   │                   # routes, destinations, projects, hierarchy, timeline, quickLinks, faqs,
│   │                   # gallery, submissions, adminUsers, developers
│   └── navigation/    # building.json — the surveyed CS block: floors, rooms, corridors,
│                       # stairs, lifts, entrances and the routing graph
├── lib/
│   └── navigation/    # types, data (indexes + categories), pathfinding (Dijkstra + legs),
│                       # directions (turn-by-turn), search (fuzzy), geometry (world → SVG)
├── pages/
│   ├── public/        # All public-facing pages (incl. DevelopersPage)
│   └── admin/          # All admin panel pages (incl. AdminDevelopersPage)
├── routes/            # React Router route tree (routes/index.tsx)
├── types/              # Shared TypeScript domain types (mirrors a future API response shape)
└── utils/              # storage.ts (localStorage helpers), search.ts (global search index)
```

## What Was Built

**Public site**
- Home page with animated announcement ticker, hero, quick links grid, banner carousel,
  upcoming events preview, academic resources preview, navigation preview, projects expo
  preview, and about preview.
- About, Hierarchy (with semester selector, FA24→FA26 archive), Timeline.
- Past Papers: browse with search/filters, detail page, contribute form, request-missing form.
- Courses: browse with search/filters, detail page (syllabus, CDF, lab manual, outcomes, tips),
  teacher directory (no ratings), suggest-correction form.
- Events: tabbed listing (Upcoming/Previous/Featured/Workshops/Competitions/Seminars/Hackathons),
  detail page with outcome sections for past events, registration form.
- Navigation (`/navigation`) — a 2D indoor map of the CS block, described in its own section
  below, plus a report-wrong-route form.
- Projects Expo: browse with filters, detail page (problem/solution/features/team/tech/demo),
  submit-project form.
- Quick Links (7 categories), Announcements (list + detail), Gallery (albums + detail grids),
  Contribute hub, FAQ & Contact (categorized FAQ + contact form), global Search, Privacy &
  Disclaimer.
- Developers page (`/developers`, linked from the footer) — cards for each site contributor
  with photo, position in the society, contribution summary, bio, skills, and contact/portfolio/
  GitHub/LinkedIn links.
- Every form ends in an animated `SuccessState` and (where relevant) persists to `localStorage`.

**Admin panel**
- Login (prototype-only, no real auth), Dashboard with animated metric counters and
  progress bars, and CRUD-style management pages for Events, Banners, Past Papers (with
  verify action), Courses, Projects (with approve action), Navigation/Destinations, Hierarchy
  (per-semester), Submissions (approve/reject workflow reading from both seed + localStorage
  data), Quick Links, Announcements, Gallery, FAQ, Users, Developers (full add/edit/delete —
  the only admin page with fully wired local CRUD, as a reference for wiring the rest), and
  Settings.

## Wayfinding — the 2D navigation map

`/navigation` is a real indoor map rather than a picture of one. It is built from
`src/data/navigation/building.json`: 4 floors, 80 rooms, 3 staircases, 1 lift, 4 entrances and a
271-node routing graph, all surveyed from the department floor plans. 1 world unit = 0.5 m.

**The engine** (`src/lib/navigation`, no dependencies beyond the dataset)

| Module | Does |
| --- | --- |
| `data.ts` | Loads the dataset once and derives every index: per-floor geometry, the adjacency list, the searchable place list, category colours/labels |
| `pathfinding.ts` | Dijkstra over the graph, returning the path split into **one leg per floor** plus the stair/lift transition joining them. Two travel modes: `stairs` (default) and `lift` (step-free) |
| `directions.ts` | Turns a route into turn-by-turn steps. Simplifies the raw polyline (Douglas–Peucker → gentle-bend merge → short-segment merge) so half-metre corridor jogs don't each become a step, while distances stay summed along the *real* path |
| `search.ts` | Fuzzy place search — `cl11`, `CL 11` and `cl-11` all find CL-11; `washroom` lists every washroom grouped by floor. Also feeds the site-wide search box via `utils/navigationSearch.ts` |
| `labels.ts` | Fits room names into room boxes: longest form that fits, wrapped to two lines before abbreviating ("Female Washrooms" → "Female WR" → "F. WR" → "FW") |
| `geometry.ts` | World (x east / z north) → SVG (y down) conversion, rounded route paths, view fitting |

**The interface** (`src/components/navigation`)

- `FloorPlan.tsx` — the SVG map. Pan/zoom moves the **viewBox**, not a group transform, which
  gives one `unitsPerPixel` number that keeps strokes, labels and hit targets a constant screen
  size at any zoom. Wheel, drag, pinch, double-tap and keyboard (arrows / `+` / `-` / `0`).
- `FloorRail.tsx` — floor switcher that badges each floor the route touches with its leg number
  and shows the stairs or lift joining them.
- `RoutePanel.tsx` — summary, the floor-by-floor journey strip, the step list, and guidance mode.
- `PlacePicker.tsx` — full-screen search sheet, keyboard navigable, with recents.
- `NavigatorShowcase.tsx` / `BuildingIsometric.tsx` — the preview on the 3D companion card:
  a cross-fading slideshow of the renders in `public/nav-3d/`, loaded only once the card
  nears the viewport and one slide at a time, falling back to an exploded axonometric
  generated from the same dataset while they load (or for good, if none do).

**Design decisions worth knowing**

- **Multi-floor is the hard case**, so it gets the most help: the journey strip names every floor
  and transition before you read a single instruction, and guidance switches the map to the next
  floor for you when you reach the stairs or lift.
- **A turn and the walk after it are one step** ("Turn right and continue for 8 m"), not two.
- **Steps name landmarks you pass** ("You'll pass the Canteen on your right") — indoors, a door
  you can see beats a distance in metres.
- **Nine rooms on the third floor are called "Studio."** Any name that repeats on a floor is
  flagged `ambiguous` and shown with its room code and a zone hint ("North-west corner").
- **Stairs, not the lift, by default.** The dataset weights a lift floor at 4 and a stair
  flight at 12–21, so a plain shortest path *always* rides the lift. `data.ts` replaces those
  with walk-equivalent costs (a flight ≈17 s; calling the lift ≈28 s, charged once per ride on
  the corridor edge entering it), which matches how people actually move through a four-storey
  block. Step-free routing stays one tap away.
- **Every route is a URL** — `?from=<id>&to=<id>&mode=lift` — so a route can be sent to someone
  who is actually lost. (`access=1` from earlier links still works.)
- **The site-wide search box finds rooms.** `/search?q=cl11` returns CL-11 and links straight to
  a route. The dataset is pulled in with a dynamic import there, so it stays out of the main
  bundle.
- The page and its dataset are **lazily loaded** (`React.lazy` in `src/routes/index.tsx`), so the
  ~162 kB navigation chunk never lands in the main bundle.

### The 3D companion app

The 3D navigator is deployed separately at
<https://muhammad-ahsan-001-cs-dept-navigator.vercel.app/> because the model is heavy and its
release cycle should not be tied to this site's. It is a PWA (installable, works offline), and
`/navigation` links out to it in a new tab.

The card's preview cross-fades through the renders in
[`public/nav-3d/`](public/nav-3d/README.md) — six views of the block, from the exploded
floor stack to a floor with every room labelled. They load only once the card nears the
viewport and one at a time, the slideshow pauses while the card is off screen, and any file
that fails to load drops out of the rotation. Until the first one paints — and permanently,
if none of them load — the card draws an exploded axonometric of the real building instead,
so it is never a broken image.

**Animation**
Framer Motion powers page transitions, header nav hover/underline, the ticker marquee, hero
reveal, card hover-lift, scroll-triggered section reveals, search result stagger, the SVG route
draw + pulsing markers on the wayfinding map, form success checkmarks, admin metric counters,
dashboard progress-bar fade-ins, and modal/drawer slide-ins. All animations respect
`prefers-reduced-motion` via a global CSS override in `src/index.css`.

## Workflow Diagrams

Visual references for how the site and admin panel are structured and how users move through
them, kept in [`docs/mermaid_diagrams/`](docs/mermaid_diagrams).

### Public Website Sitemap / Information Architecture
[docs/mermaid_diagrams/Public Website Sitemap  Information Architecture.png](<docs/mermaid_diagrams/Public Website Sitemap  Information Architecture.png>)

### Public Website Primary User Flow — Landing Page to Conversion
[docs/mermaid_diagrams/Public Website Primary User Flow — Landing Page to Conversion.png](<docs/mermaid_diagrams/Public Website Primary User Flow — Landing Page to Conversion.png>)

### Admin Panel Sitemap / Information Architecture
[docs/mermaid_diagrams/Admin Panel Sitemap  Information Architecture.png](<docs/mermaid_diagrams/Admin Panel Sitemap  Information Architecture.png>)

### Admin Panel Primary User Flow — Logged Out vs Logged In
[docs/mermaid_diagrams/Admin Panel Primary User Flow — Logged Out vs Logged In.png](<docs/mermaid_diagrams/Admin Panel Primary User Flow — Logged Out vs Logged In.png>)

### Combined Public-to-Admin Content Moderation Flow
[docs/mermaid_diagrams/Combined Public-to-Admin Content Moderation Flow.png](<docs/mermaid_diagrams/Combined Public-to-Admin Content Moderation Flow.png>)

### Developers Page Flow — Public and Admin
[docs/mermaid_diagrams/Developers Page Flow — Public and Admin.png](<docs/mermaid_diagrams/Developers Page Flow — Public and Admin.png>)

## How the data layer works

Every page reads through a service in `src/services/`, and each service follows the same shape:
a row interface mirroring the database columns, explicit mappers in both directions, and error
mapping so a PostgREST message never reaches a visitor.

Two rules are worth knowing before changing one:

1. **A failed read throws.** It never degrades to an empty array. An empty list and a broken
   connection look identical on screen, and the pages are written to tell them apart — several
   real bugs in this project's history were exactly that confusion.
2. **A refused write is not always an error.** Postgres applies a row-level security policy to
   `DELETE`/`UPDATE` by filtering rows out, so PostgREST answers `204` with no error and zero
   rows affected. Services that delete pass `{ count: 'exact' }` and treat an explicit `0` as a
   refusal — a null count means the header was absent and proves nothing.

Row-level security is what protects the data, so the anon key in `.env.local` is safe in the
browser bundle. Content tables are readable by everyone and writable only by the four
content-manager roles; submission tables (registrations, contact messages, route reports) accept
a write from anyone and are readable only by the committee.

The only things deliberately still in `localStorage` are per-viewer preferences that would be
wrong to share: recently-visited places in the wayfinder, and which homepage promo cards you have
dismissed.
