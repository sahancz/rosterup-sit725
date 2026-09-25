const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildCreateWorkplaceController,
    buildGetMyWorkplaceController,
    buildUpdateMyWorkplaceController,
    buildRegenerateInviteCodeController,
    buildSendInviteEmailController,
} = require('../controllers/workplaces.controller');

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

test('create workplace controller returns the new workplace', async () => {
    const service = {
        async createWorkplace(body, managerId) {
            assert.equal(managerId, 'manager-1');
            assert.equal(body.workplace_name, 'Corner Cafe');
            return {
                _id: 'workplace-1',
                workplace_name: body.workplace_name,
                invite_code: 'RU-ABC234',
            };
        },
    };
    const controller = buildCreateWorkplaceController(service);
    const response = createResponseRecorder();

    await controller({
        body: { workplace_name: 'Corner Cafe' },
        user: { id: 'manager-1' },
    }, response);

    assert.equal(response.statusCode, 201);
    assert.equal(response.body.workplace.invite_code, 'RU-ABC234');
});

test('create workplace controller returns expected validation errors', async () => {
    const service = {
        async createWorkplace() {
            const error = new Error('Missing required workplace fields');
            error.statusCode = 400;
            throw error;
        },
    };
    const controller = buildCreateWorkplaceController(service);
    const response = createResponseRecorder();

    await controller({ body: {}, user: { id: 'manager-1' } }, response);

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error, 'Missing required workplace fields');
});

test('get my workplace controller returns the manager\'s workplace', async () => {
    const service = {
        async getWorkplaceByManagerId(managerId) {
            assert.equal(managerId, 'manager-1');
            return { _id: 'workplace-1', invite_code: 'RU-ABC234' };
        },
    };
    const controller = buildGetMyWorkplaceController(service);
    const response = createResponseRecorder();

    await controller({ user: { id: 'manager-1' } }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.workplace.invite_code, 'RU-ABC234');
});

test('get my workplace controller returns null when the manager has no workplace yet', async () => {
    const service = {
        async getWorkplaceByManagerId() {
            return null;
        },
    };
    const controller = buildGetMyWorkplaceController(service);
    const response = createResponseRecorder();

    await controller({ user: { id: 'manager-1' } }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.workplace, null);
});

test('update my workplace controller returns the updated workplace', async () => {
    const service = {
        async updateWorkplaceByManagerId(body, managerId) {
            assert.equal(managerId, 'manager-1');
            assert.equal(body.workplace_name, 'Corner Cafe');
            return { _id: 'workplace-1', ...body };
        },
    };
    const controller = buildUpdateMyWorkplaceController(service);
    const response = createResponseRecorder();

    await controller({
        body: { workplace_name: 'Corner Cafe' },
        user: { id: 'manager-1' },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.workplace.workplace_name, 'Corner Cafe');
});

test('update my workplace controller returns service validation errors', async () => {
    const service = {
        async updateWorkplaceByManagerId() {
            const error = new Error('Missing required workplace fields');
            error.statusCode = 400;
            throw error;
        },
    };
    const controller = buildUpdateMyWorkplaceController(service);
    const response = createResponseRecorder();

    await controller({ body: {}, user: { id: 'manager-1' } }, response);

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error, 'Missing required workplace fields');
});

test('regenerate invite code controller returns the new code', async () => {
    const service = {
        async regenerateInviteCode(managerId) {
            assert.equal(managerId, 'manager-1');
            return { _id: 'workplace-1', invite_code: 'RU-NEW123' };
        },
    };
    const controller = buildRegenerateInviteCodeController(service);
    const response = createResponseRecorder();

    await controller({ user: { id: 'manager-1' } }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.workplace.invite_code, 'RU-NEW123');
});

function inviteRequest(overrides = {}) {
    return {
        user: { id: 'manager-1', role: 'manager' },
        body: { email: 'new@example.com' },
        protocol: 'http',
        get: (header) => (header === 'host' ? 'localhost:3000' : undefined),
        ...overrides,
    };
}

test('send invite email controller sends the invite with a join link on this host', async () => {
    const originalBaseUrl = process.env.APP_BASE_URL;
    delete process.env.APP_BASE_URL;

    try {
        const controller = buildSendInviteEmailController({
            async sendInviteEmail(managerId, email, joinUrl) {
                assert.equal(managerId, 'manager-1');
                assert.equal(email, 'new@example.com');
                assert.equal(joinUrl, 'http://localhost:3000/employee-join.html');
                return { email: 'new@example.com', previewUrl: 'https://ethereal.email/message/abc' };
            },
        });
        const response = createResponseRecorder();

        await controller(inviteRequest(), response);

        assert.equal(response.statusCode, 200);
        assert.deepEqual(response.body, {
            message: 'Invite sent to new@example.com',
            previewUrl: 'https://ethereal.email/message/abc',
        });
    } finally {
        if (originalBaseUrl !== undefined) process.env.APP_BASE_URL = originalBaseUrl;
    }
});

test('send invite email controller uses APP_BASE_URL for the join link when set', async () => {
    const originalBaseUrl = process.env.APP_BASE_URL;
    process.env.APP_BASE_URL = 'https://rosterup.example.com';

    try {
        const controller = buildSendInviteEmailController({
            async sendInviteEmail(managerId, email, joinUrl) {
                assert.equal(joinUrl, 'https://rosterup.example.com/employee-join.html');
                return { email, previewUrl: null };
            },
        });
        const response = createResponseRecorder();

        await controller(inviteRequest(), response);

        assert.equal(response.statusCode, 200);
    } finally {
        if (originalBaseUrl === undefined) delete process.env.APP_BASE_URL;
        else process.env.APP_BASE_URL = originalBaseUrl;
    }
});

test('send invite email controller surfaces a validation error with its own status code', async () => {
    const controller = buildSendInviteEmailController({
        async sendInviteEmail() {
            const error = new Error('Please enter a valid email address.');
            error.statusCode = 400;
            throw error;
        },
    });
    const response = createResponseRecorder();

    await controller(inviteRequest({ body: { email: 'nope' } }), response);

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: 'Please enter a valid email address.' });
});

test('send invite email controller does not expose unexpected errors', async () => {
    const controller = buildSendInviteEmailController({
        async sendInviteEmail() {
            throw new Error('database details');
        },
    });
    const response = createResponseRecorder();

    await controller(inviteRequest(), response);

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { error: 'Unable to send invite email' });
});
