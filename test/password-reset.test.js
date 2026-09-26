const test = require('node:test');
const assert = require('node:assert/strict');

const { requestPasswordReset, resetPassword, hashToken, RESET_TOKEN_TTL_MS } = require('../services/password-reset.service');
const { buildForgotPasswordController, buildResetPasswordController, RESET_REQUESTED_MESSAGE } = require('../controllers/password-reset.controller');

const NOW = Date.parse('2026-09-27T10:00:00Z');

function fakeUser(overrides = {}) {
    return {
        _id: 'user-1',
        first_name: 'Sarah',
        email: 'sarah.jones@test.com',
        password_hashed: 'hashed-old',
        password_reset_token_hash: null,
        password_reset_expires: null,
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

// ---------- requestPasswordReset ----------

test('requestPasswordReset rejects an invalid email', async () => {
    await assert.rejects(
        () => requestPasswordReset('not-an-email', 'http://localhost:3000/reset-password.html', {
            UserModel: {
                findOne: async () => {
                    throw new Error('Lookup should not run');
                },
            },
        }),
        (error) => error.statusCode === 400,
    );
});

test('requestPasswordReset quietly does nothing for an unknown email', async () => {
    await requestPasswordReset('nobody@test.com', 'http://localhost:3000/reset-password.html', {
        UserModel: { findOne: async () => null },
        sendEmail: async () => {
            throw new Error('No email should be sent');
        },
    });
});

test('requestPasswordReset stores only a hash of the token with a 1 hour expiry and emails the link', async () => {
    const user = fakeUser();
    let lookup;
    let sent;

    await requestPasswordReset('  Sarah.Jones@Test.com ', 'http://localhost:3000/reset-password.html', {
        UserModel: {
            findOne: async (filter) => {
                lookup = filter;
                return user;
            },
        },
        createToken: () => 'plain-token-123',
        now: () => NOW,
        sendEmail: async (message) => {
            sent = message;
            return {};
        },
    });

    assert.deepEqual(lookup, { email: 'sarah.jones@test.com', active: true });
    assert.equal(user.saved, true);
    assert.equal(user.password_reset_token_hash, hashToken('plain-token-123'));
    assert.notEqual(user.password_reset_token_hash, 'plain-token-123');
    assert.equal(user.password_reset_expires.getTime(), NOW + RESET_TOKEN_TTL_MS);
    assert.equal(sent.to, 'sarah.jones@test.com');
    assert.match(sent.text, /http:\/\/localhost:3000\/reset-password\.html\?token=plain-token-123/);
});

test('requestPasswordReset does not fail the request when the email cannot be sent', async () => {
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
        await requestPasswordReset('sarah.jones@test.com', 'http://localhost:3000/reset-password.html', {
            UserModel: { findOne: async () => fakeUser() },
            sendEmail: async () => {
                throw new Error('SMTP down');
            },
        });
    } finally {
        console.error = originalConsoleError;
    }
});

// ---------- resetPassword ----------

test('resetPassword rejects a missing token', async () => {
    await assert.rejects(
        () => resetPassword('', 'NewPass123'),
        (error) => error.statusCode === 400,
    );
});

test('resetPassword rejects a new password shorter than 8 characters', async () => {
    await assert.rejects(
        () => resetPassword('plain-token-123', 'short', {
            UserModel: {
                findOne: async () => {
                    throw new Error('Lookup should not run');
                },
            },
        }),
        (error) => error.statusCode === 400 && /8 characters/.test(error.message),
    );
});

test('resetPassword rejects an unknown or expired token', async () => {
    let lookup;

    await assert.rejects(
        () => resetPassword('plain-token-123', 'NewPass123', {
            UserModel: {
                findOne: async (filter) => {
                    lookup = filter;
                    return null;
                },
            },
            now: () => NOW,
        }),
        (error) => error.statusCode === 400 && /invalid or has expired/.test(error.message),
    );

    assert.deepEqual(lookup, {
        password_reset_token_hash: hashToken('plain-token-123'),
        password_reset_expires: { $gt: new Date(NOW) },
        active: true,
    });
});

test('resetPassword sets the new password and clears the token so the link only works once', async () => {
    const user = fakeUser({ password_reset_token_hash: hashToken('plain-token-123'), password_reset_expires: new Date(NOW + 1000) });

    await resetPassword('plain-token-123', 'NewPass123', {
        UserModel: { findOne: async () => user },
        hashPassword: async (plain) => `hashed:${plain}`,
        now: () => NOW,
    });

    assert.equal(user.saved, true);
    assert.equal(user.password_hashed, 'hashed:NewPass123');
    assert.equal(user.password_reset_token_hash, null);
    assert.equal(user.password_reset_expires, null);
});

// ---------- controllers ----------

function resetRequest(body) {
    return {
        body,
        protocol: 'http',
        get: (header) => (header === 'host' ? 'localhost:3000' : undefined),
    };
}

test('forgotPassword controller gives the same answer and builds the reset link on this host', async () => {
    const originalBaseUrl = process.env.APP_BASE_URL;
    delete process.env.APP_BASE_URL;

    try {
        const controller = buildForgotPasswordController({
            async requestPasswordReset(email, resetUrl) {
                assert.equal(email, 'nobody@test.com');
                assert.equal(resetUrl, 'http://localhost:3000/reset-password.html');
            },
        });
        const res = createResponse();

        await controller(resetRequest({ email: 'nobody@test.com' }), res);

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { success: true, message: RESET_REQUESTED_MESSAGE });
    } finally {
        if (originalBaseUrl !== undefined) process.env.APP_BASE_URL = originalBaseUrl;
    }
});

test('forgotPassword controller does not expose unexpected errors', async () => {
    const controller = buildForgotPasswordController({
        async requestPasswordReset() {
            throw new Error('database details');
        },
    });
    const res = createResponse();

    await controller(resetRequest({ email: 'sarah@test.com' }), res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { success: false, message: 'Unable to process the request' });
});

test('resetPassword controller confirms a successful reset', async () => {
    const controller = buildResetPasswordController({
        async resetPassword(token, password) {
            assert.equal(token, 'plain-token-123');
            assert.equal(password, 'NewPass123');
        },
    });
    const res = createResponse();

    await controller({ body: { token: 'plain-token-123', password: 'NewPass123' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
});

test('resetPassword controller surfaces an expired-link error with its own status code', async () => {
    const controller = buildResetPasswordController({
        async resetPassword() {
            const error = new Error('This reset link is invalid or has expired.');
            error.statusCode = 400;
            throw error;
        },
    });
    const res = createResponse();

    await controller({ body: { token: 'old', password: 'NewPass123' } }, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { success: false, message: 'This reset link is invalid or has expired.' });
});
