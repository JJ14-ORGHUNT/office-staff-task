# Office Daily Checklist

A small web app where office support staff **log in → update their daily checklist → clock out**, and an admin manages staff, tasks and sees daily attendance and completion.

- Node.js + Express backend, plain HTML/CSS/JS frontend (no build step)
- **Postgres** (Supabase, Neon or any Postgres) in production, and a **local SQLite file** for development, chosen automatically
- PINs are hashed (scrypt). Sessions are signed httpOnly cookies, and admin APIs are blocked for staff.

## Features

**Staff** (built for phones and for staff who aren't comfortable with technology)
- Big number keypad for the PIN. The phone remembers the Employee ID, so next time staff only enter the PIN.
- Screens in **English, हिंदी or తెలుగు** (one tap to switch; the choice is remembered).
- A big green **Clock In** button records the arrival time. Tasks stay locked until the staff member clocks in.
- Each task shows an icon and large **▶ Start** / **✓ Done** buttons. **📝 Note** has one-tap quick notes ("Out of stock", "Need help", …). Done tasks move to a "Done" list with an **Undo** button.
- A progress ring, live clock and "working for 3h 12m" timer.
- **Clock Out** opens a confirmation showing the day's summary and warns if tasks are still not done. The day then shows a summary card and locks. Clocking in or out twice is blocked.
- Can be installed to the home screen like an app (Chrome menu → *Add to Home screen*).

**Admin**
- **Dashboard** for today or any past day (‹ › arrows to move between days; refreshes itself every minute): total staff, present, working now, overall completion %, and one row per employee with clock-in/out, status and progress. Tap an employee to see each task's status and notes. **Export CSV** downloads the day's report for Excel.
- **Corrections:** edit an employee's clock-in/clock-out (or clear clock-out so they can continue), change a task's status, and add or remove ad-hoc tasks for one person on one day.
- **Staff:** add, edit (name, ID, role, PIN reset), and deactivate/reactivate accounts. Deactivated users are logged out immediately.
- **Tasks:** add, edit or delete checklist tasks, reorder them with ↑ ↓, and assign each task to all staff or to selected people.

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

- A staff member's checklist for the day is created the first time they open the app that day (clock-in time is recorded only when they tap **Clock In**), from the tasks assigned to them. Tasks added or assigned later in the day show up the next time they open or refresh the app.
- Each day's task names are stored with the record, so editing or deleting tasks never changes past reports.
- Staff who never log in show as "Not logged in" for that day.
