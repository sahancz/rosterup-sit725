document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('rosterup_token');
  if (!token) {
    window.location.href = 'sign-in.html';
    return;
  }

  const userJson = localStorage.getItem('rosterup_user');
  const user = userJson ? JSON.parse(userJson) : null;
  if (user) renderSidebar(user);

  document.getElementById('logoutLink').addEventListener('click', handleLogout);
  document.getElementById('historyFilters').addEventListener('click', handleFilterClick);

  // Lets the dashboard's "Shifts Covered" card link straight to the
  // covered filter (employee-shift-history.html?outcome=covered).
  const initialOutcome = new URLSearchParams(window.location.search).get('outcome');
  if (initialOutcome && OUTCOME_LABELS[initialOutcome]) {
    selectFilter(initialOutcome);
  }

  loadHistory();
});

// Badge text, footer line and the date that line refers to, for each
// outcome returned by GET /api/shifts/history.
const OUTCOME_LABELS = {
  covered: {
    badge: 'Covered',
    detail: (shift) => `You covered this shift for <strong>${escapeHtml(personName(shift.posted_by, 'a coworker'))}</strong>`,
    date: (shift) => lastDecision(shift, 'approved', shift.claimed_by),
    reason: (shift) => shift.note
  },
  covered_for_you: {
    badge: 'Covered for you',
    detail: (shift) => `<strong>${escapeHtml(personName(shift.claimed_by, 'A coworker'))}</strong> covered your shift`,
    date: (shift) => lastDecision(shift, 'approved', shift.claimed_by),
    reason: (shift) => shift.note
  },
  withdrawn: {
    badge: 'Withdrawn',
    detail: () => 'You withdrew this shift before anyone claimed it',
    date: (shift) => shift.updatedAt,
    reason: (shift) => shift.cancel_reason
  },
  claim_rejected: {
    badge: 'Not approved',
    detail: (shift) => `Your claim on <strong>${escapeHtml(personName(shift.posted_by, 'a coworker'))}</strong>'s shift wasn't approved`,
    date: (shift) => lastDecisionEntry(shift, 'rejected', currentUserId())?.decided_at,
    reason: (shift) => lastDecisionEntry(shift, 'rejected', currentUserId())?.reason
  }
};

function currentUserId() {
  const userJson = localStorage.getItem('rosterup_user');
  const user = userJson ? JSON.parse(userJson) : null;
  return user ? user.id : null;
}

// Latest claim decision with this outcome for this employee, or null for
// shifts decided before claim_history existed.
function lastDecisionEntry(shift, outcome, employee) {
  const employeeId = employee && String(employee._id || employee);
  const matches = (shift.claim_history || []).filter((entry) =>
    entry.outcome === outcome && String(entry.employee) === employeeId
  );
  return matches.length ? matches[matches.length - 1] : null;
}

function lastDecision(shift, outcome, employee) {
  const entry = lastDecisionEntry(shift, outcome, employee);
  return entry ? entry.decided_at : null;
}

// " · 15 Sept" after a line, or nothing if there's no date to show.
function dateSuffix(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return ` · ${escapeHtml(date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }))}`;
}

let historyEntries = [];
let selectedOutcome = 'all';

function renderSidebar(user) {
  document.getElementById('userName').textContent = `${user.first_name} ${user.last_name}`;
  document.getElementById('userRole').textContent = capitalize(user.role);
  const initials = `${user.first_name[0] || ''}${user.last_name[0] || ''}`.toUpperCase();
  document.getElementById('userAvatar').textContent = initials || '--';
}

function personName(person, fallback) {
  return person && person.first_name ? `${person.first_name} ${person.last_name}` : fallback;
}

async function loadHistory() {
  const listEl = document.getElementById('historyList');
  const token = localStorage.getItem('rosterup_token');

  try {
    const response = await fetch('/api/shifts/history', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 401) {
      localStorage.removeItem('rosterup_token');
      localStorage.removeItem('rosterup_user');
      window.location.href = 'sign-in.html';
      return;
    }

    const data = await response.json();

    if (!response.ok || !Array.isArray(data.history)) {
      listEl.innerHTML = '<div class="emp-empty-card"><p>Could not load your shift history.</p></div>';
      return;
    }

    historyEntries = data.history;
    renderHistory();
  } catch (err) {
    console.error('Failed to load shift history:', err);
    listEl.innerHTML = '<div class="emp-empty-card"><p>Connection error. Please try again.</p></div>';
  }
}

function handleFilterClick(e) {
  const btn = e.target.closest('[data-outcome]');
  if (!btn) return;

  selectFilter(btn.dataset.outcome);
  renderHistory();
}

function selectFilter(outcome) {
  selectedOutcome = outcome;
  document.querySelectorAll('#historyFilters [data-outcome]').forEach((filter) => {
    filter.classList.toggle('shh-filter--active', filter.dataset.outcome === outcome);
  });
}

function renderHistory() {
  const listEl = document.getElementById('historyList');
  const entries = selectedOutcome === 'all'
    ? historyEntries
    : historyEntries.filter((entry) => entry.outcome === selectedOutcome);

  if (entries.length === 0) {
    listEl.innerHTML = '<div class="emp-empty-card"><p>Nothing here yet.</p></div>';
    return;
  }

  listEl.innerHTML = entries.map(historyCardHtml).join('');
}

function historyCardHtml(shift) {
  const date = new Date(shift.shift_date);
  const dayShort = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase();
  const dateNum = date.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' });
  const monthShort = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
  const label = OUTCOME_LABELS[shift.outcome] || { badge: capitalize(shift.status), detail: () => '', date: () => null, reason: () => null };
  const reason = label.reason(shift);

  return `
    <div class="eos-card">
      <div class="eos-date">
        <p class="eos-date-day">${dayShort}</p>
        <p class="eos-date-num">${dateNum}</p>
        <p class="eos-date-month">${monthShort}</p>
      </div>
      <div class="eos-divider"></div>
      <div class="eos-body">
        <div class="eos-body-top">
          <div>
            <p class="eos-role">${escapeHtml(shift.shift_role)}</p>
            <p class="eos-time"><span class="material-icons">schedule</span> ${escapeHtml(shift.start_time)} — ${escapeHtml(shift.end_time)}</p>
          </div>
          <span class="eos-badge shh-badge--${escapeHtml(shift.outcome)}">${escapeHtml(label.badge)}</span>
        </div>
        <div class="eos-footer">
          <div>
            <p>${label.detail(shift)}${dateSuffix(label.date(shift))}</p>
            ${reason ? `<p class="shh-reason">“${escapeHtml(reason)}”</p>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

async function handleLogout(e) {
  e.preventDefault();
  const token = localStorage.getItem('rosterup_token');

  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
  } catch (err) {
    console.error('Logout request failed (signing out locally anyway):', err);
  }

  localStorage.removeItem('rosterup_token');
  localStorage.removeItem('rosterup_user');
  window.location.href = 'sign-in.html';
}
