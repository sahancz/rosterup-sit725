const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createWorkplace,
    getWorkplaceByManagerId,
    updateWorkplaceByManagerId,
    regenerateInviteCode,
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
