const test = require('node:test');
const assert = require('node:assert/strict');

const { getShiftsService, listPendingClaims, processShiftClaim, claimShift, postShiftsService, withdrawShiftsService, withdrawPostedShiftService } = require('../services/shifts.service');

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
        () => processShiftClaim('shift-1', 'manager-1', 'approve', {
            WorkplaceModel: { findOne: async () => null },
            ShiftModel: { findOne: async () => { throw new Error('Shift lookup should not run'); } },
        }),
        (error) => error.statusCode === 404,
    );
});

test('processShiftClaim 404s when the shift is not a pending claim in this workplace', async () => {
    await assert.rejects(
        () => processShiftClaim('shift-1', 'manager-1', 'approve', {
            WorkplaceModel: { findOne: async () => ({ _id: 'workplace-1' }) },
            ShiftModel: { findOne: async () => null },
        }),
        (error) => error.statusCode === 404,
    );
});

test('processShiftClaim approve marks the shift covered without clearing who claimed it', async () => {
    const shift = buildFakeShift();

    const result = await processShiftClaim('shift-1', 'manager-1', 'approve', {
        WorkplaceModel: { findOne: async () => ({ _id: 'workplace-1' }) },
        ShiftModel: { findOne: async () => shift },
    });

    assert.equal(result.status, 'covered');
    assert.equal(result.claimed_by, 'employee-1');
    assert.equal(result.saved, true);
});

test('processShiftClaim reject reopens the shift and clears the claim', async () => {
    const shift = buildFakeShift();

    const result = await processShiftClaim('shift-1', 'manager-1', 'reject', {
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

test('claimShift marks an open shift as pending and assigns the claimant', async () => {
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

    assert.deepEqual(capturedFilter, { _id: 'shift-1', status: 'open' });
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

    await processShiftClaim('shift-1', 'manager-1', 'approve', {
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

    const shift = await withdrawPostedShiftService('shift-1', 'employee-1', {
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
        () => withdrawPostedShiftService('shift-1', 'employee-1', {
            ShiftModel: { findOneAndUpdate: async () => null },
        }),
        (error) => error.statusCode === 404,
    );
});
