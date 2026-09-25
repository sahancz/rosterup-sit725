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

// GET /api/shifts is real (unlike most shift endpoints, still stubs) —
// used here for the "Open Shifts" stat and a small preview of the same list
// shown in full on employee-open-shifts.html. Not scoped to this employee's
// own workplace (see the note in employee-open-shifts.js) — fine for the
// current single-workplace demo data.
async function loadOpenShifts() {
  const statEl = document.getElementById('statOpenShifts');
  const listEl = document.getElementById('availableShiftsList');
  const token = localStorage.getItem('rosterup_token');

  try {
    const response = await fetch('/api/shifts', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    const shifts = await response.json();

    if (!response.ok || !Array.isArray(shifts)) {
      statEl.textContent = '—';
      listEl.innerHTML = '<div class="emp-empty-card"><p>Could not load open shifts.</p></div>';
      return;
    }

    statEl.textContent = shifts.length;

    if (shifts.length === 0) {
      listEl.innerHTML = '<div class="emp-empty-card"><p>No open shifts right now.</p></div>';
      return;
    }

    listEl.innerHTML = shifts.slice(0, 3).map(previewCardHtml).join('');
  } catch (err) {
    console.error('Failed to load open shifts:', err);
    statEl.textContent = '—';
    listEl.innerHTML = '<div class="emp-empty-card"><p>Connection error.</p></div>';
  }
}

function previewCardHtml(shift) {
  const postedByName = shift.posted_by && shift.posted_by.first_name
    ? `${shift.posted_by.first_name} ${shift.posted_by.last_name}`
    : 'a coworker';

  return `
    <div class="emp-empty-card" style="text-align:left;">
      <p style="font-weight:700; color:var(--color-foreground); margin:0;">${escapeHtml(shift.shift_role)}</p>
      <p style="font-size:0.75rem; color:#6B7280; margin:0.25rem 0 0;">${escapeHtml(shift.start_time)} — ${escapeHtml(shift.end_time)} · Offered by ${escapeHtml(postedByName)}</p>
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
