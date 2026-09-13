// Shared helpers for employee-facing pages.
// Consolidated from employee-dashboard.js, employee-open-shifts.js,
// and employee-my-shifts.js, which each had their own copy.
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function capitalize(word) {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1);
}
