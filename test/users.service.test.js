const test = require('node:test');
const assert = require('node:assert/strict');

const { getWorkplaceEmployeesService, getPendingEmployeesService } = require('../services/users.service');

function createUserQuery(result, captured) {
    return {
        select(fields) {
            captured.select = fields;
            return this;
        },
        sort(fields) {
            captured.sort = fields;
            return this;
        },
        lean() {
            return Promise.resolve(result);
        },
    };
}

test('getWorkplaceEmployeesService requires an authenticated manager', async () => {
    await assert.rejects(
        () => getWorkplaceEmployeesService(),
        (error) => error.statusCode === 401,
    );
});

test('getWorkplaceEmployeesService returns an empty list without a workplace', async () => {
    const employees = await getWorkplaceEmployeesService('manager-1', {
        WorkplaceModel: { findOne: async () => null },
        UserModel: {
            find: () => {
                throw new Error('Employee lookup should not run');
            },
        },
    });

    assert.deepEqual(employees, []);
});

test('getWorkplaceEmployeesService limits employees to the manager workplace', async () => {
    const expectedEmployees = [{ _id: 'employee-1' }];
    const captured = {};

    const employees = await getWorkplaceEmployeesService('manager-1', {
        WorkplaceModel: {
            findOne: async (filter) => {
                captured.workplaceFilter = filter;
                return { _id: 'workplace-1' };
            },
        },
        UserModel: {
            find: (filter) => {
                captured.employeeFilter = filter;
                return createUserQuery(expectedEmployees, captured);
            },
        },
    });

    assert.deepEqual(captured.workplaceFilter, {
        manager_id: 'manager-1',
        active: true,
    });
    assert.deepEqual(captured.employeeFilter, {
        role: 'employee',
        workplace: 'workplace-1',
        workplace_status: { $in: ['approved', 'pending'] },
        active: true,
    });
    assert.equal(captured.select, 'first_name last_name email workplace_status');
    assert.deepEqual(captured.sort, { first_name: 1, last_name: 1 });
    assert.deepEqual(employees, expectedEmployees);
});

function createSelectOnlyQuery(result, captured) {
    return {
        select(fields) {
            captured.select = fields;
            return result;
        },
    };
}

test('getPendingEmployeesService requires an authenticated manager', async () => {
    await assert.rejects(
        () => getPendingEmployeesService(),
        (error) => error.statusCode === 401,
    );
});

test('getPendingEmployeesService returns an empty list without a workplace', async () => {
    const employees = await getPendingEmployeesService('manager-1', {
        WorkplaceModel: { findOne: async () => null },
        UserModel: {
            find: () => {
                throw new Error('Employee lookup should not run');
            },
        },
    });

    assert.deepEqual(employees, []);
});

test('getPendingEmployeesService limits pending employees to the manager workplace', async () => {
    const expectedEmployees = [{ _id: 'employee-1', workplace_status: 'pending' }];
    const captured = {};

    const employees = await getPendingEmployeesService('manager-1', {
        WorkplaceModel: {
            findOne: async (filter) => {
                captured.workplaceFilter = filter;
                return { _id: 'workplace-1' };
            },
        },
        UserModel: {
            find: (filter) => {
                captured.employeeFilter = filter;
                return createSelectOnlyQuery(expectedEmployees, captured);
            },
        },
    });

    assert.deepEqual(captured.workplaceFilter, {
        manager_id: 'manager-1',
        active: true,
    });
    assert.deepEqual(captured.employeeFilter, {
        role: 'employee',
        workplace_status: 'pending',
        workplace: 'workplace-1',
        active: true,
    });
    assert.equal(captured.select, 'first_name last_name email role workplace_status');
    assert.deepEqual(employees, expectedEmployees);
});