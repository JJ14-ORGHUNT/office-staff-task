const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const db = require('./db');

const PORT = process.env.PORT || 3000;
const TZ = process.env.APP_TZ || 'Asia/Kolkata';
const STATUSES = ['Pending', 'In Progress', 'Completed'];
const SESSION_HOURS = 14;

let SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET must be set in production');
  SECRET = 'dev-only-secret-change-me';
}

// ---------- helpers ----------
const now = () => new Date().toISOString();
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()); // YYYY-MM-DD
const str = v => (typeof v === 'string' ? v.trim() : '');
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
const isoOrNull = v => {
  if (v === null || v === '' || v === undefined) return null;
  const d = new Date(v);
  return isNaN(d) ? undefined : d.toISOString();
};
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pin, salt, 32).toString('hex');
}
function checkPin(pin, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const a = crypto.scryptSync(pin, salt, 32), b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const sign = data => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
function makeToken(uid) {
  const body = Buffer.from(JSON.stringify({ uid, exp: Date.now() + SESSION_HOURS * 3600e3 })).toString('base64url');
  return body + '.' + sign(body);
}
function readToken(tok) {
  const [body, sig] = String(tok || '').split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}
function getCookie(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
function setSession(req, res, value, maxAge) {
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}
const publicUser = u => ({ id: u.id, emp_code: u.emp_code, name: u.name, role: u.role, active: !!u.active });

// Simple in-memory brute-force guard (per instance): 5 failures -> 5 min lock.
const fails = new Map();
const locked = key => { const f = fails.get(key); return f && f.n >= 5 && Date.now() - f.t < 5 * 60e3; };
const noteFail = key => { const f = fails.get(key); fails.set(key, { n: f && Date.now() - f.t < 5 * 60e3 ? f.n + 1 : 1, t: Date.now() }); };

// ---------- DB init + seed ----------
async function seed() {
  const ins = await db.run(
    `INSERT INTO users (emp_code, name, pin_hash, role, active, created_at) VALUES (?, ?, ?, 'admin', 1, ?)
     ON CONFLICT (emp_code) DO NOTHING RETURNING id`,
    ['ADMIN', 'Office Admin', hashPin(process.env.ADMIN_PIN || 'admin123'), now()]
  );
  if (!ins.rows.length) return; // already seeded
  const staff = [['EMP001', 'Ravi Kumar', '1111'], ['EMP002', 'Suresh Babu', '2222'], ['EMP003', 'Lakshmi Devi', '3333']];
  for (const [code, name, pin] of staff) {
    await db.run(`INSERT INTO users (emp_code, name, pin_hash, role, active, created_at) VALUES (?, ?, ?, 'staff', 1, ?)
                  ON CONFLICT (emp_code) DO NOTHING`, [code, name, hashPin(pin), now()]);
  }
  const tasks = [
    'Check and clean meeting rooms', 'Ensure drinking water availability', 'Check pantry supplies',
    'Maintain office cleanliness', 'Check washrooms and hygiene', 'Ensure dustbins are cleared',
    'Arrange meeting rooms before meetings', 'Check office supplies', 'Complete assigned ad-hoc tasks',
  ];
  for (let i = 0; i < tasks.length; i++) {
    await db.run('INSERT INTO tasks (name, sort_order, assign_all) VALUES (?, ?, 1)', [tasks[i], (i + 1) * 10]);
  }
}
let ready;
const init = () => (ready ||= db.migrate().then(seed).catch(e => { ready = null; throw e; }));

// ---------- app ----------
const app = express();
app.set('trust proxy', 1);
app.use(express.json());
// App version = hash of the frontend files. Pages that were opened before a deploy
// see a different version on their next API call and reload themselves.
const PUBLIC = path.join(__dirname, 'public');
const VERSION = crypto.createHash('sha1')
  .update(['index.html', 'app.js', 'i18n.js', 'style.css'].map(f => fs.readFileSync(path.join(PUBLIC, f))).join('\n'))
  .digest('hex').slice(0, 10);
const INDEX = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8')
  .replace(/(href|src)="\/(app\.js|i18n\.js|style\.css)"/g, `$1="/$2?v=${VERSION}"`);
const sendIndex = (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.type('html').send(INDEX);
};
app.get(['/', '/index.html'], sendIndex);
app.use(express.static(PUBLIC, { index: false }));
app.use('/api', async (req, res, next) => {
  res.set({ 'X-App-Version': VERSION, 'Cache-Control': 'no-store' });
  await init(); next();
});

async function loadUser(req) {
  const p = readToken(getCookie(req, 'sid'));
  if (!p) return null;
  const u = await db.get('SELECT * FROM users WHERE id = ?', [p.uid]);
  return u && u.active ? u : null;
}
const requireUser = async (req, res, next) => {
  req.user = await loadUser(req);
  if (!req.user) return bad(res, 'Please log in', 401);
  next();
};
const requireStaff = (req, res, next) => (req.user.role === 'staff' ? next() : bad(res, 'Staff only', 403));
const requireAdmin = (req, res, next) => (req.user.role === 'admin' ? next() : bad(res, 'Admin only', 403));

app.get('/api/health', async (req, res) => res.json({ ok: true, db: db.kind }));

// ----- auth -----
app.post('/api/login', async (req, res) => {
  const code = str(req.body?.emp_code).toUpperCase(), pin = str(req.body?.pin);
  if (!code || !pin) return bad(res, 'Enter Employee ID and PIN');
  const key = req.ip + '|' + code;
  if (locked(key)) return bad(res, 'Too many attempts. Try again in 5 minutes.', 429);
  const u = await db.get('SELECT * FROM users WHERE emp_code = ?', [code]);
  if (!u || !checkPin(pin, u.pin_hash)) { noteFail(key); return bad(res, 'Invalid Employee ID or PIN', 401); }
  if (!u.active) return bad(res, 'This account is deactivated. Contact admin.', 403);
  fails.delete(key);
  setSession(req, res, makeToken(u.id), SESSION_HOURS * 3600);
  res.json({ user: publicUser(u) });
});
app.post('/api/logout', (req, res) => { setSession(req, res, '', 0); res.json({ ok: true }); });
app.get('/api/me', requireUser, (req, res) => res.json({ user: publicUser(req.user) }));

// ----- staff -----
async function ensureItems(userId, date) {
  const tasks = await db.all(
    `SELECT id, name FROM tasks t WHERE assign_all = 1
       OR EXISTS (SELECT 1 FROM task_staff s WHERE s.task_id = t.id AND s.user_id = ?)
     ORDER BY sort_order, id`, [userId]);
  const have = new Set((await db.all('SELECT task_id FROM daily_items WHERE user_id = ? AND work_date = ?', [userId, date])).map(r => r.task_id));
  for (const t of tasks) {
    if (have.has(t.id)) continue;
    await db.run(`INSERT INTO daily_items (user_id, work_date, task_id, task_name, status, remarks) VALUES (?, ?, ?, ?, 'Pending', '')
                  ON CONFLICT (user_id, work_date, task_id) DO NOTHING`, [userId, date, t.id, t.name]);
  }
}
const itemsFor = (userId, date) =>
  db.all(`SELECT d.id, d.task_id, d.task_name, d.status, d.remarks, d.updated_at FROM daily_items d
          LEFT JOIN tasks t ON t.id = d.task_id
          WHERE d.user_id = ? AND d.work_date = ?
          ORDER BY CASE WHEN t.sort_order IS NULL THEN 1 ELSE 0 END, t.sort_order, d.id`, [userId, date]);
const summarize = items => {
  const s = { total: items.length, Pending: 0, 'In Progress': 0, Completed: 0 };
  items.forEach(i => s[i.status]++);
  s.percent = s.total ? Math.round((s.Completed / s.total) * 100) : 0;
  return s;
};

app.get('/api/my/today', requireUser, requireStaff, async (req, res) => {
  const date = today(), uid = req.user.id;
  const att = (await db.get('SELECT clock_in, clock_out FROM attendance WHERE user_id = ? AND work_date = ?', [uid, date]))
    || { clock_in: null, clock_out: null };
  if (!att.clock_out) await ensureItems(uid, date);
  const items = await itemsFor(uid, date);
  res.json({ user: publicUser(req.user), date, attendance: att, items, summary: summarize(items) });
});

app.patch('/api/my/items/:id', requireUser, requireStaff, async (req, res) => {
  const date = today(), uid = req.user.id;
  const item = await db.get('SELECT * FROM daily_items WHERE id = ? AND user_id = ? AND work_date = ?', [+req.params.id, uid, date]);
  if (!item) return bad(res, 'Task not found', 404);
  const att = await db.get('SELECT clock_in, clock_out FROM attendance WHERE user_id = ? AND work_date = ?', [uid, date]);
  if (!att?.clock_in) return bad(res, 'Please clock in first', 409);
  if (att.clock_out) return bad(res, 'You have already clocked out for today', 409);
  const status = req.body?.status ?? item.status;
  if (!STATUSES.includes(status)) return bad(res, 'Invalid status');
  const remarks = typeof req.body?.remarks === 'string' ? req.body.remarks.trim().slice(0, 500) : item.remarks;
  const ts = now();
  await db.run('UPDATE daily_items SET status = ?, remarks = ?, updated_at = ? WHERE id = ?', [status, remarks, ts, item.id]);
  res.json({ ...item, status, remarks, updated_at: ts });
});

app.post('/api/my/clockin', requireUser, requireStaff, async (req, res) => {
  const date = today(), uid = req.user.id;
  const r = await db.run(`INSERT INTO attendance (user_id, work_date, clock_in) VALUES (?, ?, ?)
                          ON CONFLICT (user_id, work_date) DO NOTHING`, [uid, date, now()]);
  if (!r.changes) return bad(res, 'You have already clocked in today', 409);
  await ensureItems(uid, date);
  res.json({ attendance: await db.get('SELECT clock_in, clock_out FROM attendance WHERE user_id = ? AND work_date = ?', [uid, date]) });
});

app.post('/api/my/clockout', requireUser, requireStaff, async (req, res) => {
  const date = today(), uid = req.user.id;
  if (!(await db.get('SELECT 1 AS x FROM attendance WHERE user_id = ? AND work_date = ?', [uid, date]))) return bad(res, 'Please clock in first', 409);
  const r = await db.run('UPDATE attendance SET clock_out = ? WHERE user_id = ? AND work_date = ? AND clock_out IS NULL', [now(), uid, date]);
  if (!r.changes) return bad(res, 'You have already clocked out today', 409);
  const att = await db.get('SELECT clock_in, clock_out FROM attendance WHERE user_id = ? AND work_date = ?', [uid, date]);
  const items = await itemsFor(uid, date);
  res.json({ attendance: att, summary: summarize(items) });
});

// ----- admin -----
const admin = express.Router();
admin.use(requireUser, requireAdmin);

admin.get('/report', async (req, res) => {
  const date = isDate(req.query.date) ? req.query.date : today();
  const atts = await db.all('SELECT * FROM attendance WHERE work_date = ?', [date]);
  const items = await db.all('SELECT * FROM daily_items WHERE work_date = ? ORDER BY id', [date]);
  const users = await db.all("SELECT * FROM users WHERE role = 'staff' ORDER BY name");
  const seen = new Set([...atts.map(a => a.user_id), ...items.map(i => i.user_id)]);
  const staff = users.filter(u => u.active || seen.has(u.id)).map(u => {
    const its = items.filter(i => i.user_id === u.id);
    const a = atts.find(x => x.user_id === u.id);
    return { user: publicUser(u), attendance: a ? { clock_in: a.clock_in, clock_out: a.clock_out } : null, items: its, summary: summarize(its) };
  });
  const all = summarize(items);
  res.json({
    date, today: today(),
    totals: {
      total_staff: users.filter(u => u.active).length,
      present: staff.filter(s => s.attendance?.clock_in).length,
      working: date === today() ? staff.filter(s => s.attendance?.clock_in && !s.attendance.clock_out).length : 0,
      no_clock_out: date < today() ? staff.filter(s => s.attendance?.clock_in && !s.attendance.clock_out).length : 0,
      clocked_out: staff.filter(s => s.attendance?.clock_out).length,
      tasks: all,
    },
    staff,
  });
});

// Staff accounts
admin.get('/users', async (req, res) => {
  res.json({ users: (await db.all('SELECT * FROM users ORDER BY role, name')).map(publicUser) });
});
admin.post('/users', async (req, res) => {
  const code = str(req.body?.emp_code).toUpperCase(), name = str(req.body?.name), pin = str(req.body?.pin);
  const role = req.body?.role === 'admin' ? 'admin' : 'staff';
  if (!code || !name) return bad(res, 'Employee ID and name are required');
  if (pin.length < 4) return bad(res, 'PIN must be at least 4 characters');
  if (role === 'staff' && !/^[0-9]{4,8}$/.test(pin)) return bad(res, 'Staff PIN must be 4 to 8 digits (numbers only)');
  const r = await db.run(`INSERT INTO users (emp_code, name, pin_hash, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)
                          ON CONFLICT (emp_code) DO NOTHING RETURNING id`, [code, name, hashPin(pin), role, now()]);
  if (!r.rows.length) return bad(res, 'Employee ID already exists', 409);
  res.status(201).json({ id: r.rows[0].id });
});
admin.put('/users/:id', async (req, res) => {
  const u = await db.get('SELECT * FROM users WHERE id = ?', [+req.params.id]);
  if (!u) return bad(res, 'User not found', 404);
  const code = str(req.body?.emp_code).toUpperCase() || u.emp_code;
  const name = str(req.body?.name) || u.name;
  const role = ['admin', 'staff'].includes(req.body?.role) ? req.body.role : u.role;
  const active = typeof req.body?.active === 'boolean' ? (req.body.active ? 1 : 0) : u.active;
  const pin = str(req.body?.pin);
  if (u.id === req.user.id && (!active || role !== 'admin')) return bad(res, 'You cannot deactivate or demote your own account');
  if (pin && pin.length < 4) return bad(res, 'PIN must be at least 4 characters');
  if (pin && role === 'staff' && !/^[0-9]{4,8}$/.test(pin)) return bad(res, 'Staff PIN must be 4 to 8 digits (numbers only)');
  if (code !== u.emp_code && (await db.get('SELECT id FROM users WHERE emp_code = ?', [code]))) return bad(res, 'Employee ID already exists', 409);
  await db.run('UPDATE users SET emp_code = ?, name = ?, role = ?, active = ?, pin_hash = ? WHERE id = ?',
    [code, name, role, active, pin ? hashPin(pin) : u.pin_hash, u.id]);
  res.json({ ok: true });
});

// Checklist tasks
admin.get('/tasks', async (req, res) => {
  const tasks = await db.all('SELECT * FROM tasks ORDER BY sort_order, id');
  const links = await db.all('SELECT * FROM task_staff');
  res.json({ tasks: tasks.map(t => ({ ...t, assign_all: !!t.assign_all, staff_ids: links.filter(l => l.task_id === t.id).map(l => l.user_id) })) });
});
async function saveTaskStaff(taskId, body) {
  await db.run('DELETE FROM task_staff WHERE task_id = ?', [taskId]);
  if (body.assign_all !== false) return;
  for (const uid of [...new Set((body.staff_ids || []).map(Number).filter(Boolean))]) {
    await db.run('INSERT INTO task_staff (task_id, user_id) VALUES (?, ?)', [taskId, uid]);
  }
}
admin.post('/tasks', async (req, res) => {
  const name = str(req.body?.name);
  if (!name) return bad(res, 'Task name is required');
  const max = await db.get('SELECT MAX(sort_order) AS m FROM tasks');
  const sort = Number.isFinite(+req.body?.sort_order) && req.body?.sort_order !== '' && req.body?.sort_order != null
    ? Math.trunc(+req.body.sort_order) : Number(max?.m || 0) + 10;
  const r = await db.run('INSERT INTO tasks (name, sort_order, assign_all) VALUES (?, ?, ?) RETURNING id', [name, sort, req.body?.assign_all === false ? 0 : 1]);
  await saveTaskStaff(r.rows[0].id, req.body);
  res.status(201).json({ id: r.rows[0].id });
});
admin.put('/tasks/:id', async (req, res) => {
  const t = await db.get('SELECT * FROM tasks WHERE id = ?', [+req.params.id]);
  if (!t) return bad(res, 'Task not found', 404);
  const name = str(req.body?.name) || t.name;
  const sort = Number.isFinite(+req.body?.sort_order) && req.body?.sort_order !== '' && req.body?.sort_order != null ? Math.trunc(+req.body.sort_order) : t.sort_order;
  await db.run('UPDATE tasks SET name = ?, sort_order = ?, assign_all = ? WHERE id = ?', [name, sort, req.body?.assign_all === false ? 0 : 1, t.id]);
  await saveTaskStaff(t.id, req.body);
  // Keep today's checklists in sync with the new name.
  await db.run('UPDATE daily_items SET task_name = ? WHERE task_id = ? AND work_date = ?', [name, t.id, today()]);
  res.json({ ok: true });
});
admin.delete('/tasks/:id', async (req, res) => {
  const id = +req.params.id;
  await db.run('DELETE FROM tasks WHERE id = ?', [id]);
  await db.run('DELETE FROM task_staff WHERE task_id = ?', [id]);
  // Remove it from today's lists if nobody has started it; history is kept.
  await db.run("DELETE FROM daily_items WHERE task_id = ? AND work_date = ? AND status = 'Pending' AND remarks = ''", [id, today()]);
  res.json({ ok: true });
});

// Ad-hoc task for one staff member on one day
admin.post('/items', async (req, res) => {
  const uid = +req.body?.user_id, name = str(req.body?.task_name);
  const date = isDate(req.body?.date) ? req.body.date : today();
  if (!name) return bad(res, 'Task name is required');
  const u = await db.get("SELECT id FROM users WHERE id = ? AND role = 'staff'", [uid]);
  if (!u) return bad(res, 'Staff not found', 404);
  const r = await db.run(`INSERT INTO daily_items (user_id, work_date, task_id, task_name, status, remarks, updated_at)
                          VALUES (?, ?, NULL, ?, 'Pending', '', ?) RETURNING id`, [uid, date, name, now()]);
  res.status(201).json({ id: r.rows[0].id });
});
// Admin correction of a task status / remarks
admin.patch('/items/:id', async (req, res) => {
  const item = await db.get('SELECT * FROM daily_items WHERE id = ?', [+req.params.id]);
  if (!item) return bad(res, 'Item not found', 404);
  const status = req.body?.status ?? item.status;
  if (!STATUSES.includes(status)) return bad(res, 'Invalid status');
  const remarks = typeof req.body?.remarks === 'string' ? req.body.remarks.trim().slice(0, 500) : item.remarks;
  await db.run('UPDATE daily_items SET status = ?, remarks = ?, updated_at = ? WHERE id = ?', [status, remarks, now(), item.id]);
  res.json({ ok: true });
});
admin.delete('/items/:id', async (req, res) => {
  await db.run('DELETE FROM daily_items WHERE id = ?', [+req.params.id]);
  res.json({ ok: true });
});
// Attendance correction (create or edit clock-in/out)
admin.put('/attendance', async (req, res) => {
  const uid = +req.body?.user_id, date = req.body?.date;
  if (!uid || !isDate(date)) return bad(res, 'user_id and date are required');
  if (!(await db.get('SELECT id FROM users WHERE id = ?', [uid]))) return bad(res, 'User not found', 404);
  const ci = isoOrNull(req.body.clock_in), co = isoOrNull(req.body.clock_out);
  if (ci === undefined || co === undefined) return bad(res, 'Invalid time');
  if (!ci && co) return bad(res, 'Clock-in is required when clock-out is set');
  if (ci && co && co < ci) return bad(res, 'Clock-out cannot be before clock-in');
  if (!ci) {
    await db.run('DELETE FROM attendance WHERE user_id = ? AND work_date = ?', [uid, date]);
  } else {
    await db.run(`INSERT INTO attendance (user_id, work_date, clock_in, clock_out) VALUES (?, ?, ?, ?)
                  ON CONFLICT (user_id, work_date) DO UPDATE SET clock_in = excluded.clock_in, clock_out = excluded.clock_out`,
      [uid, date, ci, co]);
  }
  res.json({ ok: true });
});

app.use('/api/admin', admin);
app.use('/api', (req, res) => bad(res, 'Not found', 404));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || (err.status >= 400 && err.status < 500)) return bad(res, 'Bad request', err.status || 400);
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

if (require.main === module) {
  init().then(() => app.listen(PORT, () => console.log(`Office checklist running at http://localhost:${PORT} (db: ${db.kind}, tz: ${TZ})`)))
    .catch(e => { console.error('Database init failed:', e); process.exit(1); });
}
module.exports = app;
