# Today's Work — Office Staff Daily Task App

A mobile-first task checklist for office support staff (office boys, housekeeping,
pantry staff, maintenance, etc.), plus an admin console for managing employees,
tasks, and reports.

Staff experience is intentionally as simple as: **Open → See → Tap → Done.**

## Quick start

```bash
npm install
npm run seed     # creates demo data (idempotent, safe to re-run)
npm run dev
```

Open http://localhost:3000

### Demo logins

| Role       | Login                          |
|------------|---------------------------------|
| Staff      | Employee ID `EMP001` / PIN `1234` (also `EMP002`, `EMP003`) |
| Supervisor | `supervisor@example.com` / `super123` |
| Admin      | `admin@example.com` / `admin123` |

On a phone, open the site in Chrome and use "Add to Home Screen" — it installs
as a standalone app icon (PWA) so staff never need to type a URL.

## What's built (MVP)

- **Staff app** (`/staff`): today's tasks as big tap cards — Done / In Progress /
  Not Done, with simple tap-to-select reasons (no typing required) when a task
  isn't done. Progress bar, English/Hindi/Kannada language toggle.
- **Admin console** (`/admin`): live dashboard (completed/overdue/completion %),
  employee management (create/edit/disable, PIN or password reset), task
  management (daily/weekly/monthly/one-time/special-day recurrence, priority,
  assign to one or many employees), CSV report export by date range.
- **Auth & roles**: Staff sign in with Employee ID + PIN; Admin/Supervisor with
  email + password. Sessions are signed cookies (JWT). Role-gated pages and
  APIs (`STAFF`, `SUPERVISOR`, `ADMIN`, `SUPER_ADMIN`).
- **Recurring task engine**: a task template (e.g. "Clean Reception, daily,
  9:00 AM") automatically generates today's concrete task for every assigned
  employee the first time it's viewed each day — no manual daily setup.
- **Extra Work logging**: below the checklist, staff can log work that wasn't
  on their assigned list — typed, voice-recorded, or both. While recording,
  the browser's speech recognition (Web Speech API) live-transcribes into the
  note text as they talk, still fully editable before submitting; the audio
  itself is also kept so admins can play back the original if a transcript
  looks off. Admins review everything (text + audio player) at
  `/admin/extra-work`, filterable by date, with per-employee attribution.
  Needs Chrome-family browsers and an internet connection for live
  transcription — on browsers without it (e.g. iOS Safari), recording and
  manual typing still work, just without the auto-fill.
- **Audit trail**: logins, task status changes, employee/task create-edit-
  disable, extra-work entries are all recorded (`AuditLog` table).
- **Data model**: Locations, Departments, Users, TaskTemplates, TaskAssignments,
  TaskInstances (per-day occurrences), ExtraWorkLog, AuditLog, Notification —
  see `prisma/schema.prisma`.
- **Tech stack**: Next.js 16 (App Router) + TypeScript, Tailwind CSS v4,
  Prisma 7 + SQLite (zero external services to run locally), `jose` for
  sessions, `bcryptjs` for PIN/password hashing.

## Deliberately deferred (not in this pass)

This app started from a very large spec (native mobile apps, offline sync with
conflict resolution, multi-tenant isolation, push notifications via FCM, PDF/Excel
export, AI task creation, attendance/payroll integrations, etc).
Building all of that is realistically weeks of work per area, not one pass. What
you have now is a solid, working MVP core — the recurring-task engine, RBAC, and
schema are designed so these can be layered on without a rewrite:

- **Native mobile app** — today it's a responsive, installable PWA (works great
  on cheap Android phones, installs like an app), not a separate React
  Native/iOS build.
- **True offline mode** — the UI will show a loading/error state without a
  connection; there's no local queue + background sync yet.
- **Push notifications / reminders** — `reminderMinutesBefore` exists on the
  schema but nothing fires notifications yet.
- **Multi-tenant company isolation** — Locations/Departments exist, but there's
  no top-level "company" boundary yet.
- **PDF/Excel export** — CSV export works; PDF/XLSX are not implemented.
- **AI-assisted task creation** — not implemented.

## Project structure

```
prisma/schema.prisma       Data model
prisma/seed.ts             Demo data
src/lib/                   auth, session, task-instance generation, dashboard stats
src/app/login              Login (staff PIN / admin password)
src/app/staff              Staff checklist UI
src/app/admin              Admin dashboard, employees, tasks, reports
src/app/api                REST API routes backing all of the above
```

## Useful commands

```bash
npm run dev      # dev server
npm run build    # production build (type-checks too)
npm run start    # run the production build
npm run seed     # (re-)seed demo data
npx prisma studio  # browse/edit the SQLite database visually
```

Voice recordings are saved to `var/uploads/extra-work/` (gitignored, not under
`public/`) and are only ever served through an authenticated route that checks
the requester is the recording's owner or a manager.

**After changing `prisma/schema.prisma`**, run `npx prisma migrate dev` *and
restart the dev server*. The dev server's Prisma client is cached across hot
reloads on purpose (to avoid leaking connections), so it won't pick up new
models until the process restarts.
