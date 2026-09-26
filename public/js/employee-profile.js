document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('rosterup_token');
  if (!token) {
    window.location.href = 'sign-in.html';
    return;
  }

  const userJson = localStorage.getItem('rosterup_user');
  const user = userJson ? JSON.parse(userJson) : null;
  if (user) {
    renderSidebar(user);
    renderProfile(user);
  }

  document.getElementById('logoutLink').addEventListener('click', handleLogout);
  setupProfileForms({
    onProfileUpdated: (updated) => {
      renderSidebar(updated);
      renderProfile(updated);
    }
  });

  refreshUser();
});

function renderSidebar(user) {
  document.getElementById('userName').textContent = `${user.first_name} ${user.last_name}`;
  document.getElementById('userRole').textContent = capitalize(user.role);
  const initials = `${user.first_name[0] || ''}${user.last_name[0] || ''}`.toUpperCase();
  document.getElementById('userAvatar').textContent = initials || '--';
}

function renderProfile(user) {
  const initials = `${user.first_name[0] || ''}${user.last_name[0] || ''}`.toUpperCase();
  document.getElementById('profileAvatar').textContent = initials || '--';
  document.getElementById('profileName').textContent = `${user.first_name} ${user.last_name}`;
  document.getElementById('profileMeta').textContent = `${capitalize(user.role)} · ${user.email}`;

  const badge = document.getElementById('profileBadge');
  const status = user.workplace_status;
  if (status) {
    badge.textContent = status;
    badge.className = `emp-badge emp-badge--${status}`;
  } else {
    badge.classList.add('hidden');
  }

  fillProfileFields(user);
  document.getElementById('fieldRole').value = capitalize(user.role);
}

async function refreshUser() {
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

    localStorage.setItem('rosterup_user', JSON.stringify(data.user));
    renderSidebar(data.user);
    renderProfile(data.user);
  } catch (err) {
    console.error('Failed to refresh profile:', err);
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
