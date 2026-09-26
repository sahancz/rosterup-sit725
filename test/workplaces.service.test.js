const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createWorkplace,
    getWorkplaceByManagerId,
    updateWorkplaceByManagerId,
    regenerateInviteCode,
    sendInviteEmail,
} = require('../services/workplaces.service');

const validInput = {
    workplace_name: '  Corner Cafe  ',
    workplace_type: ' Hospitality ',
    workplace_address: ' 1 Main Street ',
    workplace_town: ' Geelong ',
    workplace_postcode: ' 3220 ',
};

test('createWorkplace saves normalised data and a generated invite code', async () => {
    let savedWorkplace;
    const WorkplaceModel = {
        async create(workplace) {
            savedWorkplace = workplace;
            return { _id: 'workplace-1', ...workplace };
        },
    };

    const workplace = await createWorkplace(validInput, 'manager-1', {
        WorkplaceModel,
        inviteCodeGenerator: async () => 'RU-ABC234',
    });

    assert.equal(workplace._id, 'workplace-1');
    assert.deepEqual(savedWorkplace, {
        workplace_name: 'Corner Cafe',
        workplace_type: 'Hospitality',
        workplace_address: '1 Main Street',
        workplace_town: 'Geelong',
        workplace_postcode: '3220',
        invite_code: 'RU-ABC234',
        manager_id: 'manager-1',
    });
});

test('createWorkplace rejects missing required fields', async () => {
    await assert.rejects(
        createWorkplace({ workplace_name: 'Corner Cafe' }, 'manager-1'),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.match(error.message, /workplace_type/);
            return true;
        },
    );
});

test('createWorkplace requires an authenticated manager', async () => {
    await assert.rejects(
        createWorkplace(validInput),
        (error) => {
            assert.equal(error.statusCode, 401);
            return true;
        },
    );
});

test('getWorkplaceByManagerId returns the manager\'s workplace when one exists', async () => {
    const WorkplaceModel = {
        async findOne(query) {
            assert.deepEqual(query, { manager_id: 'manager-1' });
            return { _id: 'workplace-1', workplace_name: 'Corner Cafe' };
        },
    };

    const workplace = await getWorkplaceByManagerId('manager-1', { WorkplaceModel });

    assert.equal(workplace._id, 'workplace-1');
});

test('getWorkplaceByManagerId returns null when the manager has none yet', async () => {
    const WorkplaceModel = {
        async findOne() {
            return null;
        },
    };

    const workplace = await getWorkplaceByManagerId('manager-1', { WorkplaceModel });

    assert.equal(workplace, null);
});

test('getWorkplaceByManagerId requires an authenticated manager', async () => {
    await assert.rejects(
        getWorkplaceByManagerId(),
        (error) => {
            assert.equal(error.statusCode, 401);
            return true;
        },
    );
});

test('updateWorkplaceByManagerId updates only the authenticated manager workplace', async () => {
    let captured;
    const WorkplaceModel = {
        async findOneAndUpdate(filter, update, options) {
            captured = { filter, update, options };
            return { _id: 'workplace-1', ...update.$set };
        },
    };

    const workplace = await updateWorkplaceByManagerId(
        validInput,
        'manager-1',
        { WorkplaceModel },
    );

    assert.deepEqual(captured.filter, {
        manager_id: 'manager-1',
        active: true,
    });
    assert.deepEqual(captured.update.$set, {
        workplace_name: 'Corner Cafe',
        workplace_type: 'Hospitality',
        workplace_address: '1 Main Street',
        workplace_town: 'Geelong',
        workplace_postcode: '3220',
    });
    assert.deepEqual(captured.options, { new: true, runValidators: true });
    assert.equal(workplace.workplace_name, 'Corner Cafe');
});

test('updateWorkplaceByManagerId returns not found when the manager has no workplace', async () => {
    const WorkplaceModel = {
        async findOneAndUpdate() {
            return null;
        },
    };

    await assert.rejects(
        updateWorkplaceByManagerId(validInput, 'manager-1', { WorkplaceModel }),
        (error) => {
            assert.equal(error.statusCode, 404);
            return true;
        },
    );
});

test('regenerateInviteCode replaces the code on the manager workplace', async () => {
    let captured;
    const WorkplaceModel = {
        async findOneAndUpdate(filter, update, options) {
            captured = { filter, update, options };
            return { _id: 'workplace-1', invite_code: update.$set.invite_code };
        },
    };

    const workplace = await regenerateInviteCode('manager-1', {
        WorkplaceModel,
        inviteCodeGenerator: async () => 'RU-NEW123',
    });

    assert.deepEqual(captured.filter, {
        manager_id: 'manager-1',
        active: true,
    });
    assert.deepEqual(captured.update, {
        $set: { invite_code: 'RU-NEW123' },
    });
    assert.deepEqual(captured.options, { new: true, runValidators: true });
    assert.equal(workplace.invite_code, 'RU-NEW123');
});

test('regenerateInviteCode returns not found when the manager has no workplace', async () => {
    const WorkplaceModel = {
        async findOneAndUpdate() {
            return null;
        },
    };

    await assert.rejects(
        regenerateInviteCode('manager-1', {
            WorkplaceModel,
            inviteCodeGenerator: async () => 'RU-NEW123',
        }),
        (error) => {
            assert.equal(error.statusCode, 404);
            return true;
        },
    );
});

const inviteWorkplace = {
    workplace_name: 'Corner Cafe',
    invite_code: 'RU-ABC234',
};

test('sendInviteEmail requires an authenticated manager', async () => {
    await assert.rejects(
        () => sendInviteEmail(undefined, 'new@example.com', 'http://localhost:3000/employee-join.html'),
        (error) => error.statusCode === 401,
    );
});

test('sendInviteEmail rejects an invalid email before looking anything up', async () => {
    for (const email of ['', '   ', 'not-an-email', 'a@b', 'two words@example.com', undefined]) {
        await assert.rejects(
            () => sendInviteEmail('manager-1', email, 'http://localhost:3000/employee-join.html', {
                WorkplaceModel: {
                    findOne: async () => {
                        throw new Error('Workplace lookup should not run');
                    },
                },
            }),
            (error) => error.statusCode === 400,
        );
    }
});

test('sendInviteEmail 404s when the manager has no workplace yet', async () => {
    await assert.rejects(
        () => sendInviteEmail('manager-1', 'new@example.com', 'http://localhost:3000/employee-join.html', {
            WorkplaceModel: { findOne: async () => null },
            sendEmail: async () => {
                throw new Error('Email should not be sent');
            },
        }),
        (error) => error.statusCode === 404,
    );
});

test('sendInviteEmail emails the invite code and a pre-filled join link to the normalised address', async () => {
    let sent;
    let lookup;

    const result = await sendInviteEmail('manager-1', '  New.Hire@Example.com ', 'http://localhost:3000/employee-join.html', {
        WorkplaceModel: {
            findOne: async (filter) => {
                lookup = filter;
                return inviteWorkplace;
            },
        },
        sendEmail: async (message) => {
            sent = message;
            return { previewUrl: 'https://ethereal.email/message/abc' };
        },
    });

    assert.deepEqual(lookup, { manager_id: 'manager-1', active: true });
    assert.equal(sent.to, 'new.hire@example.com');
    assert.match(sent.subject, /Corner Cafe/);
    assert.match(sent.text, /RU-ABC234/);
    assert.match(sent.text, /http:\/\/localhost:3000\/employee-join\.html\?code=RU-ABC234/);
    assert.match(sent.html, /RU-ABC234/);
    assert.deepEqual(result, { email: 'new.hire@example.com', previewUrl: 'https://ethereal.email/message/abc' });
});

test('sendInviteEmail escapes the workplace name in the HTML email', async () => {
    let sent;

    await sendInviteEmail('manager-1', 'new@example.com', 'http://localhost:3000/employee-join.html', {
        WorkplaceModel: { findOne: async () => ({ ...inviteWorkplace, workplace_name: '<b>Cafe</b>' }) },
        sendEmail: async (message) => {
            sent = message;
            return {};
        },
    });

    assert.doesNotMatch(sent.html, /<b>Cafe<\/b>/);
    assert.match(sent.html, /&lt;b&gt;Cafe&lt;\/b&gt;/);
});

test('sendInviteEmail turns a delivery failure into a friendly 502', async () => {
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
        await assert.rejects(
            () => sendInviteEmail('manager-1', 'new@example.com', 'http://localhost:3000/employee-join.html', {
                WorkplaceModel: { findOne: async () => inviteWorkplace },
                sendEmail: async () => {
                    throw new Error('SMTP connection refused');
                },
            }),
            (error) => error.statusCode === 502 && !/SMTP/.test(error.message),
        );
    } finally {
        console.error = originalConsoleError;
    }
});
