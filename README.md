# RosterUp

RosterUp is our SIT725 group project for making shift swaps easier. Instead of
asking “Can anyone take my shift?” in the group chat and watching the message
get buried, employees can post an open shift and someone else can claim it.
Managers can approve the change, and everyone knows who is working without
scrolling through a hundred messages.

## Run RosterUp locally

You will need Node.js 20.19 or newer and Docker Desktop.

1. Clone the repository and open the project.

```bash
git clone https://github.com/sahancz/rosterup-sit725.git
cd rosterup-sit725
git switch sprint2-integration
```

2. Install the project packages and create your local environment file.

```bash
npm install
cp .env.example .env
```

**Emails when running locally.** RosterUp sends two kinds of email: workplace
invites (manager dashboard → Send Invite) and password reset links (Sign In →
Forgot password?). With no extra setup they are not delivered to real inboxes —
they go to a free [Ethereal](https://ethereal.email) test inbox instead. To
read them:

- **Invite emails:** the manager dashboard shows a **View email** link right
  after sending.
- **Password reset emails:** look in the **terminal where the server is
  running** for a line like
  `Password reset email for sarah.jones@test.com: https://ethereal.email/message/...`
  and open that link, then click **Choose a new password** in the email. (The
  web page deliberately doesn't show this link — otherwise anyone could reset
  someone else's password just by typing their email.)

To deliver emails to real inboxes instead, fill in the `SMTP_*` settings in
`.env` (see `.env.example`, e.g. Gmail with an app password).

After testing a password reset or profile change, `npm run seed` puts the demo
accounts back to their original names and the password `Password123!`.

3. Start MongoDB and add the demo data.

```bash
docker compose up -d
npm run seed
```

4. Start the application.

```bash
node server.js
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

Manager demo account

```text
john.smith@test.com
Password123!
```

Employee demo account

```text
sarah.jones@test.com
Password123!
```

Press `Control + C` to stop the application. Run `docker compose down` when
you also want to stop MongoDB.

## Project status

Sprint 1 is finished and RosterUp is now moving into Sprint 2. The main
features are working, including registration, workplace setup, employee
approvals, shift cover, manager approvals, chat and the manager workplace
views. Sprint 2 has added withdrawing a posted shift, shift history for
employees and managers (with dates and reasons for each decision), and
emailing the invite code to new employees.

`main` contains the completed Sprint 1 version. `sprint2-integration` is where
the current Sprint 2 work comes together before it is reviewed and moved into
`main`.

Current work is tracked on the
[RosterUp Trello board](https://trello.com/b/D2KuzpJt/rosterup-sprint-1-planning).

Before starting development, have a quick look at
[CONTRIBUTING.md](CONTRIBUTING.md). Before opening or merging a pull request,
check [docs/MERGE_GUIDE.md](docs/MERGE_GUIDE.md). Future you and the rest of the
team will appreciate it.

## Core workflow

```text
Register or sign in
        |
        v
Create or join a workplace
        |
        v
Manager approves employee access
        |
        v
Employee posts a shift for cover
        |
        v
Coworker submits a claim
        |
        v
Manager approves or rejects the claim
        |
        v
Shift status and history are updated
```

## Users

### Manager

- Register and sign in as a manager.
- Create a workplace and receive an invite code.
- Email the invite code to a new employee.
- Approve or reject employee join requests.
- Review pending shift claims, including why the shift needs cover.
- Approve or reject shift-cover requests (a reason is required to reject).
- View employees, shifts, and shift history, including who covered each
  shift, rejected claims and the reasons given.

### Employee

- Register and sign in as an employee.
- Join a workplace using its invite code (pre-filled when opened from an
  invite email).
- View upcoming and open shifts.
- Post a shift for cover.
- Claim an open shift (but not their own).
- View claim outcomes and shift history, including why a claim wasn't
  approved.
- Withdraw an unclaimed posted shift, with an optional reason.

## Approved scope

The Software Requirements Specification (SRS) is the source of truth for
project scope. Sprint work must map to an approved functional requirement or
use case.

The first version covers:

- Authentication and role-based access.
- Workplace creation and employee onboarding.
- Employee approval by a manager.
- Shift posting and open-shift browsing.
- Shift claims and manager approval.
- Shift status and history.
- Basic profile and workplace management.

The first version does not attempt to provide payroll, timesheets, leave
management, award interpretation, or unrelated chat functionality.

## Architecture

```text
Responsive web interface
          |
          v
Node.js and Express application
          |
          v
MongoDB database through Mongoose
```

The server is organised into routes, controllers, services, and Mongoose
models. Authentication, users, workplaces, shifts, and approvals should remain
separate modules so team members can work without unnecessary overlap.

## API Reference

All routes are prefixed with `/api`. Endpoints marked 🔒 require an
`Authorization: Bearer <token>` header (obtained from `/api/auth/login`);
those marked 🔒 Manager also require the signed-in user's role to be
`manager`.

### Authentication (`/api/auth`)

**POST /register** — creates a manager or employee account. Employees must supply a valid workplace invite code.
```json
// Request
{ "first_name": "Sarah", "last_name": "Jones", "email": "sarah@test.com", "password": "...", "role": "employee", "workplaceInviteCode": "ABC123" }
```
```json
// Response (201)
{ "success": true, "message": "Registration successful.",
  "user": { "id": "...", "first_name": "Sarah", "last_name": "Jones", "email": "sarah@test.com", "role": "employee", "workplace_status": "pending" } }
```

**POST /login**
```json
// Response (200)
{ "success": true, "message": "Login successful.", "token": "<jwt>",
  "user": { "id": "...", "first_name": "Sarah", "last_name": "Jones", "email": "sarah@test.com", "role": "employee", "workplace_status": "approved" } }
```

**POST /logout** — stateless; the client just discards its token. Returns `{ "success": true, "message": "Logged out successfully." }`.

**GET /me** 🔒 — returns the caller's current profile (same `user` shape as login). Used by dashboards to pick up changes like a manager's approval without needing to log back in.

**POST /forgot-password** — starts a password reset (FR-03). Emails a one-time link to `reset-password.html?token=...`, valid for 1 hour; only a SHA-256 hash of the token is stored. Always returns the same `200` message whether or not the email has an account, so the form can't be used to find out who is registered (`400` only for a malformed email). In test-inbox mode (no SMTP configured) the email's preview link is printed in the server console.
```json
// Request
{ "email": "sarah.jones@test.com" }
```

**POST /reset-password** — sets a new password from that link (FR-03). The new password must be at least 8 characters. The link works once; an unknown, used or expired token returns `400`.
```json
// Request
{ "token": "...", "password": "NewPassword456!" }
```

### Workplaces (`/api/workplaces`)

**POST /** 🔒 Manager — creates a workplace and generates its invite code.
```json
// Request
{ "workplace_name": "Corner Cafe", "workplace_type": "Cafe", "workplace_address": "1 Main St", "workplace_town": "Geelong", "workplace_postcode": "3220" }
```
```json
// Response (201)
{ "message": "Workplace created successfully",
  "workplace": { "_id": "...", "workplace_name": "Corner Cafe", "invite_code": "XJ4K9P", "manager_id": "...", "active": true, "createdAt": "...", "updatedAt": "..." } }
```

**GET /mine** 🔒 Manager — the signed-in manager's own workplace, or `{ "workplace": null }` if they haven't created one yet.

**POST /mine/invite-email** 🔒 Manager — emails the workplace invite code to a new employee (FR-24), with a link to `employee-join.html?code=...` so the code is pre-filled. Returns `400` for an invalid email, `404` if the manager has no workplace yet, `502` if the email couldn't be sent.
```json
// Request
{ "email": "new.employee@example.com" }
```
```json
// Response (200)
{ "message": "Invite sent to new.employee@example.com", "previewUrl": "https://ethereal.email/message/..." }
```
Without `SMTP_*` settings in `.env`, emails go to a free [Ethereal](https://ethereal.email) test inbox instead of being delivered, and `previewUrl` links to the sent email. With SMTP configured (see `.env.example`), emails are delivered for real and `previewUrl` is `null`.

**Not yet implemented** (return a placeholder `501`): `GET /`, `GET /:id`, `PUT /:id`, `POST /join`, `POST /:id/invite-code`.

### Shifts (`/api/shifts`)

**GET /** 🔒 — shifts belonging to the caller's own workplace, populated with who posted them. The workplace is always resolved from the authenticated user server-side — a `workplace` query parameter is **not** read from the request, so it can't be used to view another workplace's shifts. Returns `[]` if the caller has no active workplace.

Query parameters: `status` (defaults to `open`), `claimed_by`, `posted_by` — optional.
```json
// Response (200)
[{ "_id": "...", "posted_by": { "_id": "...", "first_name": "Sarah", "last_name": "Jones" },
   "claimed_by": null, "shift_date": "2026-09-20T00:00:00.000Z", "start_time": "09:00",
   "end_time": "17:00", "shift_role": "Barista", "note": "Doctor's appointment", "status": "open" }]
```

**GET /history** 🔒 — the caller's own shift history (FR-16), newest first, scoped to their workplace. Each shift's `claim_history` only includes the caller's own entries, and each shift carries an `outcome` from the caller's point of view: `covered` (they covered it for someone), `covered_for_you` (their posted shift was covered), `withdrawn` (they withdrew their posted shift) or `claim_rejected` (a manager rejected their claim).
```json
// Response (200)
{ "history": [{ "_id": "...", "shift_role": "Barista", "status": "covered", "outcome": "covered",
    "posted_by": { "first_name": "Emily", "last_name": "Wilson" },
    "claimed_by": { "first_name": "Sarah", "last_name": "Jones" } }] }
```

**POST /** 🔒 — posts one of the caller's own shifts for cover. Only `shift_date`, `start_time`, `end_time`, `shift_role`, `note` are accepted — `workplace` and `posted_by` are resolved server-side from the token, not the request body.

**PUT /withdraw** 🔒 — withdraws a *claim* the caller made on a shift (not a shift they originally posted — see note below). `shiftId` is passed as a query string, e.g. `PUT /api/shifts/withdraw?shiftId=...`. Resets the shift to `claimed_by: null, status: "open"`. Returns `404` if it isn't a pending claim of yours.

**GET /claims** 🔒 Manager — pending claims awaiting the manager's decision, scoped to their own workplace.
```json
// Response (200)
{ "claims": [{ "_id": "...", "posted_by": { "first_name": "...", "last_name": "...", "email": "..." },
    "claimed_by": { "first_name": "...", "last_name": "...", "email": "..." }, "status": "pending" }] }
```

**POST /:id/claim** 🔒 — claims an open shift. Fails with `404` if it's no longer open (handles two employees racing for the same shift). Returns `{ "shift": {...} }` with `status` now `"pending"`.

**PUT /:id/claim** 🔒 Manager — approves or rejects a pending claim.
```json
// Request
{ "action": "reject", "reason": "We already have enough staff that day." }  // or { "action": "approve" }
```
Approve sets `status: "covered"`; reject reopens it (`status: "open"`, `claimed_by: null`). `reason` is required to reject (max 300 characters, otherwise `400`) — the employee sees it in their shift history. Either way the decision is appended to the shift's `claim_history` (`employee`, `outcome`, `decided_at`, `reason`), so a rejected claim still shows up in the employee's shift history. Returns `{ "shift": {...} }`.

**POST /:id/withdraw** 🔒 — withdraws a shift the caller *posted* (FR-23). Only allowed while the shift is still `open` (unclaimed); it's marked `status: "cancelled"` rather than deleted so it stays in shift history. Optional body `{ "reason": "..." }` (max 300 characters) is saved as `cancel_reason`. Returns `{ "shift": {...} }`, or `404` if it isn't an open shift you posted. Not to be confused with `PUT /withdraw` above, which withdraws a *claim* instead.

**Not yet implemented**: `GET /:id`, `PUT /:id`.

### Manager (`/api/manager`)

**GET /pending-employees** 🔒 Manager — employees awaiting approval into the manager's own workplace.
```json
// Response (200)
{ "success": true, "count": 1,
  "employees": [{ "_id": "...", "first_name": "Sarah", "last_name": "Jones", "email": "sarah@test.com", "role": "employee", "workplace_status": "pending" }] }
```

**GET /employees** 🔒 Manager — all active employees (approved or pending) in the manager's own workplace.
```json
// Response (200)
{ "success": true, "count": 1,
  "employees": [{ "_id": "...", "first_name": "Sarah", "last_name": "Jones", "email": "sarah@test.com", "workplace_status": "approved" }] }
```

**GET /shifts** 🔒 Manager — all shifts belonging to the manager's own workplace, with no status filter applied.
```json
// Response (200)
{ "success": true, "count": 1, "shifts": [{ "_id": "...", "status": "covered", "shift_role": "Barista" }] }
```

**PATCH /process-employee/:id** 🔒 Manager
```json
// Request
{ "action": "approve" }  // or "reject"
```
Approve sets the employee's `workplace_status` to `"approved"`. Reject sets it to `"rejected"` and `active: false` (soft-disabled, not deleted). Returns `{ "success": true, "message": "Employee request successfully approved.", "employeeName": "Sarah Jones", "action": "approve" }`.

### Users (`/api/users`)

**PUT /me** 🔒 — updates the signed-in user's own name and email (FR-22). Acts on the id in the token, never an id from the URL. Returns `400` for missing fields or an invalid email, `409` if the email belongs to another account.
```json
// Request
{ "first_name": "Sarah", "last_name": "Jones", "email": "sarah.jones@test.com" }
```
```json
// Response (200) — same user shape as login
{ "success": true, "message": "Profile updated.", "user": { "id": "...", "first_name": "Sarah", "last_name": "Jones", "email": "sarah.jones@test.com", "role": "employee", "workplace_status": "approved" } }
```

**PUT /me/password** 🔒 — changes the signed-in user's password (FR-22). The new password must be at least 8 characters and different from the current one. A wrong current password returns `400` (not `401`, since the session itself is still valid).
```json
// Request
{ "current_password": "Password123!", "new_password": "NewPassword456!" }
```

Reading the current profile is `GET /api/auth/me`.

**Not yet implemented** (all return a placeholder `501`): `GET /:id`, `PUT /:id`, `PUT /:id/password`, `PUT /:id/status`.

### Real-time chat

Workplace chat runs over Socket.io (`sockets/chat.socket.js`), not REST — not covered by this reference.

## Technology

- Node.js 20.19 or newer
- Express
- MongoDB 7
- Mongoose
- Socket.io (workplace chat)
- Nodemailer (invite emails)
- HTML, CSS, and client-side JavaScript

## Development workflow

1. Claim a Trello card before beginning work.
2. Confirm that the card maps to the approved SRS.
3. Create a branch from `sprint2-integration`.
4. Make focused commits under your own GitHub account.
5. Test your change locally.
6. Open a pull request into `sprint2-integration`.
7. Address review comments and conflicts.
8. Merge only after approval.
9. Merge the integration branch into `main` only when the complete Sprint 2
   application has been reviewed and verified.

Direct pushes, force pushes, and deletion of `main` are blocked.

## Project documentation

- [Contribution guide](CONTRIBUTING.md)
- [Branch and merge guide](docs/MERGE_GUIDE.md)
- [End-to-end test report (Sprint 2)](docs/E2E_TEST_REPORT.md) — every user story with screenshots
- [Pull-request template](.github/pull_request_template.md)
- [GitHub contributors](https://github.com/sahancz/rosterup-sit725/graphs/contributors)

## Licence

This student project is currently distributed under the ISC licence declared
in `package.json`.

Documentation updated by Sahan on 14th Sep.
