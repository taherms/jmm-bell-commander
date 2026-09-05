/* ==========================================================================
   JMM Bell Commander — app.js
   State, persistence, rendering and event wiring for the whole app.
   Loaded after utils.js, db.js, auth.js, scheduler.js.
   ========================================================================== */

/* ---------------------------- persistence ---------------------------- */

const Store = (() => {
  const TT_KEY = 'jmm_timetables';
  const SETTINGS_KEY = 'jmm_settings';

  const DEFAULT_SETTINGS = {
    volume: 0.9,
    wakeLockPreferred: true,
    overrideTimetableId: null,
    overrideDate: null,
  };

  function getTimetables() {
    try {
      return JSON.parse(localStorage.getItem(TT_KEY)) || [];
    } catch { return []; }
  }
  function setTimetables(list) {
    localStorage.setItem(TT_KEY, JSON.stringify(list));
  }
  function getSettings() {
    try {
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) };
    } catch { return { ...DEFAULT_SETTINGS }; }
  function setSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }
  function hasSavedData() {
    return localStorage.getItem(TT_KEY) !== null || localStorage.getItem(SETTINGS_KEY) !== null;
  }

  return { getTimetables, setTimetables, getSettings, setSettings, hasSavedData, DEFAULT_SETTINGS };
})();

/* ------------------------------ app state ------------------------------ */

const AppState = {
  activeTab: 'now',
  timetables: Store.getTimetables(),
  settings: Store.getSettings(),
  defaultRings: [],       // [{id, name, file}]
  customRings: [],        // [{id, name, mimeType, createdAt}]  (blobs stay in IndexedDB)
  todayLog: [],           // [{time, bellLabel, timetableName}]
  firedTodaySet: new Set(),
  audioUnlocked: false,
  audioBlockedBanner: false,
  wakeLockObj: null,
  currentTickInfo: null,
};

function persistTimetables() { Store.setTimetables(AppState.timetables); }
function persistSettings() { Store.setSettings(AppState.settings); }

function allRingOptions() {
  const opts = [];
  for (const r of AppState.defaultRings) opts.push({ source: 'default', id: r.id, name: r.name });
  for (const r of AppState.customRings) opts.push({ source: 'custom', id: r.id, name: r.name });
  return opts;
}
function ringName(ringRef) {
  if (!ringRef) return '(no ring set)';
  const found = allRingOptions().find((o) => o.source === ringRef.source && o.id === ringRef.id);
  return found ? found.name : '(missing ring)';
}

/* ------------------------------ tab nav ------------------------------ */

function switchTab(tab) {
  AppState.activeTab = tab;
  document.querySelectorAll('.tabbar__btn').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.screen').forEach((s) => {
    s.classList.toggle('is-active', s.id === `screen-${tab}`);
  });
  renderActiveTab();
}

function renderActiveTab() {
  if (AppState.activeTab === 'now') renderNow();
  else if (AppState.activeTab === 'timetables') renderTimetables();
  else if (AppState.activeTab === 'rings') renderRings();
  else if (AppState.activeTab === 'settings') renderSettings();
}

/* ------------------------------ modal ------------------------------ */

function openModal(html) {
  const overlay = document.getElementById('modal-overlay');
  const root = document.getElementById('modal-root');
  root.innerHTML = html;
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => overlay.classList.add('is-visible'));
}
function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('is-visible');
  setTimeout(() => {
    overlay.classList.add('hidden');
    document.getElementById('modal-root').innerHTML = '';
  }, 200);
}

/* ============================== NOW TAB ============================== */

function renderNow() {
  const el = document.getElementById('screen-now');
  const info = AppState.currentTickInfo;
  const now = info ? info.now : new Date();
  const timetable = info ? info.timetable : null;
  const reason = info ? info.reason : 'none';
  const next = info ? info.next : null;

  const reasonLabel = {
    override: 'Manual override for today',
    dateRange: 'Active — scheduled date range',
    weekday: 'Active — recurring weekday',
    none: 'No timetable scheduled today',
  }[reason];

  const bells = timetable ? Scheduler.sortedBells(timetable) : [];
  const todayYMD = Utils.dateToYMD(now);

  el.innerHTML = `
    <div class="arch-header">
      <div class="clock" id="clock-display">${Utils.nowLabel(now)}</div>
      <div class="clock-date">${now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
    </div>

    ${AppState.audioBlockedBanner ? `
      <div class="banner banner--warn">
        🔇 A bell tried to ring but sound is locked. Tap <strong>Enable Sound</strong> below.
      </div>` : ''}

    <div class="card card--hero">
      <div class="card__row">
        <div>
          <div class="eyebrow-plain">Active timetable</div>
          <div class="hero-title">${timetable ? Utils.escapeHtml(timetable.name) : 'None'}</div>
          <div class="hero-sub hero-sub--${reason === 'none' ? 'muted' : 'ok'}">${reasonLabel}</div>
        </div>
        <span class="tag tag--${timetable ? timetable.colorTag : 'muted'}">${timetable ? Utils.WEEKDAY_LABELS[now.getDay()] : ''}</span>
      </div>

      <div class="divider-lattice"></div>

      <div class="card__row">
        <div>
          <div class="eyebrow-plain">Next bell</div>
          <div class="hero-title hero-title--sm">${next ? `${Utils.escapeHtml(next.label)} · ${Utils.formatTimeLabel(next.time)}` : '—'}</div>
        </div>
        <div class="hero-countdown">${next ? Utils.humanizeMinutes(Utils.minutesUntil(now, next.time)) : ''}</div>
      </div>

      <div class="override-row">
        <label for="override-select">Today's timetable</label>
        <select id="override-select" data-action="override-change">
          <option value="__auto__" ${!AppState.settings.overrideTimetableId ? 'selected' : ''}>Auto (by schedule)</option>
          ${AppState.timetables.map((t) => `<option value="${t.id}" ${AppState.settings.overrideTimetableId === t.id && AppState.settings.overrideDate === todayYMD ? 'selected' : ''}>${Utils.escapeHtml(t.name)}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="quick-actions">
      ${!AppState.audioUnlocked ? `<button class="btn btn--gold" data-action="enable-sound">🔔 Enable Sound</button>` : `<span class="pill pill--ok">Sound enabled ✓</span>`}
      <button class="btn btn--outline" data-action="toggle-wakelock">${AppState.wakeLockObj ? '💡 Screen Lock: On' : '🌙 Screen Lock: Off'}</button>
    </div>

    <div class="section-title">Today's bells</div>
    ${bells.length ? `
      <div class="bell-list">
        ${bells.map((b) => {
          const fired = AppState.firedTodaySet.has(`${todayYMD}_${b.id}`);
          return `
          <div class="bell-row ${!b.enabled ? 'is-disabled' : ''}">
            <div class="bell-row__time">${Utils.formatTimeLabel(b.time)}</div>
            <div class="bell-row__info">
              <div class="bell-row__label">${Utils.escapeHtml(b.label)}</div>
              <div class="bell-row__ring">${Utils.escapeHtml(ringName(b.ring))}</div>
            </div>
            <div class="bell-row__status">${fired ? '<span class="pill pill--ok">Rung</span>' : (b.enabled ? '<span class="pill">Pending</span>' : '<span class="pill pill--muted">Off</span>')}</div>
            <button class="btn btn--tiny" data-action="test-bell" data-source="${b.ring?.source || ''}" data-id="${b.ring?.id || ''}">Test</button>
          </div>`;
        }).join('')}
      </div>
    ` : `<div class="empty-state">No bells scheduled for today. Head to <strong>Timetables</strong> to set one up.</div>`}

    ${AppState.todayLog.length ? `
      <div class="section-title">Today's log</div>
      <div class="log-list">
        ${AppState.todayLog.slice().reverse().map((l) => `
          <div class="log-row"><span class="log-row__time">${l.time}</span> ${Utils.escapeHtml(l.bellLabel)} <span class="log-row__tt">· ${Utils.escapeHtml(l.timetableName)}</span></div>
        `).join('')}
      </div>
    ` : ''}
  `;
}

/* ========================== TIMETABLES TAB ========================== */

function renderTimetables() {
  const el = document.getElementById('screen-timetables');
  const list = AppState.timetables;
  el.innerHTML = `
    <div class="arch-header arch-header--sm">
      <div class="screen-title">Timetables</div>
      <div class="screen-sub">Recurring weekdays or a specific date range. If two could apply on the same day, the one listed first wins.</div>
    </div>
    <button class="btn btn--gold btn--block" data-action="new-timetable">+ New timetable</button>
    ${list.length === 0 ? `
      <div class="empty-state empty-state--big">
        No timetables yet. Create one to start scheduling bells — for example "Regular Weekdays" or "Ramadan Hours".
      </div>
    ` : `
      <div class="tt-list">
        ${list.map((t, i) => `
          <div class="card card--tt">
            <div class="card__row">
              <div>
                <span class="tag tag--${t.colorTag}">${Utils.escapeHtml(t.name)}</span>
                <div class="tt-assignment">${describeAssignment(t)}</div>
              </div>
              <div class="tt-order-btns">
                <button class="btn btn--icon" data-action="move-up" data-id="${t.id}" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button class="btn btn--icon" data-action="move-down" data-id="${t.id}" ${i === list.length - 1 ? 'disabled' : ''}>↓</button>
              </div>
            </div>
            <div class="tt-bell-count">${t.bells.length} bell${t.bells.length === 1 ? '' : 's'}</div>
            <div class="tt-actions">
              <button class="btn btn--outline btn--sm" data-action="edit-timetable" data-id="${t.id}">Edit</button>
              <button class="btn btn--outline btn--sm" data-action="duplicate-timetable" data-id="${t.id}">Duplicate</button>
              <button class="btn btn--outline btn--sm btn--danger" data-action="delete-timetable" data-id="${t.id}">Delete</button>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  `;
}

function describeAssignment(t) {
  if (t.assignment.type === 'weekday') {
    const days = t.assignment.days || [];
    if (days.length === 7) return 'Every day';
    if (!days.length) return 'No days selected';
    return days.slice().sort().map((d) => Utils.WEEKDAY_LABELS[d]).join(', ');
  }
  return `${t.assignment.start} → ${t.assignment.end}`;
}

function newTimetableSkeleton() {
  return {
    id: Utils.uuid(),
    name: '',
    colorTag: ['emerald', 'gold', 'maroon', 'teal', 'plum'][AppState.timetables.length % 5],
    assignment: { type: 'weekday', days: [0, 1, 2, 3, 4, 5, 6] },
    bells: [],
  };
}

function ringSelectOptions(selected) {
  const opts = allRingOptions();
  const defaults = opts.filter((o) => o.source === 'default');
  const customs = opts.filter((o) => o.source === 'custom');
  const optHtml = (o) => `<option value="${o.source}:${o.id}" ${selected && selected.source === o.source && selected.id === o.id ? 'selected' : ''}>${Utils.escapeHtml(o.name)}</option>`;
  return `
    ${defaults.length ? `<optgroup label="Default rings">${defaults.map(optHtml).join('')}</optgroup>` : ''}
    ${customs.length ? `<optgroup label="Custom rings">${customs.map(optHtml).join('')}</optgroup>` : ''}
  `;
}

function bellRowHtml(bell) {
  return `
    <div class="bell-edit-row" data-row-id="${bell.id}">
      <input type="time" class="input input--time" value="${bell.time}" data-field="time" />
      <input type="text" class="input input--label" value="${Utils.escapeHtml(bell.label)}" placeholder="Bell label" data-field="label" />
      <select class="input input--ring" data-field="ring">${ringSelectOptions(bell.ring)}</select>
      <label class="check">
        <input type="checkbox" data-field="enabled" ${bell.enabled ? 'checked' : ''} />
      </label>
      <button class="btn btn--icon btn--danger" data-action="remove-bell-row" data-row-id="${bell.id}">✕</button>
    </div>
  `;
}

function openTimetableEditor(timetable) {
  const isNew = !timetable;
  const t = timetable ? JSON.parse(JSON.stringify(timetable)) : newTimetableSkeleton();
  if (!t.bells.length && isNew) {
    t.bells.push({ id: Utils.uuid(), time: '07:00', label: 'Bell 1', ring: allRingOptions()[0] || null, enabled: true });
  }

  const colorSwatches = ['emerald', 'gold', 'maroon', 'teal', 'plum'];

  openModal(`
    <div class="modal__header">
      <div>${isNew ? 'New timetable' : 'Edit timetable'}</div>
      <button class="btn btn--icon" data-action="cancel-modal">✕</button>
    </div>
    <div class="modal__body" id="tt-editor-body" data-tt-id="${t.id}">
      <label class="field-label">Name</label>
      <input type="text" class="input" id="tt-name" placeholder="e.g. Regular Weekdays" value="${Utils.escapeHtml(t.name)}" />

      <label class="field-label">Color tag</label>
      <div class="swatch-row" id="tt-color-row">
        ${colorSwatches.map((c) => `<button type="button" class="swatch swatch--${c} ${t.colorTag === c ? 'is-selected' : ''}" data-action="pick-color" data-color="${c}"></button>`).join('')}
      </div>

      <label class="field-label">When does this apply?</label>
      <div class="seg-row">
        <button type="button" class="seg ${t.assignment.type === 'weekday' ? 'is-selected' : ''}" data-action="set-assignment-type" data-type="weekday">Recurring weekdays</button>
        <button type="button" class="seg ${t.assignment.type === 'dateRange' ? 'is-selected' : ''}" data-action="set-assignment-type" data-type="dateRange">Specific date range</button>
      </div>

      <div id="tt-weekday-block" class="${t.assignment.type === 'weekday' ? '' : 'hidden'}">
        <div class="day-chip-row">
          ${Utils.WEEKDAY_LABELS.map((lbl, idx) => `
            <button type="button" class="day-chip ${(t.assignment.days || []).includes(idx) ? 'is-selected' : ''}" data-action="toggle-weekday" data-day="${idx}">${lbl}</button>
          `).join('')}
        </div>
      </div>
      <div id="tt-daterange-block" class="${t.assignment.type === 'dateRange' ? '' : 'hidden'}">
        <div class="date-range-row">
          <div>
            <label class="field-label field-label--sm">Start date</label>
            <input type="date" class="input" id="tt-start" value="${t.assignment.type === 'dateRange' ? t.assignment.start : ''}" />
          </div>
          <div>
            <label class="field-label field-label--sm">End date</label>
            <input type="date" class="input" id="tt-end" value="${t.assignment.type === 'dateRange' ? t.assignment.end : ''}" />
          </div>
        </div>
      </div>

      <label class="field-label">Bells</label>
      <div id="bell-rows">
        ${t.bells.map(bellRowHtml).join('')}
      </div>
      <button type="button" class="btn btn--outline btn--block" data-action="add-bell-row">+ Add bell</button>
    </div>
    <div class="modal__footer">
      ${!isNew ? `<button class="btn btn--outline btn--danger" data-action="delete-timetable-in-editor" data-id="${t.id}">Delete</button>` : '<span></span>'}
      <button class="btn btn--gold" data-action="save-timetable" data-id="${t.id}" data-is-new="${isNew}">Save</button>
    </div>
  `);
}

function collectBellRows() {
  const rows = document.querySelectorAll('#bell-rows .bell-edit-row');
  const bells = [];
  rows.forEach((row) => {
    const id = row.dataset.rowId;
    const time = row.querySelector('[data-field="time"]').value || '00:00';
    const label = row.querySelector('[data-field="label"]').value.trim() || 'Bell';
    const ringVal = row.querySelector('[data-field="ring"]').value;
    const enabled = row.querySelector('[data-field="enabled"]').checked;
    let ring = null;
    if (ringVal) {
      const [source, ...rest] = ringVal.split(':');
      ring = { source, id: rest.join(':') };
    }
    bells.push({ id, time, label, ring, enabled });
  });
  return bells;
}

/* ============================== RINGS TAB ============================== */

function renderRings() {
  const el = document.getElementById('screen-rings');
  el.innerHTML = `
    <div class="arch-header arch-header--sm">
      <div class="screen-title">Rings</div>
      <div class="screen-sub">Default rings come from the <code>rings/</code> folder in the repo. Custom rings you add here are saved only on this device — use Export in Settings to carry them elsewhere.</div>
    </div>

    <div class="section-title">Add a custom ring</div>
    <div class="card">
      <input type="file" id="ring-upload-input" accept="audio/*" class="input" />
      <input type="text" id="ring-upload-name" class="input" placeholder="Name this ring (optional)" />
      <button class="btn btn--gold btn--block" id="ring-upload-btn">Upload ring</button>
    </div>

    <div class="section-title">Default rings</div>
    <div class="ring-list">
      ${AppState.defaultRings.length ? AppState.defaultRings.map((r) => `
        <div class="ring-row">
          <div class="ring-row__name">${Utils.escapeHtml(r.name)}</div>
          <button class="btn btn--outline btn--sm" data-action="play-default-ring" data-id="${r.id}">▶ Preview</button>
        </div>
      `).join('') : '<div class="empty-state">No default rings found — check rings/manifest.json.</div>'}
    </div>

    <div class="section-title">Custom rings</div>
    <div class="ring-list">
      ${AppState.customRings.length ? AppState.customRings.map((r) => `
        <div class="ring-row">
          <div class="ring-row__name">${Utils.escapeHtml(r.name)}</div>
          <div class="ring-row__actions">
            <button class="btn btn--outline btn--sm" data-action="play-custom-ring" data-id="${r.id}">▶</button>
            <button class="btn btn--outline btn--sm" data-action="rename-custom-ring" data-id="${r.id}">Rename</button>
            <button class="btn btn--outline btn--sm btn--danger" data-action="delete-custom-ring" data-id="${r.id}">Delete</button>
          </div>
        </div>
      `).join('') : '<div class="empty-state">No custom rings uploaded yet.</div>'}
    </div>
  `;

  document.getElementById('ring-upload-btn').addEventListener('click', handleRingUpload);
}

async function handleRingUpload() {
  const fileInput = document.getElementById('ring-upload-input');
  const nameInput = document.getElementById('ring-upload-name');
  const file = fileInput.files[0];
  if (!file) { Utils.toast('Choose an audio file first', 'warn'); return; }
  const id = Utils.uuid();
  const name = nameInput.value.trim() || file.name.replace(/\.[^.]+$/, '');
  const record = { id, name, mimeType: file.type || 'audio/mpeg', blob: file, createdAt: Date.now() };
  await RingsDB.put(record);
  AppState.customRings.push({ id, name, mimeType: record.mimeType, createdAt: record.createdAt });
  Utils.toast(`Added ring: ${name}`, 'ok');
  renderRings();
}

/* ============================== SETTINGS TAB ============================== */

function renderSettings() {
  const el = document.getElementById('screen-settings');
  el.innerHTML = `
    <div class="arch-header arch-header--sm">
      <div class="screen-title">Settings</div>
    </div>

    <div class="section-title">Sound &amp; screen</div>
    <div class="card">
      <label class="field-label">Bell volume</label>
      <input type="range" id="volume-slider" min="0" max="100" value="${Math.round(AppState.settings.volume * 100)}" />
      <label class="check-row">
        <input type="checkbox" id="wakelock-pref" ${AppState.settings.wakeLockPreferred ? 'checked' : ''} />
        Keep screen awake while app is open (recommended for a bell station)
      </label>
    </div>

    <div class="section-title">Data</div>
    <div class="card">
      <p class="hint-text">Timetables and settings live in this browser. Export regularly and keep the file safe — it's also how you copy everything to another device.</p>
      <button class="btn btn--gold btn--block" data-action="export-data">⬇ Export all data (.json)</button>
      <label class="field-label" style="margin-top:14px">Import a backup</label>
      <input type="file" id="import-file-input" accept=".json" class="input" />
      <div class="import-btn-row">
        <button class="btn btn--outline btn--block" data-action="import-merge">Merge into existing</button>
        <button class="btn btn--outline btn--danger btn--block" data-action="import-replace">Replace all data</button>
      </div>
    </div>

    <div class="section-title">Shared login password</div>
    <div class="card">
      <p class="hint-text">This app uses one shared password for everyone (there's no real per-user login on a static site). Changing it here only updates it for people typing that new password on <em>this device</em> — see the README for how to change it for everyone.</p>
      <input type="text" id="new-password-input" class="input" placeholder="New password" />
      <button class="btn btn--outline btn--block" data-action="save-password-device">Save on this device only</button>
      <button class="btn btn--outline btn--block" data-action="save-password-everyone">Show hash to update for everyone</button>
      ${Auth.hasLocalOverride() ? `<button class="btn btn--outline btn--danger btn--block" data-action="remove-password-override">Remove this device's override</button>` : ''}
    </div>

    <div class="section-title">Account</div>
    <div class="card">
      <button class="btn btn--outline btn--block" data-action="logout">Log out of this device</button>
    </div>

    <div class="section-title">Danger zone</div>
    <div class="card card--danger">
      <p class="hint-text">This permanently erases all timetables, settings and custom rings on this device. Export first if unsure.</p>
      <button class="btn btn--danger btn--block" data-action="reset-all">Reset all data</button>
    </div>

    <div class="about-block">
      JMM Bell Commander · runs entirely in this browser · v1.0
    </div>
  `;

  document.getElementById('volume-slider').addEventListener('input', (e) => {
    AppState.settings.volume = Number(e.target.value) / 100;
    Scheduler.setVolume(AppState.settings.volume);
    persistSettings();
  });
  document.getElementById('wakelock-pref').addEventListener('change', (e) => {
    AppState.settings.wakeLockPreferred = e.target.checked;
    persistSettings();
    if (e.target.checked) requestWakeLock(); else releaseWakeLock();
  });
}

/* ============================== EXPORT / IMPORT ============================== */

async function exportAllData() {
  const customRingsFull = [];
  for (const meta of AppState.customRings) {
    const rec = await RingsDB.get(meta.id);
    if (!rec) continue;
    const dataUrl = await Utils.blobToDataURL(rec.blob);
    customRingsFull.push({ id: rec.id, name: rec.name, mimeType: rec.mimeType, dataUrl });
  }
  const payload = {
    app: 'JMM Bell Commander',
    version: 1,
    exportedAt: new Date().toISOString(),
    timetables: AppState.timetables,
    settings: { volume: AppState.settings.volume, wakeLockPreferred: AppState.settings.wakeLockPreferred },
    customRings: customRingsFull,
  };
  Utils.downloadJSON(payload, `jmm-bell-commander-backup-${Utils.dateToYMD(new Date())}.json`);
  Utils.toast('Backup downloaded', 'ok');
}

async function importData(mode) {
  const fileInput = document.getElementById('import-file-input');
  const file = fileInput.files[0];
  if (!file) { Utils.toast('Choose a backup file first', 'warn'); return; }
  if (mode === 'replace' && !confirm('Replace ALL current timetables and custom rings with the contents of this file? This cannot be undone.')) return;

  try {
    const text = await Utils.readFileAsText(file);
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.timetables)) throw new Error('not a valid backup file');

    if (mode === 'replace') {
      AppState.timetables = data.timetables;
      await RingsDB.clear();
      AppState.customRings = [];
    } else {
      const incoming = data.timetables.map((t) => ({ ...t, id: Utils.uuid(), bells: t.bells.map((b) => ({ ...b, id: Utils.uuid() })) }));
      AppState.timetables = [...AppState.timetables, ...incoming];
    }

    for (const r of (data.customRings || [])) {
      const existing = AppState.customRings.find((c) => c.name === r.name);
      if (mode === 'merge' && existing) continue;
      const blob = await Utils.dataURLToBlob(r.dataUrl);
      const id = mode === 'replace' ? r.id : Utils.uuid();
      const rec = { id, name: r.name, mimeType: r.mimeType, blob, createdAt: Date.now() };
      await RingsDB.put(rec);
      AppState.customRings.push({ id, name: r.name, mimeType: r.mimeType, createdAt: rec.createdAt });
    }

    if (data.settings) {
      AppState.settings = { ...AppState.settings, ...data.settings };
      persistSettings();
    }
    persistTimetables();
    Utils.toast(mode === 'replace' ? 'Data replaced' : 'Data merged', 'ok');
    renderActiveTab();
  } catch (err) {
    console.error(err);
    Utils.toast('Could not read that file — is it a JMM Bell Commander backup?', 'warn');
  }
}

/* ============================== WAKE LOCK ============================== */

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    AppState.wakeLockObj = await navigator.wakeLock.request('screen');
    AppState.wakeLockObj.addEventListener('release', () => {
      AppState.wakeLockObj = null;
      if (AppState.activeTab === 'now') renderNow();
    });
    if (AppState.activeTab === 'now') renderNow();
  } catch (e) {
    AppState.wakeLockObj = null;
  }
}
function releaseWakeLock() {
  if (AppState.wakeLockObj) {
    AppState.wakeLockObj.release();
    AppState.wakeLockObj = null;
  }
  if (AppState.activeTab === 'now') renderNow();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && AppState.settings.wakeLockPreferred && !AppState.wakeLockObj) {
    requestWakeLock();
  }
});

/* ============================== EVENT DELEGATION ============================== */

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  switch (action) {
    case 'enable-sound': {
      await Scheduler.unlockAudio();
      AppState.audioUnlocked = true;
      AppState.audioBlockedBanner = false;
      Utils.toast('Sound enabled for this session', 'ok');
      renderNow();
      break;
    }
    case 'toggle-wakelock': {
      if (AppState.wakeLockObj) releaseWakeLock(); else await requestWakeLock();
      break;
    }
    case 'test-bell': {
      const source = btn.dataset.source, id = btn.dataset.id;
      if (!source || !id) { Utils.toast('This bell has no ring set', 'warn'); break; }
      await Scheduler.previewRing({ source, id }, AppState.defaultRings, AppState.settings.volume);
      break;
    }
    case 'new-timetable': openTimetableEditor(null); break;
    case 'edit-timetable': openTimetableEditor(AppState.timetables.find((t) => t.id === btn.dataset.id)); break;
    case 'duplicate-timetable': {
      const src = AppState.timetables.find((t) => t.id === btn.dataset.id);
      if (!src) break;
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = Utils.uuid();
      copy.name = `${copy.name} (Copy)`;
      copy.bells = copy.bells.map((b) => ({ ...b, id: Utils.uuid() }));
      AppState.timetables.push(copy);
      persistTimetables();
      renderTimetables();
      Utils.toast('Timetable duplicated', 'ok');
      break;
    }
    case 'delete-timetable': {
      if (!confirm('Delete this timetable and all its bells?')) break;
      AppState.timetables = AppState.timetables.filter((t) => t.id !== btn.dataset.id);
      persistTimetables();
      renderTimetables();
      break;
    }
    case 'move-up': case 'move-down': {
      const idx = AppState.timetables.findIndex((t) => t.id === btn.dataset.id);
      const swapWith = action === 'move-up' ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= AppState.timetables.length) break;
      [AppState.timetables[idx], AppState.timetables[swapWith]] = [AppState.timetables[swapWith], AppState.timetables[idx]];
      persistTimetables();
      renderTimetables();
      break;
    }
    case 'cancel-modal': closeModal(); break;
    case 'pick-color': {
      document.querySelectorAll('#tt-color-row .swatch').forEach((s) => s.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      break;
    }
    case 'set-assignment-type': {
      document.querySelectorAll('.seg').forEach((s) => s.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      document.getElementById('tt-weekday-block').classList.toggle('hidden', btn.dataset.type !== 'weekday');
      document.getElementById('tt-daterange-block').classList.toggle('hidden', btn.dataset.type !== 'dateRange');
      break;
    }
    case 'toggle-weekday': btn.classList.toggle('is-selected'); break;
    case 'add-bell-row': {
      const container = document.getElementById('bell-rows');
      const div = document.createElement('div');
      div.innerHTML = bellRowHtml({ id: Utils.uuid(), time: '07:00', label: 'Bell', ring: allRingOptions()[0] || null, enabled: true });
      container.appendChild(div.firstElementChild);
      break;
    }
    case 'remove-bell-row': {
      const row = document.querySelector(`.bell-edit-row[data-row-id="${btn.dataset.rowId}"]`);
      if (row) row.remove();
      break;
    }
    case 'save-timetable': {
      const body = document.getElementById('tt-editor-body');
      const id = body.dataset.ttId;
      const name = document.getElementById('tt-name').value.trim();
      if (!name) { Utils.toast('Give this timetable a name', 'warn'); break; }
      const colorTag = document.querySelector('#tt-color-row .swatch.is-selected')?.dataset.color || 'emerald';
      const assignType = document.querySelector('.seg.is-selected')?.dataset.type || 'weekday';
      let assignment;
      if (assignType === 'weekday') {
        const days = Array.from(document.querySelectorAll('.day-chip.is-selected')).map((c) => Number(c.dataset.day));
        assignment = { type: 'weekday', days };
      } else {
        const start = document.getElementById('tt-start').value;
        const end = document.getElementById('tt-end').value;
        if (!start || !end) { Utils.toast('Set both a start and end date', 'warn'); break; }
        assignment = { type: 'dateRange', start, end };
      }
      const bells = collectBellRows();
      const existingIdx = AppState.timetables.findIndex((t) => t.id === id);
      const record = { id, name, colorTag, assignment, bells };
      if (existingIdx >= 0) AppState.timetables[existingIdx] = record;
      else AppState.timetables.push(record);
      persistTimetables();
      closeModal();
      renderTimetables();
      Utils.toast('Timetable saved', 'ok');
      break;
    }
    case 'delete-timetable-in-editor': {
      if (!confirm('Delete this timetable and all its bells?')) break;
      AppState.timetables = AppState.timetables.filter((t) => t.id !== btn.dataset.id);
      persistTimetables();
      closeModal();
      renderTimetables();
      break;
    }
    case 'play-default-ring': {
      const r = AppState.defaultRings.find((x) => x.id === btn.dataset.id);
      if (r) await Scheduler.previewRing({ source: 'default', id: r.id }, AppState.defaultRings, AppState.settings.volume);
      break;
    }
    case 'play-custom-ring': {
      await Scheduler.previewRing({ source: 'custom', id: btn.dataset.id }, AppState.defaultRings, AppState.settings.volume);
      break;
    }
    case 'rename-custom-ring': {
      const meta = AppState.customRings.find((c) => c.id === btn.dataset.id);
      if (!meta) break;
      const newName = prompt('Rename ring', meta.name);
      if (!newName || !newName.trim()) break;
      meta.name = newName.trim();
      const rec = await RingsDB.get(meta.id);
      if (rec) { rec.name = meta.name; await RingsDB.put(rec); }
      renderRings();
      break;
    }
    case 'delete-custom-ring': {
      if (!confirm('Delete this custom ring? Any bells using it will need a new ring chosen.')) break;
      await RingsDB.remove(btn.dataset.id);
      Scheduler.invalidateRingCache('custom', btn.dataset.id);
      AppState.customRings = AppState.customRings.filter((c) => c.id !== btn.dataset.id);
      renderRings();
      break;
    }
    case 'export-data': await exportAllData(); break;
    case 'import-merge': await importData('merge'); break;
    case 'import-replace': await importData('replace'); break;
    case 'save-password-device': {
      const val = document.getElementById('new-password-input').value;
      if (!val || val.length < 4) { Utils.toast('Password should be at least 4 characters', 'warn'); break; }
      await Auth.setLocalOverridePassword(val);
      Utils.toast('Password updated on this device', 'ok');
      renderSettings();
      break;
    }
    case 'save-password-everyone': {
      const val = document.getElementById('new-password-input').value;
      if (!val || val.length < 4) { Utils.toast('Password should be at least 4 characters', 'warn'); break; }
      const hash = await Utils.sha256Hex(val.trim());
      openModal(`
        <div class="modal__header"><div>Update the shared password</div><button class="btn btn--icon" data-action="cancel-modal">✕</button></div>
        <div class="modal__body">
          <p class="hint-text">Paste this into <code>js/auth.js</code>, replacing the <code>DEFAULT_HASH</code> value, then commit and push to GitHub so Pages redeploys:</p>
          <textarea class="input" rows="3" readonly onclick="this.select()">${hash}</textarea>
        </div>
        <div class="modal__footer"><span></span><button class="btn btn--gold" data-action="cancel-modal">Done</button></div>
      `);
      break;
    }
    case 'remove-password-override': {
      Auth.clearLocalOverride();
      Utils.toast('This device now uses the shared password again', 'ok');
      renderSettings();
      break;
    }
    case 'logout': {
      Auth.logout();
      location.reload();
      break;
    }
    case 'reset-all': {
      if (!confirm('Erase ALL timetables, settings and custom rings on this device? This cannot be undone.')) break;
      localStorage.removeItem('jmm_timetables');
      localStorage.removeItem('jmm_settings');
      await RingsDB.clear();
      AppState.timetables = [];
      AppState.settings = { ...Store.DEFAULT_SETTINGS };
      AppState.customRings = [];
      persistTimetables();
      persistSettings();
      Utils.toast('All data reset', 'ok');
      renderActiveTab();
      break;
    }
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'override-select') {
    const val = e.target.value;
    if (val === '__auto__') {
      AppState.settings.overrideTimetableId = null;
      AppState.settings.overrideDate = null;
    } else {
      AppState.settings.overrideTimetableId = val;
      AppState.settings.overrideDate = Utils.dateToYMD(new Date());
    }
    persistSettings();
    Utils.toast('Today\'s timetable updated', 'ok');
  }
});

/* ============================== BOTTOM NAV ============================== */

document.querySelectorAll('.tabbar__btn').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

/* ============================== LOGIN GATE ============================== */

async function initAuthGate() {
  const loginScreen = document.getElementById('login-screen');
  const appShell = document.getElementById('app-shell');

  if (Auth.isAuthenticated()) {
    loginScreen.classList.add('hidden');
    appShell.classList.remove('hidden');
    return true;
  }
  loginScreen.classList.remove('hidden');
  appShell.classList.add('hidden');

  return new Promise((resolve) => {
    const input = document.getElementById('login-password');
    const errorEl = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-submit-btn');

    // Deliberately NOT a <form>/"submit" event: some embedded/sandboxed
    // preview frames block native form submission outright (missing the
    // "allow-forms" sandbox permission), which silently swallows the click
    // before any JS runs. Plain click + keydown avoids that entirely.
    async function attemptLogin() {
      errorEl.textContent = '';
      try {
        const ok = await Auth.tryLogin(input.value);
        if (ok) {
          loginScreen.classList.add('hidden');
          appShell.classList.remove('hidden');
          resolve(true);
        } else {
          errorEl.textContent = 'Incorrect password. Please try again.';
          input.value = '';
          input.focus();
        }
      } catch (err) {
        console.error('Login error', err);
        errorEl.textContent = `Something went wrong: ${err && err.message ? err.message : err}`;
      }
    }

    submitBtn.addEventListener('click', attemptLogin);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        attemptLogin();
      }
    });
  });
}

/* ============================== BOOTSTRAP ============================== */

async function loadDefaultRings() {
  try {
    const res = await fetch('rings/manifest.json');
    const data = await res.json();
    AppState.defaultRings = data.rings || [];
  } catch (e) {
    console.error('Could not load rings/manifest.json', e);
    AppState.defaultRings = [];
  }
}

async function loadCustomRingsMeta() {
  const all = await RingsDB.getAll();
  AppState.customRings = all.map((r) => ({ id: r.id, name: r.name, mimeType: r.mimeType, createdAt: r.createdAt }));
}

async function loadInitialSetup() {
  if (Store.hasSavedData()) return;

  try {
    const res = await fetch('seed/jmm-bell-commander-backup-2026-09-05-2.json');
    if (!res.ok) throw new Error(`Seed setup request failed: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.timetables)) throw new Error('Seed setup has no timetables');

    AppState.timetables = data.timetables;
    AppState.settings = { ...Store.DEFAULT_SETTINGS, ...(data.settings || {}) };
    persistTimetables();
    persistSettings();

    for (const ring of (data.customRings || [])) {
      await RingsDB.put({
        id: ring.id,
        name: ring.name,
        mimeType: ring.mimeType,
        blob: await Utils.dataURLToBlob(ring.dataUrl),
        createdAt: Date.now(),
      });
    }
  } catch (err) {
    console.error('Could not load first-run setup', err);
  }
}

function startScheduler() {
  Scheduler.setVolume(AppState.settings.volume);
  Scheduler.start({
    getTimetables: () => AppState.timetables,
    getSettings: () => AppState.settings,
    getDefaultRings: () => AppState.defaultRings,
    onTick: (info) => {
      AppState.currentTickInfo = info;
      // Re-render the whole Now screen each second: it's a small DOM tree,
      // and this keeps the active timetable, next-bell countdown and each
      // bell's Rung/Pending status correct without extra bookkeeping.
      // Keep the timetable selector stable while it is being used.
      if (AppState.activeTab === 'now' && document.activeElement?.id !== 'override-select') renderNow();
    },
    onBellFire: (bell, timetable) => {
      AppState.firedTodaySet.add(`${Utils.dateToYMD(new Date())}_${bell.id}`);
      AppState.todayLog.push({ time: Utils.formatTimeLabel(bell.time), bellLabel: bell.label, timetableName: timetable.name });
      if (AppState.activeTab === 'now') renderNow();
    },
    onDayRollover: (ymd) => {
      AppState.todayLog = [];
      AppState.firedTodaySet = new Set();
      if (AppState.settings.overrideDate && AppState.settings.overrideDate !== ymd) {
        AppState.settings.overrideTimetableId = null;
        AppState.settings.overrideDate = null;
        persistSettings();
      }
    },
    onAudioBlocked: () => {
      AppState.audioBlockedBanner = true;
      if (AppState.activeTab === 'now') renderNow();
    },
  });
}

async function boot() {
  await initAuthGate();
  await loadInitialSetup();
  await loadDefaultRings();
  await loadCustomRingsMeta();
  if (AppState.settings.wakeLockPreferred) requestWakeLock();
  switchTab('now');
  startScheduler();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
}

boot();
