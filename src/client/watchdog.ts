(function (): void {
interface WatchdogRule {
  type: string;
  forwardToEmail: string;
}

interface WatchdogStats {
  emailsRead: number;
  emailsForwarded: number;
  emailsSkipped: number;
}

interface WatchdogActivity {
  subject: string;
  from: string;
  emailType: string;
  action: string;
  forwardTo?: string;
  status: string;
  createdAt: string;
}

interface WatchdogResponse {
  enabled: boolean;
  rules: WatchdogRule[];
  types: string[];
  stats: WatchdogStats;
  activity: WatchdogActivity[];
  error?: string;
}

interface AuthStatusResponse {
  authenticated: boolean;
  email: string | null;
}

const authBtn = document.getElementById('wd-auth-btn') as HTMLButtonElement;
const gateBtn = document.getElementById('wd-gate-signin') as HTMLButtonElement;
const gate = document.getElementById('wd-gate') as HTMLElement;
const dashboard = document.getElementById('wd-dashboard') as HTMLElement;
const userChip = document.getElementById('wd-user-chip') as HTMLDivElement;
const userAvatar = document.getElementById('wd-user-avatar') as HTMLDivElement;
const userEmail = document.getElementById('wd-user-email') as HTMLSpanElement;
const statusBadge = document.getElementById('wd-status-badge') as HTMLDivElement;
const statusLabel = document.getElementById('wd-status-label') as HTMLSpanElement;
const enabledInput = document.getElementById('wd-enabled') as HTMLInputElement;
const scanBtn = document.getElementById('wd-scan-btn') as HTMLButtonElement;
const scanLabel = document.getElementById('wd-scan-label') as HTMLSpanElement;
const rulesEl = document.getElementById('wd-rules') as HTMLDivElement;
const addRuleBtn = document.getElementById('wd-add-rule') as HTMLButtonElement;
const saveBtn = document.getElementById('wd-save') as HTMLButtonElement;
const saveStatus = document.getElementById('wd-save-status') as HTMLParagraphElement;
const statRead = document.getElementById('stat-read') as HTMLParagraphElement;
const statForwarded = document.getElementById('stat-forwarded') as HTMLParagraphElement;
const statSkipped = document.getElementById('stat-skipped') as HTMLParagraphElement;
const activityBody = document.getElementById('wd-activity-body') as HTMLTableSectionElement;
const activityEmpty = document.getElementById('wd-activity-empty') as HTMLParagraphElement;
const filterTabs = document.getElementById('wd-filter-tabs') as HTMLDivElement;

let isAuthenticated = false;
let watchdogTypes: string[] = [
  'Product or Service Inquiry',
  'Pricing and Quote Request',
  'Collaboration or Partnership',
  'LinkedIn Message',
];
let allActivity: WatchdogActivity[] = [];
let activityFilter: 'all' | 'forwarded' | 'skipped' = 'all';
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let prevStats: WatchdogStats = { emailsRead: 0, emailsForwarded: 0, emailsSkipped: 0 };

function getInitials(value: string): string {
  return value.split('@')[0].slice(0, 2).toUpperCase();
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function setSaveStatus(message: string, type: 'default' | 'success' | 'error' = 'default'): void {
  saveStatus.textContent = message;
  saveStatus.className = 'wd-save-status';
  if (type !== 'default') saveStatus.classList.add(type);
}

function updateAuthUI(authenticated: boolean, email: string | null): void {
  isAuthenticated = authenticated;

  if (authenticated && email) {
    userEmail.textContent = email;
    userAvatar.textContent = getInitials(email);
    userChip.classList.remove('hidden');
    authBtn.textContent = 'Sign out';
    authBtn.className = 'btn btn-logout';
    gate.classList.add('hidden');
    dashboard.classList.remove('hidden');
    loadDashboard();
    startAutoRefresh();
  } else {
    userChip.classList.add('hidden');
    authBtn.textContent = 'Sign in with Google';
    authBtn.className = 'btn btn-google';
    gate.classList.remove('hidden');
    dashboard.classList.add('hidden');
    stopAutoRefresh();
  }
}

function renderRules(rules: WatchdogRule[]): void {
  rulesEl.innerHTML = '';
  const rows = rules.length > 0 ? rules : [{ type: watchdogTypes[0], forwardToEmail: '' }];

  rows.forEach((rule) => {
    const row = document.createElement('div');
    row.className = 'wd-rule-row';

    const typeSelect = document.createElement('select');
    typeSelect.className = 'wd-type';
    watchdogTypes.forEach((type) => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      if (type === rule.type) option.selected = true;
      typeSelect.appendChild(option);
    });

    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.className = 'wd-forward';
    emailInput.placeholder = 'admin@gmail.com';
    emailInput.value = rule.forwardToEmail;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'wd-rule-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      if (rulesEl.children.length <= 1) {
        emailInput.value = '';
        typeSelect.value = watchdogTypes[0];
        return;
      }
      row.remove();
    });

    row.appendChild(typeSelect);
    row.appendChild(emailInput);
    row.appendChild(removeBtn);
    rulesEl.appendChild(row);
  });
}

function collectRules(): WatchdogRule[] {
  const rules: WatchdogRule[] = [];
  rulesEl.querySelectorAll<HTMLDivElement>('.wd-rule-row').forEach((row) => {
    const type = row.querySelector<HTMLSelectElement>('.wd-type')?.value?.trim() ?? '';
    const forwardToEmail = row.querySelector<HTMLInputElement>('.wd-forward')?.value?.trim() ?? '';
    if (type && forwardToEmail) rules.push({ type, forwardToEmail });
  });
  return rules;
}

function updateStats(stats: WatchdogStats, animate = false): void {
  if (animate) {
    if (stats.emailsRead > prevStats.emailsRead) {
      document.querySelector('[data-stat="read"]')?.classList.add('pulse');
    }
    if (stats.emailsForwarded > prevStats.emailsForwarded) {
      document.querySelector('[data-stat="forwarded"]')?.classList.add('pulse');
    }
    if (stats.emailsSkipped > prevStats.emailsSkipped) {
      document.querySelector('[data-stat="skipped"]')?.classList.add('pulse');
    }
    setTimeout(() => {
      document.querySelectorAll('.wd-stat-card').forEach((el) => el.classList.remove('pulse'));
    }, 500);
  }

  statRead.textContent = String(stats.emailsRead);
  statForwarded.textContent = String(stats.emailsForwarded);
  statSkipped.textContent = String(stats.emailsSkipped);
  prevStats = { ...stats };
}

function actionLabel(action: string, forwardTo?: string): string {
  if (action === 'forwarded') return `Forwarded to ${forwardTo ?? 'recipient'}`;
  if (action === 'skipped_other') return 'Classified as Other';
  if (action === 'no_rule') return 'No matching rule';
  if (action === 'forward_failed') return `Forward failed → ${forwardTo ?? ''}`;
  return action;
}

function renderActivity(): void {
  const filtered =
    activityFilter === 'all'
      ? allActivity
      : activityFilter === 'forwarded'
        ? allActivity.filter((item) => item.action === 'forwarded')
        : allActivity.filter((item) => item.action !== 'forwarded');

  activityBody.innerHTML = '';

  if (filtered.length === 0) {
    activityEmpty.classList.remove('hidden');
    return;
  }

  activityEmpty.classList.add('hidden');

  filtered.forEach((item) => {
    const row = document.createElement('tr');

    const cells = [
      formatDateTime(item.createdAt),
      item.from,
      item.subject || '(no subject)',
      item.emailType,
      actionLabel(item.action, item.forwardTo),
      item.status,
    ];

    cells.forEach((text, index) => {
      const td = document.createElement('td');
      if (index === 5) {
        const pill = document.createElement('span');
        pill.className = `wd-pill ${item.status}`;
        pill.textContent = item.status;
        td.appendChild(pill);
      } else {
        td.textContent = text;
      }
      row.appendChild(td);
    });

    activityBody.appendChild(row);
  });
}

function applyDashboardData(data: WatchdogResponse, animateStats = false): void {
  watchdogTypes = data.types.length > 0 ? data.types : watchdogTypes;
  enabledInput.checked = data.enabled;
  statusBadge.classList.toggle('active', data.enabled);
  statusLabel.textContent = data.enabled ? 'Active — monitoring inbox' : 'Inactive';

  updateStats(data.stats, animateStats);
  renderRules(data.rules);
  allActivity = data.activity ?? [];
  renderActivity();
}

async function loadDashboard(): Promise<void> {
  try {
    const res = await fetch('/api/watchdog');
    if (res.status === 401) {
      updateAuthUI(false, null);
      return;
    }
    if (!res.ok) return;

    const data = (await res.json()) as WatchdogResponse;
    applyDashboardData(data);
  } catch {
    setSaveStatus('Could not load watchdog data.', 'error');
  }
}

async function saveConfiguration(): Promise<void> {
  const rules = collectRules();
  if (enabledInput.checked && rules.length === 0) {
    setSaveStatus('Add at least one rule before enabling watchdog.', 'error');
    return;
  }

  saveBtn.disabled = true;
  setSaveStatus('Saving…');

  try {
    const res = await fetch('/api/watchdog', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: enabledInput.checked, rules }),
    });

    const data = (await res.json()) as WatchdogResponse;
    if (!res.ok) {
      setSaveStatus(data.error ?? 'Failed to save configuration.', 'error');
      return;
    }

    applyDashboardData(data);
    setSaveStatus(
      data.enabled ? 'Configuration saved. Watchdog is active.' : 'Configuration saved.',
      'success'
    );
  } catch {
    setSaveStatus('Network error while saving.', 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

async function scanNow(): Promise<void> {
  if (!enabledInput.checked) {
    setSaveStatus('Enable watchdog and save rules before scanning.', 'error');
    return;
  }

  scanBtn.disabled = true;
  scanLabel.textContent = 'Scanning…';

  try {
    const res = await fetch('/api/watchdog/scan', { method: 'POST' });
    const data = (await res.json()) as WatchdogResponse;

    if (!res.ok) {
      setSaveStatus(data.error ?? 'Scan failed.', 'error');
      return;
    }

    applyDashboardData(data, true);
    setSaveStatus('Scan complete.', 'success');
  } catch {
    setSaveStatus('Network error during scan.', 'error');
  } finally {
    scanBtn.disabled = false;
    scanLabel.textContent = 'Scan now';
  }
}

async function checkAuth(): Promise<void> {
  try {
    const res = await fetch('/auth/status');
    const data = (await res.json()) as AuthStatusResponse;
    updateAuthUI(data.authenticated, data.email);
  } catch {
    updateAuthUI(false, null);
  }
}

function handleAuthClick(): void {
  if (isAuthenticated) {
    fetch('/auth/logout', { method: 'POST' })
      .then(() => updateAuthUI(false, null))
      .catch(() => setSaveStatus('Failed to sign out.', 'error'));
  } else {
    window.location.href = '/auth/google';
  }
}

function startAutoRefresh(): void {
  stopAutoRefresh();
  refreshTimer = setInterval(() => {
    if (isAuthenticated) loadDashboard();
  }, 30000);
}

function stopAutoRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

authBtn.addEventListener('click', handleAuthClick);
gateBtn.addEventListener('click', () => {
  window.location.href = '/auth/google';
});
addRuleBtn.addEventListener('click', () => {
  renderRules([...collectRules(), { type: watchdogTypes[0], forwardToEmail: '' }]);
});
saveBtn.addEventListener('click', () => saveConfiguration());
scanBtn.addEventListener('click', () => scanNow());
enabledInput.addEventListener('change', () => {
  statusBadge.classList.toggle('active', enabledInput.checked);
  statusLabel.textContent = enabledInput.checked
    ? 'Active — monitoring inbox'
    : 'Inactive';
});

filterTabs.querySelectorAll<HTMLButtonElement>('.wd-filter').forEach((btn) => {
  btn.addEventListener('click', () => {
    filterTabs.querySelectorAll('.wd-filter').forEach((el) => el.classList.remove('active'));
    btn.classList.add('active');
    activityFilter = btn.dataset.filter as 'all' | 'forwarded' | 'skipped';
    renderActivity();
  });
});

checkAuth();
})();
