// Profile details and Change Password forms (FR-22), shared by
// employee-profile.html and manager-profile.html. Both pages use the same
// element ids; each page passes in its own render function so the header
// card and sidebar update after a successful save.

const PROFILE_MIN_PASSWORD_LENGTH = 8;

function setupProfileForms({ onProfileUpdated }) {
  document.getElementById('profileForm').addEventListener('submit', (e) => handleProfileSave(e, onProfileUpdated));
  document.getElementById('passwordForm').addEventListener('submit', handlePasswordChange);
}

function fillProfileFields(user) {
  document.getElementById('fieldFirstName').value = user.first_name || '';
  document.getElementById('fieldLastName').value = user.last_name || '';
  document.getElementById('fieldEmail').value = user.email || '';
}

async function handleProfileSave(e, onProfileUpdated) {
  e.preventDefault();

  const button = document.getElementById('profileSaveBtn');
  const payload = {
    first_name: document.getElementById('fieldFirstName').value.trim(),
    last_name: document.getElementById('fieldLastName').value.trim(),
    email: document.getElementById('fieldEmail').value.trim()
  };

  if (!payload.first_name || !payload.last_name || !payload.email) {
    showFormMessage('profileMessage', 'First name, last name and email are required.', 'error');
    return;
  }

  const data = await sendProfileRequest('/api/users/me', payload, button, 'Saving…', 'profileMessage');
  if (!data) return;

  localStorage.setItem('rosterup_user', JSON.stringify(data.user));
  if (onProfileUpdated) onProfileUpdated(data.user);
  showFormMessage('profileMessage', 'Your details have been saved.', 'success');
}

async function handlePasswordChange(e) {
  e.preventDefault();

  const button = document.getElementById('passwordSaveBtn');
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (!currentPassword || !newPassword || !confirmPassword) {
    showFormMessage('passwordMessage', 'Please fill in all three password fields.', 'error');
    return;
  }
  if (newPassword.length < PROFILE_MIN_PASSWORD_LENGTH) {
    showFormMessage('passwordMessage', `New password must be at least ${PROFILE_MIN_PASSWORD_LENGTH} characters.`, 'error');
    return;
  }
  if (newPassword !== confirmPassword) {
    showFormMessage('passwordMessage', 'New passwords do not match.', 'error');
    return;
  }

  const data = await sendProfileRequest('/api/users/me/password', {
    current_password: currentPassword,
    new_password: newPassword
  }, button, 'Updating…', 'passwordMessage');
  if (!data) return;

  document.getElementById('passwordForm').reset();
  showFormMessage('passwordMessage', 'Your password has been updated.', 'success');
}

// PUTs the payload and returns the parsed response on success, or null after
// showing the error. A 401 means the session itself is gone, so sign out.
async function sendProfileRequest(url, payload, button, busyText, messageId) {
  const token = localStorage.getItem('rosterup_token');
  const originalText = button.textContent;

  button.disabled = true;
  button.textContent = busyText;
  document.getElementById(messageId).className = 'alert-box hidden';

  try {
    const response = await fetch(url, {
      method: 'PUT',
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
      return null;
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
      showFormMessage(messageId, data.message || 'Something went wrong. Please try again.', 'error');
      return null;
    }

    return data;
  } catch (err) {
    console.error(`Request to ${url} failed:`, err);
    showFormMessage(messageId, 'Connection error. Please try again.', 'error');
    return null;
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function showFormMessage(id, text, type) {
  const box = document.getElementById(id);
  box.textContent = text;
  box.className = `alert-box alert-${type}`;
}
