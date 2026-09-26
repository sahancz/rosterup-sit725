// FR-03 step 2: set a new password using the token from the emailed link
// (reset-password.html?token=...).
const RESET_MIN_PASSWORD_LENGTH = 8;
const resetToken = new URLSearchParams(window.location.search).get('token');

if (!resetToken) {
  showMessage('This reset link is incomplete. Please use the link from your email, or request a new one.', 'error');
  document.getElementById('submitBtn').disabled = true;
}

document.getElementById('resetForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const messageBox = document.getElementById('messageBox');
  const submitBtn = document.getElementById('submitBtn');
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (password.length < RESET_MIN_PASSWORD_LENGTH) {
    showMessage(`Your new password must be at least ${RESET_MIN_PASSWORD_LENGTH} characters.`, 'error');
    return;
  }
  if (password !== confirmPassword) {
    showMessage('Passwords do not match.', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';
  messageBox.className = 'alert-box hidden';

  try {
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, password })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
      showMessage(data.message || 'Could not reset your password. Please try again.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Reset Password';
      return;
    }

    // Done: the link can't be used again, so keep the button disabled and
    // send them to sign in.
    showMessage(`${data.message} Redirecting to sign in…`, 'success');
    submitBtn.textContent = 'Password Reset';
    setTimeout(() => { window.location.href = 'sign-in.html'; }, 2500);
  } catch (err) {
    console.error('Reset password request failed:', err);
    showMessage('Connection error. Please try again.', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Reset Password';
  }
});

function showMessage(text, type) {
  const box = document.getElementById('messageBox');
  box.textContent = text;
  box.className = `alert-box alert-${type}`;
}
