const test = require('node:test');
const assert = require('node:assert/strict');

const { updateProfileService, changePasswordService } = require('../services/users.service');
const { buildUpdateProfileController, buildChangePasswordController } = require('../controllers/users.controller');

function fakeUser(overrides = {}) {
    return {
        _id: 'user-1',
        first_name: 'Sarah',
        last_name: 'Jones',
        email: 'sarah.jones@test.com',
        role: 'employee',
        workplace_status: 'approved',
        password_hashed: 'hashed-old',
        active: true,
        saved: false,
        ...overrides,
        async save() {
            this.saved = true;
            return this;
        },
    };
}

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

// ---------- updateProfileService ----------

test('updateProfileService requires an authenticated user', async () => {
    await assert.rejects(
        () => updateProfileService(undefined, { first_name: 'A', last_name: 'B', email: 'a@b.co' }),
        (error) => error.statusCode === 401,
    );
});

test('updateProfileService rejects missing fields and an invalid email before looking anything up', async () => {
    const UserModel = {
        findById: async () => {
            throw new Error('Lookup should not run');
        },
    };

    for (const input of [
        { first_name: '', last_name: 'Jones', email: 'sarah@test.com' },
        { first_name: 'Sarah', last_name: '   ', email: 'sarah@test.com' },
        { first_name: 'Sarah', last_name: 'Jones', email: 'not-an-email' },
        { first_name: 'x'.repeat(51), last_name: 'Jones', email: 'sarah@test.com' },
    ]) {
        await assert.rejects(
            () => updateProfileService('user-1', input, { UserModel }),
            (error) => error.statusCode === 400,
        );
    }
});

test('updateProfileService saves trimmed names and a normalised email, and never returns the password hash', async () => {
    const user = fakeUser();

    const result = await updateProfileService('user-1', {
        first_name: '  Sara ',
        last_name: ' Jones-Smith ',
        email: ' Sara.New@Test.com ',
    }, {
        UserModel: {
            findById: async () => user,
            findOne: async () => null,
        },
    });

    assert.equal(user.saved, true);
    assert.equal(user.first_name, 'Sara');
    assert.equal(user.last_name, 'Jones-Smith');
    assert.equal(user.email, 'sara.new@test.com');
    assert.deepEqual(result, {
        id: 'user-1',
        first_name: 'Sara',
        last_name: 'Jones-Smith',
        email: 'sara.new@test.com',
        role: 'employee',
        workplace_status: 'approved',
    });
});

test('updateProfileService refuses an email that belongs to another account', async () => {
    const user = fakeUser();

    await assert.rejects(
        () => updateProfileService('user-1', { first_name: 'Sarah', last_name: 'Jones', email: 'john.smith@test.com' }, {
            UserModel: {
                findById: async () => user,
                findOne: async (filter) => {
                    assert.deepEqual(filter, { email: 'john.smith@test.com', _id: { $ne: 'user-1' } });
                    return { _id: 'user-2' };
                },
            },
        }),
        (error) => error.statusCode === 409,
    );
    assert.equal(user.saved, false);
});

test('updateProfileService does not check for duplicates when the email is unchanged', async () => {
    const user = fakeUser();

    await updateProfileService('user-1', { first_name: 'Sarah', last_name: 'Brown', email: 'sarah.jones@test.com' }, {
        UserModel: {
            findById: async () => user,
            findOne: async () => {
                throw new Error('Duplicate check should not run');
            },
        },
    });

    assert.equal(user.last_name, 'Brown');
});

// ---------- changePasswordService ----------

const passwordDeps = (user, { matches = true } = {}) => ({
    UserModel: { findById: async () => user },
    comparePassword: async (plain, hashed) => {
        assert.equal(hashed, 'hashed-old');
        return matches;
    },
    hashPassword: async (plain) => `hashed:${plain}`,
});

test('changePasswordService requires both passwords', async () => {
    await assert.rejects(
        () => changePasswordService('user-1', { current_password: 'OldPass123', new_password: '' }, passwordDeps(fakeUser())),
        (error) => error.statusCode === 400,
    );
});

test('changePasswordService rejects a new password shorter than 8 characters', async () => {
    await assert.rejects(
        () => changePasswordService('user-1', { current_password: 'OldPass123', new_password: 'short' }, passwordDeps(fakeUser())),
        (error) => error.statusCode === 400 && /8 characters/.test(error.message),
    );
});

test('changePasswordService rejects a new password that is the same as the current one', async () => {
    await assert.rejects(
        () => changePasswordService('user-1', { current_password: 'SamePass123', new_password: 'SamePass123' }, passwordDeps(fakeUser())),
        (error) => error.statusCode === 400,
    );
});

test('changePasswordService rejects a wrong current password with 400, not 401', async () => {
    const user = fakeUser();

    await assert.rejects(
        () => changePasswordService('user-1', { current_password: 'WrongPass1', new_password: 'NewPass123' }, passwordDeps(user, { matches: false })),
        (error) => error.statusCode === 400 && error.message === 'Current password is incorrect.',
    );
    assert.equal(user.saved, false);
});

test('changePasswordService stores a hash of the new password', async () => {
    const user = fakeUser();

    await changePasswordService('user-1', { current_password: 'OldPass123', new_password: 'NewPass123' }, passwordDeps(user));

    assert.equal(user.saved, true);
    assert.equal(user.password_hashed, 'hashed:NewPass123');
});

// ---------- controllers ----------

test('updateProfile controller returns the updated user for the signed-in user', async () => {
    const controller = buildUpdateProfileController({
        updateProfileService: async (userId, body) => {
            assert.equal(userId, 'user-1');
            assert.equal(body.first_name, 'Sara');
            return { id: 'user-1', first_name: 'Sara' };
        },
    });
    const res = createResponse();

    await controller({ user: { id: 'user-1' }, body: { first_name: 'Sara' } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true, message: 'Profile updated.', user: { id: 'user-1', first_name: 'Sara' } });
});

test('updateProfile controller surfaces a service error with its own status code', async () => {
    const controller = buildUpdateProfileController({
        updateProfileService: async () => {
            const error = new Error('An account with this email address already exists.');
            error.statusCode = 409;
            throw error;
        },
    });
    const res = createResponse();

    await controller({ user: { id: 'user-1' }, body: {} }, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, { success: false, message: 'An account with this email address already exists.' });
});

test('changePassword controller does not expose unexpected errors', async () => {
    const controller = buildChangePasswordController({
        changePasswordService: async () => {
            throw new Error('database details');
        },
    });
    const res = createResponse();

    await controller({ user: { id: 'user-1' }, body: {} }, res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { success: false, message: 'Unable to change password' });
});

test('changePassword controller confirms a successful change', async () => {
    const controller = buildChangePasswordController({
        changePasswordService: async (userId, body) => {
            assert.equal(userId, 'user-1');
            assert.equal(body.new_password, 'NewPass123');
        },
    });
    const res = createResponse();

    await controller({ user: { id: 'user-1' }, body: { current_password: 'OldPass123', new_password: 'NewPass123' } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true, message: 'Password updated.' });
});
