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

  const filters = document.getElementById('shiftFilters');
  if (filters) filters.addEventListener('click', handleFilterClick);

  // Lets the dashboard's "Open Shifts" card link straight to the open
  // filter (manager-shifts.html?status=open).
  const initialStatus = new URLSearchParams(window.location.search).get('status');
  const initialButton = initialStatus && filters && filters.querySelector(`[data-status="${CSS.escape(initialStatus)}"]`);
  if (initialButton) initialButton.click();

  loadManagerShifts();
});

let managerShifts = [];
let selectedStatus = 'all';

function renderSidebar(user) {
  document.getElementById('userName').textContent = `${user.first_name} ${user.last_name}`;
  const initials = `${user.first_name[0] || ''}${user.last_name[0] || ''}`.toUpperCase();
  document.getElementById('userAvatar').textContent = initials || '--';
}

async function loadManagerShifts() {
  const listEl = document.getElementById('managerShiftList');
  const token = localStorage.getItem('rosterup_token');

  try {
    const response = await fetch('/api/manager/shifts', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('rosterup_token');
      localStorage.removeItem('rosterup_user');
      window.location.href = 'sign-in.html';
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.success || !Array.isArray(data.shifts)) {
      listEl.innerHTML = '<div class="mgr-empty-card"><p>Could not load open shifts.</p></div>';
      return;
    }

    managerShifts = data.shifts;
    renderManagerShifts();
  } catch (error) {
    console.error('Failed to load shifts:', error);
    listEl.innerHTML = '<div class="mgr-empty-card"><p>Could not load open shifts.</p></div>';
  }
}

function handleFilterClick(event) {
  const button = event.target.closest('[data-status]');
  if (!button) return;

  selectedStatus = button.dataset.status;
  document.querySelectorAll('[data-status]').forEach(filter => {
    filter.classList.toggle('mwv-filter--active', filter === button);
  });
  renderManagerShifts();
}

function renderManagerShifts() {
  const listEl = document.getElementById('managerShiftList');
  const view = document.body.dataset.shiftView;
  let shifts = managerShifts;

  if (view === 'history') {
    // A rejected claim sends the shift back to 'open', so without the
    // rejectedClaims check it would drop out of history entirely.
    shifts = shifts.filter(shift =>
      ['covered', 'cancelled'].includes(shift.status) || rejectedClaims(shift).length > 0
    );
  } else if (selectedStatus !== 'all') {
    shifts = shifts.filter(shift => shift.status === selectedStatus);
  }

  if (shifts.length === 0) {
    listEl.innerHTML = '<div class="mgr-empty-card"><p>No shifts available right now</p></div>';
    return;
  }

  listEl.innerHTML = shifts.map(shiftCardHtml).join('');
}

function shiftCardHtml(shift) {
  const date = new Date(shift.shift_date);
  const day = date.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });
  const postedBy = shift.posted_by && shift.posted_by.first_name
    ? `${shift.posted_by.first_name} ${shift.posted_by.last_name}`
    : 'Unknown';

  return `
    <article class="mwv-shift-card">
      <div class="mwv-shift-card-top">
        <div>
          <p class="mwv-shift-date">${escapeHtml(day)}</p>
          <h2>${escapeHtml(shift.shift_role)}</h2>
        </div>
        <span class="mwv-status mwv-status--${escapeHtml(shift.status)}">${escapeHtml(capitalize(shift.status))}</span>
      </div>
      <p class="mwv-shift-time"><span class="material-icons">schedule</span>${escapeHtml(shift.start_time)} — ${escapeHtml(shift.end_time)}</p>
      <p class="mwv-shift-person">Offered by <strong>${escapeHtml(postedBy)}</strong>${dateSuffix(shift.createdAt)}</p>
      ${reasonLine(shift.note)}
      ${shift.status === 'covered' && personName(shift.claimed_by) ? `<p class="mwv-shift-person">Covered by <strong>${escapeHtml(personName(shift.claimed_by))}</strong>${dateSuffix(approvedAt(shift))}</p>` : ''}
      ${shift.status === 'cancelled' ? `<p class="mwv-shift-person">Withdrawn${dateSuffix(shift.updatedAt)}</p>${reasonLine(shift.cancel_reason)}` : ''}
      ${rejectedClaims(shift).map(entry => `<p class="mwv-shift-person mwv-shift-person--rejected">Claim rejected: <strong>${escapeHtml(personName(entry.employee) || 'Unknown')}</strong>${dateSuffix(entry.decided_at)}</p>${reasonLine(entry.reason)}`).join('')}
    </article>
  `;
}

function personName(person) {
  return person && person.first_name ? `${person.first_name} ${person.last_name}` : '';
}

// When the manager approved the current claim. Shifts covered before
// claim_history existed have no entry, so they just show no date.
function approvedAt(shift) {
  const approvals = (shift.claim_history || []).filter(entry => entry.outcome === 'approved');
  return approvals.length ? approvals[approvals.length - 1].decided_at : null;
}

// The "why" under an event line — the poster's note, a withdrawal reason
// or a rejection reason. Nothing if none was given.
function reasonLine(reason) {
  if (!reason) return '';
  return `<p class="mwv-shift-reason">“${escapeHtml(reason)}”</p>`;
}

// " · 15 Sept" after a line, or nothing if there's no date to show.
function dateSuffix(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return ` · ${escapeHtml(date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }))}`;
}

function rejectedClaims(shift) {
  return (shift.claim_history || []).filter(entry => entry.outcome === 'rejected');
}

function capitalize(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

async function handleLogout() {
  const token = localStorage.getItem('rosterup_token');

  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
  } catch (error) {
    console.error('Logout request failed:', error);
  }

  localStorage.removeItem('rosterup_token');
  localStorage.removeItem('rosterup_user');
  window.location.href = 'sign-in.html';
}
