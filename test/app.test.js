// End-to-end API test of the core workflows. Runs against a throwaway database.
// Uses DATABASE_URL if set (Postgres), otherwise an in-memory SQLite DB.
if (!process.env.DATABASE_URL) process.env.SQLITE_FILE = ':memory:';
const test = require('node:test');
const assert = require('node:assert');
const app = require('../server');

let server, base;
test.before(() => new Promise(r => { server = app.listen(0, () => { base = `http://localhost:${server.address().port}/api`; r(); }); }));
test.after(() => server.close());

function client() {
  let cookie = '';
  return async (path, method = 'GET', body) => {
    const res = await fetch(base + path, {
      method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { status: res.status, data: await res.json() };
  };
}

test('staff: login -> update tasks -> clock out', async () => {
  const c = client();
  assert.equal((await c('/my/today')).status, 401);
  assert.equal((await c('/login', 'POST', { emp_code: 'EMP001', pin: '9999' })).status, 401);

  const login = await c('/login', 'POST', { emp_code: 'emp001', pin: '1111' });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.name, 'Ravi Kumar');

  let t = await c('/my/today');
  assert.equal(t.status, 200);
  assert.equal(t.data.attendance.clock_in, null, 'login alone does not clock in');
  assert.equal(t.data.items.length, 9, 'checklist visible before clock-in');
  assert.ok(t.data.items.every(i => i.status === 'Pending'));
  assert.equal((await c('/my/items/' + t.data.items[0].id, 'PATCH', { status: 'Completed' })).status, 409, 'no updates before clock-in');
  assert.equal((await c('/my/clockout', 'POST')).status, 409, 'no clock-out before clock-in');

  const ci = await c('/my/clockin', 'POST');
  assert.equal(ci.status, 200);
  assert.ok(ci.data.attendance.clock_in);
  assert.equal((await c('/my/clockin', 'POST')).status, 409, 'duplicate clock-in blocked');
  t = await c('/my/today');
  assert.equal(t.data.attendance.clock_in, ci.data.attendance.clock_in);

  const [a, b] = t.data.items;
  const u1 = await c('/my/items/' + a.id, 'PATCH', { status: 'Completed', remarks: 'Done by 10am' });
  assert.equal(u1.status, 200);
  assert.ok(u1.data.updated_at);
  assert.equal((await c('/my/items/' + b.id, 'PATCH', { status: 'In Progress' })).status, 200);
  assert.equal((await c('/my/items/' + b.id, 'PATCH', { status: 'Bogus' })).status, 400);

  const t2 = await c('/my/today');
  assert.equal(t2.data.summary.Completed, 1);
  assert.equal(t2.data.summary['In Progress'], 1);
  assert.equal(t2.data.summary.percent, 11);
  assert.equal(t2.data.items[0].remarks, 'Done by 10am');

  // Second login the same day keeps the original clock-in.
  await c('/login', 'POST', { emp_code: 'EMP001', pin: '1111' });
  assert.equal((await c('/my/today')).data.attendance.clock_in, t.data.attendance.clock_in);

  const out = await c('/my/clockout', 'POST');
  assert.equal(out.status, 200);
  assert.ok(out.data.attendance.clock_out);
  assert.equal(out.data.summary.Completed, 1);

  assert.equal((await c('/my/clockout', 'POST')).status, 409, 'duplicate clock-out blocked');
  assert.equal((await c('/my/items/' + a.id, 'PATCH', { status: 'Pending' })).status, 409, 'locked after clock-out');

  // Staff cannot reach admin APIs.
  assert.equal((await c('/admin/report')).status, 403);
  assert.equal((await c('/admin/users', 'POST', { emp_code: 'X', name: 'X', pin: '1234' })).status, 403);
});

test('admin: dashboard, staff, tasks, corrections', async () => {
  const s2 = client();
  await s2('/login', 'POST', { emp_code: 'EMP002', pin: '2222' });
  await s2('/my/clockin', 'POST');

  const ad = client();
  assert.equal((await ad('/login', 'POST', { emp_code: 'ADMIN', pin: 'admin123' })).status, 200);
  assert.equal((await ad('/my/today')).status, 403, 'admin has no staff checklist');

  let r = await ad('/admin/report');
  assert.equal(r.status, 200);
  assert.equal(r.data.totals.total_staff, 3);
  assert.equal(r.data.totals.present, 2);
  assert.equal(r.data.totals.working, 1);
  const ravi = r.data.staff.find(s => s.user.emp_code === 'EMP001');
  assert.ok(ravi.attendance.clock_out);
  assert.equal(ravi.summary.Completed, 1);

  // Correction: reopen Ravi's day (clear clock-out).
  const date = r.data.date;
  assert.equal((await ad('/admin/attendance', 'PUT', { user_id: ravi.user.id, date, clock_in: ravi.attendance.clock_in, clock_out: null })).status, 200);
  r = await ad('/admin/report');
  assert.equal(r.data.totals.working, 2);

  // Add a staff member, then deactivate.
  const nu = await ad('/admin/users', 'POST', { emp_code: 'emp004', name: 'New Person', pin: '4444' });
  assert.equal(nu.status, 201);
  assert.equal((await ad('/admin/users', 'POST', { emp_code: 'EMP004', name: 'Dup', pin: '4444' })).status, 409);
  const n = client();
  assert.equal((await n('/login', 'POST', { emp_code: 'EMP004', pin: '4444' })).status, 200);
  assert.equal((await n('/my/today')).status, 200);
  assert.equal((await ad('/admin/users/' + nu.data.id, 'PUT', { active: false })).status, 200);
  assert.equal((await n('/my/today')).status, 401, 'deactivated session rejected');
  assert.equal((await n('/login', 'POST', { emp_code: 'EMP004', pin: '4444' })).status, 403);

  // Task only for Suresh + an ad-hoc task.
  const users = (await ad('/admin/users')).data.users;
  const suresh = users.find(u => u.emp_code === 'EMP002');
  const tk = await ad('/admin/tasks', 'POST', { name: 'Water plants', assign_all: false, staff_ids: [suresh.id] });
  assert.equal(tk.status, 201);
  assert.equal((await ad('/admin/items', 'POST', { user_id: suresh.id, task_name: 'Courier pickup at 4pm' })).status, 201);
  let st = await s2('/my/today');
  assert.equal(st.data.items.length, 11);
  assert.ok(st.data.items.some(i => i.task_name === 'Water plants'));
  const rv = client();
  await rv('/login', 'POST', { emp_code: 'EMP001', pin: '1111' });
  assert.ok(!(await rv('/my/today')).data.items.some(i => i.task_name === 'Water plants'), 'not assigned to Ravi');

  // Rename + delete task.
  assert.equal((await ad('/admin/tasks/' + tk.data.id, 'PUT', { name: 'Water the plants', assign_all: false, staff_ids: [suresh.id] })).status, 200);
  st = await s2('/my/today');
  assert.ok(st.data.items.some(i => i.task_name === 'Water the plants'));
  assert.equal((await ad('/admin/tasks/' + tk.data.id, 'DELETE')).status, 200);
  st = await s2('/my/today');
  assert.equal(st.data.items.length, 10);

  // Admin status correction.
  const item = st.data.items[0];
  assert.equal((await ad('/admin/items/' + item.id, 'PATCH', { status: 'Completed' })).status, 200);
  assert.equal((await s2('/my/today')).data.items[0].status, 'Completed');

  // Historical date with no data.
  r = await ad('/admin/report?date=2020-01-01');
  assert.equal(r.data.totals.present, 0);
  assert.equal(r.data.totals.tasks.total, 0);

  // Admin can't lock themselves out.
  const me = users.find(u => u.emp_code === 'ADMIN');
  assert.equal((await ad('/admin/users/' + me.id, 'PUT', { active: false })).status, 400);
});
