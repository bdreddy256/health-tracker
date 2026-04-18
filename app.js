/* ──────────────────────────────────────────
   Health Tracker — app.js
   ────────────────────────────────────────── */

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── DOM refs ──
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const authScreen  = $('#auth-screen');
const appScreen   = $('#app-screen');
const authForm    = $('#auth-form');
const authEmail   = $('#auth-email');
const authPass    = $('#auth-password');
const authSubmit  = $('#auth-submit');
const authError   = $('#auth-error');
const authToggle  = $('#auth-toggle-link');
const authToggleT = $('#auth-toggle-text');

const entryForm   = $('#entry-form');
const entryDate   = $('#entry-date');
const entryStatus = $('#entry-status');

const historyList = $('#history-list');
const weeklySummary = $('#weekly-summary');
const settingsForm  = $('#settings-form');
const settingsStatus = $('#settings-status');

let isSignUp = false;
let currentUser = null;
let charts = {};

// ── Settings (persisted in localStorage) ──
function loadSettings() {
  const raw = localStorage.getItem('ht-settings');
  return raw ? JSON.parse(raw) : { unit: 'lbs', goalSteps: 10000, goalProtein: 150, goalCalories: 2000 };
}

function saveSettings(s) {
  localStorage.setItem('ht-settings', JSON.stringify(s));
  applyUnit(s.unit);
}

function applyUnit(unit) {
  $$('.unit-label').forEach(el => el.textContent = unit);
}

// ── Auth ──
authToggle.addEventListener('click', (e) => {
  e.preventDefault();
  isSignUp = !isSignUp;
  authSubmit.textContent = isSignUp ? 'Sign Up' : 'Sign In';
  authToggleT.textContent = isSignUp ? 'Already have an account?' : "Don't have an account?";
  authToggle.textContent = isSignUp ? 'Sign In' : 'Sign Up';
  authError.textContent = '';
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.textContent = '';
  authSubmit.disabled = true;
  const email = authEmail.value.trim();
  const password = authPass.value;

  const { data, error } = isSignUp
    ? await sb.auth.signUp({ email, password })
    : await sb.auth.signInWithPassword({ email, password });

  authSubmit.disabled = false;
  if (error) { authError.textContent = error.message; return; }
  if (isSignUp && data.user && !data.session) {
    authError.textContent = 'Check your email to confirm your account.';
    authError.style.color = 'var(--success)';
    return;
  }
});

$('#btn-logout').addEventListener('click', async () => {
  await sb.auth.signOut();
});

sb.auth.onAuthStateChange((event, session) => {
  if (session?.user) {
    currentUser = session.user;
    showApp();
  } else {
    currentUser = null;
    showAuth();
  }
});

function showAuth() {
  authScreen.classList.remove('hidden');
  appScreen.classList.add('hidden');
}

function showApp() {
  authScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  $('#user-email').textContent = currentUser.email;
  const s = loadSettings();
  $('#setting-unit').value = s.unit;
  $('#goal-steps').value = s.goalSteps;
  $('#goal-protein').value = s.goalProtein;
  $('#goal-calories').value = s.goalCalories;
  applyUnit(s.unit);
  entryDate.value = todayStr();
  loadHistory();
}

// ── Tabs ──
$$('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.tab').forEach(t => t.classList.remove('active'));
    $$('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    const target = $(`#tab-${btn.dataset.tab}`);
    target.classList.add('active');
    if (btn.dataset.tab === 'history') loadHistory();
    if (btn.dataset.tab === 'metrics') loadMetrics();
  });
});

// ── Entry ──
entryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  entryStatus.textContent = '';
  const row = {
    user_id: currentUser.id,
    entry_date: entryDate.value,
    weight: num('entry-weight'),
    steps: num('entry-steps'),
    protein: num('entry-protein'),
    calories: num('entry-calories'),
    workout_type: $('#entry-workout-type').value,
    workout_volume: num('entry-volume'),
    workout_notes: $('#entry-notes').value.trim() || null,
  };

  const { error } = await sb.from('entries')
    .upsert(row, { onConflict: 'user_id,entry_date' });

  if (error) { entryStatus.textContent = error.message; entryStatus.className = 'error'; return; }
  entryStatus.textContent = 'Saved!';
  entryStatus.className = 'status';
  entryForm.reset();
  entryDate.value = todayStr();
});

// ── History ──
async function loadHistory() {
  const { data, error } = await sb.from('entries')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('entry_date', { ascending: false })
    .limit(90);

  if (error) { historyList.innerHTML = `<p class="error">${error.message}</p>`; return; }
  if (!data.length) { historyList.innerHTML = '<p class="history-empty">No entries yet.</p>'; return; }

  const s = loadSettings();
  historyList.innerHTML = data.map(r => `
    <div class="history-row" data-id="${r.id}">
      <div class="row-header">
        <span class="row-date">${r.entry_date}</span>
        <div class="row-actions">
          <button class="btn-sm btn-ghost" onclick="editEntry('${r.id}')">Edit</button>
          <button class="btn-sm btn-danger" onclick="deleteEntry('${r.id}')">Del</button>
        </div>
      </div>
      <div class="row-details">
        ${r.weight != null ? `<span>${r.weight} ${s.unit}</span>` : ''}
        ${r.steps != null ? `<span>${r.steps} steps</span>` : ''}
        ${r.protein != null ? `<span>${r.protein}g protein</span>` : ''}
        ${r.calories != null ? `<span>${r.calories} cal</span>` : ''}
        ${r.workout_type !== 'none' ? `<span>${r.workout_type}${r.workout_volume ? ' · ' + r.workout_volume : ''}</span>` : ''}
        ${r.workout_notes ? `<span>"${r.workout_notes}"</span>` : ''}
      </div>
    </div>
  `).join('');
}

window.deleteEntry = async function(id) {
  if (!confirm('Delete this entry?')) return;
  await sb.from('entries').delete().eq('id', id).eq('user_id', currentUser.id);
  loadHistory();
};

window.editEntry = async function(id) {
  const { data } = await sb.from('entries').select('*').eq('id', id).single();
  if (!data) return;
  const s = loadSettings();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>Edit ${data.entry_date}</h3>
      <label>Weight (${s.unit})<input type="number" id="ed-weight" step="0.1" value="${data.weight ?? ''}"></label>
      <label>Steps<input type="number" id="ed-steps" value="${data.steps ?? ''}"></label>
      <label>Protein (g)<input type="number" id="ed-protein" value="${data.protein ?? ''}"></label>
      <label>Calories<input type="number" id="ed-calories" value="${data.calories ?? ''}"></label>
      <label>Workout Type
        <select id="ed-type">
          ${['none','cardio','strength','mixed','other'].map(t =>
            `<option value="${t}" ${t === data.workout_type ? 'selected' : ''}>${t}</option>`
          ).join('')}
        </select>
      </label>
      <label>Volume<input type="number" id="ed-volume" step="0.1" value="${data.workout_volume ?? ''}"></label>
      <label>Notes<textarea id="ed-notes" rows="2">${data.workout_notes ?? ''}</textarea></label>
      <div class="modal-actions">
        <button class="btn-ghost" id="ed-cancel">Cancel</button>
        <button id="ed-save">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#ed-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#ed-save').addEventListener('click', async () => {
    const updates = {
      weight: parseFloat(overlay.querySelector('#ed-weight').value) || null,
      steps: parseInt(overlay.querySelector('#ed-steps').value) || null,
      protein: parseInt(overlay.querySelector('#ed-protein').value) || null,
      calories: parseInt(overlay.querySelector('#ed-calories').value) || null,
      workout_type: overlay.querySelector('#ed-type').value,
      workout_volume: parseFloat(overlay.querySelector('#ed-volume').value) || null,
      workout_notes: overlay.querySelector('#ed-notes').value.trim() || null,
    };
    await sb.from('entries').update(updates).eq('id', id).eq('user_id', currentUser.id);
    overlay.remove();
    loadHistory();
  });
};

// ── Metrics ──
async function loadMetrics() {
  const thirtyAgo = new Date();
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const cutoff = thirtyAgo.toISOString().slice(0, 10);

  const { data, error } = await sb.from('entries')
    .select('*')
    .eq('user_id', currentUser.id)
    .gte('entry_date', cutoff)
    .order('entry_date', { ascending: true });

  if (error || !data) return;

  const s = loadSettings();
  const sevenAgo = new Date();
  sevenAgo.setDate(sevenAgo.getDate() - 7);
  const sevenCutoff = sevenAgo.toISOString().slice(0, 10);
  const week = data.filter(r => r.entry_date >= sevenCutoff);

  const avg = (arr, key) => {
    const vals = arr.map(r => r[key]).filter(v => v != null);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };

  const goalHit = (arr, key, goal) => {
    if (!goal) return null;
    const vals = arr.filter(r => r[key] != null);
    if (!vals.length) return null;
    return Math.round((vals.filter(r => r[key] >= goal).length / vals.length) * 100);
  };

  const weekWorkouts = week.filter(r => r.workout_type && r.workout_type !== 'none').length;
  const weekVolume = week.reduce((sum, r) => sum + (r.workout_volume || 0), 0);

  const avgWeight = avg(week, 'weight');
  const avgSteps = avg(week, 'steps');
  const avgProtein = avg(week, 'protein');
  const avgCalories = avg(week, 'calories');

  weeklySummary.innerHTML = `
    ${card('Avg Weight', avgWeight != null ? avgWeight.toFixed(1) + ' ' + s.unit : '—')}
    ${card('Avg Steps', avgSteps != null ? Math.round(avgSteps).toLocaleString() : '—')}
    ${card('Avg Protein', avgProtein != null ? Math.round(avgProtein) + 'g' : '—')}
    ${card('Avg Calories', avgCalories != null ? Math.round(avgCalories).toLocaleString() : '—')}
    ${card('Steps Goal Hit', goalHit(week, 'steps', s.goalSteps) != null ? goalHit(week, 'steps', s.goalSteps) + '%' : '—')}
    ${card('Protein Goal Hit', goalHit(week, 'protein', s.goalProtein) != null ? goalHit(week, 'protein', s.goalProtein) + '%' : '—')}
    ${card('Cal Goal Hit', goalHit(week, 'calories', s.goalCalories) != null ? goalHit(week, 'calories', s.goalCalories) + '%' : '—')}
    ${card('Workouts', weekWorkouts + ' days')}
    ${card('Total Volume', weekVolume || '—')}
  `;

  renderChart('chart-weight', 'Weight (' + s.unit + ')', data, 'weight', '#2563eb');
  renderChart('chart-steps', 'Steps', data, 'steps', '#16a34a');
  renderChart('chart-protein', 'Protein (g)', data, 'protein', '#ea580c');
  renderChart('chart-calories', 'Calories', data, 'calories', '#9333ea');
  renderChart('chart-volume', 'Workout Volume', data, 'workout_volume', '#0891b2');
}

function card(label, value) {
  return `<div class="summary-card"><div class="card-value">${value}</div><div class="card-label">${label}</div></div>`;
}

function renderChart(canvasId, label, data, key, color) {
  const ctx = document.getElementById(canvasId);
  if (charts[canvasId]) charts[canvasId].destroy();

  const filtered = data.filter(r => r[key] != null);
  charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: filtered.map(r => r.entry_date.slice(5)),
      datasets: [{
        label,
        data: filtered.map(r => r[key]),
        borderColor: color,
        backgroundColor: color + '22',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, title: { display: true, text: label } },
      scales: { x: { ticks: { maxTicksToSkip: 5 } }, y: { beginAtZero: false } },
    }
  });
}

// ── Settings ──
settingsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const s = {
    unit: $('#setting-unit').value,
    goalSteps: parseInt($('#goal-steps').value) || 0,
    goalProtein: parseInt($('#goal-protein').value) || 0,
    goalCalories: parseInt($('#goal-calories').value) || 0,
  };
  saveSettings(s);
  settingsStatus.textContent = 'Settings saved!';
  setTimeout(() => settingsStatus.textContent = '', 2000);
});

// ── Helpers ──
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function num(id) {
  const v = document.getElementById(id).value;
  return v === '' ? null : parseFloat(v);
}
