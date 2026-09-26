const test = require('node:test');
const assert = require('node:assert/strict');

const { getShiftsService, getShiftHistoryService, listPendingClaims, processShiftClaim, claimShift, postShiftsService, withdrawShiftsService, withdrawPostedShiftService } = require('../services/shifts.service');

function createShiftQuery(result, captured) {
    return {
        populate(path, fields) {
            captured.populate.push({ path, fields });
            return this;
        },
        sort(value) {
            captured.sort = value;
            return this;
        },
        select(value) {
            captured.select = value;
            return this;
        },
        lean() {
            return Promise.resolve(result);
        },
        then(resolve, reject) {
            return Promise.resolve(result).then(resolve, reject);
        },
    };
}

test('getShiftsService requires an authenticated user', async () => {
    await assert.rejects(
        () => getShiftsService({ status: 'open' }),
        (error) => error.statusCode === 401,
    );
});

test('getShiftsService returns no shifts when the user has no active workplace', async () => {
    const shifts = await getShiftsService({ status: 'open' }, 'employee-1', {
        UserModel: { findById: async () => ({ _id: 'employee-1' }) },
        resolveUserWorkplaceId: async () => null,
        ShiftModel: {
            find: () => {
                throw new Error('Shift lookup should not run');
            },
        },
    });

    assert.deepEqual(shifts, []);
});

test('getShiftsService limits shifts to the authenticated user workplace', async () => {
    const expectedShifts = [{ _id: 'shift-1' }];
    const captured = { populate: [] };
    const user = { _id: 'employee-1' };

    const shifts = await getShiftsService(
        { status: 'open', claimed_by: 'employee-1' },
        'employee-1',
        {
            UserModel: {
                findById: async (userId) => {
                    assert.equal(userId, 'employee-1');
                    return user;
                },
            },
            resolveUserWorkplaceId: async (resolvedUser) => {
                assert.equal(resolvedUser, user);
                return 'workplace-1';
            },
            ShiftModel: {
                find: (filter) => {
                    captured.filter = filter;
                    return createShiftQuery(expectedShifts, captured);
                },
            },
        },
    );

    assert.deepEqual(captured.filter, {
        status: 'open',
        claimed_by: 'employee-1',
        workplace: 'workplace-1',
    });
    assert.deepEqual(captured.populate, [{
        path: 'posted_by',
        fields: 'first_name last_name',
    }]);
    assert.deepEqual(captured.sort, { shift_date: 1, start_time: 1 });
    assert.deepEqual(shifts, expectedShifts);
});

test('requires an authenticated manager', async () => {
    await assert.rejects(
        () => listPendingClaims(),
        (error) => error.statusCode === 401,
    );
});

test('returns an empty list when the manager has no workplace', async () => {
    const claims = await listPendingClaims('manager-1', {
        WorkplaceModel: {
            findOne: async () => null,
        },
        ShiftModel: {
            find: () => {
                throw new Error('Shift lookup should not run');
            },
        },
    });

    assert.deepEqual(claims, []);
});

test('lists pending claims for the manager workplace', async () => {
    const expectedClaims = [{ _id: 'shift-1', status: 'pending' }];
    const captured = { populate: [] };

    const claims = await listPendingClaims('manager-1', {
        WorkplaceModel: {
            findOne: async (filter) => {
                captured.workplaceFilter = filter;
                return { _id: 'workplace-1' };
            },
        },
        ShiftModel: {
            find: (filter) => {
                captured.shiftFilter = filter;
                return createShiftQuery(expectedClaims, captured);
            },
        },
    });

    assert.deepEqual(captured.workplaceFilter, {
        manager_id: 'manager-1',
        active: true,
    });
    assert.deepEqual(captured.shiftFilter, {
        workplace: 'workplace-1',
        status: 'pending',
        claimed_by: { $ne: null },
    });
    assert.deepEqual(captured.populate, [
        {
            path: 'posted_by',
            fields: 'first_name last_name email',
        },
        {
            path: 'claimed_by',
            fields: 'first_name last_name email',
        },
    ]);
    assert.deepEqual(captured.sort, { shift_date: 1, start_time: 1 });
    assert.deepEqual(claims, expectedClaims);
});

function buildFakeShift(overrides = {}) {
    return {
        _id: 'shift-1',
        status: 'pending',
        claimed_by: 'employee-1',
        saved: false,
        ...overrides,
        async save() {
            this.saved = true;
            return this;
        },
    };
}

test('processShiftClaim requires an authenticated manager', async () => {
    await assert.rejects(
        () => processShiftClaim('shift-1', undefined, 'approve'),
        (error) => error.statusCode === 401,
    );
});

test('processShiftClaim rejects an unrecognised action', async () => {
    await assert.rejects(
        () => processShiftClaim('shift-1', 'manager-1', 'delete'),
        (error) => error.statusCode === 400,
    );
});

test('processShiftClaim 404s when the manager has no workplace', async () => {
    await assert.rejects(
        () => processShiftClaim('shift-1', 'manager-1', 'approve', undefined, {
            WorkplaceModel: { findOne: async () => null },
            ShiftModel: { findOne: async () => { throw new Error('Shift lookup should not run'); } },
        }),
        (error) => error.statusCode === 404,
    );
});

test('processShiftClaim 404s when the shift is not a pending claim in this workplace', async () => {
    await assert.rejects(
        () => processShiftClaim('shift-1', 'manager-1', 'approve', undefined, {
            WorkplaceModel: { findOne: async () => ({ _id: 'workplace-1' }) },
            ShiftModel: { findOne: async () => null },
        }),
        (error) => error.statusCode === 404,
    );
});

test('processShiftClaim approve marks the shift covered without clearing who claimed it', async () => {
    const shift = buildFakeShift();

    const result = await processShiftClaim('shift-1', 'manager-1', 'approve', undefined, {
        WorkplaceModel: { findOne: async () => ({ _id: 'workplace-1' }) },
        ShiftModel: { findOne: async () => shift },
    });

    assert.equal(result.status, 'covered');
    assert.equal(result.claimed_by, 'employee-1');
    assert.equal(result.saved, true);
});

test('processShiftClaim reject reopens the shift and clears the claim', async () => {
    const shift = buildFakeShift();

    const result = await processShiftClaim('shift-1', 'manager-1', 'reject', 'We already have enough staff that day.', {
        WorkplaceModel: { findOne: async () => ({ _id: 'workplace-1' }) },
        ShiftModel: { findOne: async () => shift },
    });

    assert.equal(result.status, 'open');
    assert.equal(result.claimed_by, null);
    assert.equal(result.saved, true);
});

test('claimShift requires an authenticated employee', async () => {
    await assert.rejects(
        () => claimShift('shift-1', undefined),
        (error) => error.statusCode === 401,
    );
});

test('claimShift 404s when the shift is not open', async () => {
    await assert.rejects(
        () => claimShift('shift-1', 'employee-1', {
            ShiftModel: { findOneAndUpdate: async () => null },
        }),
        (error) => error.statusCode === 404,
    );
});

test('claimShift marks an open shift as pending and assigns the claimant, never on their own shift', async () => {
    const updatedShift = { _id: 'shift-1', status: 'pending', claimed_by: 'employee-1' };
    let capturedFilter;
    let capturedUpdate;

    const shift = await claimShift('shift-1', 'employee-1', {
        ShiftModel: {
            findOneAndUpdate: async (filter, update) => {
                capturedFilter = filter;
                capturedUpdate = update;
                return updatedShift;
            },
        },
    });

    assert.deepEqual(capturedFilter, { _id: 'shift-1', status: 'open', posted_by: { $ne: 'employee-1' } });
    assert.deepEqual(capturedUpdate, { claimed_by: 'employee-1', status: 'pending' });
    assert.deepEqual(shift, updatedShift);
});


test('postShiftsService requires an authenticated user', async () => {
    await assert.rejects(
        () => postShiftsService({ shift_date: '2026-01-01', start_time: '09:00', end_time: '17:00', shift_role: 'Barista' }, undefined),
        (error) => error.statusCode === 401,
    );
});

test('postShiftsService rejects an unexpected field', async () => {
    await assert.rejects(
        () => postShiftsService({ workplace: 'workplace-1', shift_role: 'Barista' }, 'employee-1'),
        (error) => /Invalid create field: workplace/.test(error.message),
    );
});

test('postShiftsService rejects a user with no active workplace', async () => {
    await assert.rejects(
        () => postShiftsService({ shift_role: 'Barista' }, 'employee-1', {
            UserModel: { findById: async () => ({ id: 'employee-1', role: 'employee', workplace_status: 'pending', workplace: null }) },
            resolveUserWorkplaceId: async () => null,
        }),
        (error) => error.statusCode === 400,
    );
});

test('postShiftsService resolves the workplace and poster server-side rather than trusting the request body', async () => {
    const fakeUser = { id: 'employee-1', role: 'employee', workplace_status: 'approved', workplace: 'workplace-1' };
    let created;

    const shift = await postShiftsService(
        { shift_date: '2026-01-01', start_time: '09:00', end_time: '17:00', shift_role: 'Barista', note: 'Cover please' },
        'employee-1',
        {
            UserModel: { findById: async (id) => { assert.equal(id, 'employee-1'); return fakeUser; } },
            resolveUserWorkplaceId: async (user) => { assert.equal(user, fakeUser); return 'workplace-1'; },
            ShiftModel: { create: async (obj) => { created = obj; return { _id: 'shift-new', ...obj }; } },
        }
    );

    assert.deepEqual(created, {
        workplace: 'workplace-1',
        posted_by: 'employee-1',
        shift_date: '2026-01-01',
        start_time: '09:00',
        end_time: '17:00',
        shift_role: 'Barista',
        note: 'Cover please',
    });
    assert.equal(shift._id, 'shift-new');
});

test('withdrawShiftsService requires an authenticated user', async () => {
    await assert.rejects(
        () => withdrawShiftsService('shift-1', undefined),
        (error) => error.statusCode === 401,
    );
});

test('withdrawShiftsService only withdraws a shift claimed by this user', async () => {
    let capturedFilter;

    await withdrawShiftsService('shift-1', 'employee-1', {
        ShiftModel: {
            findOneAndUpdate: async (filter, update) => {
                capturedFilter = filter;
                assert.deepEqual(update, { claimed_by: null, status: 'open' });
                return { _id: 'shift-1', status: 'open', claimed_by: null };
            },
        },
    });

    assert.deepEqual(capturedFilter, { _id: 'shift-1', claimed_by: 'employee-1', status: 'pending' });
});

test('withdrawShiftsService returns null when the shift was not claimed by this user', async () => {
    const shift = await withdrawShiftsService('shift-1', 'employee-1', {
        ShiftModel: { findOneAndUpdate: async () => null },
    });

    assert.equal(shift, null);
});

test('processShiftClaim scopes the shift lookup to the manager\'s own workplace', async () => {
    let capturedFilter;

    await processShiftClaim('shift-1', 'manager-1', 'approve', undefined, {
        WorkplaceModel: { findOne: async () => ({ _id: 'workplace-1' }) },
        ShiftModel: {
            findOne: async (filter) => {
                capturedFilter = filter;
                return buildFakeShift();
            },
        },
    });

    assert.deepEqual(capturedFilter, {
        _id: 'shift-1',
        workplace: 'workplace-1',
        status: 'pending',
        claimed_by: { $ne: null },
    });
});

test('withdrawPostedShiftService requires an authenticated user', async () => {
    await assert.rejects(
        () => withdrawPostedShiftService('shift-1', undefined),
        (error) => error.statusCode === 401,
    );
});

test('withdrawPostedShiftService cancels an open shift posted by this user', async () => {
    const updatedShift = { _id: 'shift-1', status: 'cancelled', posted_by: 'employee-1' };
    let capturedFilter;
    let capturedUpdate;

    const shift = await withdrawPostedShiftService('shift-1', 'employee-1', undefined, {
        ShiftModel: {
            findOneAndUpdate: async (filter, update) => {
                capturedFilter = filter;
                capturedUpdate = update;
                return updatedShift;
            },
        },
    });

    assert.deepEqual(capturedFilter, { _id: 'shift-1', posted_by: 'employee-1', status: 'open' });
    assert.deepEqual(capturedUpdate, { status: 'cancelled' });
    assert.deepEqual(shift, updatedShift);
});

test('withdrawPostedShiftService 404s when the shift is not an open shift posted by this user', async () => {
    await assert.rejects(
        () => withdrawPostedShiftService('shift-1', 'employee-1', undefined, {
            ShiftModel: { findOneAndUpdate: async () => null },
        }),
        (error) => error.statusCode === 404,
    );
});

test('processShiftClaim records an approved decision in claim history', async () => {
    const shift = buildFakeShift();

    const result = await processShiftClaim('shift-1', 'manager-1', 'approve', undefined, {
        WorkplaceModel: { findOne: async () => ({ _id: 'workplace-1' }) },
        ShiftModel: { findOne: async () => shift },
    });

    assert.equal(result.claim_history.length, 1);
    assert.equal(result.claim_history[0].employee, 'employee-1');
    assert.equal(result.claim_history[0].outcome, 'approved');
});

test('processShiftClaim records who was rejected before clearing the claim', async () => {
    const shift = buildFakeShift({
        claim_history: [{ employee: 'employee-2', outcome: 'rejected' }],
    });

    const result = await processShiftClaim('shift-1', 'manager-1', 'reject', 'We already have enough staff that day.', {
        WorkplaceModel: { findOne: async () => ({ _id: 'workplace-1' }) },
        ShiftModel: { findOne: async () => shift },
    });

    assert.equal(result.claimed_by, null);
    assert.equal(result.claim_history.length, 2);
    assert.equal(result.claim_history[1].employee, 'employee-1');
    assert.equal(result.claim_history[1].outcome, 'rejected');
});

test('getShiftHistoryService requires an authenticated user', async () => {
    await assert.rejects(
        () => getShiftHistoryService(undefined),
        (error) => error.statusCode === 401,
    );
});

test('getShiftHistoryService returns no history when the user has no active workplace', async () => {
    const history = await getShiftHistoryService('employee-1', {
        UserModel: { findById: async () => ({ _id: 'employee-1' }) },
        resolveUserWorkplaceId: async () => null,
        ShiftModel: {
            find: () => {
                throw new Error('Shift lookup should not run');
            },
        },
    });

    assert.deepEqual(history, []);
});

test('getShiftHistoryService scopes to the workplace and labels each shift from the employee point of view', async () => {
    const captured = { populate: [] };
    const shifts = [
        { _id: 'covered-by-me', status: 'covered', posted_by: { _id: 'employee-2' }, claimed_by: { _id: 'employee-1' } },
        { _id: 'covered-for-me', status: 'covered', posted_by: { _id: 'employee-1' }, claimed_by: { _id: 'employee-3' } },
        { _id: 'withdrawn', status: 'cancelled', posted_by: { _id: 'employee-1' }, claimed_by: null },
        {
            _id: 'rejected',
            status: 'open',
            posted_by: { _id: 'employee-2' },
            claimed_by: null,
            claim_history: [{ employee: 'employee-1', outcome: 'rejected' }],
        },
    ];

    const history = await getShiftHistoryService('employee-1', {
        UserModel: { findById: async () => ({ _id: 'employee-1' }) },
        resolveUserWorkplaceId: async () => 'workplace-1',
        ShiftModel: {
            find: (filter) => {
                captured.filter = filter;
                return createShiftQuery(shifts, captured);
            },
        },
    });

    assert.deepEqual(captured.filter, {
        workplace: 'workplace-1',
        $or: [
            { claimed_by: 'employee-1', status: 'covered' },
            { posted_by: 'employee-1', status: { $in: ['covered', 'cancelled'] } },
            { claim_history: { $elemMatch: { employee: 'employee-1', outcome: 'rejected' } } },
        ],
    });
    assert.deepEqual(
        history.map((entry) => [entry._id, entry.outcome]),
        [
            ['covered-by-me', 'covered'],
            ['covered-for-me', 'covered_for_you'],
            ['withdrawn', 'withdrawn'],
            ['rejected', 'claim_rejected'],
        ],
    );
});

test('getShiftsService only populates claim history when asked to (manager view)', async () => {
    const dependencies = {
        UserModel: { findById: async () => ({ _id: 'manager-1' }) },
        resolveUserWorkplaceId: async () => 'workplace-1',
    };
    const withoutHistory = { populate: [] };
    const withHistory = { populate: [] };

    await getShiftsService({}, 'employee-1', {
        ...dependencies,
        ShiftModel: { find: () => createShiftQuery([], withoutHistory) },
    });
    await getShiftsService({}, 'manager-1', {
        ...dependencies,
        ShiftModel: { find: () => createShiftQuery([], withHistory) },
    }, { withClaimHistory: true });

    assert.deepEqual(withoutHistory.populate.map((p) => p.path), ['posted_by']);
    assert.deepEqual(withHistory.populate.map((p) => p.path), ['posted_by', 'claimed_by', 'claim_history.employee']);
});

test('getShiftHistoryService labels a rejected claim as not approved even on an open shift', async () => {
    const shifts = [{
        _id: 'reopened',
        status: 'open',
        posted_by: { _id: 'employee-2' },
        claimed_by: null,
        claim_history: [{ employee: 'employee-1', outcome: 'rejected' }],
    }];

    const history = await getShiftHistoryService('employee-1', {
        UserModel: { findById: async () => ({ _id: 'employee-1' }) },
        resolveUserWorkplaceId: async () => 'workplace-1',
        ShiftModel: { find: () => createShiftQuery(shifts, { populate: [] }) },
    });

    assert.equal(history[0].outcome, 'claim_rejected');
});

test('processShiftClaim requires a reason to reject a claim', async () => {
    await assert.rejects(
        () => processShiftClaim('shift-1', 'manager-1', 'reject', '   ', {
            WorkplaceModel: {
                findOne: async () => {
                    throw new Error('Workplace lookup should not run');
                },
            },
        }),
        (error) => error.statusCode === 400,
    );
});

test('processShiftClaim rejects a reason longer than 300 characters', async () => {
    await assert.rejects(
        () => processShiftClaim('shift-1', 'manager-1', 'reject', 'x'.repeat(301)),
        (error) => error.statusCode === 400,
    );
});

test('processShiftClaim stores the trimmed rejection reason in claim history', async () => {
    const shift = buildFakeShift();

    const result = await processShiftClaim('shift-1', 'manager-1', 'reject', '  Too many staff that day.  ', {
        WorkplaceModel: { findOne: async () => ({ _id: 'workplace-1' }) },
        ShiftModel: { findOne: async () => shift },
    });

    assert.equal(result.claim_history[0].reason, 'Too many staff that day.');
});

test('processShiftClaim does not need a reason to approve', async () => {
    const shift = buildFakeShift();

    const result = await processShiftClaim('shift-1', 'manager-1', 'approve', undefined, {
        WorkplaceModel: { findOne: async () => ({ _id: 'workplace-1' }) },
        ShiftModel: { findOne: async () => shift },
    });

    assert.equal(result.status, 'covered');
    assert.equal(result.claim_history[0].reason, undefined);
});

test('withdrawPostedShiftService saves an optional withdrawal reason', async () => {
    let capturedUpdate;

    await withdrawPostedShiftService('shift-1', 'employee-1', ' I can work after all. ', {
        ShiftModel: {
            findOneAndUpdate: async (filter, update) => {
                capturedUpdate = update;
                return { _id: 'shift-1', ...update };
            },
        },
    });

    assert.deepEqual(capturedUpdate, { status: 'cancelled', cancel_reason: 'I can work after all.' });
});

test('withdrawPostedShiftService rejects a withdrawal reason longer than 300 characters', async () => {
    await assert.rejects(
        () => withdrawPostedShiftService('shift-1', 'employee-1', 'x'.repeat(301), {
            ShiftModel: {
                findOneAndUpdate: async () => {
                    throw new Error('Update should not run');
                },
            },
        }),
        (error) => error.statusCode === 400,
    );
});

test('getShiftsService hides claim history from employees', async () => {
    const captured = { populate: [] };

    await getShiftsService({ status: 'open' }, 'employee-1', {
        UserModel: { findById: async () => ({ _id: 'employee-1' }) },
        resolveUserWorkplaceId: async () => 'workplace-1',
        ShiftModel: { find: () => createShiftQuery([], captured) },
    });

    assert.equal(captured.select, '-claim_history');
});

test('getShiftHistoryService only returns the employee\'s own claim decisions', async () => {
    const shifts = [{
        _id: 'shift-1',
        status: 'open',
        posted_by: { _id: 'employee-2' },
        claimed_by: null,
        claim_history: [
            { employee: 'employee-3', outcome: 'rejected', reason: 'Not trained for this role.' },
            { employee: 'employee-1', outcome: 'rejected', reason: 'Too many staff that day.' },
        ],
    }];

    const history = await getShiftHistoryService('employee-1', {
        UserModel: { findById: async () => ({ _id: 'employee-1' }) },
        resolveUserWorkplaceId: async () => 'workplace-1',
        ShiftModel: { find: () => createShiftQuery(shifts, { populate: [] }) },
    });

    assert.deepEqual(history[0].claim_history, [
        { employee: 'employee-1', outcome: 'rejected', reason: 'Too many staff that day.' },
    ]);
});
