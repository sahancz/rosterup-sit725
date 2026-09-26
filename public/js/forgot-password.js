// FR-03 step 1: request a password reset email. The server gives the same
// answer whether or not the email has an account, so this page does too.
const FORGOT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

document.getElementById('forgotForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const messageBox = document.getElementById('messageBox');
  const submitBtn = document.getElementById('submitBtn');
  const email = document.getElementById('email').value.trim();

  if (!FORGOT_EMAIL_PATTERN.test(email)) {
    showMessage('Please enter a valid email address.', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending…';
  messageBox.className = 'alert-box hidden';

  try {
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
      showMessage(data.message || 'Something went wrong. Please try again.', 'error');
      return;
    }

    showMessage(data.message, 'success');
    document.getElementById('forgotForm').reset();
  } catch (err) {
    console.error('Forgot password request failed:', err);
    showMessage('Connection error. Please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send Reset Link';
  }
});

function showMessage(text, type) {
  const box = document.getElementById('messageBox');
  box.textContent = text;
  // Success uses the green "done" style; errors keep the shared red one.
  box.className = type === 'success' ? 'alert-box alert-done' : `alert-box alert-${type}`;
}
