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

  document.getElementById('shiftList').addEventListener('click', handleClaimClick);

  loadOpenShifts();
});

function renderSidebar(user) {
  document.getElementById('userName').textContent = `${user.first_name} ${user.last_name}`;
  document.getElementById('userRole').textContent = capitalize(user.role);
  const initials = `${user.first_name[0] || ''}${user.last_name[0] || ''}`.toUpperCase();
  document.getElementById('userAvatar').textContent = initials || '--';
}

async function loadOpenShifts() {
  const subtitle = document.getElementById('openShiftsSubtitle');
  const listEl = document.getElementById('shiftList');
  const token = localStorage.getItem('rosterup_token');

  try {
    // Note: /api/shifts isn't scoped to the signed-in employee's own
    // workplace — the cached profile doesn't currently carry a workplace id
    // to filter by, so this shows every open shift in the system. That's
    // fine for the current single-workplace demo data, but would need a
    // workplace filter added once there's more than one workplace in play.
    const response = await fetch('/api/shifts', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('rosterup_token');
      localStorage.removeItem('rosterup_user');
      window.location.href = 'sign-in.html';
      return;
    }

    const shifts = await response.json();

    if (!response.ok || !Array.isArray(shifts)) {
      subtitle.textContent = 'Could not load open shifts.';
      listEl.innerHTML = '<div class="emp-empty-card"><p>Could not load open shifts.</p></div>';
      return;
    }

    renderShifts(shifts);
  } catch (err) {
    console.error('Failed to load open shifts:', err);
    subtitle.textContent = 'Could not load open shifts.';
    listEl.innerHTML = '<div class="emp-empty-card"><p>Connection error. Please try again.</p></div>';
  }
}

function renderShifts(shifts) {
  const subtitle = document.getElementById('openShiftsSubtitle');
  const listEl = document.getElementById('shiftList');

  if (shifts.length === 0) {
    subtitle.textContent = 'No shifts available right now';
    listEl.innerHTML = '<div class="emp-empty-card"><p>Check back later for new shift opportunities.</p></div>';
    return;
  }

  subtitle.textContent = `${shifts.length} shift${shifts.length !== 1 ? 's' : ''} available to claim`;
  listEl.innerHTML = shifts.map(shiftCardHtml).join('');
}

function shiftCardHtml(shift) {
  const date = new Date(shift.shift_date);
  const dayShort = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase();
  const dateNum = date.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' });
  const monthShort = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();

  const postedByName = shift.posted_by && shift.posted_by.first_name
    ? `${shift.posted_by.first_name} ${shift.posted_by.last_name}`
    : 'a coworker';

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
            <p class="eos-posted-by">Offered by <strong>${escapeHtml(postedByName)}</strong></p>
          </div>
          <span class="eos-badge">Open</span>
        </div>
        <div class="eos-footer">
          <p>Available to claim</p>
          <button class="eos-claim-btn" data-shift-id="${shift._id}">Claim Shift</button>
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

async function handleClaimClick(e) {
  const btn = e.target.closest('.eos-claim-btn');
  if (!btn || btn.disabled) return;

  const shiftId = btn.dataset.shiftId;
  const card = btn.closest('.eos-card');
  const token = localStorage.getItem('rosterup_token');

  btn.disabled = true;
  btn.textContent = 'Claiming…';

  try {
    const response = await fetch(`/api/shifts/${shiftId}/claim`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (response.status === 401) {
      localStorage.removeItem('rosterup_token');
      localStorage.removeItem('rosterup_user');
      window.location.href = 'sign-in.html';
      return;
    }

    const data = await response.json();

    if (!response.ok) {
      // Most likely someone else claimed it a moment ago (404) — refresh
      // the list so the card reflects reality instead of leaving a stale
      // "Claim Shift" button the user would just get the same error from.
      btn.textContent = 'Unavailable';
      btn.title = data.error || 'This shift is no longer available.';
      setTimeout(loadOpenShifts, 1200);
      return;
    }

    btn.textContent = 'Claimed ✓';
    card.classList.add('eos-card--claimed');
    setTimeout(loadOpenShifts, 900);
  } catch (err) {
    console.error('Failed to claim shift:', err);
    btn.disabled = false;
    btn.textContent = 'Claim Shift';
    btn.title = 'Connection error — please try again.';
  }
}
