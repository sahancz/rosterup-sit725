// End-to-end walkthrough of RosterUp that saves one screenshot per user story
// (used for docs/E2E_TEST_REPORT.md). It drives a real browser through the
// app as the demo users and performs real actions (claim, approve, reject,
// withdraw, send invite, reset password), so run it against freshly seeded
// demo data and re-seed afterwards.
//
// Usage (from the project root):
//   npm install --no-save playwright && npx playwright install chromium
//   npm run seed
//   PORT=3100 node server.js > /tmp/rosterup-e2e.log 2>&1 &
//   node docs/e2e/capture-screenshots.js docs/screenshots /tmp/rosterup-e2e.log
//   kill %1 && npm run seed
//
// The server log is read to find the password reset email link (FR-03),
// which is only printed to the server console in test-inbox mode.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3100';
const OUT = process.argv[2];
const SERVER_LOG = process.argv[3];
const PASSWORD = 'Password123!';
fs.mkdirSync(OUT, { recursive: true });

const saved = [];
async function shot(page, name, opts = {}) {
  await page.waitForTimeout(opts.delay === undefined ? 400 : opts.delay);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: opts.fullPage !== false });
  saved.push(name);
  console.log('saved', name);
}

async function login(email, password = PASSWORD) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`login failed for ${email}: ${JSON.stringify(data)}`);
  return data;
}

async function pageAs(browser, email) {
  const { token, user } = await login(email);
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  await context.addInitScript(([t, u]) => {
    localStorage.setItem('rosterup_token', t);
    localStorage.setItem('rosterup_user', u);
  }, [token, JSON.stringify(user)]);
  const page = await context.newPage();
  return page;
}

async function open(page, file) {
  await page.goto(`${BASE}/${file}`);
  await page.waitForLoadState('networkidle');
}

(async () => {
  const browser = await chromium.launch();
  const anon = await (await browser.newContext({ viewport: { width: 1280, height: 820 } })).newPage();

  // ---- FR-01 / FR-04 / FR-02 / FR-08 (forms only, not submitted) ----
  await open(anon, 'create-account.html');
  await shot(anon, 'FR-01_choose-account-type');
  await open(anon, 'manager-register.html');
  await anon.fill('#firstName', 'Alex');
  await anon.fill('#lastName', 'Morgan');
  await anon.fill('#email', 'alex.morgan@example.com');
  await anon.fill('#password', 'Password123!');
  await shot(anon, 'FR-04_manager-registration-form');
  await open(anon, 'sign-in.html');
  await shot(anon, 'FR-02_sign-in');
  await open(anon, 'employee-join.html?code=ROSTER123');
  await anon.fill('#firstName', 'Jamie');
  await anon.fill('#lastName', 'Lee');
  await anon.fill('#email', 'jamie.lee@example.com');
  await anon.fill('#password', 'Password123!');
  await anon.fill('#confirmPassword', 'Password123!');
  await shot(anon, 'FR-08_employee-join-with-invite-code');

  // ---- Employee pending approval (FR-09) ----
  const james = await pageAs(browser, 'james.taylor@test.com');
  await open(james, 'employee-dashboard.html');
  await shot(james, 'FR-09_employee-pending-approval');

  // ---- Manager: dashboard, invite code, employees (FR-06, FR-07, FR-10, FR-17) ----
  const john = await pageAs(browser, 'john.smith@test.com');
  await open(john, 'manager-dashboard.html');
  await shot(john, 'FR-06_FR-07_FR-17_manager-dashboard-invite-code');
  await open(john, 'manager-approvals.html');
  await shot(john, 'FR-10_FR-20_employees-and-pending-requests');
  await open(john, 'manager-business-settings.html');
  await shot(john, 'FR-07_FR-21_business-settings');

  // Workplace setup form (FR-05). The demo manager already has a workplace,
  // so the page would normally skip straight to the dashboard; answer
  // "no workplace yet" just so the real setup form is shown.
  const setupCtx = john.context();
  await setupCtx.route('**/api/workplaces/mine', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ workplace: null }) }));
  await open(john, 'manager-workplace-setup.html');
  await john.fill('#workplaceName', 'Corner Cafe').catch(() => {});
  await john.selectOption('#workplaceType', { index: 1 }).catch(() => john.fill('#workplaceType', 'Cafe').catch(() => {}));
  await john.fill('#workplaceAddress', '1 Main Street').catch(() => {});
  await john.fill('#workplaceTown', 'Melbourne').catch(() => {});
  await john.fill('#workplacePostcode', '3000').catch(() => {});
  await shot(john, 'FR-05_create-workplace-form');
  await setupCtx.unroute('**/api/workplaces/mine');

  // ---- Employee: dashboard, open shifts, post a shift (FR-11, FR-12, FR-15) ----
  const sarah = await pageAs(browser, 'sarah.jones@test.com');
  await open(sarah, 'employee-open-shifts.html');
  await shot(sarah, 'FR-12_open-shifts');
  await open(sarah, 'employee-my-shifts.html');
  await sarah.fill('#shiftDate', '2026-10-05');
  await sarah.fill('#shiftStart', '10:00');
  await sarah.fill('#shiftEnd', '16:00');
  await sarah.fill('#shiftRole', 'Barista');
  await sarah.fill('#shiftNote', 'Sister\'s wedding.');
  await sarah.click('#postShiftBtn');
  await sarah.waitForSelector('#postShiftMessage.alert-success');
  await shot(sarah, 'FR-15_post-shift-for-cover');

  // ---- Michael claims Sarah's new 5 Oct shift (FR-13, FR-14) ----
  const michael = await pageAs(browser, 'michael.brown@test.com');
  await open(michael, 'employee-open-shifts.html');
  const claimCard = michael.locator('.eos-card', { hasText: 'OCT' }).first();
  await claimCard.locator('.eos-claim-btn').click();
  await claimCard.locator('text=Claimed').waitFor();
  await shot(michael, 'FR-13_claim-open-shift', { delay: 0 });
  await open(michael, 'employee-my-shifts.html');
  await shot(michael, 'FR-14_claim-awaiting-approval');

  // ---- Manager approves Michael's claim, rejects Sarah's (FR-17, FR-18, FR-19) ----
  await open(john, 'manager-shift-approvals.html');
  await shot(john, 'FR-17_shift-approvals-pending');
  await john.locator('.msa-card', { hasText: 'Michael Brown' }).filter({ hasText: 'OCT' }).locator('.msa-approve').click();
  await john.waitForSelector('#actionMessage.alert-success');
  await shot(john, 'FR-18_approve-shift-claim');
  const rejectCard = john.locator('.msa-card', { hasText: 'Front of House' }).first();
  await rejectCard.locator('button[data-action="reject"]').click();
  await rejectCard.locator('textarea').fill('Sarah is already rostered on the morning shift that day.');
  await shot(john, 'FR-19_reject-requires-reason');
  await rejectCard.locator('button[data-action="confirm-reject"]').click();
  await john.waitForSelector('#actionMessage.alert-success');
  await shot(john, 'FR-19_claim-rejected');

  // Michael's dashboard now has an upcoming shift (FR-11)
  await open(michael, 'employee-dashboard.html');
  await michael.waitForFunction(() => document.getElementById('statUpcomingShifts').textContent.trim() !== '—');
  await shot(michael, 'FR-11_employee-dashboard-upcoming-shift');

  // ---- Withdraw a posted shift with a reason (FR-23) ----
  await open(sarah, 'employee-my-shifts.html');
  const posted = sarah.locator('#postedShiftsList .eos-card', { hasText: 'Unable to work due to an appointment' }).first();
  const withdrawCard = (await posted.count()) ? posted : sarah.locator('#postedShiftsList .eos-card').first();
  await withdrawCard.locator('button[data-step="open"]').click();
  await withdrawCard.locator('textarea').fill('Appointment moved, I can work this shift.');
  await shot(sarah, 'FR-23_withdraw-posted-shift-reason');
  await withdrawCard.locator('button[data-step="confirm"]').click();
  await sarah.waitForTimeout(1200);

  // ---- Shift history (FR-16, FR-20) ----
  await open(sarah, 'employee-shift-history.html');
  await shot(sarah, 'FR-16_employee-shift-history');
  await sarah.click('[data-outcome="withdrawn"]');
  await shot(sarah, 'FR-23_history-withdrawn');
  await sarah.click('[data-outcome="claim_rejected"]');
  await shot(sarah, 'FR-16_FR-19_history-not-approved-with-reason');
  await open(michael, 'employee-shift-history.html');
  await shot(michael, 'FR-16_history-covered-by-me');
  await open(john, 'manager-shifts.html');
  await shot(john, 'FR-20_all-shifts');
  await open(john, 'manager-shift-history.html');
  await shot(john, 'FR-20_manager-shift-history');

  // ---- Invite code by email (FR-24) ----
  await open(john, 'manager-dashboard.html');
  await john.fill('#inviteEmail', 'new.employee@example.com');
  await john.click('#inviteEmailBtn');
  await john.waitForSelector('#inviteEmailMessage.alert-success', { timeout: 30000 });
  await shot(john, 'FR-24_send-invite');
  const preview = await john.locator('#inviteEmailMessage a').getAttribute('href').catch(() => null);
  if (preview) {
    const mail = await john.context().newPage();
    await mail.setViewportSize({ width: 1280, height: 820 });
    await mail.goto(preview);
    await mail.waitForLoadState('networkidle');
    await shot(mail, 'FR-24_invite-email', { fullPage: false });
    await mail.close();
  }
  await open(anon, 'employee-join.html?code=ROSTER123');
  await shot(anon, 'FR-24_join-page-code-prefilled');

  // ---- Profile (FR-22) ----
  await open(sarah, 'employee-profile.html');
  await sarah.click('#profileSaveBtn');
  await sarah.waitForSelector('#profileMessage.alert-success');
  await shot(sarah, 'FR-22_profile-saved');
  await sarah.fill('#currentPassword', PASSWORD);
  await sarah.fill('#newPassword', 'NewPassword456!');
  await sarah.fill('#confirmPassword', 'NewPassword456!');
  await sarah.click('#passwordSaveBtn');
  await sarah.waitForSelector('#passwordMessage.alert-success');
  await shot(sarah, 'FR-22_password-changed');

  // ---- Forgot / reset password (FR-03) ----
  await open(anon, 'forgot-password.html');
  await anon.fill('#email', 'michael.brown@test.com');
  await anon.click('#submitBtn');
  await anon.waitForSelector('#messageBox.alert-success');
  await shot(anon, 'FR-03_forgot-password');
  let resetPreview = null;
  for (let i = 0; i < 40 && !resetPreview; i += 1) {
    await anon.waitForTimeout(500);
    const log = fs.readFileSync(SERVER_LOG, 'utf8');
    const m = log.match(/Password reset email for michael\.brown@test\.com: (\S+)/);
    if (m) resetPreview = m[1];
  }
  if (resetPreview) {
    const mail = await anon.context().newPage();
    await mail.goto(resetPreview);
    await mail.waitForLoadState('networkidle');
    await shot(mail, 'FR-03_reset-email', { fullPage: false });
    const frame = mail.frameLocator('iframe').first();
    const href = await frame.locator('a', { hasText: 'Choose a new password' }).getAttribute('href').catch(() => null);
    await mail.close();
    if (href) {
      await anon.goto(href);
      await anon.fill('#password', 'NewPassword456!');
      await anon.fill('#confirmPassword', 'NewPassword456!');
      await anon.click('#submitBtn');
      await anon.waitForSelector('#messageBox.alert-success');
      await shot(anon, 'FR-03_password-reset-done');
    } else {
      console.log('could not find reset link in email');
    }
  } else {
    console.log('no reset preview url in server log');
  }

  await browser.close();
  console.log(`DONE ${saved.length} screenshots`);
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
