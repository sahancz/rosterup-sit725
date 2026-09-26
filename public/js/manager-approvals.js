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
  if (user) renderSidebar(user);

  document.getElementById('logoutLink').addEventListener('click', handleLogout);

  loadEmployees();
  loadPendingRequests();
});

function renderSidebar(user) {
  document.getElementById('userName').textContent = `${user.first_name} ${user.last_name}`;
  const initials = `${user.first_name[0] || ''}${user.last_name[0] || ''}`.toUpperCase();
  document.getElementById('userAvatar').textContent = initials || '--';
}

async function loadEmployees() {
  const listEl = document.getElementById('employeeList');
  const countEl = document.getElementById('activeEmployeeCount');
  const token = localStorage.getItem('rosterup_token');

  try {
    const response = await fetch('/api/manager/employees', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('rosterup_token');
      localStorage.removeItem('rosterup_user');
      window.location.href = 'sign-in.html';
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.success || !Array.isArray(data.employees)) {
      listEl.innerHTML = '<div class="mgr-empty-card"><p>Could not load employee requests.</p></div>';
      return;
    }

    const employees = data.employees.filter(employee => employee.workplace_status === 'approved');
    countEl.textContent = employees.length;

    if (employees.length === 0) {
      listEl.innerHTML = '';
      return;
    }

    listEl.innerHTML = employees.map(employeeCardHtml).join('');
  } catch (error) {
    console.error('Failed to load employees:', error);
    listEl.innerHTML = '<div class="mgr-empty-card"><p>Could not load employee requests.</p></div>';
  }
}

function employeeCardHtml(employee) {
  const initials = `${employee.first_name[0] || ''}${employee.last_name[0] || ''}`.toUpperCase();

  return `
    <article class="mwv-employee-card">
      <div class="mgr-avatar">${escapeHtml(initials)}</div>
      <div style="min-width:0;">
        <p class="mgr-request-name">${escapeHtml(employee.first_name)} ${escapeHtml(employee.last_name)}</p>
        <p class="mgr-request-sub">${escapeHtml(employee.email)}</p>
      </div>
    </article>
  `;
}

async function loadPendingRequests() {
  const loading = document.getElementById('loadingState');
  const listEl = document.getElementById('requestList');
  const emptyState = document.getElementById('emptyState');
  const token = localStorage.getItem('rosterup_token');

  try {
    const response = await fetch('/api/manager/pending-employees', {
      headers: { Authorization: `Bearer ${token}` }
    });

    // 401 = the token itself is missing/invalid/expired — clear it and send
    // back to sign-in. 403 = a real, still-valid session that just isn't a
    // manager (e.g. signed in via the Employee View demo button) — that's
    // not a reason to nuke a perfectly good session, so just say so here.
    if (response.status === 401) {
      localStorage.removeItem('rosterup_token');
      localStorage.removeItem('rosterup_user');
      window.location.href = 'sign-in.html';
      return;
    }
    if (response.status === 403) {
      loading.classList.add('hidden');
      showGlobalMessage('This page is manager-only — you’re signed in as an employee.', 'error');
      return;
    }

    const data = await response.json();
    loading.classList.add('hidden');

    if (response.ok && data.success && data.employees.length > 0) {
      renderRequests(data.employees);
    } else {
      listEl.classList.add('hidden');
      emptyState.classList.remove('hidden');
    }
  } catch (err) {
    console.error('Failed to load pending employee requests:', err);
    loading.classList.add('hidden');
    showGlobalMessage('Could not load employee requests.', 'error');
  }
}

function renderRequests(employees) {
  const listEl = document.getElementById('requestList');
  const emptyState = document.getElementById('emptyState');

  listEl.innerHTML = '';
  employees.forEach(emp => {
    const card = document.createElement('div');
    card.className = 'mgr-request-card';
    card.id = `emp-row-${emp._id}`;
    card.innerHTML = `
      <div class="mgr-request-top">
        <div class="mgr-avatar">${escapeHtml((emp.first_name[0] || '') + (emp.last_name[0] || ''))}</div>
        <div style="min-width:0;">
          <p class="mgr-request-name">${escapeHtml(emp.first_name)} ${escapeHtml(emp.last_name)}</p>
          <p class="mgr-request-sub">${escapeHtml(emp.email)}</p>
        </div>
      </div>
      <div class="mgr-request-actions">
        <button class="mgr-btn-reject" onclick="processRequest('${emp._id}', 'reject')">
          <span class="material-icons">close</span> Reject
        </button>
        <button class="mgr-btn-approve" onclick="processRequest('${emp._id}', 'approve')">
          <span class="material-icons">check</span> Approve
        </button>
      </div>
    `;
    listEl.appendChild(card);
  });

  listEl.classList.remove('hidden');
  emptyState.classList.add('hidden');
}

async function processRequest(userId, action) {
  const card = document.getElementById(`emp-row-${userId}`);
  const buttons = card ? card.querySelectorAll('button') : [];
  buttons.forEach(btn => btn.disabled = true);
  const token = localStorage.getItem('rosterup_token');

  try {
    const response = await fetch(`/api/manager/process-employee/${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ action })
    });

    if (response.status === 401) {
      localStorage.removeItem('rosterup_token');
      localStorage.removeItem('rosterup_user');
      window.location.href = 'sign-in.html';
      return;
    }
    if (response.status === 403) {
      showGlobalMessage('This page is manager-only — you’re signed in as an employee.', 'error');
      buttons.forEach(btn => btn.disabled = false);
      return;
    }

    const data = await response.json();

    if (response.ok && data.success) {
      showGlobalMessage(`Successfully ${action}d ${data.employeeName}.`, 'success');
      loadEmployees();

      if (card) card.remove();

      const listEl = document.getElementById('requestList');
      if (listEl.children.length === 0) {
        listEl.classList.add('hidden');
        document.getElementById('emptyState').classList.remove('hidden');
      }
    } else {
      showGlobalMessage(data.message || 'Could not process this request.', 'error');
      buttons.forEach(btn => btn.disabled = false);
    }
  } catch (err) {
    console.error('Failed to process employee request:', err);
    showGlobalMessage('Connection error. Please try again.', 'error');
    buttons.forEach(btn => btn.disabled = false);
  }
}

function showGlobalMessage(text, type) {
  const box = document.getElementById('globalMessage');
  box.textContent = text;
  box.className = `alert-box alert-${type}`;
  setTimeout(() => { box.className = 'alert-box hidden'; }, 4000);
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
