const Workplace = require('../models/Workplace');
const { generateUniqueInviteCode } = require('./invite-code.service');
const emailService = require('./email.service');

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

// Deliberately simple: one @, something either side, a dot in the domain,
// no spaces. Real validation is whether the email arrives.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Manager emails their workplace invite code to a new employee — FR-24.
// joinUrl is the employee registration page; the code is added to it as
// ?code= so the invite field is already filled in when they open the link.
async function sendInviteEmail(
    managerId,
    email,
    joinUrl,
    dependencies = {},
) {
    const WorkplaceModel = dependencies.WorkplaceModel || Workplace;
    const sendEmail = dependencies.sendEmail || emailService.sendEmail;

    if (!managerId) {
        const error = new Error('An authenticated manager is required');
        error.statusCode = 401;
        throw error;
    }

    const recipient = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!recipient || recipient.length > 254 || !EMAIL_PATTERN.test(recipient)) {
        const error = new Error('Please enter a valid email address.');
        error.statusCode = 400;
        throw error;
    }

    const workplace = await WorkplaceModel.findOne({ manager_id: managerId, active: true });

    if (!workplace) {
        const error = new Error('Set up your workplace before inviting employees.');
        error.statusCode = 404;
        throw error;
    }

    const code = workplace.invite_code;
    const link = `${joinUrl}?code=${encodeURIComponent(code)}`;
    const name = workplace.workplace_name;

    let result;
    try {
        result = await sendEmail({
            to: recipient,
            subject: `You're invited to join ${name} on RosterUp`,
            text: [
                `Hi,`,
                ``,
                `You've been invited to join ${name} on RosterUp.`,
                ``,
                `Your workplace invite code: ${code}`,
                ``,
                `Create your account here (the code is already filled in):`,
                link,
                ``,
                `Your manager will approve your request once you've registered.`,
            ].join('\n'),
            html: `
                <p>Hi,</p>
                <p>You've been invited to join <strong>${escapeHtml(name)}</strong> on RosterUp.</p>
                <p>Your workplace invite code:<br>
                   <strong style="font-size:1.25rem;letter-spacing:0.06em;">${escapeHtml(code)}</strong></p>
                <p><a href="${escapeHtml(link)}">Create your account</a> — the code is already filled in.</p>
                <p>Your manager will approve your request once you've registered.</p>
            `,
        });
    } catch (sendError) {
        console.error('Failed to send invite email:', sendError);
        const error = new Error('Could not send the email right now. Please try again.');
        error.statusCode = 502;
        throw error;
    }

    return {
        email: recipient,
        previewUrl: result && result.previewUrl ? result.previewUrl : null,
    };
}

module.exports = {
    createWorkplace,
    normaliseWorkplaceInput,
    validateWorkplaceInput,
    getWorkplaceByManagerId,
    updateWorkplaceByManagerId,
    regenerateInviteCode,
    sendInviteEmail,
};
