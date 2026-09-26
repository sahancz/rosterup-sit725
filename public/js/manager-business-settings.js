document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('rosterup_token');
  const userJson = localStorage.getItem('rosterup_user');
  const user = userJson ? JSON.parse(userJson) : null;

  if (!token || !user || user.role !== 'manager') {
    window.location.href = 'sign-in.html';
    return;
  }

  renderSidebar(user);
  document.getElementById('businessSettingsForm').addEventListener('submit', handleSave);
  document.getElementById('copyButton').addEventListener('click', handleCopy);
  document.getElementById('regenerateButton').addEventListener('click', handleRegenerate);
  document.getElementById('logoutLink').addEventListener('click', handleLogout);

  loadWorkplace();
});

function renderSidebar(user) {
  document.getElementById('userName').textContent = `${user.first_name} ${user.last_name}`;
  const initials = `${user.first_name[0] || ''}${user.last_name[0] || ''}`.toUpperCase();
  document.getElementById('userAvatar').textContent = initials || '--';
}

function authHeaders(includeContentType = false) {
  const headers = {
    Authorization: `Bearer ${localStorage.getItem('rosterup_token')}`
  };

  if (includeContentType) headers['Content-Type'] = 'application/json';
  return headers;
}

function leaveIfSignedOut(response) {
  if (response.status !== 401 && response.status !== 403) return false;

  localStorage.removeItem('rosterup_token');
  localStorage.removeItem('rosterup_user');
  window.location.href = 'sign-in.html';
  return true;
}

function showError(message) {
  document.getElementById('messageBox').textContent = message;
}

function fillWorkplace(workplace) {
  document.getElementById('workplaceName').value = workplace.workplace_name || '';
  document.getElementById('workplaceType').value = workplace.workplace_type || '';
  document.getElementById('workplaceAddress').value = workplace.workplace_address || '';
  document.getElementById('workplaceTown').value = workplace.workplace_town || '';
  document.getElementById('workplacePostcode').value = workplace.workplace_postcode || '';
  document.getElementById('inviteCodeValue').textContent = workplace.invite_code || '—';
}

async function loadWorkplace() {
  try {
    const response = await fetch('/api/workplaces/mine', {
      headers: authHeaders()
    });

    if (leaveIfSignedOut(response)) return;

    const data = await response.json();
    if (!response.ok) {
      showError(data.error || 'Connection error. Please try again.');
      return;
    }

    if (!data.workplace) {
      window.location.href = 'manager-workplace-setup.html';
      return;
    }

    fillWorkplace(data.workplace);
  } catch (error) {
    console.error('Failed to load workplace:', error);
    showError('Connection error. Please try again.');
  }
}

async function handleSave(event) {
  event.preventDefault();
  const saveButton = document.getElementById('saveButton');
  const payload = {
    workplace_name: document.getElementById('workplaceName').value.trim(),
    workplace_type: document.getElementById('workplaceType').value,
    workplace_address: document.getElementById('workplaceAddress').value.trim(),
    workplace_town: document.getElementById('workplaceTown').value.trim(),
    workplace_postcode: document.getElementById('workplacePostcode').value.trim()
  };

  saveButton.disabled = true;
  showError('');

  try {
    const response = await fetch('/api/workplaces/mine', {
      method: 'PUT',
      headers: authHeaders(true),
      body: JSON.stringify(payload)
    });

    if (leaveIfSignedOut(response)) return;

    const data = await response.json();
    if (!response.ok) {
      showError(data.error || 'Connection error. Please try again.');
      return;
    }

    fillWorkplace(data.workplace);
  } catch (error) {
    console.error('Failed to update workplace:', error);
    showError('Connection error. Please try again.');
  } finally {
    saveButton.disabled = false;
  }
}

async function handleCopy() {
  const copyButton = document.getElementById('copyButton');
  const originalHtml = copyButton.innerHTML;

  try {
    await navigator.clipboard.writeText(
      document.getElementById('inviteCodeValue').textContent
    );
    copyButton.innerHTML = '<span class="material-icons">check</span> Copied!';
    setTimeout(() => { copyButton.innerHTML = originalHtml; }, 1500);
  } catch (error) {
    console.error('Clipboard copy failed:', error);
    showError('Connection error. Please try again.');
  }
}

async function handleRegenerate() {
  const regenerateButton = document.getElementById('regenerateButton');
  regenerateButton.disabled = true;
  showError('');

  try {
    const response = await fetch('/api/workplaces/mine/invite-code', {
      method: 'POST',
      headers: authHeaders()
    });

    if (leaveIfSignedOut(response)) return;

    const data = await response.json();
    if (!response.ok) {
      showError(data.error || 'Connection error. Please try again.');
      return;
    }

    fillWorkplace(data.workplace);
  } catch (error) {
    console.error('Failed to regenerate invite code:', error);
    showError('Connection error. Please try again.');
  } finally {
    regenerateButton.disabled = false;
  }
}

async function handleLogout(event) {
  event.preventDefault();

  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: authHeaders()
    });
  } catch (error) {
    console.error('Logout request failed:', error);
  }

  localStorage.removeItem('rosterup_token');
  localStorage.removeItem('rosterup_user');
  window.location.href = 'sign-in.html';
}
