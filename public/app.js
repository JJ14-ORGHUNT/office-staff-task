'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

// ---------------- language ----------------
let lang = I18N[store.get('lang')] ? store.get('lang') : 'en';
const t = (key, vars) => {
  let s = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
  if (vars) for (const k in vars) s = s.replace('{' + k + '}', vars[k]);
  return s;
};
const locale = () => I18N[lang]._locale;
const fmtTime = iso => (iso ? new Date(iso).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' }) : '—');
const fmtDate = ymd => new Date(ymd + 'T12:00:00').toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
const fmtDur = ms => {
  if (!(ms > 0)) return '0' + t('m');
  const mins = Math.floor(ms / 60000), h = Math.floor(mins / 60), m = mins % 60;
  return (h ? h + t('h') + ' ' : '') + m + t('m');
};
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

function renderLangSwitch(el) {
  el.innerHTML = Object.keys(I18N).map(k => `<button type="button" data-lang="${k}" class="${k === lang ? 'on' : ''}">${I18N[k]._name}</button>`).join('');
}
function applyLang() {
  document.documentElement.lang = lang;
  $$('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  renderLangSwitch($('#loginLang')); renderLangSwitch($('#topLang'));
  $('#togglePw').textContent = pwMode ? t('usePin') : t('usePassword');
  $('#logoutBtn').title = t('logout');
  if (staff) renderStaff();
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-lang]');
  if (!b) return;
  lang = b.dataset.lang; store.set('lang', lang); applyLang();
});

// ---------------- toast + api ----------------
let toastTimer;
function toast(msg, kind) {
  const el = $('#toast');
  el.textContent = msg; el.className = 'toast' + (kind ? ' ' + kind : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}
const ERR_KEYS = [
  [/Invalid Employee ID or PIN/, 'wrongLogin'], [/Too many attempts/, 'tooMany'], [/deactivated/, 'deactivated'],
  [/already clocked in/, 'alreadyIn'], [/already clocked out/, 'alreadyOut'], [/clock in first/, 'clockInFirst'],
  [/Please log in/, 'pleaseLogin'], [/Task not found/, 'taskGone'], [/Server error|Something went wrong/, 'serverErr'],
];
const friendly = msg => { for (const [re, k] of ERR_KEYS) if (re.test(msg)) return t(k); return msg; };

async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin', cache: 'no-store',
    });
  } catch { throw new Error(t('noNet')); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') { goLogin(); throw new Error(t('pleaseLogin')); }
  if (!res.ok) { const e = new Error(friendly(data.error || 'Something went wrong')); e.status = res.status; throw e; }
  return data;
}

// ---------------- views ----------------
let me = null;
function showView(v) {
  ['login', 'staff', 'admin'].forEach(x => $('#' + x + 'View').classList.toggle('hidden', x !== v));
  $('#topbar').classList.toggle('hidden', v === 'login');
  $('#topLang').classList.toggle('hidden', v !== 'staff');
  document.body.classList.toggle('is-staff', v === 'staff');
  if (v !== 'staff') $('#bottomBar').classList.add('hidden');
  $('#who').innerHTML = me && v !== 'login'
    ? `<div class="avatar">${esc(initials(me.name))}</div><div><b>${esc(me.name)}</b><span>${esc(me.emp_code)}</span></div>` : '';
}
function goLogin() { $$('dialog[open]').forEach(d => d.close()); me = null; staff = null; showView('login'); resetLogin(); }
function route(user) {
  me = user;
  if (user.role === 'admin') { showView('admin'); loadReport(); }
  else { showView('staff'); loadStaff(); }
}
$('#logoutBtn').addEventListener('click', async () => {
  await api('/logout', { method: 'POST' }).catch(() => {});
  goLogin();
});
$$('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
function bindForm(dlg, onSave) {
  const form = dlg.querySelector('form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = form.querySelector('.error'), btn = form.querySelector('button:not([type=button])');
    if (err) err.textContent = '';
    btn.disabled = true;
    try { await onSave(form); dlg.close(); }
    catch (ex) { if (err) err.textContent = ex.message; else toast(ex.message, 'err'); }
    finally { btn.disabled = false; }
  });
}

// ---------------- login ----------------
let pin = '', pwMode = store.get('loginMode') === 'pw';
const remembered = () => store.get('empCode');
function resetLogin() {
  pin = ''; $('#pw').value = ''; $('#loginError').textContent = '';
  const code = remembered();
  $('#remembered').classList.toggle('hidden', !code);
  $('#idLabel').classList.toggle('hidden', !!code);
  if (code) { $('#remCode').textContent = code; $('#remAvatar').textContent = code.slice(-2); }
  $('#pinPad').classList.toggle('hidden', pwMode);
  $('#pwBox').classList.toggle('hidden', !pwMode);
  $('#togglePw').textContent = pwMode ? t('usePin') : t('usePassword');
  renderDots();
}
function renderDots() {
  const n = Math.max(4, pin.length);
  $('#dots').innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join('');
}
$('#keypad').innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'go'].map(k =>
  k === 'del' ? '<button type="button" class="key-del" data-k="del" aria-label="Delete">⌫</button>'
  : k === 'go' ? '<button type="button" class="key-go" data-k="go" aria-label="Log in">✓</button>'
  : `<button type="button" data-k="${k}">${k}</button>`).join('');
function pressKey(k) {
  $('#loginError').textContent = '';
  if (k === 'del') pin = pin.slice(0, -1);
  else if (k === 'go') return doLogin();
  else if (pin.length < 8) pin += k;
  renderDots();
}
$('#keypad').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) pressKey(b.dataset.k); });
document.addEventListener('keydown', e => {
  if ($('#loginView').classList.contains('hidden') || pwMode || document.activeElement === $('#empCode')) return;
  if (/^\d$/.test(e.key)) pressKey(e.key);
  else if (e.key === 'Backspace') pressKey('del');
  else if (e.key === 'Enter') pressKey('go');
});
$('#empCode').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); pwMode ? $('#pw').focus() : $('#empCode').blur(); } });
$('#pw').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
$('#pwLogin').addEventListener('click', doLogin);
$('#notYou').addEventListener('click', () => { store.set('empCode', null); resetLogin(); $('#empCode').focus(); });
$('#togglePw').addEventListener('click', () => {
  pwMode = !pwMode; store.set('loginMode', pwMode ? 'pw' : 'pin'); resetLogin();
  if (pwMode) $('#pw').focus();
});
let loggingIn = false;
async function doLogin() {
  if (loggingIn) return;
  const code = (remembered() || $('#empCode').value).trim().toUpperCase();
  const secret = pwMode ? $('#pw').value : pin;
  if (!code) { $('#loginError').textContent = t('enterId'); $('#empCode').focus(); return; }
  if (!secret) { $('#loginError').textContent = pwMode ? t('password') + '?' : t('enterPin'); return; }
  loggingIn = true;
  try {
    const { user } = await api('/login', { method: 'POST', body: { emp_code: code, pin: secret } });
    store.set('empCode', user.emp_code);
    pin = ''; $('#pw').value = ''; $('#empCode').value = '';
    route(user);
  } catch (ex) {
    $('#loginError').textContent = ex.message;
    pin = ''; renderDots();
  } finally { loggingIn = false; }
}

// ---------------- staff ----------------
const ICONS = [
  [/meeting|conference|chair|board ?room/i, '🪑'], [/pantry|tea|coffee|kitchen|snack/i, '☕'], [/water|drink/i, '💧'],
  [/washroom|toilet|restroom|hygiene|bathroom/i, '🚻'], [/dustbin|garbage|trash|waste/i, '🗑️'],
  [/clean|sweep|mop|dust|wipe/i, '🧹'], [/suppl|stationery|stock|printer|paper/i, '📦'],
  [/courier|parcel|deliver|letter/i, '📮'], [/plant|garden/i, '🪴'], [/light|\bac\b|switch|fan|power/i, '💡'],
  [/door|lock|key|security/i, '🔑'], [/ad-?hoc|assigned|extra/i, '📌'], [/guest|visitor|reception/i, '🤝'],
];
const iconFor = name => { for (const [re, ic] of ICONS) if (re.test(name)) return ic; return '📋'; };

let staff = null, clockTimer = null;
const lastStatus = {};
async function loadStaff(silent) {
  try { staff = await api('/my/today'); renderStaff(); }
  catch (ex) { if (!silent) toast(ex.message, 'err'); }
}
function summarize(items) {
  const s = { total: items.length, Pending: 0, 'In Progress': 0, Completed: 0 };
  items.forEach(i => s[i.status]++);
  s.percent = s.total ? Math.round(s.Completed / s.total * 100) : 0;
  return s;
}
function greeting() {
  const h = new Date().getHours();
  return t(h < 12 ? 'greetMorning' : h < 17 ? 'greetAfternoon' : 'greetEvening');
}
function tickClock() {
  $('#liveClock').textContent = new Date().toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
  if (staff?.attendance.clock_in && !staff.attendance.clock_out) {
    const w = $('#workChip');
    if (w) w.textContent = '⏱ ' + t('working', { h: fmtDur(Date.now() - new Date(staff.attendance.clock_in)) });
  }
}
function renderStaff() {
  if (!staff) return;
  const { user, date, attendance: a, items } = staff;
  const s = staff.summary = summarize(items);
  const state = !a.clock_in ? 'before' : a.clock_out ? 'after' : 'working';
  $('#greet').textContent = `${greeting()}, ${user.name.split(' ')[0]} 👋`;
  $('#todayDate').textContent = fmtDate(date);
  $('#hero').classList.toggle('done', state === 'after');
  $('#ring').classList.toggle('hidden', state === 'before');
  $('#ringNum').textContent = `${s.Completed}/${s.total}`;
  $('#ringFg').style.strokeDashoffset = String(263.9 * (1 - (s.total ? s.Completed / s.total : 0)));
  $('#heroChips').innerHTML = state === 'before' ? '' :
    `<span class="chip">🟢 ${esc(t('inAt', { t: fmtTime(a.clock_in) }))}</span>` +
    (state === 'working' ? '<span class="chip" id="workChip"></span>'
      : `<span class="chip">🏁 ${esc(t('outAt', { t: fmtTime(a.clock_out) }))}</span>`);
  $('#clockInCard').classList.toggle('hidden', state !== 'before');
  $('#bottomBar').classList.toggle('hidden', state !== 'working');
  tickClock();

  let banner = '';
  if (state === 'before') banner = `<div class="banner info"><span class="big">👆</span><span>${esc(t('clockInFirst'))}</span></div>`;
  else if (state === 'after') banner = `<div class="card" style="margin-bottom:1rem"><h2>✅ ${esc(t('dayDone'))}</h2>
      <div class="summary-grid">
        <div><span>${esc(t('inTime'))}</span><b>${fmtTime(a.clock_in)}</b></div>
        <div><span>${esc(t('outTime'))}</span><b>${fmtTime(a.clock_out)}</b></div>
        <div><span>${esc(t('worked'))}</span><b>${fmtDur(new Date(a.clock_out) - new Date(a.clock_in))}</b></div>
        <div><span>${esc(t('tasksDone'))}</span><b>${s.Completed}/${s.total}</b></div>
      </div><div class="muted">${esc(t('seeYou'))}</div></div>`;
  else if (s.total && s.Completed === s.total) banner = `<div class="banner ok"><span class="big">🎉</span><span>${esc(t('allDone'))}</span></div>`;
  $('#staffBanner').innerHTML = banner;

  const locked = state !== 'working';
  const todo = items.filter(i => i.status !== 'Completed'), done = items.filter(i => i.status === 'Completed');
  const card = i => {
    const doing = i.status === 'In Progress';
    const meta = [
      doing ? `<span class="pill doing">🔄 ${esc(t('doing'))}</span>` : `<span class="pill">⏳ ${esc(t('pending'))}</span>`,
      i.task_id == null ? `<span class="pill new">📌 ${esc(t('adhoc'))}</span>` : '',
    ].join('');
    return `<li class="task ${doing ? 'doing' : ''} ${locked ? 'locked' : ''}" data-id="${i.id}">
      <div class="top"><div class="ticon">${iconFor(i.task_name)}</div>
        <div style="flex:1;min-width:0"><div class="tname">${esc(i.task_name)}</div><div class="tmeta">${meta}</div></div></div>
      ${i.remarks ? `<div class="note">📝 ${esc(i.remarks)}</div>` : ''}
      <div class="acts">
        ${doing ? '' : `<button class="btn soft" data-act="start">▶ ${esc(t('start'))}</button>`}
        <button class="btn ok" data-act="done">✓ ${esc(t('markDone'))}</button>
        <button class="btn note-btn" data-act="note" aria-label="${esc(t('addNote'))}" title="${esc(t('addNote'))}">📝</button>
      </div></li>`;
  };
  const doneCard = i => `<li class="task done" data-id="${i.id}">
      <div class="top"><div class="ticon">✓</div>
        <div style="flex:1;min-width:0"><div class="tname">${esc(i.task_name)}</div>
        <div class="tmeta">${i.updated_at ? esc(t('updated', { t: fmtTime(i.updated_at) })) : ''}</div></div>
        ${locked ? '' : `<button class="btn small ghost undo" data-act="undo">↺ ${esc(t('undo'))}</button>`}</div>
      ${i.remarks ? `<div class="note">📝 ${esc(i.remarks)}</div>` : ''}</li>`;

  $('#taskArea').innerHTML = !items.length ? `<div class="card empty">${esc(t('noTasks'))}</div>` :
    (todo.length ? `<div class="section-title"><h2>${esc(t('toDo'))}</h2><span class="count">${todo.length}</span></div>
      <ul class="tasks">${todo.map(card).join('')}</ul>` : '') +
    (done.length ? `<div class="section-title"><h2>${esc(t('doneTitle'))}</h2><span class="count">${done.length}</span></div>
      <ul class="tasks">${done.map(doneCard).join('')}</ul>` : '');
}

let saving = 0;
const findItem = id => staff?.items.find(i => i.id === id);
async function setItem(id, patch, okMsg) {
  const it = findItem(id);
  if (!it) return false;
  const before = Object.fromEntries(Object.keys(patch).map(k => [k, it[k]]));
  Object.assign(it, patch);
  renderStaff();
  saving++;
  try {
    const upd = await api('/my/items/' + id, { method: 'PATCH', body: patch });
    const cur = findItem(id); if (cur) Object.assign(cur, upd);
    renderStaff();
    if (okMsg) toast(okMsg, 'ok');
    return true;
  } catch (ex) {
    const cur = findItem(id);
    // only roll back fields that still hold the value we set
    if (cur) for (const k in patch) if (cur[k] === patch[k]) cur[k] = before[k];
    renderStaff(); toast(ex.message, 'err');
    if (ex.status === 404 || ex.status === 409) loadStaff(true);
    return false;
  } finally { saving--; }
}
$('#taskArea').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const id = +b.closest('.task').dataset.id, it = staff.items.find(i => i.id === id);
  const act = b.dataset.act;
  if (act === 'start') { lastStatus[id] = it.status; setItem(id, { status: 'In Progress' }, t('started')); }
  else if (act === 'done') { lastStatus[id] = it.status; setItem(id, { status: 'Completed' }, t('taskDone')); }
  else if (act === 'undo') setItem(id, { status: lastStatus[id] && lastStatus[id] !== 'Completed' ? lastStatus[id] : 'Pending' });
  else if (act === 'note') openNote(it);
});

// notes
let noteItem = null;
function openNote(it) {
  noteItem = it;
  $('#noteTask').textContent = it.task_name;
  $('#noteText').value = it.remarks || '';
  $('#quickNotes').innerHTML = ['qDone', 'qNoStock', 'qNeedHelp', 'qLater', 'qInformed']
    .map(k => `<button type="button">${esc(t(k))}</button>`).join('');
  $('#noteDlg').showModal();
}
$('#quickNotes').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const ta = $('#noteText');
  ta.value = ta.value.trim() ? ta.value.trim() + ', ' + b.textContent : b.textContent;
});
bindForm($('#noteDlg'), async () => {
  const v = $('#noteText').value.trim();
  if (v !== (noteItem.remarks || '') && !(await setItem(noteItem.id, { remarks: v }, t('saved')))) throw new Error(t('noNet'));
});

// clock in / out
$('#clockInBtn').addEventListener('click', async () => {
  const b = $('#clockInBtn'); b.disabled = true;
  try { await api('/my/clockin', { method: 'POST' }); toast(t('clockedIn'), 'ok'); }
  catch (ex) { toast(ex.message, 'err'); }
  b.disabled = false;
  loadStaff();
});
$('#clockOutBtn').addEventListener('click', () => {
  const s = staff.summary, a = staff.attendance, left = s.total - s.Completed;
  $('#outBody').innerHTML = `
    ${left ? `<div class="warnbox">⚠️ ${esc(t('pendingWarn', { n: left }))}</div>` : ''}
    <div class="summary-grid">
      <div><span>${esc(t('inTime'))}</span><b>${fmtTime(a.clock_in)}</b></div>
      <div><span>${esc(t('worked'))}</span><b>${fmtDur(Date.now() - new Date(a.clock_in))}</b></div>
      <div><span>${esc(t('tasksDone'))}</span><b>${s.Completed}/${s.total}</b></div>
      <div><span>%</span><b>${s.percent}%</b></div>
    </div>`;
  $('#outDlg').showModal();
});
bindForm($('#outDlg'), async () => {
  try { await api('/my/clockout', { method: 'POST' }); toast(t('clockedOut'), 'ok'); }
  finally { loadStaff(); }
});

// keep things fresh: clock every 20s, data every 60s, and when the app comes back to the foreground
setInterval(() => { if (staff && !$('#staffView').classList.contains('hidden')) tickClock(); }, 20000);
setInterval(() => {
  if (document.hidden || saving || $('#staffView').classList.contains('hidden') || document.querySelector('dialog[open]')) return;
  loadStaff(true);
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !me) return;
  if (me.role === 'staff' && !saving && !document.querySelector('dialog[open]')) loadStaff(true);
  if (me.role === 'admin' && !$('#tab-dash').classList.contains('hidden')) loadReport(true);
});

// ---------------- admin ----------------
const ymdLocal = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const toLocalInput = iso => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const STATUSES = ['Pending', 'In Progress', 'Completed'];
const STATUS_LABEL = { Pending: '⏳ Pending', 'In Progress': '🔄 In progress', Completed: '✅ Completed' };

$$('.tabs button').forEach(b => b.addEventListener('click', () => {
  $$('.tabs button').forEach(x => x.classList.toggle('active', x === b));
  $$('.tab').forEach(x => x.classList.toggle('hidden', x.id !== 'tab-' + b.dataset.tab));
  ({ dash: loadReport, staff: loadUsers, tasks: loadTasks })[b.dataset.tab]();
}));

let report = null, users = [], tasks = [], openEmp = null;
async function loadReport(silent) {
  try {
    const d = $('#repDate').value;
    report = await api('/admin/report' + (d ? '?date=' + d : ''));
    if (!d) $('#repDate').value = report.date;
    renderReport();
    $('#lastSync').textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (openEmp != null && $('#empDlg').open && !$('#edItems').contains(document.activeElement)) renderEmpDlg();
  } catch (ex) { if (!silent) toast(ex.message, 'err'); }
}
const shiftDate = n => {
  const d = new Date(($('#repDate').value || report?.date) + 'T12:00:00');
  d.setDate(d.getDate() + n);
  $('#repDate').value = ymdLocal(d); loadReport();
};
$('#prevDay').addEventListener('click', () => shiftDate(-1));
$('#nextDay').addEventListener('click', () => shiftDate(1));
$('#repDate').addEventListener('change', () => loadReport());
$('#repRefresh').addEventListener('click', () => loadReport());
$('#repToday').addEventListener('click', () => { $('#repDate').value = ''; loadReport(); });
setInterval(() => {
  if (document.hidden || !me || me.role !== 'admin' || $('#tab-dash').classList.contains('hidden')) return;
  if (report && report.date === report.today && !document.querySelector('dialog[open]:not(#empDlg)')) loadReport(true);
}, 60000);

const empState = s => !s.attendance?.clock_in ? 'absent' : s.attendance.clock_out ? 'out' : report.date < report.today ? 'noout' : 'working';
const statePill = st => ({
  working: '<span class="pill doing">🟢 Working</span>', out: '<span class="pill done">🏁 Clocked out</span>',
  absent: '<span class="pill absent">Not clocked in</span>', noout: '<span class="pill absent">⚠️ No clock-out</span>' })[st];
const worked = a => (!a?.clock_in ? '—' : a.clock_out ? fmtDurEn(new Date(a.clock_out) - new Date(a.clock_in))
  : report && report.date < report.today ? '—' : fmtDurEn(Date.now() - new Date(a.clock_in)));
const fmtDurEn = ms => { const mins = Math.max(0, Math.floor(ms / 60000)); return (mins >= 60 ? Math.floor(mins / 60) + 'h ' : '') + (mins % 60) + 'm'; };
const tEn = iso => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—');

function renderReport() {
  const tt = report.totals;
  $('#stTotal').textContent = tt.total_staff;
  $('#stPresent').textContent = tt.present;
  $('#stWorking').textContent = tt.working;
  $('#stOut').textContent = tt.clocked_out;
  $('#stPct').textContent = tt.tasks.percent + '%';
  $('#stTasks').textContent = `${tt.tasks.Completed} of ${tt.tasks.total} tasks`;
  const rank = { working: 0, noout: 1, out: 2, absent: 3 };
  const list = [...report.staff].sort((a, b) => rank[empState(a)] - rank[empState(b)] || a.user.name.localeCompare(b.user.name));
  $('#emps').innerHTML = list.map(s => {
    const st = empState(s), sm = s.summary;
    return `<button class="emp" data-uid="${s.user.id}">
      <div class="head"><div class="avatar">${esc(initials(s.user.name))}</div>
        <div class="nm"><b>${esc(s.user.name)}</b><span class="small muted">${esc(s.user.emp_code)}${s.user.active ? '' : ' · inactive'}</span></div>
        ${statePill(st)}</div>
      <div class="times"><div><span>IN</span>${tEn(s.attendance?.clock_in)}</div><div><span>OUT</span>${tEn(s.attendance?.clock_out)}</div><div><span>WORKED</span>${worked(s.attendance)}</div></div>
      <div class="bar-row"><div class="bar"><div style="width:${sm.percent}%"></div></div>${sm.Completed}/${sm.total}</div>
      <div class="mini">${sm.total ? `<span class="pill done">✅ ${sm.Completed} done</span><span class="pill doing">🔄 ${sm['In Progress']} doing</span><span class="pill">⏳ ${sm.Pending} pending</span>`
        : '<span class="pill">No checklist yet</span>'}</div>
    </button>`;
  }).join('') || '<div class="card empty">No staff yet. Add staff in the Staff tab.</div>';
}
$('#emps').addEventListener('click', e => {
  const b = e.target.closest('.emp');
  if (!b) return;
  openEmp = +b.dataset.uid; renderEmpDlg(); $('#empDlg').showModal();
});
function renderEmpDlg() {
  const s = report.staff.find(x => x.user.id === openEmp);
  if (!s) return $('#empDlg').close();
  const a = s.attendance, sm = s.summary;
  $('#edAvatar').textContent = initials(s.user.name);
  $('#edName').textContent = s.user.name;
  $('#edSub').innerHTML = `${esc(s.user.emp_code)} · ${esc(new Date(report.date + 'T12:00:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))} · ${statePill(empState(s))}`;
  $('#edSummary').innerHTML = `<div><span>Clock in</span><b>${tEn(a?.clock_in)}</b></div><div><span>Clock out</span><b>${tEn(a?.clock_out)}</b></div>
    <div><span>Time worked</span><b>${worked(a)}</b></div><div><span>Tasks done</span><b>${sm.Completed}/${sm.total} (${sm.percent}%)</b></div>`;
  $('#edItems').innerHTML = s.items.map(i => `<div class="irow" data-item="${i.id}">
      <div class="ic">${iconFor(i.task_name)}</div>
      <div><div class="nm">${esc(i.task_name)} ${i.task_id == null ? '<span class="pill new">Ad-hoc</span>' : ''}</div>
        <div class="rm">${i.remarks ? '📝 ' + esc(i.remarks) + ' · ' : ''}${i.updated_at ? 'Updated ' + tEn(i.updated_at) : 'Not updated'}</div></div>
      <div class="ctl"><select class="itemStatus" aria-label="Status">${STATUSES.map(x => `<option value="${x}" ${x === i.status ? 'selected' : ''}>${STATUS_LABEL[x]}</option>`).join('')}</select>
        ${i.task_id == null ? '<button class="icon-btn delItem" title="Remove ad-hoc task" aria-label="Remove">🗑</button>' : ''}</div>
    </div>`).join('') || '<div class="empty">No checklist for this day — the staff member has not opened the app.</div>';
}
$('#edItems').addEventListener('change', async e => {
  if (!e.target.classList.contains('itemStatus')) return;
  try { await api('/admin/items/' + e.target.closest('.irow').dataset.item, { method: 'PATCH', body: { status: e.target.value } }); toast('Status updated', 'ok'); loadReport(true); }
  catch (ex) { toast(ex.message, 'err'); }
});
$('#edItems').addEventListener('click', async e => {
  if (!e.target.closest('.delItem') || !confirm('Remove this ad-hoc task?')) return;
  try { await api('/admin/items/' + e.target.closest('.irow').dataset.item, { method: 'DELETE' }); toast('Removed', 'ok'); loadReport(true); }
  catch (ex) { toast(ex.message, 'err'); }
});
$('#edAtt').addEventListener('click', () => {
  const s = report.staff.find(x => x.user.id === openEmp), f = $('#attDlg form');
  $('#attWho').textContent = `${s.user.name} — ${report.date}`;
  f.clock_in.value = toLocalInput(s.attendance?.clock_in);
  f.clock_out.value = toLocalInput(s.attendance?.clock_out);
  f.querySelector('.error').textContent = '';
  $('#attDlg').showModal();
});
bindForm($('#attDlg'), async f => {
  const iso = v => (v ? new Date(v).toISOString() : null);
  await api('/admin/attendance', { method: 'PUT', body: { user_id: openEmp, date: report.date, clock_in: iso(f.clock_in.value), clock_out: iso(f.clock_out.value) } });
  toast('Attendance updated', 'ok'); loadReport(true);
});
$('#edAdhoc').addEventListener('click', () => {
  const s = report.staff.find(x => x.user.id === openEmp), f = $('#adhocDlg form');
  f.reset(); f.querySelector('.error').textContent = '';
  $('#adhocWho').textContent = `For ${s.user.name} — ${report.date}`;
  $('#adhocDlg').showModal();
});
bindForm($('#adhocDlg'), async f => {
  await api('/admin/items', { method: 'POST', body: { user_id: openEmp, date: report.date, task_name: f.task_name.value } });
  toast('Task added — it will show on their phone', 'ok'); loadReport(true);
});

$('#exportCsv').addEventListener('click', () => {
  if (!report) return;
  const q = v => { let x = String(v ?? ''); if (/^[=+\-@\t\r]/.test(x)) x = "'" + x; return '"' + x.replace(/"/g, '""') + '"'; };
  const rows = [['Date', 'Employee ID', 'Name', 'Clock in', 'Clock out', 'Time worked', 'Task', 'Status', 'Remarks', 'Last updated']];
  for (const s of report.staff) {
    const a = s.attendance, base = [report.date, s.user.emp_code, s.user.name, tEn(a?.clock_in), tEn(a?.clock_out), worked(a)];
    if (!s.items.length) rows.push([...base, '', '', '', '']);
    s.items.forEach(i => rows.push([...base, i.task_name, i.status, i.remarks, tEn(i.updated_at)]));
  }
  const blob = new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' });
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `checklist-${report.date}.csv` });
  document.body.appendChild(link); link.click(); link.remove();
});

// staff accounts
async function loadUsers() {
  try { users = (await api('/admin/users')).users; } catch (ex) { return toast(ex.message, 'err'); }
  $('#userRows').innerHTML = users.map(u => `<tr>
    <td><div class="who"><div class="avatar">${esc(initials(u.name))}</div><div><b>${esc(u.name)}</b><span>${esc(u.emp_code)}</span>${u.active ? '<span class="pill done show-sm">Active</span>' : '<span class="pill absent show-sm">Inactive</span>'}</div></div></td>
    <td class="hide-sm">${esc(u.emp_code)}</td><td class="hide-sm">${u.role === 'admin' ? '<span class="pill blue">Admin</span>' : 'Staff'}</td>
    <td class="hide-sm">${u.active ? '<span class="pill done">Active</span>' : '<span class="pill absent">Inactive</span>'}</td>
    <td><div class="acts"><button class="btn small" data-edit="${u.id}">Edit</button>
      ${u.id === me.id ? '' : `<button class="btn small" data-toggle="${u.id}">${u.active ? 'Deactivate' : 'Activate'}</button>`}</div></td></tr>`).join('');
}
function openUser(u) {
  const f = $('#userDlg form');
  f.reset(); f.dataset.id = u ? u.id : ''; f.querySelector('.error').textContent = '';
  $('#userDlgTitle').textContent = u ? 'Edit staff' : 'Add staff';
  f.elements.emp_code.value = u?.emp_code || ''; f.elements.name.value = u?.name || '';
  f.elements.role.value = u?.role || 'staff'; f.elements.active.checked = u ? u.active : true;
  f.elements.pin.required = !u;
  f.elements.pin.placeholder = u ? 'Leave blank to keep current PIN' : '4 or more digits, e.g. 4821';
  $('#pinLabel').textContent = u ? 'New PIN (optional)' : 'PIN';
  $('#userDlg').showModal();
}
$('#addUserBtn').addEventListener('click', () => openUser(null));
$('#userRows').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  const u = users.find(x => x.id === +(b.dataset.edit || b.dataset.toggle));
  if (!u) return;
  if (b.dataset.edit) return openUser(u);
  if (u.active && !confirm(`Deactivate ${u.name}? They will not be able to log in.`)) return;
  try { await api('/admin/users/' + u.id, { method: 'PUT', body: { active: !u.active } }); toast('Saved', 'ok'); loadUsers(); }
  catch (ex) { toast(ex.message, 'err'); }
});
bindForm($('#userDlg'), async f => {
  const el = f.elements;
  const body = { emp_code: el.emp_code.value, name: el.name.value, role: el.role.value, active: el.active.checked, pin: el.pin.value };
  if (f.dataset.id) await api('/admin/users/' + f.dataset.id, { method: 'PUT', body });
  else await api('/admin/users', { method: 'POST', body });
  toast('Saved', 'ok'); loadUsers();
});

// checklist tasks
async function loadTasks() {
  try { [tasks, users] = await Promise.all([api('/admin/tasks').then(r => r.tasks), api('/admin/users').then(r => r.users)]); }
  catch (ex) { return toast(ex.message, 'err'); }
  const nameOf = id => users.find(u => u.id === id)?.name || '?';
  $('#taskRows').innerHTML = tasks.map((tk, i) => `<tr>
    <td><div class="acts" style="justify-content:flex-start"><button class="icon-btn" data-up="${i}" ${i ? '' : 'disabled'} aria-label="Move up">↑</button><button class="icon-btn" data-down="${i}" ${i < tasks.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button></div></td>
    <td><span style="font-size:1.2rem;margin-right:.4rem">${iconFor(tk.name)}</span><b>${esc(tk.name)}</b></td>
    <td class="hide-sm">${tk.assign_all ? '<span class="pill blue">All staff</span>' : esc(tk.staff_ids.map(nameOf).join(', ') || 'Nobody')}</td>
    <td><div class="acts"><button class="btn small" data-edit="${tk.id}">Edit</button><button class="btn small" data-del="${tk.id}">Delete</button></div></td></tr>`).join('')
    || '<tr><td colspan="4" class="empty">No tasks yet.</td></tr>';
}
const taskBody = tk => ({ name: tk.name, sort_order: tk.sort_order, assign_all: tk.assign_all, staff_ids: tk.staff_ids });
async function moveTask(i, dir) {
  const order = [...tasks];
  [order[i], order[i + dir]] = [order[i + dir], order[i]];
  try {
    await Promise.all(order.map((tk, idx) => ((idx + 1) * 10 !== tk.sort_order
      ? api('/admin/tasks/' + tk.id, { method: 'PUT', body: { ...taskBody(tk), sort_order: (idx + 1) * 10 } }) : null)));
  } catch (ex) { toast(ex.message, 'err'); }
  loadTasks();
}
function renderTaskStaff(selected) {
  $('#taskStaff div').innerHTML = users.filter(u => u.role === 'staff' && u.active).map(u =>
    `<label class="check"><input type="checkbox" value="${u.id}" ${selected.includes(u.id) ? 'checked' : ''}> ${esc(u.name)} (${esc(u.emp_code)})</label>`).join('')
    || '<span class="muted">No active staff.</span>';
  $('#taskStaff').classList.toggle('hidden', $('#taskDlg form').elements.assign_all.checked);
}
function openTask(tk) {
  const f = $('#taskDlg form');
  f.reset(); f.dataset.id = tk ? tk.id : ''; f.querySelector('.error').textContent = '';
  $('#taskDlgTitle').textContent = tk ? 'Edit task' : 'Add task';
  f.elements.name.value = tk?.name || ''; f.elements.sort_order.value = tk ? tk.sort_order : '';
  f.elements.assign_all.checked = tk ? tk.assign_all : true;
  renderTaskStaff(tk?.staff_ids || []);
  $('#taskDlg').showModal();
}
$('#taskDlg form').elements.assign_all.addEventListener('change', e => $('#taskStaff').classList.toggle('hidden', e.target.checked));
$('#addTaskBtn').addEventListener('click', () => openTask(null));
$('#taskRows').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.dataset.up) return moveTask(+b.dataset.up, -1);
  if (b.dataset.down) return moveTask(+b.dataset.down, 1);
  const tk = tasks.find(x => x.id === +(b.dataset.edit || b.dataset.del));
  if (!tk) return;
  if (b.dataset.edit) return openTask(tk);
  if (!confirm(`Delete task "${tk.name}"? Past reports keep their records.`)) return;
  try { await api('/admin/tasks/' + tk.id, { method: 'DELETE' }); toast('Task deleted', 'ok'); loadTasks(); }
  catch (ex) { toast(ex.message, 'err'); }
});
bindForm($('#taskDlg'), async f => {
  const staff_ids = $$('#taskStaff input:checked').map(i => +i.value);
  if (!f.elements.assign_all.checked && !staff_ids.length) throw new Error('Pick at least one staff member, or tick "Assign to all staff".');
  const body = { name: f.elements.name.value, sort_order: f.elements.sort_order.value, assign_all: f.elements.assign_all.checked, staff_ids };
  if (f.dataset.id) await api('/admin/tasks/' + f.dataset.id, { method: 'PUT', body });
  else await api('/admin/tasks', { method: 'POST', body });
  toast('Saved', 'ok'); loadTasks();
});

// ---------------- boot ----------------
applyLang();
resetLogin();
api('/me').then(({ user }) => route(user)).catch(() => goLogin());
