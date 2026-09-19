const Workplace = require('../models/Workplace');
const { generateUniqueInviteCode } = require('./invite-code.service');

const REQUIRED_FIELDS = [
    'workplace_name',
    'workplace_type',
    'workplace_address',
    'workplace_town',
    'workplace_postcode',
];

function normaliseWorkplaceInput(input = {}) {
    return REQUIRED_FIELDS.reduce((workplace, field) => {
        workplace[field] = typeof input[field] === 'string'
            ? input[field].trim()
            : input[field];
        return workplace;
    }, {});
}

function validateWorkplaceInput(input) {
    const missingFields = REQUIRED_FIELDS.filter((field) => !input[field]);

    if (missingFields.length > 0) {
        const error = new Error(
            `Missing required workplace fields: ${missingFields.join(', ')}`,
        );
        error.statusCode = 400;
        throw error;
    }
}

async function createWorkplace(
    input,
    managerId,
    dependencies = {},
) {
    const WorkplaceModel = dependencies.WorkplaceModel || Workplace;
    const inviteCodeGenerator = dependencies.inviteCodeGenerator
        || (() => generateUniqueInviteCode(WorkplaceModel));
    const workplaceInput = normaliseWorkplaceInput(input);

    validateWorkplaceInput(workplaceInput);

    if (!managerId) {
        const error = new Error('An authenticated manager is required');
        error.statusCode = 401;
        throw error;
    }

    const inviteCode = await inviteCodeGenerator();

    return WorkplaceModel.create({
        ...workplaceInput,
        invite_code: inviteCode,
        manager_id: managerId,
    });
}

// Looks up the workplace a manager already owns, if any. Used by the
// frontend to decide whether a manager still needs to go through workplace
// setup (a manager can only ever have one workplace right now — there's no
// multi-workplace support anywhere else in the app either).
async function getWorkplaceByManagerId(
    managerId,
    dependencies = {},
) {
    const WorkplaceModel = dependencies.WorkplaceModel || Workplace;

    if (!managerId) {
        const error = new Error('An authenticated manager is required');
        error.statusCode = 401;
        throw error;
    }

    return WorkplaceModel.findOne({ manager_id: managerId });
}

async function updateWorkplaceByManagerId(
    input,
    managerId,
    dependencies = {},
) {
    const WorkplaceModel = dependencies.WorkplaceModel || Workplace;
    const workplaceInput = normaliseWorkplaceInput(input);

    validateWorkplaceInput(workplaceInput);

    if (!managerId) {
        const error = new Error('An authenticated manager is required');
        error.statusCode = 401;
        throw error;
    }

    const workplace = await WorkplaceModel.findOneAndUpdate(
        { manager_id: managerId, active: true },
        { $set: workplaceInput },
        { new: true, runValidators: true },
    );

    if (!workplace) {
        const error = new Error('Workplace not found');
        error.statusCode = 404;
        throw error;
    }

    return workplace;
}

async function regenerateInviteCode(
    managerId,
    dependencies = {},
) {
    const WorkplaceModel = dependencies.WorkplaceModel || Workplace;
    const inviteCodeGenerator = dependencies.inviteCodeGenerator
        || (() => generateUniqueInviteCode(WorkplaceModel));

    if (!managerId) {
        const error = new Error('An authenticated manager is required');
        error.statusCode = 401;
        throw error;
    }

    const inviteCode = await inviteCodeGenerator();
    const workplace = await WorkplaceModel.findOneAndUpdate(
        { manager_id: managerId, active: true },
        { $set: { invite_code: inviteCode } },
        { new: true, runValidators: true },
    );

    if (!workplace) {
        const error = new Error('Workplace not found');
        error.statusCode = 404;
        throw error;
    }

    return workplace;
}

module.exports = {
    createWorkplace,
    normaliseWorkplaceInput,
    validateWorkplaceInput,
    getWorkplaceByManagerId,
    updateWorkplaceByManagerId,
    regenerateInviteCode,
};
