'use strict';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = iso => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—');
const fmtDate = ymd => new Date(ymd + 'T12:00:00').toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
const toLocalInput = iso => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const STATUSES = ['Pending', 'In Progress', 'Completed'];
const slug = s => 's-' + s.toLowerCase().replace(/\s+/g, '-');

let toastTimer;
function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (err ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2500);
}

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') { show('login'); throw new Error(data.error || 'Please log in'); }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function show(view, user) {
  ['login', 'staff', 'admin'].forEach(v => $('#' + v + 'View').classList.toggle('hidden', v !== view));
  $('#logoutBtn').classList.toggle('hidden', view === 'login');
  $('#who').textContent = user ? `${user.name} (${user.emp_code})` : '';
}

// Dialog helpers: keep the dialog open until the async save succeeds.
document.querySelectorAll('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
function bindDialog(dlg, onSave) {
  const form = dlg.querySelector('form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = form.querySelector('.error');
    err.textContent = '';
    try { await onSave(form); dlg.close(); } catch (ex) { err.textContent = ex.message; }
  });
}

// ---------------- Login ----------------
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  $('#loginError').textContent = '';
  try {
    const { user } = await api('/login', { method: 'POST', body: { emp_code: f.emp_code.value, pin: f.pin.value } });
    f.reset();
    route(user);
  } catch (ex) { $('#loginError').textContent = ex.message; }
});
$('#logoutBtn').addEventListener('click', async () => { await api('/logout', { method: 'POST' }).catch(() => {}); show('login'); });

function route(user) {
  show(user.role === 'admin' ? 'admin' : 'staff', user);
  if (user.role === 'admin') loadReport(); else loadStaff();
}

// ---------------- Staff ----------------
let staffState = null;
async function loadStaff() {
  try { staffState = await api('/my/today'); renderStaff(); } catch (ex) { toast(ex.message, true); }
}
function renderStaff() {
  const { user, date, attendance, items, summary } = staffState;
  const out = !!attendance.clock_out;
  $('#welcome').textContent = `Welcome, ${user.name}`;
  $('#sDate').textContent = fmtDate(date);
  $('#sIn').textContent = fmtTime(attendance.clock_in);
  $('#sOut').textContent = fmtTime(attendance.clock_out);
  $('#sBar').style.width = summary.percent + '%';
  $('#sProgress').textContent = `${summary.Completed} of ${summary.total} completed (${summary.percent}%) · ${summary['In Progress']} in progress · ${summary.Pending} pending`;
  $('#clockOutBtn').classList.toggle('hidden', out);
  $('#sDone').classList.toggle('hidden', !out);
  if (out) $('#sDone').innerHTML = `<b>You clocked out at ${fmtTime(attendance.clock_out)}.</b><br>Today's summary: ${summary.Completed}/${summary.total} tasks completed (${summary.percent}%). Thank you!`;
  $('#sList').innerHTML = items.map(i => `
    <li class="${slug(i.status)}" data-id="${i.id}">
      <div class="name">${esc(i.task_name)}${i.task_id == null ? ' <span class="badge">Ad-hoc</span>' : ''}</div>
      <div class="seg">${STATUSES.map(s => `<button type="button" data-s="${s}" class="${s === i.status ? 'on' : ''}" ${out ? 'disabled' : ''}>${s}</button>`).join('')}</div>
      <input class="remarks" placeholder="Remarks (optional)" value="${esc(i.remarks)}" maxlength="500" ${out ? 'disabled' : ''}>
      <div class="upd">${i.updated_at ? 'Last updated ' + fmtTime(i.updated_at) : 'Not updated yet'}</div>
    </li>`).join('') || '<li>No tasks assigned for today.</li>';
}
async function updateItem(id, patch) {
  try {
    const upd = await api('/my/items/' + id, { method: 'PATCH', body: patch });
    const it = staffState.items.find(i => i.id === id);
    Object.assign(it, upd);
    const s = { total: staffState.items.length, Pending: 0, 'In Progress': 0, Completed: 0 };
    staffState.items.forEach(i => s[i.status]++);
    s.percent = s.total ? Math.round(s.Completed / s.total * 100) : 0;
    staffState.summary = s;
    renderStaff();
    toast('Saved');
  } catch (ex) { toast(ex.message, true); loadStaff(); }
}
$('#sList').addEventListener('click', e => {
  const b = e.target.closest('.seg button');
  if (!b || b.disabled || b.classList.contains('on')) return;
  updateItem(+b.closest('li').dataset.id, { status: b.dataset.s });
});
$('#sList').addEventListener('change', e => {
  if (!e.target.classList.contains('remarks')) return;
  updateItem(+e.target.closest('li').dataset.id, { remarks: e.target.value });
});
$('#clockOutBtn').addEventListener('click', () => {
  const s = staffState.summary;
  $('#confirmBody').innerHTML = `<p>Completed: <b>${s.Completed}</b> · In progress: <b>${s['In Progress']}</b> · Pending: <b>${s.Pending}</b><br>Overall: <b>${s.percent}%</b></p>`;
  const dlg = $('#confirmDlg');
  dlg.returnValue = '';
  dlg.showModal();
  dlg.onclose = async () => {
    if (dlg.returnValue !== 'yes') return;
    const btn = $('#clockOutBtn'); btn.disabled = true;
    try { await api('/my/clockout', { method: 'POST' }); toast('Clocked out'); }
    catch (ex) { toast(ex.message, true); }
    btn.disabled = false;
    loadStaff();
  };
});

// ---------------- Admin ----------------
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('hidden', t.id !== 'tab-' + b.dataset.tab));
  ({ dash: loadReport, staff: loadUsers, tasks: loadTasks })[b.dataset.tab]();
}));

let report = null, users = [], tasks = [];
async function loadReport() {
  try {
    const d = $('#repDate').value;
    report = await api('/admin/report' + (d ? '?date=' + d : ''));
    if (!d) $('#repDate').value = report.date;
    renderReport();
  } catch (ex) { toast(ex.message, true); }
}
$('#repDate').addEventListener('change', loadReport);
$('#repRefresh').addEventListener('click', loadReport);
$('#repToday').addEventListener('click', () => { $('#repDate').value = ''; loadReport(); });

function renderReport() {
  const t = report.totals;
  $('#stTotal').textContent = t.total_staff;
  $('#stPresent').textContent = t.present;
  $('#stWorking').textContent = t.working;
  $('#stPct').textContent = t.tasks.percent + '%';
  $('#stTasks').textContent = `${t.tasks.Completed}/${t.tasks.total} tasks`;
  const open = new Set([...document.querySelectorAll('#repList details[open]')].map(d => d.dataset.uid));
  $('#repList').innerHTML = report.staff.map(s => {
    const a = s.attendance;
    const badge = !a ? '<span class="badge absent">Not logged in</span>' : a.clock_out ? '<span class="badge out">Clocked out</span>' : '<span class="badge working">Working</span>';
    const rows = s.items.map(i => `<tr data-item="${i.id}">
        <td>${esc(i.task_name)}${i.task_id == null ? ' <span class="badge">Ad-hoc</span>' : ''}</td>
        <td><select class="itemStatus">${STATUSES.map(x => `<option ${x === i.status ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
        <td>${esc(i.remarks) || '<span class="muted">—</span>'}</td>
        <td class="muted">${i.updated_at ? fmtTime(i.updated_at) : '—'}</td>
        <td>${i.task_id == null ? '<button class="btn small delItem">Remove</button>' : ''}</td></tr>`).join('');
    return `<details class="emp" data-uid="${s.user.id}" ${open.has(String(s.user.id)) ? 'open' : ''}>
      <summary>
        <div><b>${esc(s.user.name)}</b><br><span class="muted small">${esc(s.user.emp_code)}${s.user.active ? '' : ' · inactive'}</span></div>
        <div class="small">In: <b>${fmtTime(a?.clock_in)}</b><br>Out: <b>${fmtTime(a?.clock_out)}</b></div>
        <div>${badge}</div>
        <div class="pct"><div class="progress"><div style="width:${s.summary.percent}%"></div></div><span class="small">${s.summary.Completed}/${s.summary.total}</span></div>
      </summary>
      <div class="body">
        ${s.items.length ? `<div class="table-wrap"><table><thead><tr><th>Task</th><th>Status</th><th>Remarks</th><th>Updated</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
          : '<p class="muted">No checklist for this day (staff has not opened the app).</p>'}
        <div class="row" style="margin:.6rem 0 0">
          <button class="btn small editAtt">Correct attendance</button>
          <button class="btn small addAdhoc">+ Ad-hoc task</button>
        </div>
      </div></details>`;
  }).join('') || '<p class="muted">No staff yet.</p>';
}
$('#repList').addEventListener('change', async e => {
  if (!e.target.classList.contains('itemStatus')) return;
  try { await api('/admin/items/' + e.target.closest('tr').dataset.item, { method: 'PATCH', body: { status: e.target.value } }); toast('Updated'); loadReport(); }
  catch (ex) { toast(ex.message, true); }
});
$('#repList').addEventListener('click', async e => {
  const uid = e.target.closest('details')?.dataset.uid;
  const s = report?.staff.find(x => String(x.user.id) === uid);
  if (e.target.classList.contains('delItem')) {
    if (!confirm('Remove this ad-hoc task?')) return;
    try { await api('/admin/items/' + e.target.closest('tr').dataset.item, { method: 'DELETE' }); loadReport(); } catch (ex) { toast(ex.message, true); }
  } else if (e.target.classList.contains('editAtt')) {
    const f = $('#attForm');
    f.dataset.uid = uid;
    $('#attWho').textContent = `${s.user.name} — ${fmtDate(report.date)}`;
    f.clock_in.value = toLocalInput(s.attendance?.clock_in);
    f.clock_out.value = toLocalInput(s.attendance?.clock_out);
    f.querySelector('.error').textContent = '';
    $('#attDlg').showModal();
  } else if (e.target.classList.contains('addAdhoc')) {
    const f = $('#adhocForm');
    f.reset(); f.dataset.uid = uid;
    $('#adhocWho').textContent = `${s.user.name} — ${fmtDate(report.date)}`;
    f.querySelector('.error').textContent = '';
    $('#adhocDlg').showModal();
  }
});
bindDialog($('#attDlg'), async f => {
  const iso = v => (v ? new Date(v).toISOString() : null);
  await api('/admin/attendance', { method: 'PUT', body: { user_id: +f.dataset.uid, date: report.date, clock_in: iso(f.clock_in.value), clock_out: iso(f.clock_out.value) } });
  toast('Attendance updated'); loadReport();
});
bindDialog($('#adhocDlg'), async f => {
  await api('/admin/items', { method: 'POST', body: { user_id: +f.dataset.uid, date: report.date, task_name: f.task_name.value } });
  toast('Task added'); loadReport();
});

// Staff accounts
async function loadUsers() {
  try { users = (await api('/admin/users')).users; } catch (ex) { return toast(ex.message, true); }
  $('#userRows').innerHTML = users.map(u => `<tr>
    <td>${esc(u.emp_code)}</td><td>${esc(u.name)}</td><td>${u.role === 'admin' ? 'Admin' : 'Staff'}</td>
    <td>${u.active ? '<span class="badge out">Active</span>' : '<span class="badge absent">Inactive</span>'}</td>
    <td><div class="actions-cell"><button class="btn small" data-edit="${u.id}">Edit</button>
      <button class="btn small" data-toggle="${u.id}">${u.active ? 'Deactivate' : 'Activate'}</button></div></td></tr>`).join('');
}
function openUser(u) {
  const f = $('#userForm');
  f.reset(); f.dataset.id = u ? u.id : '';
  $('#userDlgTitle').textContent = u ? 'Edit staff' : 'Add staff';
  f.emp_code.value = u?.emp_code || ''; f.name.value = u?.name || '';
  f.role.value = u?.role || 'staff'; f.active.checked = u ? u.active : true;
  f.pin.required = !u;
  f.pin.placeholder = u ? 'Leave blank to keep current PIN' : 'min 4 characters';
  f.querySelector('.error').textContent = '';
  $('#userDlg').showModal();
}
$('#addUserBtn').addEventListener('click', () => openUser(null));
$('#userRows').addEventListener('click', async e => {
  const id = +(e.target.dataset.edit || e.target.dataset.toggle);
  const u = users.find(x => x.id === id);
  if (!u) return;
  if (e.target.dataset.edit) return openUser(u);
  if (u.active && !confirm(`Deactivate ${u.name}? They will not be able to log in.`)) return;
  try { await api('/admin/users/' + id, { method: 'PUT', body: { active: !u.active } }); loadUsers(); } catch (ex) { toast(ex.message, true); }
});
bindDialog($('#userDlg'), async f => {
  const body = { emp_code: f.emp_code.value, name: f.name.value, role: f.role.value, active: f.active.checked, pin: f.pin.value };
  if (f.dataset.id) await api('/admin/users/' + f.dataset.id, { method: 'PUT', body });
  else await api('/admin/users', { method: 'POST', body });
  toast('Saved'); loadUsers();
});

// Checklist tasks
async function loadTasks() {
  try {
    tasks = (await api('/admin/tasks')).tasks;
    users = (await api('/admin/users')).users;
  } catch (ex) { return toast(ex.message, true); }
  const nameOf = id => users.find(u => u.id === id)?.name || '?';
  $('#taskRows').innerHTML = tasks.map(t => `<tr>
    <td>${t.sort_order}</td><td>${esc(t.name)}</td>
    <td>${t.assign_all ? 'All staff' : esc(t.staff_ids.map(nameOf).join(', ') || 'Nobody')}</td>
    <td><div class="actions-cell"><button class="btn small" data-edit="${t.id}">Edit</button><button class="btn small" data-del="${t.id}">Delete</button></div></td></tr>`).join('')
    || '<tr><td colspan="4" class="muted">No tasks yet.</td></tr>';
}
function renderTaskStaff(selected) {
  const box = $('#taskStaff');
  box.querySelector('div').innerHTML = users.filter(u => u.role === 'staff' && u.active).map(u =>
    `<label class="check"><input type="checkbox" value="${u.id}" ${selected.includes(u.id) ? 'checked' : ''}> ${esc(u.name)} (${esc(u.emp_code)})</label>`).join('');
  box.classList.toggle('hidden', $('#taskForm').assign_all.checked);
}
function openTask(t) {
  const f = $('#taskForm');
  f.reset(); f.dataset.id = t ? t.id : '';
  $('#taskDlgTitle').textContent = t ? 'Edit task' : 'Add task';
  f.name.value = t?.name || ''; f.sort_order.value = t ? t.sort_order : '';
  f.assign_all.checked = t ? t.assign_all : true;
  renderTaskStaff(t?.staff_ids || []);
  f.querySelector('.error').textContent = '';
  $('#taskDlg').showModal();
}
$('#taskForm').assign_all.addEventListener('change', e => $('#taskStaff').classList.toggle('hidden', e.target.checked));
$('#addTaskBtn').addEventListener('click', () => openTask(null));
$('#taskRows').addEventListener('click', async e => {
  const t = tasks.find(x => x.id === +(e.target.dataset.edit || e.target.dataset.del));
  if (!t) return;
  if (e.target.dataset.edit) return openTask(t);
  if (!confirm(`Delete task "${t.name}"? Past reports keep their records.`)) return;
  try { await api('/admin/tasks/' + t.id, { method: 'DELETE' }); loadTasks(); } catch (ex) { toast(ex.message, true); }
});
bindDialog($('#taskDlg'), async f => {
  const staff_ids = [...f.querySelectorAll('#taskStaff input:checked')].map(i => +i.value);
  if (!f.assign_all.checked && !staff_ids.length) throw new Error('Pick at least one staff member, or assign to all');
  const body = { name: f.name.value, sort_order: f.sort_order.value, assign_all: f.assign_all.checked, staff_ids };
  if (f.dataset.id) await api('/admin/tasks/' + f.dataset.id, { method: 'PUT', body });
  else await api('/admin/tasks', { method: 'POST', body });
  toast('Saved'); loadTasks();
});

// ---------------- Boot ----------------
api('/me').then(({ user }) => route(user)).catch(() => show('login'));
