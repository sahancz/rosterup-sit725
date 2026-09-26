const test = require('node:test');
const assert = require('node:assert/strict');

const bcrypt = require('bcrypt');
const User = require('../models/User');
const authController = require('../controllers/auth.controller');

function createResponseRecorder() {
    return {
        statusCode: null,
        body: null,
        status(statusCode) {
            this.statusCode = statusCode;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
}

test('login rejects a request missing email', async () => {
    const response = createResponseRecorder();

    await authController.login(
        { body: { password: 'test1234' } },
        response
    );

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
});

test('login rejects a request missing password', async () => {
    const response = createResponseRecorder();

    await authController.login(
        { body: { email: 'nat@test.com' } },
        response
    );

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
});

test('login rejects a wrong password without saying which field was wrong', async () => {
    const originalFindOne = User.findOne;
    const passwordHash = await bcrypt.hash('RightPass123', 4);
    User.findOne = async () => ({ _id: 'user-1', email: 'nat@test.com', password_hashed: passwordHash, active: true });

    const response = createResponseRecorder();

    try {
        await authController.login({ body: { email: 'nat@test.com', password: 'WrongPass123' } }, response);

        assert.equal(response.statusCode, 401);
        assert.equal(response.body.success, false);
        assert.equal(response.body.message, 'Invalid email or password.');
        assert.equal(response.body.token, undefined);
    } finally {
        User.findOne = originalFindOne;
    }
});

test('login gives the same answer for an email that has no account', async () => {
    const originalFindOne = User.findOne;
    User.findOne = async () => null;

    const response = createResponseRecorder();

    try {
        await authController.login({ body: { email: 'nobody@test.com', password: 'WhateverPass1' } }, response);

        assert.equal(response.statusCode, 401);
        assert.equal(response.body.message, 'Invalid email or password.');
    } finally {
        User.findOne = originalFindOne;
    }
});

test('logout always responds with success (stateless JWT)', async () => {
    const response = createResponseRecorder();

    await authController.logout({}, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
});

test('register rejects employee registration missing required fields', async () => {
    const response = createResponseRecorder();

    await authController.register({
        body: {
            email: 'nat@test.com',
            password: 'test1234',
            role: 'employee'
        },
    }, response);

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
});

test('register rejects an invalid role', async () => {
    const response = createResponseRecorder();

    await authController.register({
        body: {
            first_name: 'Nat',
            last_name: 'Smith',
            email: 'nat@test.com',
            password: 'test1234',
            role: 'owner',
        },
    }, response);

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
});

test('register rejects employee registration without a workplace invite code', async () => {
    const response = createResponseRecorder();

    await authController.register({
        body: {
            first_name: 'Nat',
            last_name: 'Smith',
            email: 'nat@test.com',
            password: 'test1234',
            role: 'employee',
        },
    }, response);

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.success, false);
    assert.match(response.body.message, /invite code/i);
});

test('register creates a manager account successfully', async () => {
    const originalFindOne = User.findOne;
    const originalSave = User.prototype.save;

    User.findOne = async () => null;

    User.prototype.save = async function () {
        this._id = 'test-manager-id';
        return this;
    };

    const req = {
        body: {
            first_name: 'John',
            last_name: 'Smith',
            email: 'john@example.com',
            password: 'Password123',
            role: 'Manager'
        }
    };

    const res = createResponseRecorder();

    try {
        await authController.register(req, res);

        assert.equal(res.statusCode, 201);
        assert.equal(res.body.success, true);
        assert.equal(res.body.message, 'Registration successful.');
        assert.equal(res.body.user.email, 'john@example.com');
        assert.equal(res.body.user.role, 'manager');
    } finally {
        User.findOne = originalFindOne;
        User.prototype.save = originalSave;
    }
});

test('register rejects missing required fields', async () => {
    const req = {
        body: {
            first_name: 'John',
            last_name: 'Smith',
            email: 'john@example.com'
        }
    };

    const res = createResponseRecorder();

    await authController.register(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /Missing required fields/);
});

test('register rejects an existing email address', async () => {
    const originalFindOne = User.findOne;

    User.findOne = async () => ({
        email: 'existing@example.com'
    });

    const req = {
        body: {
            first_name: 'John',
            last_name: 'Smith',
            email: 'existing@example.com',
            password: 'Password123',
            role: 'Manager'
        }
    };

    const res = createResponseRecorder();

    try {
        await authController.register(req, res);

        assert.equal(res.statusCode, 400);
        assert.equal(res.body.success, false);
        assert.match(res.body.message, /already exists/);
    } finally {
        User.findOne = originalFindOne;
    }
});

test('register hashes the password before saving the user', async () => {
    const originalFindOne = User.findOne;
    const originalSave = User.prototype.save;

    User.findOne = async () => null;

    let savedPassword;

    User.prototype.save = async function () {
        savedPassword = this.password_hashed;
        this._id = 'test-password-id';
        return this;
    };

    const plainPassword = 'Password123';

    const req = {
        body: {
            first_name: 'Alice',
            last_name: 'Brown',
            email: 'alice@example.com',
            password: plainPassword,
            role: 'Manager'
        }
    };

    const res = createResponseRecorder();

    try {
        await authController.register(req, res);

        assert.equal(res.statusCode, 201);
        assert.notEqual(savedPassword, plainPassword);
        assert.equal(
            await bcrypt.compare(plainPassword, savedPassword),
            true
        );
    } finally {
        User.findOne = originalFindOne;
        User.prototype.save = originalSave;
    }
});

test('register response does not expose the password', async () => {
    const originalFindOne = User.findOne;
    const originalSave = User.prototype.save;

    User.findOne = async () => null;

    User.prototype.save = async function () {
        this._id = 'test-security-id';
        return this;
    };

    const req = {
        body: {
            first_name: 'Security',
            last_name: 'Test',
            email: 'security@example.com',
            password: 'SecretPassword123',
            role: 'Manager'
        }
    };

    const res = createResponseRecorder();

    try {
        await authController.register(req, res);

        assert.equal(res.statusCode, 201);

        assert.equal(
            Object.prototype.hasOwnProperty.call(
                res.body.user,
                'password'
            ),
            false
        );

        assert.equal(
            Object.prototype.hasOwnProperty.call(
                res.body.user,
                'password_hashed'
            ),
            false
        );
    } finally {
        User.findOne = originalFindOne;
        User.prototype.save = originalSave;
    }
});