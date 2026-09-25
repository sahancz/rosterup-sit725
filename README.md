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
views.

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
- Approve or reject employee join requests.
- Review pending shift claims.
- Approve or reject shift-cover requests.
- View employees, shifts, and shift history.

### Employee

- Register and sign in as an employee.
- Join a workplace using its invite code.
- View upcoming and open shifts.
- Post a shift for cover.
- Claim an open shift.
- View claim outcomes and shift history.
- Withdraw an unclaimed posted shift.

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
{ "action": "approve" }  // or "reject"
```
Approve sets `status: "covered"`; reject reopens it (`status: "open"`, `claimed_by: null`). Returns `{ "shift": {...} }`.

**POST /:id/withdraw** 🔒 — withdraws a shift the caller *posted* (FR-23). Only allowed while the shift is still `open` (unclaimed); it's marked `status: "cancelled"` rather than deleted so it stays in shift history. Returns `{ "shift": {...} }`, or `404` if it isn't an open shift you posted. Not to be confused with `PUT /withdraw` above, which withdraws a *claim* instead.

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

**Not yet implemented** (all return a placeholder `501`): `GET /:id`, `PUT /:id`, `PUT /:id/password`, `PUT /:id/status`.

### Real-time chat

Workplace chat runs over Socket.io (`sockets/chat.socket.js`), not REST — not covered by this reference.

## Technology

- Node.js 20.19 or newer
- Express
- MongoDB 7
- Mongoose
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
- [Pull-request template](.github/pull_request_template.md)
- [GitHub contributors](https://github.com/sahancz/rosterup-sit725/graphs/contributors)

## Licence

This student project is currently distributed under the ISC licence declared
in `package.json`.

Documentation updated by Sahan on 14th Sep.
