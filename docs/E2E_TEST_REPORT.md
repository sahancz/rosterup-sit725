# RosterUp – End-to-End Test Report (Sprint 2)

**Date:** 27 September 2026
**Build:** `sprint2-integration` (after PR #34)
**Tested by:** Natalia Pakhomova
**Result:** all 24 user stories (FR-01 – FR-24) passed · automated test suite: **174 / 174 passing** (`npm test`)

## How the test was run

- Fresh demo data (`npm run seed`) and the app running locally against MongoDB.
- The full core flow was walked through in a real browser (Chromium) as the demo users, performing
  real actions — posting, claiming, approving, rejecting, withdrawing, sending invites and
  resetting a password. The walkthrough is scripted with Playwright so it can be repeated:
  [`docs/e2e/capture-screenshots.js`](e2e/capture-screenshots.js). Every screenshot below was
  reviewed by hand against the expected result.
- Registration and workplace-setup forms were filled in but not submitted, so the walkthrough
  doesn't leave extra accounts in the database (both flows are covered by the automated tests).
- Emails used the Ethereal test inbox (no SMTP configured).

**Demo accounts** (password `Password123!`): manager `john.smith@test.com`; employees
`sarah.jones@test.com`, `michael.brown@test.com`; pending employee `james.taylor@test.com`.

## Summary

| # | User story | Result |
|---|---|---|
| FR-01 | Choose Manager or Employee account type | ✅ Pass |
| FR-02 | Sign in and sign out | ✅ Pass |
| FR-03 | Password reset / recovery | ✅ Pass |
| FR-04 | Manager registration | ✅ Pass |
| FR-05 | Manager creates a workplace | ✅ Pass |
| FR-06 | Workplace invite code generated | ✅ Pass |
| FR-07 | Copy and regenerate invite code | ✅ Pass |
| FR-08 | Employee registration with invite code | ✅ Pass |
| FR-09 | Join request pending until reviewed | ✅ Pass |
| FR-10 | Manager approves / rejects join requests | ✅ Pass |
| FR-11 | Employee dashboard overview | ✅ Pass |
| FR-12 | Browse open shifts | ✅ Pass |
| FR-13 | Claim an open shift | ✅ Pass |
| FR-14 | Claim pending until manager review | ✅ Pass |
| FR-15 | Post a shift for cover | ✅ Pass |
| FR-16 | Personal shifts and shift history | ✅ Pass |
| FR-17 | Manager dashboard of pending requests | ✅ Pass |
| FR-18 | Manager approves a shift claim | ✅ Pass |
| FR-19 | Manager rejects a shift claim (with a reason) | ✅ Pass |
| FR-20 | Manager views employees, shifts and history | ✅ Pass |
| FR-21 | View and edit workplace details | ✅ Pass |
| FR-22 | Update profile and change password | ✅ Pass |
| FR-23 | Withdraw a posted shift | ✅ Pass |
| FR-24 | Send the invite code by email | ✅ Pass |

## Issues found during end-to-end testing (all fixed)

| Issue | Fix |
|---|---|
| An employee could claim a shift they had posted themselves. | API refuses it; no Claim button on your own shifts (#29). |
| A rejected claim left no record, so it vanished from history. | Every manager decision is stored in `claim_history` (#29). |
| The seed script created a second demo workplace after the invite code was regenerated, so the manager and employees saw different data. | The demo workplace is now matched by its manager; duplicates are removed (#30). |
| Employee dashboard showed "—" for Upcoming Shifts / Pending Requests and "isn't built yet" placeholder text. | Both stats and the Upcoming Shifts list now show real data (this PR). |
| Events on a manager shift card were grouped by type, not in the order they happened. | Events are shown as a timeline, oldest first (this PR). |
| Success messages were purple on some pages and green on others. | All success messages use the app's green (this PR). |

---

## Test cases

### FR-01, FR-04 – Registration as a manager
**Steps:** Welcome → Create Account → choose Manager → fill in name, email and password.
**Expected:** the user can choose an account type; the manager form asks for name, email and password.

![Choose account type](screenshots/FR-01_choose-account-type.png)
![Manager registration form](screenshots/FR-04_manager-registration-form.png)

### FR-02 – Sign in and sign out
**Steps:** open Sign In; sign in as any demo user; use Logout in the sidebar.
**Expected:** sign in opens the right dashboard for the role; Logout returns to Sign In.

![Sign in](screenshots/FR-02_sign-in.png)

### FR-05, FR-06 – Manager creates a workplace and gets an invite code
**Steps:** a manager without a workplace fills in business name, type and address.
**Expected:** setup form with all fields; after creation the invite code is shown on the dashboard.

![Create workplace form](screenshots/FR-05_create-workplace-form.png)
![Manager dashboard with invite code](screenshots/FR-06_FR-07_FR-17_manager-dashboard-invite-code.png)

### FR-07, FR-21 – Copy / regenerate the invite code; edit workplace details
**Steps:** manager → Business Settings.
**Expected:** workplace details are editable; the invite code can be copied and regenerated.

![Business settings](screenshots/FR-07_FR-21_business-settings.png)

### FR-08, FR-09 – Employee joins with an invite code and waits for approval
**Steps:** open the join page with an invite code; sign in as the pending employee James.
**Expected:** the join form takes the invite code; a pending employee sees a "pending approval" banner.

![Employee join form](screenshots/FR-08_employee-join-with-invite-code.png)
![Pending approval banner](screenshots/FR-09_employee-pending-approval.png)

### FR-10, FR-20 – Manager reviews employees and join requests
**Steps:** manager → Employees.
**Expected:** active employees are listed; James appears as a pending request with Approve / Reject.

![Employees and pending requests](screenshots/FR-10_FR-20_employees-and-pending-requests.png)

### FR-12 – Browse open shifts
**Steps:** Sarah → Open Shifts.
**Expected:** open shifts in her workplace, with who offered each and when; her own shifts have no Claim button.

![Open shifts](screenshots/FR-12_open-shifts.png)

### FR-15 – Post a shift for cover
**Steps:** Sarah → My Shifts → fill in date, times, role and a note → Post Shift.
**Expected:** confirmation message; the shift appears in Open Shifts and in "My Posted Shifts".

![Post a shift](screenshots/FR-15_post-shift-for-cover.png)

### FR-13, FR-14 – Claim an open shift; claim stays pending
**Steps:** Michael → Open Shifts → Claim Shift on Sarah's 5 Oct shift → My Shifts.
**Expected:** the card shows "Claimed ✓"; in My Shifts the claim is "Awaiting approval".

![Claiming a shift](screenshots/FR-13_claim-open-shift.png)
![Claim awaiting approval](screenshots/FR-14_claim-awaiting-approval.png)

### FR-17, FR-18 – Manager sees pending claims and approves one
**Steps:** John → Shift Approvals → Approve Cover on Michael's claim.
**Expected:** each claim shows the shift, both employees and the reason for cover; after approving, a confirmation message and the claim leaves the list.

![Pending shift approvals](screenshots/FR-17_shift-approvals-pending.png)
![Claim approved](screenshots/FR-18_approve-shift-claim.png)

### FR-19 – Manager rejects a claim with a reason
**Steps:** Reject on Sarah's claim → type a reason → Confirm Reject.
**Expected:** a reason is required (it's shown to the employee); after confirming, a message and the shift goes back to Open Shifts.

![Reject requires a reason](screenshots/FR-19_reject-requires-reason.png)
![Claim rejected](screenshots/FR-19_claim-rejected.png)

### FR-11 – Employee dashboard overview
**Steps:** Michael → Dashboard (after his claim was approved).
**Expected:** Upcoming Shifts, Open Shifts, Pending Requests and Shifts Covered show real numbers; the approved 5 Oct shift is listed under Upcoming Shifts.

![Employee dashboard with upcoming shift](screenshots/FR-11_employee-dashboard-upcoming-shift.png)

### FR-23 – Withdraw a posted shift
**Steps:** Sarah → My Shifts → Withdraw Shift on her unclaimed 10 Sep shift → optional reason → Confirm Withdraw.
**Expected:** the shift leaves Open Shifts and shows as "Withdrawn" with the reason in history.

![Withdraw with a reason](screenshots/FR-23_withdraw-posted-shift-reason.png)
![Withdrawn in history](screenshots/FR-23_history-withdrawn.png)

### FR-16 – Shift history for employees
**Steps:** Sarah and Michael → Shift History; use the filters.
**Expected:** each entry shows what happened, when and why — covered by me, covered for me, withdrawn, or not approved (with the manager's reason).

![Sarah's shift history](screenshots/FR-16_employee-shift-history.png)
![Not approved, with the reason](screenshots/FR-16_FR-19_history-not-approved-with-reason.png)
![Michael: covered by me](screenshots/FR-16_history-covered-by-me.png)

### FR-20 – Manager views all shifts and shift history
**Steps:** John → All Shifts; Shift History.
**Expected:** every shift in the workplace with its status; history shows a timeline for each shift — offered, rejected claims, covered or withdrawn — with dates and reasons.

![All shifts](screenshots/FR-20_all-shifts.png)
![Manager shift history](screenshots/FR-20_manager-shift-history.png)

### FR-24 – Send the invite code by email
**Steps:** John → Dashboard → enter an email → Send Invite → View email → open the link.
**Expected:** confirmation with a link to the sent email; the email contains the code and a link; the join page opens with the code filled in.

![Send invite](screenshots/FR-24_send-invite.png)
![Invite email](screenshots/FR-24_invite-email.png)
![Join page with the code filled in](screenshots/FR-24_join-page-code-prefilled.png)

### FR-22 – Update profile and change password
**Steps:** Sarah → Profile → Save Changes; enter current and new password → Update Password.
**Expected:** confirmation for each; the new password works on the next sign in.

![Profile saved](screenshots/FR-22_profile-saved.png)
![Password changed](screenshots/FR-22_password-changed.png)

### FR-03 – Password reset
**Steps:** Sign In → Forgot password? → enter Michael's email → open the reset email (link printed in the server terminal) → Choose a new password → set it.
**Expected:** the same confirmation whether or not the email has an account; the email has a one-time link valid for 1 hour; after resetting, a confirmation and a button to sign in.

![Forgot password](screenshots/FR-03_forgot-password.png)
![Reset email](screenshots/FR-03_reset-email.png)
![Password reset done](screenshots/FR-03_password-reset-done.png)
