# Office Daily Checklist

A small web app where office support staff **log in → update their daily checklist → clock out**, and an admin manages staff, tasks and sees daily attendance and completion.

- Node.js + Express backend, plain HTML/CSS/JS frontend (no build step)
- **Postgres** (Supabase, Neon or any Postgres) in production, and a **local SQLite file** for development, chosen automatically
- PINs are hashed (scrypt). Sessions are signed httpOnly cookies, and admin APIs are blocked for staff.

## Features

**Staff** (mobile-friendly)
- Log in with Employee ID + PIN. The first login of the day records the **clock-in time**.
- Today's checklist: each task has a Pending / In Progress / Completed selector, optional remarks and a "last updated" time.
- Progress bar and counts.
- **Clock Out** shows a confirmation with the day's summary and records the clock-out time. Clocking out a second time is blocked, and the checklist locks after clock-out.

**Admin**
- **Dashboard** for any date (today or past days): total staff, present, working now, overall completion %, and one row per employee with clock-in/out, status and progress. Expand a row to see each task's status and remarks.
- **Corrections:** edit an employee's clock-in/clock-out (or clear clock-out so they can continue), change a task's status, and add or remove ad-hoc tasks for one person on one day.
- **Staff:** add, edit (name, ID, role, PIN reset), and deactivate/reactivate accounts. Deactivated users are logged out immediately.
- **Tasks:** add, edit or delete checklist tasks, set the display order, and assign each task to all staff or to selected people.

## Sample accounts (created automatically on first run)

| Role  | Employee ID | PIN      | Name         |
|-------|-------------|----------|--------------|
| Admin | `ADMIN`     | `admin123` (or `ADMIN_PIN`) | Office Admin |
| Staff | `EMP001`    | `1111`   | Ravi Kumar   |
| Staff | `EMP002`    | `2222`   | Suresh Babu  |
| Staff | `EMP003`    | `3333`   | Lakshmi Devi |

It also adds 9 sample checklist tasks. **After going live, change the admin PIN and the sample staff PINs (Staff tab → Edit), or deactivate the sample staff.**

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm install
npm start            # http://localhost:3000
npm test             # automated test of the staff + admin workflows
```

With no `DATABASE_URL`, data is stored in `data/app.db` (SQLite). Delete that file to reset to the sample data.

## Configuration

| Variable         | Required          | Purpose |
|------------------|-------------------|---------|
| `DATABASE_URL`   | yes, in production | Postgres connection string |
| `SESSION_SECRET` | yes, in production | Long random string that signs login cookies. Generate one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `APP_TZ`         | no (default `Asia/Kolkata`) | Office time zone; decides where "today" starts and ends |
| `ADMIN_PIN`      | no (default `admin123`) | PIN for the `ADMIN` account, used only on the very first start |

Tables are created automatically on first start. There is no migration step.

## Deploy (Vercel + Supabase, about 10 minutes, free tiers)

1. **Create the database:** in [supabase.com](https://supabase.com), create a new project. When it's ready, click **Connect** → **Transaction pooler** and copy the URI (port `6543`), replacing `[YOUR-PASSWORD]` with the database password.
   (Neon works the same way: use its pooled connection string.)
2. **Push this repo to GitHub.**
3. **Create the Vercel project:** in [vercel.com](https://vercel.com), go to **Add New → Project** and import the repo. Leave the build settings at their defaults; `vercel.json` already configures them.
4. In **Settings → Environment Variables**, add:
   - `DATABASE_URL` = the Supabase URI from step 1
   - `SESSION_SECRET` = a long random string
   - `APP_TZ` = `Asia/Kolkata` (or your office time zone)
   - optionally `ADMIN_PIN` = the admin PIN you want
5. **Deploy**, then open the URL and log in as `ADMIN`. Check `/api/health`: it should show `"db":"postgres"`.
6. Change the PINs and replace the sample staff with real staff.

### Other hosts (Render, Railway, a VPS)
Run `npm install` then `npm start` with the same environment variables. On a single server with a persistent disk you can skip Postgres; the SQLite file in `data/` is enough. Back it up regularly. Don't use SQLite on Vercel or on hosts without a persistent disk, because the data will be lost.

## Project structure

```
server.js        Express app: auth, staff and admin APIs, DB seeding
db.js            Postgres/SQLite adapter and schema
public/          index.html, app.js, style.css (single-page UI)
test/            End-to-end API tests (node:test)
vercel.json      Vercel deployment config
.env.example     Environment variable template
```

## How it works

- A staff member's checklist for the day is created the first time they open the app that day, from the tasks assigned to them. Tasks added or assigned later in the day show up the next time they open or refresh the app.
- Each day's task names are stored with the record, so editing or deleting tasks never changes past reports.
- Staff who never log in show as "Not logged in" for that day.
