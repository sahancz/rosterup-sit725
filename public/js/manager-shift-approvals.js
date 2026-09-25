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
  document.getElementById('claimsList').addEventListener('click', handleActionClick);

  loadPendingClaims();
});

function renderSidebar(user) {
  document.getElementById('userName').textContent = `${user.first_name} ${user.last_name}`;
  const initials = `${user.first_name[0] || ''}${user.last_name[0] || ''}`.toUpperCase();
  document.getElementById('userAvatar').textContent = initials || '--';
}

async function loadPendingClaims() {
  const listEl = document.getElementById('claimsList');
  const token = localStorage.getItem('rosterup_token');

  try {
    const response = await fetch('/api/shifts/claims', {
      headers: { Authorization: `Bearer ${token}` }
    });

    // 401 = the token itself is missing/invalid/expired — clear it and send
    // back to sign-in. 403 = a real, still-valid session that just isn't a
    // manager (e.g. signed in via the Employee View demo button) — that's
    // not a reason to nuke a perfectly good session, so just say so instead.
    if (response.status === 401) {
      localStorage.removeItem('rosterup_token');
      localStorage.removeItem('rosterup_user');
      window.location.href = 'sign-in.html';
      return;
    }
    if (response.status === 403) {
      listEl.innerHTML = '<div class="mgr-empty-card"><p>This page is manager-only — you’re signed in as an employee.</p></div>';
      return;
    }

    const data = await response.json();

    if (!response.ok || !Array.isArray(data.claims)) {
      listEl.innerHTML = '<div class="mgr-empty-card"><p>Could not load pending shift approvals.</p></div>';
      return;
    }

    renderClaims(data.claims);
  } catch (err) {
    console.error('Failed to load pending shift claims:', err);
    listEl.innerHTML = '<div class="mgr-empty-card"><p>Connection error. Please try again.</p></div>';
  }
}

function renderClaims(claims) {
  const listEl = document.getElementById('claimsList');

  if (claims.length === 0) {
    listEl.innerHTML = `
      <div class="mgr-empty-card" style="padding:2.5rem 1.5rem;">
        <p style="font-weight:700; color:var(--color-foreground); margin-bottom:0.25rem;">All caught up!</p>
        <p>No pending shift approvals at this time.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = claims.map(claimCardHtml).join('');
}

function claimCardHtml(claim) {
  const date = new Date(claim.shift_date);
  const dayShort = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase();
  const dateNum = date.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' });
  const monthShort = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();

  const postedByName = fullName(claim.posted_by) || 'Unknown';
  const claimedByName = fullName(claim.claimed_by);
  const claimedByInitials = initialsFor(claim.claimed_by);

  return `
    <div class="msa-card">
      <div class="msa-card-top">
        <div>
          <p class="msa-card-top-label">Cover request from</p>
          <p class="msa-card-top-name">${escapeHtml(postedByName)}</p>
        </div>
        <span class="msa-pending-badge">Pending</span>
      </div>

      <div class="msa-shift-box">
        <div class="msa-date">
          <p class="msa-date-day">${dayShort}</p>
          <p class="msa-date-num">${dateNum}</p>
          <p class="msa-date-month">${monthShort}</p>
        </div>
        <div class="msa-divider"></div>
        <div class="msa-shift-info">
          <p class="msa-shift-role">${escapeHtml(claim.shift_role)}</p>
          <p class="msa-shift-time"><span class="material-icons">schedule</span> ${escapeHtml(claim.start_time)} — ${escapeHtml(claim.end_time)}</p>
        </div>
      </div>

      ${claimedByName ? `
      <div class="msa-claimed-row">
        <div class="msa-claimed-avatar">${claimedByInitials}</div>
        <div>
          <p class="msa-claimed-label">Requested cover by</p>
          <p class="msa-claimed-name">${escapeHtml(claimedByName)}</p>
        </div>
      </div>
      ` : ''}

      ${claim.note ? `<p class="msa-note">Reason for cover: “${escapeHtml(claim.note)}”</p>` : ''}

      <div class="msa-actions">
        <button class="msa-reject" data-shift-id="${claim._id}" data-action="reject" data-claimant="${escapeHtml(claimedByName || 'this employee')}">
          <span class="material-icons">close</span> Reject
        </button>
        <button class="msa-approve" data-shift-id="${claim._id}" data-action="approve" data-claimant="${escapeHtml(claimedByName || 'this employee')}">
          <span class="material-icons">check</span> Approve Cover
        </button>
      </div>

      <div class="msa-reject-form hidden">
        <label for="rejectReason-${claim._id}">Reason for rejecting (shown to ${escapeHtml(claimedByName || 'the employee')})</label>
        <textarea id="rejectReason-${claim._id}" rows="2" maxlength="300" placeholder="e.g. We already have enough staff on that shift"></textarea>
        <p class="msa-reject-error hidden">Please give a reason.</p>
        <div class="msa-actions">
          <button class="msa-cancel" data-action="cancel-reject">Cancel</button>
          <button class="msa-reject" data-shift-id="${claim._id}" data-action="confirm-reject" data-claimant="${escapeHtml(claimedByName || 'this employee')}">
            <span class="material-icons">close</span> Confirm Reject
          </button>
        </div>
      </div>
    </div>
  `;
}

function fullName(person) {
  if (!person || !person.first_name) return '';
  return `${person.first_name} ${person.last_name}`;
}

function initialsFor(person) {
  if (!person || !person.first_name) return '--';
  return `${person.first_name[0] || ''}${person.last_name[0] || ''}`.toUpperCase();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
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

async function handleActionClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn || btn.disabled) return;

  const card = btn.closest('.msa-card');
  const rejectForm = card.querySelector('.msa-reject-form');

  // Reject opens a reason box first (the employee sees the reason in their
  // shift history) — that second step doubles as the "are you sure?".
  if (btn.dataset.action === 'reject') {
    rejectForm.classList.remove('hidden');
    card.querySelector('.msa-actions').classList.add('hidden');
    rejectForm.querySelector('textarea').focus();
    return;
  }

  if (btn.dataset.action === 'cancel-reject') {
    rejectForm.classList.add('hidden');
    card.querySelector('.msa-actions').classList.remove('hidden');
    return;
  }

  const shiftId = btn.dataset.shiftId;
  const action = btn.dataset.action === 'confirm-reject' ? 'reject' : 'approve';
  const claimant = btn.dataset.claimant;
  const token = localStorage.getItem('rosterup_token');
  const reason = action === 'reject' ? rejectForm.querySelector('textarea').value.trim() : undefined;

  if (action === 'reject' && !reason) {
    rejectForm.querySelector('.msa-reject-error').classList.remove('hidden');
    return;
  }

  hideActionMessage();

  const buttons = card.querySelectorAll('button[data-action]');
  buttons.forEach(b => { b.disabled = true; });
  btn.innerHTML = action === 'approve'
    ? '<span class="material-icons">check</span> Approving…'
    : '<span class="material-icons">close</span> Rejecting…';

  try {
    const response = await fetch(`/api/shifts/${shiftId}/claim`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ action, reason })
    });

    if (response.status === 401) {
      localStorage.removeItem('rosterup_token');
      localStorage.removeItem('rosterup_user');
      window.location.href = 'sign-in.html';
      return;
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      buttons.forEach(b => { b.disabled = false; });
      showActionMessage(data.error || 'Could not process this claim.', 'error');
      loadPendingClaims();
      return;
    }

    showActionMessage(action === 'approve'
      ? `Approved — ${claimant} is now covering this shift.`
      : `Rejected ${claimant}'s claim — the shift is back in Open Shifts. You can still see it in Shift History.`,
    'success');

    // Either way the card no longer belongs in the pending list — approved
    // shifts are covered, rejected ones go back to Open Shifts — so just
    // refresh instead of trying to patch this one card in place.
    loadPendingClaims();
  } catch (err) {
    console.error(`Failed to ${action} shift claim:`, err);
    buttons.forEach(b => { b.disabled = false; });
    showActionMessage('Connection error — please try again.', 'error');
  }
}

function showActionMessage(text, type) {
  const box = document.getElementById('actionMessage');
  box.textContent = text;
  box.className = `alert-box alert-${type}`;
}

function hideActionMessage() {
  document.getElementById('actionMessage').className = 'alert-box hidden';
}
