const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildGetOpenShiftsController,
    buildGetShiftHistoryController,
    buildListPendingClaimsController,
    buildProcessShiftClaimController,
    buildClaimShiftController,
    buildPostShiftsController,
    buildWithdrawShiftsController,
    buildWithdrawPostedShiftController,
} = require('../controllers/shifts.controller');

function createResponse() {
    return {
        statusCode: null,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
}

test('gets shifts for the authenticated user without trusting a workplace query', async () => {
    const expectedShifts = [{ _id: 'shift-1' }];
    const controller = buildGetOpenShiftsController({
        getShiftsService: async (filter, userId) => {
            assert.equal(userId, 'employee-1');
            assert.deepEqual(filter, {
                status: 'open',
                claimed_by: 'employee-1',
            });
            return expectedShifts;
        },
    });
    const res = createResponse();

    await controller({
        user: { id: 'employee-1', role: 'employee' },
        query: {
            workplace: 'another-workplace',
            status: 'open',
            claimed_by: 'employee-1',
        },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, expectedShifts);
});

test('rejects loading shifts without an authenticated user', async () => {
    const controller = buildGetOpenShiftsController({
        getShiftsService: async () => {
            throw new Error('Service should not run');
        },
    });
    const res = createResponse();

    await controller({ query: {} }, res);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { message: 'Authentication required.' });
});

test('returns pending claims to an authenticated manager', async () => {
    const expectedClaims = [{ _id: 'shift-1' }];
    const controller = buildListPendingClaimsController({
        listPendingClaims: async (managerId) => {
            assert.equal(managerId, 'manager-1');
            return expectedClaims;
        },
    });
    const res = createResponse();

    await controller({
        user: { id: 'manager-1', role: 'manager' },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { claims: expectedClaims });
});

test('rejects a request without an authenticated user', async () => {
    const controller = buildListPendingClaimsController({
        listPendingClaims: async () => {
            throw new Error('Service should not run');
        },
    });
    const res = createResponse();

    await controller({}, res);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, {
        error: 'An authenticated manager is required',
    });
});

test('rejects an employee request', async () => {
    const controller = buildListPendingClaimsController({
        listPendingClaims: async () => {
            throw new Error('Service should not run');
        },
    });
    const res = createResponse();

    await controller({
        user: { id: 'employee-1', role: 'employee' },
    }, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'Manager access is required' });
});

test('does not expose unexpected errors', async () => {
    const controller = buildListPendingClaimsController({
        listPendingClaims: async () => {
            throw new Error('database details');
        },
    });
    const res = createResponse();

    await controller({
        user: { id: 'manager-1', role: 'manager' },
    }, res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, {
        error: 'Unable to load pending claims',
    });
});

test('processShiftClaim approves a claim for an authenticated manager', async () => {
    const updatedShift = { _id: 'shift-1', status: 'covered' };
    const controller = buildProcessShiftClaimController({
        processShiftClaim: async (shiftId, managerId, action) => {
            assert.equal(shiftId, 'shift-1');
            assert.equal(managerId, 'manager-1');
            assert.equal(action, 'approve');
            return updatedShift;
        },
    });
    const res = createResponse();

    await controller({
        user: { id: 'manager-1', role: 'manager' },
        params: { id: 'shift-1' },
        body: { action: 'approve' },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { shift: updatedShift });
});

test('processShiftClaim surfaces a validation error from the service with its own status code', async () => {
    const controller = buildProcessShiftClaimController({
        processShiftClaim: async () => {
            const error = new Error("Invalid action. Must be 'approve' or 'reject'.");
            error.statusCode = 400;
            throw error;
        },
    });
    const res = createResponse();

    await controller({
        user: { id: 'manager-1', role: 'manager' },
        params: { id: 'shift-1' },
        body: { action: 'delete' },
    }, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
        error: "Invalid action. Must be 'approve' or 'reject'.",
    });
});

test('claimShift lets an authenticated employee claim an open shift', async () => {
    const updatedShift = { _id: 'shift-1', status: 'pending', claimed_by: 'employee-1' };
    const controller = buildClaimShiftController({
        claimShift: async (shiftId, employeeId) => {
            assert.equal(shiftId, 'shift-1');
            assert.equal(employeeId, 'employee-1');
            return updatedShift;
        },
    });
    const res = createResponse();

    await controller({
        user: { id: 'employee-1', role: 'employee' },
        params: { id: 'shift-1' },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { shift: updatedShift });
});

test('claimShift rejects a request without an authenticated user', async () => {
    const controller = buildClaimShiftController({
        claimShift: async () => {
            throw new Error('Service should not run');
        },
    });
    const res = createResponse();

    await controller({ params: { id: 'shift-1' } }, res);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, {
        error: 'An authenticated employee is required',
    });
});

test('claimShift surfaces a not-found error from the service with its own status code', async () => {
    const controller = buildClaimShiftController({
        claimShift: async () => {
            const error = new Error('Open shift not found.');
            error.statusCode = 404;
            throw error;
        },
    });
    const res = createResponse();

    await controller({
        user: { id: 'employee-1', role: 'employee' },
        params: { id: 'shift-1' },
    }, res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'Open shift not found.' });
});

test('claimShift does not expose unexpected errors', async () => {
    const controller = buildClaimShiftController({
        claimShift: async () => {
            throw new Error('database details');
        },
    });
    const res = createResponse();

    await controller({
        user: { id: 'employee-1', role: 'employee' },
        params: { id: 'shift-1' },
    }, res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, {
        error: 'Unable to claim shift',
    });
});

test('processShiftClaim does not expose unexpected errors', async () => {
    const controller = buildProcessShiftClaimController({
        processShiftClaim: async () => {
            throw new Error('database details');
        },
    });
    const res = createResponse();

    await controller({
        user: { id: 'manager-1', role: 'manager' },
        params: { id: 'shift-1' },
        body: { action: 'approve' },
    }, res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, {
        error: 'Unable to process shift claim',
    });
});

test('postShiftsController lets an authenticated employee post a shift', async () => {
    const shiftBody = { shift_date: '2026-09-20', start_time: '09:00', end_time: '17:00', shift_role: 'Barista' };
    const postedShift = { _id: 'shift-new', ...shiftBody, status: 'open' };
    const controller = buildPostShiftsController({
        postShiftsService: async (body, employeeId) => {
            assert.deepEqual(body, shiftBody);
            assert.equal(employeeId, 'employee-1');
            return postedShift;
        },
    });
    const res = createResponse();

    await controller({
        user: { id: 'employee-1', role: 'employee' },
        body: shiftBody,
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, postedShift);
});

test('postShiftsController rejects a request without an authenticated user', async () => {
    const controller = buildPostShiftsController({
        postShiftsService: async () => {
            throw new Error('Service should not run');
        },
    });
    const res = createResponse();

    await controller({ body: {} }, res);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { message: 'Authentication required.' });
});

test('postShiftsController surfaces a service error with its own status code', async () => {
    const controller = buildPostShiftsController({
        postShiftsService: async () => {
            const error = new Error('You must belong to an active workplace to post a shift.');
            error.statusCode = 400;
            throw error;
        },
    });
    const res = createResponse();

    await controller({
        user: { id: 'employee-1', role: 'employee' },
        body: {},
    }, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
        message: 'You must belong to an active workplace to post a shift.',
    });
});

test('postShiftsController returns a friendly message on a schema validation error', async () => {
    const controller = buildPostShiftsController({
        postShiftsService: async () => {
            const error = new Error('Shift validation failed');
            error.name = 'ValidationError';
            error.errors = { shift_date: {}, start_time: {} };
            throw error;
        },
    });
    const res = createResponse();

    await controller({
        user: { id: 'employee-1', role: 'employee' },
        body: {},
    }, res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, {
        message: 'Data inputted incorrectly. Please check the shift_date, start_time fields and ensure they are inputted correctly.',
    });
});

test('withdrawShiftsController withdraws a pending claim for an authenticated employee', async () => {
    const withdrawnShift = { _id: 'shift-1', status: 'open', claimed_by: null };
    const controller = buildWithdrawShiftsController({
        withdrawShiftsService: async (shiftId, employeeId) => {
            assert.equal(shiftId, 'shift-1');
            assert.equal(employeeId, 'employee-1');
            return withdrawnShift;
        },
    });
    const res = createResponse();

    await controller({
        user: { id: 'employee-1', role: 'employee' },
        query: { shiftId: 'shift-1' },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, withdrawnShift);
});

test('withdrawShiftsController rejects a request without an authenticated user', async () => {
    const controller = buildWithdrawShiftsController({
        withdrawShiftsService: async () => {
            throw new Error('Service should not run');
        },
    });
    const res = createResponse();

    await controller({ query: { shiftId: 'shift-1' } }, res);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { message: 'Authentication required.' });
});

test('withdrawShiftsController requires a shiftId', async () => {
    const controller = buildWithdrawShiftsController({
        withdrawShiftsService: async () => {
            throw new Error('Service should not run');
        },
    });
    const res = createResponse();

    await controller({
        user: { id: 'employee-1', role: 'employee' },
        query: {},
    }, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { message: 'shiftId is required' });
});

test('withdrawShiftsController returns 404 when the shift is not a pending claim of the caller', async () => {
    const controller = buildWithdrawShiftsController({
        withdrawShiftsService: async () => null,
    });
    const res = createResponse();

    await controller({
        user: { id: 'employee-1', role: 'employee' },
        query: { shiftId: 'shift-1' },
    }, res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, {
        message: 'Shift not found, or it is not a pending claim of yours',
    });
});

test('withdrawShiftsController surfaces a service error with its own status code', async () => {
    const controller = buildWithdrawShiftsController({
        withdrawShiftsService: async () => {
            const error = new Error('Something went wrong.');
            error.statusCode = 400;
            throw error;
        },
    });
    const res = createResponse();

    await controller({
        user: { id: 'employee-1', role: 'employee' },
        query: { shiftId: 'shift-1' },
    }, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { message: 'Something went wrong.' });
});

test('withdrawPostedShift cancels a shift for an authenticated employee', async () => {
    const cancelledShift = { _id: 'shift-1', status: 'cancelled' };
    const controller = buildWithdrawPostedShiftController({
        withdrawPostedShiftService: async (shiftId, userId) => {
            assert.equal(shiftId, 'shift-1');
            assert.equal(userId, 'employee-1');
            return cancelledShift;
        },
    });
    const res = createResponse();

    await controller({
        user: { id: 'employee-1', role: 'employee' },
        params: { id: 'shift-1' },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { shift: cancelledShift });
});

test('withdrawPostedShift rejects a request without an authenticated user', async () => {
    const controller = buildWithdrawPostedShiftController({
        withdrawPostedShiftService: async () => {
            throw new Error('Service should not run');
        },
    });
    const res = createResponse();

    await controller({ params: { id: 'shift-1' } }, res);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'An authenticated user is required' });
});

test('withdrawPostedShift surfaces a not-found error from the service with its own status code', async () => {
    const controller = buildWithdrawPostedShiftController({
        withdrawPostedShiftService: async () => {
            const error = new Error('Open shift not found, or it was not posted by you.');
            error.statusCode = 404;
            throw error;
        },
    });
    const res = createResponse();

    await controller({
        user: { id: 'employee-1', role: 'employee' },
        params: { id: 'shift-1' },
    }, res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'Open shift not found, or it was not posted by you.' });
});

test('withdrawPostedShift does not expose unexpected errors', async () => {
    const controller = buildWithdrawPostedShiftController({
        withdrawPostedShiftService: async () => {
            throw new Error('database details');
        },
    });
    const res = createResponse();

    await controller({
        user: { id: 'employee-1', role: 'employee' },
        params: { id: 'shift-1' },
    }, res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Unable to withdraw shift' });
});

test('getOpenShiftsController passes a posted_by filter through to the service', async () => {
    const controller = buildGetOpenShiftsController({
        getShiftsService: async (filter) => {
            assert.deepEqual(filter, { status: 'open', posted_by: 'employee-1' });
            return [];
        },
    });
    const res = createResponse();

    await controller({
        user: { id: 'employee-1', role: 'employee' },
        query: { status: 'open', posted_by: 'employee-1' },
    }, res);

    assert.equal(res.statusCode, 200);
});

test('getShiftHistory returns the history for an authenticated user', async () => {
    const history = [{ _id: 'shift-1', outcome: 'covered' }];
    const controller = buildGetShiftHistoryController({
        getShiftHistoryService: async (userId) => {
            assert.equal(userId, 'employee-1');
            return history;
        },
    });
    const res = createResponse();

    await controller({ user: { id: 'employee-1', role: 'employee' } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { history });
});

test('getShiftHistory rejects a request without an authenticated user', async () => {
    const controller = buildGetShiftHistoryController({
        getShiftHistoryService: async () => {
            throw new Error('Service should not run');
        },
    });
    const res = createResponse();

    await controller({}, res);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'An authenticated user is required' });
});

test('getShiftHistory does not expose unexpected errors', async () => {
    const controller = buildGetShiftHistoryController({
        getShiftHistoryService: async () => {
            throw new Error('database details');
        },
    });
    const res = createResponse();

    await controller({ user: { id: 'employee-1', role: 'employee' } }, res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Unable to load shift history' });
});
