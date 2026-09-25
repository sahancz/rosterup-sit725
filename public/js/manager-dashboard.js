document.addEventListener('DOMContentLoaded', () => {
  // Page guard: this screen requires a manager to be signed in.
  // (Server-side, /api/manager/* also rejects requests without a valid
  // token — this just avoids showing an empty/broken page.)
  const token = localStorage.getItem('rosterup_token');
  if (!token) {
    window.location.href = 'sign-in.html';
    return;
  }

  const userJson = localStorage.getItem('rosterup_user');
  const user = userJson ? JSON.parse(userJson) : null;
  if (user) {
    document.getElementById('greeting').textContent = `${timeOfDayGreeting()}, ${user.first_name}.`;
    document.getElementById('userName').textContent = `${user.first_name} ${user.last_name}`;
    const initials = `${user.first_name[0] || ''}${user.last_name[0] || ''}`.toUpperCase();
    document.getElementById('userAvatar').textContent = initials || '--';
  }

  document.getElementById('logoutLink').addEventListener('click', handleLogout);
  document.getElementById('dashCopyInviteBtn').addEventListener('click', handleCopyInviteCode);
  document.getElementById('inviteEmailForm').addEventListener('submit', handleSendInviteEmail);

  checkWorkplace();
  loadPendingEmployees();
  loadPendingClaims();
  loadWorkplaceSummary();
});

async function loadWorkplaceSummary() {
  const employeesStat = document.getElementById('statActiveEmployees');
  const shiftsStat = document.getElementById('statOpenShifts');
  const token = localStorage.getItem('rosterup_token');

  try {
    const [employeesResponse, shiftsResponse] = await Promise.all([
      fetch('/api/manager/employees', {
        headers: { Authorization: `Bearer ${token}` }
      }),
      fetch('/api/manager/shifts', {
        headers: { Authorization: `Bearer ${token}` }
      })
    ]);

    const employeesData = await employeesResponse.json();
    const shiftsData = await shiftsResponse.json();

    if (employeesResponse.ok && employeesData.success) {
      employeesStat.textContent = employeesData.employees.filter(
        employee => employee.workplace_status === 'approved'
      ).length;
    }

    if (shiftsResponse.ok && shiftsData.success) {
      shiftsStat.textContent = shiftsData.shifts.filter(shift => shift.status === 'open').length;
    }
  } catch (error) {
    console.error('Failed to load workplace summary:', error);
  }
}

// Signing in already redirects a workplace-less manager to
// manager-workplace-setup.html, but a manager can still land here directly
// (bookmark, back button, typed URL) — the banner below is the fallback for
// that case. Once a workplace exists, this also surfaces its invite code
// right on the dashboard (not just once, right after creation) so a
// manager can always come back here to copy it for a new hire.
async function checkWorkplace() {
  const banner = document.getElementById('workplaceBanner');
  const inviteCard = document.getElementById('inviteCodeCard');
  const token = localStorage.getItem('rosterup_token');

  try {
    const response = await fetch('/api/workplaces/mine', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) return; // don't show either widget off an uncertain check

    const data = await response.json();
    if (!data.workplace) {
      banner.classList.remove('hidden');
    } else {
      document.getElementById('dashInviteCode').textContent = data.workplace.invite_code;
      inviteCard.classList.remove('hidden');
    }
  } catch (err) {
    console.error('Failed to check for an existing workplace:', err);
  }
}

async function handleCopyInviteCode() {
  const code = document.getElementById('dashInviteCode').textContent;
  const copyBtn = document.getElementById('dashCopyInviteBtn');

  try {
    await navigator.clipboard.writeText(code);
  } catch (err) {
    console.error('Clipboard copy failed:', err);
  }

  const originalHtml = copyBtn.innerHTML;
  copyBtn.innerHTML = '<span class="material-icons">check</span> Copied!';
  setTimeout(() => { copyBtn.innerHTML = originalHtml; }, 1500);
}

// Same loose check as the server (one @, a dot in the domain, no spaces) —
// catches typos before a round trip; the server validates again.
const INVITE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function handleSendInviteEmail(e) {
  e.preventDefault();

  const input = document.getElementById('inviteEmail');
  const button = document.getElementById('inviteEmailBtn');
  const messageBox = document.getElementById('inviteEmailMessage');
  const email = input.value.trim();
  const token = localStorage.getItem('rosterup_token');

  if (!email) {
    showInviteMessage('Please enter the employee\'s email address.', 'error');
    input.focus();
    return;
  }

  if (!INVITE_EMAIL_PATTERN.test(email)) {
    showInviteMessage('That doesn\'t look like a valid email address.', 'error');
    input.focus();
    return;
  }

  const originalHtml = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<span class="material-icons">hourglass_empty</span> Sending…';
  messageBox.className = 'alert-box hidden';

  try {
    const response = await fetch('/api/workplaces/mine/invite-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ email })
    });

    if (response.status === 401) {
      localStorage.removeItem('rosterup_token');
      localStorage.removeItem('rosterup_user');
      window.location.href = 'sign-in.html';
      return;
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      showInviteMessage(data.error || 'Could not send the invite. Please try again.', 'error');
      return;
    }

    showInviteMessage(data.message || `Invite sent to ${email}`, 'success', data.previewUrl);
    input.value = '';
  } catch (err) {
    console.error('Failed to send invite email:', err);
    showInviteMessage('Connection error. Please try again.', 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = originalHtml;
  }
}

// previewUrl is only set in test-inbox mode (no SMTP configured) — it
// opens the email that was sent so it can be checked without a real inbox.
function showInviteMessage(text, type, previewUrl) {
  const box = document.getElementById('inviteEmailMessage');
  box.textContent = text;

  if (previewUrl) {
    const link = document.createElement('a');
    link.href = previewUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'View email (test inbox)';
    box.append(' — ', link);
  }

  box.className = `alert-box alert-${type}`;
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

async function loadPendingEmployees() {
  const listEl = document.getElementById('employeeRequestList');
  const statEl = document.getElementById('statPendingEmployees');
  const token = localStorage.getItem('rosterup_token');

  try {
    const response = await fetch('/api/manager/pending-employees', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('rosterup_token');
      localStorage.removeItem('rosterup_user');
      window.location.href = 'sign-in.html';
      return;
    }

    const data = await response.json();

    if (response.ok && data.success) {
      statEl.textContent = data.count;

      const preview = data.employees.slice(0, 3);
      if (preview.length === 0) {
        listEl.innerHTML = '<div class="mgr-empty-card"><p>No pending employee requests</p></div>';
        return;
      }

      listEl.innerHTML = '';
      preview.forEach(emp => {
        const card = document.createElement('div');
        card.className = 'mgr-request-card';
        card.id = `emp-row-${emp._id}`;
        card.innerHTML = `
          <div class="mgr-request-top">
            <div class="mgr-avatar">${(emp.first_name[0] || '') + (emp.last_name[0] || '')}</div>
            <div style="min-width:0;">
              <p class="mgr-request-name">${emp.first_name} ${emp.last_name}</p>
              <p class="mgr-request-sub">${emp.email}</p>
            </div>
          </div>
          <div class="mgr-request-actions">
            <button class="mgr-btn-reject" onclick="processEmployee('${emp._id}', 'reject')">
              <span class="material-icons">close</span> Reject
            </button>
            <button class="mgr-btn-approve" onclick="processEmployee('${emp._id}', 'approve')">
              <span class="material-icons">check</span> Approve
            </button>
          </div>
        `;
        listEl.appendChild(card);
      });
    } else {
      listEl.innerHTML = '<div class="mgr-empty-card"><p>Could not load employee requests.</p></div>';
    }
  } catch (err) {
    console.error('Failed to load pending employees:', err);
    listEl.innerHTML = '<div class="mgr-empty-card"><p>Could not load employee requests.</p></div>';
  }
}

// GET /api/shifts/claims is real — used here for the "Pending Approvals"
// stat and a small preview of the same list shown in full on
// manager-shift-approvals.html. Approving/rejecting a claim isn't built
// yet, so that page (and the buttons on it) is view-only for now.
async function loadPendingClaims() {
  const statEl = document.getElementById('statPendingApprovals');
  const listEl = document.getElementById('shiftClaimList');
  const token = localStorage.getItem('rosterup_token');

  try {
    const response = await fetch('/api/shifts/claims', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 401 || response.status === 403) {
      // Don't force a logout from a background dashboard widget — just
      // leave this card showing its loading/placeholder state.
      statEl.textContent = '—';
      listEl.innerHTML = '<div class="mgr-empty-card"><p>Could not load shift cover requests.</p></div>';
      return;
    }

    const data = await response.json();

    if (!response.ok || !Array.isArray(data.claims)) {
      statEl.textContent = '—';
      listEl.innerHTML = '<div class="mgr-empty-card"><p>Could not load shift cover requests.</p></div>';
      return;
    }

    statEl.textContent = data.claims.length;

    if (data.claims.length === 0) {
      listEl.innerHTML = '<div class="mgr-empty-card"><p>No pending shift cover requests.</p></div>';
      return;
    }

    listEl.innerHTML = data.claims.slice(0, 3).map(claimPreviewHtml).join('');
  } catch (err) {
    console.error('Failed to load pending shift claims:', err);
    statEl.textContent = '—';
    listEl.innerHTML = '<div class="mgr-empty-card"><p>Connection error.</p></div>';
  }
}

function claimPreviewHtml(claim) {
  const postedByName = claim.posted_by && claim.posted_by.first_name
    ? `${claim.posted_by.first_name} ${claim.posted_by.last_name}`
    : 'Unknown';

  return `
    <div class="mgr-request-card">
      <div class="mgr-request-top">
        <div class="mgr-avatar">${escapeHtml(initials(claim.posted_by))}</div>
        <div style="min-width:0;">
          <p class="mgr-request-name">${escapeHtml(postedByName)}</p>
          <p class="mgr-request-sub">${escapeHtml(claim.shift_role)} · ${escapeHtml(claim.start_time)}–${escapeHtml(claim.end_time)}</p>
        </div>
      </div>
    </div>
  `;
}

function initials(person) {
  if (!person || !person.first_name) return '--';
  return `${person.first_name[0] || ''}${person.last_name[0] || ''}`.toUpperCase();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

async function processEmployee(userId, action) {
  const card = document.getElementById(`emp-row-${userId}`);
  const buttons = card ? card.querySelectorAll('button') : [];
  buttons.forEach(btn => btn.disabled = true);
  const token = localStorage.getItem('rosterup_token');
  const messageBox = document.getElementById('dashMessage');

  try {
    const response = await fetch(`/api/manager/process-employee/${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ action })
    });

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('rosterup_token');
      localStorage.removeItem('rosterup_user');
      window.location.href = 'sign-in.html';
      return;
    }

    const data = await response.json();

    if (response.ok && data.success) {
      messageBox.textContent = `Successfully ${action}d ${data.employeeName}.`;
      messageBox.className = 'alert-box alert-success';
      loadPendingEmployees();
      loadWorkplaceSummary();
    } else {
      messageBox.textContent = data.message || 'Could not process this request.';
      messageBox.className = 'alert-box alert-error';
      buttons.forEach(btn => btn.disabled = false);
    }
  } catch (err) {
    console.error('Failed to process employee request:', err);
    messageBox.textContent = 'Connection error. Please try again.';
    messageBox.className = 'alert-box alert-error';
    buttons.forEach(btn => btn.disabled = false);
  }

  setTimeout(() => { messageBox.className = 'alert-box hidden'; }, 4000);
}
