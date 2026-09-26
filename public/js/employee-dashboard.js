document.addEventListener('DOMContentLoaded', () => {
  // Page guard: this screen requires an employee to be signed in.
  // (There's no /api/employee/* endpoint yet to double-check against —
  // everything here is populated from the locally-stored profile — so this
  // is the only gate for now.)
  const token = localStorage.getItem('rosterup_token');
  if (!token) {
    window.location.href = 'sign-in.html';
    return;
  }

  const userJson = localStorage.getItem('rosterup_user');
  const user = userJson ? JSON.parse(userJson) : null;
  if (user) {
    renderUser(user);
    showStatusBanner(user.workplace_status);
  }

  document.getElementById('logoutLink').addEventListener('click', handleLogout);

  // The cached profile in localStorage is only ever refreshed at login —
  // so if a manager approves this employee while they're already signed in,
  // they'd never see that reflected until they log out and back in. Refresh
  // it here against /api/auth/me so the dashboard picks up the change
  // without needing a new login.
  refreshUserStatus(user);

  loadOpenShifts();
  loadMyShifts();
  loadShiftsCovered();
});

// "Shifts Covered" stat — how many shifts this employee has covered for
// someone else, from the same history endpoint as the Shift History page.
async function loadShiftsCovered() {
  const statEl = document.getElementById('statShiftsCovered');
  const token = localStorage.getItem('rosterup_token');

  try {
    const response = await fetch('/api/shifts/history', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    const data = await response.json();

    if (!response.ok || !Array.isArray(data.history)) {
      statEl.textContent = '—';
      return;
    }

    statEl.textContent = data.history.filter((entry) => entry.outcome === 'covered').length;
  } catch (err) {
    console.error('Failed to load shifts covered:', err);
    statEl.textContent = '—';
  }
}

function renderUser(user) {
  document.getElementById('greeting').textContent = `${timeOfDayGreeting()}, ${user.first_name}.`;
  document.getElementById('userName').textContent = `${user.first_name} ${user.last_name}`;
  document.getElementById('userRole').textContent = capitalize(user.role || 'Employee');
  const initials = `${user.first_name[0] || ''}${user.last_name[0] || ''}`.toUpperCase();
  document.getElementById('userAvatar').textContent = initials || '--';
}

// Employees start out "pending" until a manager approves their request (see
// manager-dashboard.html). Nothing shift-related is built yet either way,
// but this at least explains why the page looks empty — and, once approved,
// says so instead of just silently going quiet.
function showStatusBanner(status, justApproved) {
  const pendingBanner = document.getElementById('pendingBanner');
  const approvedBanner = document.getElementById('approvedBanner');
  pendingBanner.classList.add('hidden');
  approvedBanner.classList.add('hidden');

  if (status === 'pending') {
    pendingBanner.classList.remove('hidden');
  } else if (status === 'approved' && justApproved) {
    approvedBanner.classList.remove('hidden');
  }
}

async function refreshUserStatus(cachedUser) {
  const token = localStorage.getItem('rosterup_token');
  if (!token) return;

  try {
    const response = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('rosterup_token');
      localStorage.removeItem('rosterup_user');
      window.location.href = 'sign-in.html';
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.success) return;

    const freshUser = data.user;
    localStorage.setItem('rosterup_user', JSON.stringify(freshUser));
    renderUser(freshUser);

    const justApproved = cachedUser
      && cachedUser.workplace_status === 'pending'
      && freshUser.workplace_status === 'approved';
    showStatusBanner(freshUser.workplace_status, justApproved);
  } catch (err) {
    // Offline / server unreachable — the page already rendered from the
    // cached profile, so there's nothing more to do here.
    console.error('Failed to refresh profile:', err);
  }
}

// "Open Shifts" stat and a small preview of the list shown in full on
// employee-open-shifts.html. The employee's own posted shifts are left out,
// the same way the Open Shifts page doesn't offer them to claim.
async function loadOpenShifts() {
  const statEl = document.getElementById('statOpenShifts');
  const listEl = document.getElementById('availableShiftsList');

  const shifts = await fetchShifts('');
  if (!shifts) {
    statEl.textContent = '—';
    listEl.innerHTML = '<div class="emp-empty-card"><p>Could not load open shifts.</p></div>';
    return;
  }

  const claimable = shifts.filter((shift) => !isMine(shift.posted_by));
  statEl.textContent = claimable.length;

  if (claimable.length === 0) {
    listEl.innerHTML = '<div class="emp-empty-card"><p>No open shifts right now.</p></div>';
    return;
  }

  listEl.innerHTML = claimable.slice(0, 3).map((shift) =>
    previewCardHtml(shift, `Offered by ${personName(shift.posted_by, 'a coworker')}`)
  ).join('');
}

// "Upcoming Shifts" (shifts this employee is covering for someone, approved
// by the manager, from today on) and "Pending Requests" (their claims still
// waiting for the manager) — FR-11.
async function loadMyShifts() {
  const upcomingStat = document.getElementById('statUpcomingShifts');
  const pendingStat = document.getElementById('statPendingRequests');
  const listEl = document.getElementById('upcomingShiftsList');
  const me = currentUserId();

  if (!me) {
    listEl.innerHTML = '<div class="emp-empty-card"><p>Could not load your shifts.</p></div>';
    return;
  }

  const [covering, pending] = await Promise.all([
    fetchShifts(`?status=covered&claimed_by=${encodeURIComponent(me)}`),
    fetchShifts(`?status=pending&claimed_by=${encodeURIComponent(me)}`)
  ]);

  pendingStat.textContent = pending ? pending.length : '—';

  if (!covering) {
    upcomingStat.textContent = '—';
    listEl.innerHTML = '<div class="emp-empty-card"><p>Could not load your shifts.</p></div>';
    return;
  }

  const today = localDateString(new Date());
  const upcoming = covering.filter((shift) => String(shift.shift_date).slice(0, 10) >= today);
  upcomingStat.textContent = upcoming.length;

  if (upcoming.length === 0) {
    listEl.innerHTML = '<div class="emp-empty-card"><p>No upcoming shifts. Shifts you cover for a coworker show up here once your manager approves them.</p></div>';
    return;
  }

  listEl.innerHTML = upcoming.slice(0, 3).map((shift) =>
    previewCardHtml(shift, `Covering for ${personName(shift.posted_by, 'a coworker')}`)
  ).join('');
}

// GET /api/shifts with an optional query string; null if it failed.
async function fetchShifts(query) {
  const token = localStorage.getItem('rosterup_token');

  try {
    const response = await fetch(`/api/shifts${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    const shifts = await response.json();
    return response.ok && Array.isArray(shifts) ? shifts : null;
  } catch (err) {
    console.error('Failed to load shifts:', err);
    return null;
  }
}

function currentUserId() {
  const userJson = localStorage.getItem('rosterup_user');
  const user = userJson ? JSON.parse(userJson) : null;
  return user ? user.id : null;
}

function isMine(person) {
  const id = person && (person._id || person);
  return Boolean(id) && String(id) === String(currentUserId());
}

function personName(person, fallback) {
  return person && person.first_name ? `${person.first_name} ${person.last_name}` : fallback;
}

// YYYY-MM-DD in the user's own time zone (shift dates are stored as midnight UTC).
function localDateString(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function previewCardHtml(shift, subtitle) {
  const day = new Date(shift.shift_date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

  return `
    <div class="emp-empty-card" style="text-align:left;">
      <p style="font-weight:700; color:var(--color-foreground); margin:0;">${escapeHtml(shift.shift_role)} · ${escapeHtml(day)}</p>
      <p style="font-size:0.75rem; color:#6B7280; margin:0.25rem 0 0;">${escapeHtml(shift.start_time)} — ${escapeHtml(shift.end_time)} · ${escapeHtml(subtitle)}</p>
    </div>
  `;
}

function timeOfDayGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
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
