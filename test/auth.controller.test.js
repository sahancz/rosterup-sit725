const test = require('node:test');
const assert = require('node:assert/strict');

const bcrypt = require('bcrypt');
const User = require('../models/User');
const authController = require('../controllers/auth.controller');

function createResponse() {
    return {
        statusCode: 200,
        body: null,

        status(code) {
            this.statusCode = code;
            return this;
        },

        json(data) {
            this.body = data;
            return this;
        }
    };
}

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

    const res = createResponse();

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

    const res = createResponse();

    await authController.register(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /Missing required fields/);
});

test('register rejects an invalid role', async () => {
    const req = {
        body: {
            first_name: 'John',
            last_name: 'Smith',
            email: 'john@example.com',
            password: 'Password123',
            role: 'Admin'
        }
    };

    const res = createResponse();

    await authController.register(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /Invalid role/);
});

test('register rejects an employee without a workplace invite code', async () => {
    const req = {
        body: {
            first_name: 'Jane',
            last_name: 'Smith',
            email: 'jane@example.com',
            password: 'Password123',
            role: 'Employee'
        }
    };

    const res = createResponse();

    await authController.register(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /invite code/);
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

    const res = createResponse();

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

    const res = createResponse();

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

    const res = createResponse();

    try {
        await authController.register(req, res);

        assert.equal(res.statusCode, 201);
        assert.equal(
            Object.prototype.hasOwnProperty.call(res.body.user, 'password'),
            false
        );
        assert.equal(
            Object.prototype.hasOwnProperty.call(res.body.user, 'password_hashed'),
            false
        );
    } finally {
        User.findOne = originalFindOne;
        User.prototype.save = originalSave;
    }
});