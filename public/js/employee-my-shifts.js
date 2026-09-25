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
  document.getElementById('postShiftForm').addEventListener('submit', handlePostShift);
  document.getElementById('claimedShiftsList').addEventListener('click', handleWithdrawClick);
  document.getElementById('postedShiftsList').addEventListener('click', handleWithdrawPostedClick);

  loadPostedShifts();
  loadClaimedShifts();
});

function renderSidebar(user) {
  document.getElementById('userName').textContent = `${user.first_name} ${user.last_name}`;
  document.getElementById('userRole').textContent = capitalize(user.role);
  const initials = `${user.first_name[0] || ''}${user.last_name[0] || ''}`.toUpperCase();
  document.getElementById('userAvatar').textContent = initials || '--';
}

async function handlePostShift(e) {
  e.preventDefault();

  const messageBox = document.getElementById('postShiftMessage');
  const submitBtn = document.getElementById('postShiftBtn');
  const token = localStorage.getItem('rosterup_token');

  const payload = {
    shift_date: document.getElementById('shiftDate').value,
    start_time: document.getElementById('shiftStart').value,
    end_time: document.getElementById('shiftEnd').value,
    shift_role: document.getElementById('shiftRole').value.trim(),
    note: document.getElementById('shiftNote').value.trim() || undefined
  };

  submitBtn.disabled = true;
  submitBtn.textContent = 'Posting…';
  messageBox.className = 'alert-box hidden';

  try {
    const response = await fetch('/api/shifts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (response.status === 401) {
      localStorage.removeItem('rosterup_token');
      localStorage.removeItem('rosterup_user');
      window.location.href = 'sign-in.html';
      return;
    }

    const data = await response.json();

    if (response.ok) {
      messageBox.textContent = 'Shift posted! It now shows up in Open Shifts for your team to claim.';
      messageBox.className = 'alert-box alert-success';
      document.getElementById('postShiftForm').reset();
      loadPostedShifts();
    } else {
      messageBox.textContent = data.message || 'Could not post this shift. Please check the details and try again.';
      messageBox.className = 'alert-box alert-error';
    }
  } catch (err) {
    console.error('Error posting shift:', err);
    messageBox.textContent = 'Connection error. Please try again.';
    messageBox.className = 'alert-box alert-error';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Post Shift';
  }
}

// Shifts this employee posted that are still open (nobody has claimed them
// yet) — the only ones FR-23 lets them withdraw.
async function loadPostedShifts() {
  const listEl = document.getElementById('postedShiftsList');
  const token = localStorage.getItem('rosterup_token');
  const userJson = localStorage.getItem('rosterup_user');
  const user = userJson ? JSON.parse(userJson) : null;

  if (!user) {
    listEl.innerHTML = '<div class="emp-empty-card"><p>Could not load your posted shifts.</p></div>';
    return;
  }

  try {
    const response = await fetch(`/api/shifts?status=open&posted_by=${encodeURIComponent(user.id)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 401) {
      localStorage.removeItem('rosterup_token');
      localStorage.removeItem('rosterup_user');
      window.location.href = 'sign-in.html';
      return;
    }

    const shifts = await response.json();

    if (!response.ok || !Array.isArray(shifts)) {
      listEl.innerHTML = '<div class="emp-empty-card"><p>Could not load your posted shifts.</p></div>';
      return;
    }

    renderPostedShifts(shifts);
  } catch (err) {
    console.error('Failed to load posted shifts:', err);
    listEl.innerHTML = '<div class="emp-empty-card"><p>Connection error. Please try again.</p></div>';
  }
}

function renderPostedShifts(shifts) {
  const listEl = document.getElementById('postedShiftsList');

  if (shifts.length === 0) {
    listEl.innerHTML = '<div class="emp-empty-card"><p>You don\'t have any open shifts posted for cover right now.</p></div>';
    return;
  }

  listEl.innerHTML = shifts.map(postedShiftCardHtml).join('');
}

function postedShiftCardHtml(shift) {
  const date = new Date(shift.shift_date);
  const dayShort = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase();
  const dateNum = date.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' });
  const monthShort = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();

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
            ${shift.note ? `<p class="eos-posted-by">${escapeHtml(shift.note)}</p>` : ''}
          </div>
          <span class="eos-badge">Open</span>
        </div>
        <div class="eos-footer">
          <p>No one has claimed this shift yet</p>
          <button class="msh-withdraw-btn" data-step="open">Withdraw Shift</button>
        </div>
        <div class="msh-withdraw-form hidden">
          <label for="withdrawReason-${shift._id}">Why are you withdrawing it? (optional)</label>
          <textarea id="withdrawReason-${shift._id}" rows="2" maxlength="300" placeholder="e.g. My appointment moved, I can work this shift"></textarea>
          <p class="msh-withdraw-note">It will be removed from Open Shifts and marked as withdrawn in your shift history.</p>
          <div class="msh-withdraw-actions">
            <button class="msh-cancel-btn" data-step="cancel">Cancel</button>
            <button class="msh-withdraw-btn" data-step="confirm" data-shift-id="${shift._id}">Confirm Withdraw</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function handleWithdrawPostedClick(e) {
  const btn = e.target.closest('button[data-step]');
  if (!btn || btn.disabled) return;

  const card = btn.closest('.eos-card');
  const footer = card.querySelector('.eos-footer');
  const form = card.querySelector('.msh-withdraw-form');

  // First click opens the optional reason box; that second step also
  // works as the "are you sure?".
  if (btn.dataset.step === 'open') {
    footer.classList.add('hidden');
    form.classList.remove('hidden');
    form.querySelector('textarea').focus();
    return;
  }

  if (btn.dataset.step === 'cancel') {
    form.classList.add('hidden');
    footer.classList.remove('hidden');
    return;
  }

  const shiftId = btn.dataset.shiftId;
  const token = localStorage.getItem('rosterup_token');
  const reason = form.querySelector('textarea').value.trim();

  btn.disabled = true;
  btn.textContent = 'Withdrawing…';

  try {
    const response = await fetch(`/api/shifts/${encodeURIComponent(shiftId)}/withdraw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ reason: reason || undefined })
    });

    if (response.status === 401) {
      localStorage.removeItem('rosterup_token');
      localStorage.removeItem('rosterup_user');
      window.location.href = 'sign-in.html';
      return;
    }

    if (!response.ok) {
      btn.disabled = false;
      btn.textContent = 'Confirm Withdraw';
      const data = await response.json().catch(() => ({}));
      btn.title = data.error || 'Could not withdraw this shift.';
      // Most likely someone claimed it in the meantime — refresh so the
      // list shows the current state.
      loadPostedShifts();
      return;
    }

    loadPostedShifts();
  } catch (err) {
    console.error('Failed to withdraw posted shift:', err);
    btn.disabled = false;
    btn.textContent = 'Confirm Withdraw';
    btn.title = 'Connection error — please try again.';
  }
}

async function loadClaimedShifts() {
  const listEl = document.getElementById('claimedShiftsList');
  const token = localStorage.getItem('rosterup_token');
  const userJson = localStorage.getItem('rosterup_user');
  const user = userJson ? JSON.parse(userJson) : null;

  if (!user) {
    listEl.innerHTML = '<div class="emp-empty-card"><p>Could not load your claimed shifts.</p></div>';
    return;
  }

  try {
    const response = await fetch(`/api/shifts?status=pending&claimed_by=${encodeURIComponent(user.id)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 401) {
      localStorage.removeItem('rosterup_token');
      localStorage.removeItem('rosterup_user');
      window.location.href = 'sign-in.html';
      return;
    }

    const shifts = await response.json();

    if (!response.ok || !Array.isArray(shifts)) {
      listEl.innerHTML = '<div class="emp-empty-card"><p>Could not load your claimed shifts.</p></div>';
      return;
    }

    renderClaimedShifts(shifts);
  } catch (err) {
    console.error('Failed to load claimed shifts:', err);
    listEl.innerHTML = '<div class="emp-empty-card"><p>Connection error. Please try again.</p></div>';
  }
}

function renderClaimedShifts(shifts) {
  const listEl = document.getElementById('claimedShiftsList');

  if (shifts.length === 0) {
    listEl.innerHTML = '<div class="emp-empty-card"><p>You haven\'t claimed any shifts awaiting approval right now.</p></div>';
    return;
  }

  listEl.innerHTML = shifts.map(claimedShiftCardHtml).join('');
}

function claimedShiftCardHtml(shift) {
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
            <p class="eos-posted-by">Covering for <strong>${escapeHtml(postedByName)}</strong></p>
          </div>
          <span class="eos-badge">Awaiting approval</span>
        </div>
        <div class="eos-footer">
          <p>Manager still needs to approve this claim</p>
          <button class="msh-withdraw-btn" data-shift-id="${shift._id}">Withdraw Claim</button>
        </div>
      </div>
    </div>
  `;
}

async function handleWithdrawClick(e) {
  const btn = e.target.closest('.msh-withdraw-btn');
  if (!btn || btn.disabled) return;

  const shiftId = btn.dataset.shiftId;
  const token = localStorage.getItem('rosterup_token');

  btn.disabled = true;
  btn.textContent = 'Withdrawing…';

  try {
    const response = await fetch(`/api/shifts/withdraw?shiftId=${encodeURIComponent(shiftId)}`, {
      method: 'PUT',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (response.status === 401) {
      localStorage.removeItem('rosterup_token');
      localStorage.removeItem('rosterup_user');
      window.location.href = 'sign-in.html';
      return;
    }

    if (!response.ok) {
      btn.disabled = false;
      btn.textContent = 'Withdraw Claim';
      const data = await response.json().catch(() => ({}));
      btn.title = data.message || 'Could not withdraw this claim.';
      return;
    }

    // Reload rather than just removing the card locally, so the list stays
    // correct even if something else changed the shift in the meantime.
    loadClaimedShifts();
  } catch (err) {
    console.error('Failed to withdraw claim:', err);
    btn.disabled = false;
    btn.textContent = 'Withdraw Claim';
    btn.title = 'Connection error — please try again.';
  }
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
