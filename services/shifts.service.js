const Shift = require('../models/Shift');
const Workplace = require('../models/Workplace');
const User = require('../models/User');
const { resolveUserWorkplaceId } = require('./chat-room.service');

function createHttpError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

// Employee (or manager) posts one of their own shifts for cover — FR-15.
// workplace and posted_by are always resolved server-side from the
// authenticated user rather than trusted from the request body — the old
// version accepted both directly from the client, which would have let
// anyone post a shift into any workplace under anyone else's name.
async function postShiftsService(shiftInput, userId, dependencies = {}) {
    if (!userId) {
        throw createHttpError('An authenticated user is required', 401);
    }

    const allowedFields = [
        'shift_date',
        'start_time',
        'end_time',
        'shift_role',
        'note'
    ];

    for (const field in shiftInput) {
        if (!allowedFields.includes(field)) {
            throw new Error(`Invalid create field: ${field}`);
        }
    }

    const ShiftModel = dependencies.ShiftModel || Shift;
    const UserModel = dependencies.UserModel || User;
    const resolveWorkplaceId = dependencies.resolveUserWorkplaceId || resolveUserWorkplaceId;

    const user = await UserModel.findById(userId);
    const workplaceId = user && await resolveWorkplaceId(user, dependencies);

    if (!workplaceId) {
        throw createHttpError('You must belong to an active workplace to post a shift.', 400);
    }

    const shiftObject = {
        workplace: workplaceId,
        posted_by: userId,
        shift_date: shiftInput.shift_date,
        start_time: shiftInput.start_time,
        end_time: shiftInput.end_time,
        shift_role: shiftInput.shift_role,
        note: shiftInput.note
    };

    return await ShiftModel.create(shiftObject);
}


// Employee withdraws a claim they made on a shift — FR-13's undo path. Only
// the employee who actually claimed the shift can withdraw it (scoped by
// claimed_by in the filter, same atomic-update trick as claimShift), so one
// employee can't reopen a shift someone else claimed.
async function withdrawShiftsService(shiftId, userId, dependencies = {}) {
    if (!userId) {
        throw createHttpError('An authenticated user is required', 401);
    }

    const ShiftModel = dependencies.ShiftModel || Shift;

    const shift = await ShiftModel.findOneAndUpdate(
        {
            _id: shiftId,
            claimed_by: userId,
            status: 'pending',
        },
        {
            claimed_by: null,
            status: 'open'
        },
        { new: true }
    );

    return shift;
}

// Employee withdraws a shift they posted themselves — FR-23. The other
// direction from withdrawShiftsService above: that one undoes a claim on
// someone else's shift, this one takes your own posted shift off the board.
// Only allowed while the shift is still 'open' (no one has claimed it yet),
// and it's marked 'cancelled' rather than deleted so it still shows up in
// shift history. posted_by and status are both in the filter so the check
// and the update happen in one atomic step, same as claimShift.
async function withdrawPostedShiftService(shiftId, userId, dependencies = {}) {
    if (!userId) {
        throw createHttpError('An authenticated user is required', 401);
    }

    const ShiftModel = dependencies.ShiftModel || Shift;

    const shift = await ShiftModel.findOneAndUpdate(
        {
            _id: shiftId,
            posted_by: userId,
            status: 'open',
        },
        { status: 'cancelled' },
        { new: true }
    );

    if (!shift) {
        throw createHttpError('Open shift not found, or it was not posted by you.', 404);
    }

    return shift;
}

async function getShiftsService(filter, userId, dependencies = {}) {
    if (!userId) {
        throw createHttpError('An authenticated user is required', 401);
    }

    const ShiftModel = dependencies.ShiftModel || Shift;
    const UserModel = dependencies.UserModel || User;
    const resolveWorkplaceId = dependencies.resolveUserWorkplaceId || resolveUserWorkplaceId;
    const user = await UserModel.findById(userId);
    const workplaceId = user && await resolveWorkplaceId(user, dependencies);

    if (!workplaceId) {
        return [];
    }

    const scopedFilter = {
        ...filter,
        workplace: workplaceId,
    };

    const shifts = await ShiftModel.find(scopedFilter)
        .populate('posted_by', 'first_name last_name')
        .sort({ shift_date: 1, start_time: 1 });
    return shifts;
}

async function listPendingClaims(managerId, dependencies = {}) {
    if (!managerId) {
        throw createHttpError('An authenticated manager is required', 401);
    }

    const ShiftModel = dependencies.ShiftModel || Shift;
    const WorkplaceModel = dependencies.WorkplaceModel || Workplace;
    const workplace = await WorkplaceModel.findOne({
        manager_id: managerId,
        active: true,
    });

    if (!workplace) {
        return [];
    }

    return ShiftModel.find({
        workplace: workplace._id,
        status: 'pending',
        claimed_by: { $ne: null },
    })
        .populate('posted_by', 'first_name last_name email')
        .populate('claimed_by', 'first_name last_name email')
        .sort({ shift_date: 1, start_time: 1 })
        .lean();
}

// Employee claims an open shift — FR-13 / FR-14. The shift moves straight
// to 'pending' (not 'covered') so the claim still needs manager review via
// processShiftClaim below; scoping to status: 'open' in the filter (rather
// than checking shift.status after the fact) also makes this atomic, so two
// employees racing to claim the same shift can't both succeed.
async function claimShift(shiftId, employeeId, dependencies = {}) {
    if (!employeeId) {
        throw createHttpError('An authenticated employee is required', 401);
    }

    const ShiftModel = dependencies.ShiftModel || Shift;

    const shift = await ShiftModel.findOneAndUpdate(
        {
            _id: shiftId,
            status: 'open',
        },
        {
            claimed_by: employeeId,
            status: 'pending',
        },
        { new: true }
    );

    if (!shift) {
        throw createHttpError('Open shift not found.', 404);
    }

    return shift;
}

const VALID_CLAIM_ACTIONS = ['approve', 'reject'];

// Manager approves (mark covered) or rejects (reopen) a pending shift
// claim — FR-18 / FR-19. Mirrors listPendingClaims' own pattern for
// resolving "this manager's workplace", and manager.controller.js's
// processEmployeeRequest for using one generic "not found" message
// whether the shift doesn't exist, isn't pending, or belongs to a
// different manager's workplace, so a manager can't learn anything about
// another workplace's shifts just by guessing ids.
async function processShiftClaim(shiftId, managerId, action, dependencies = {}) {
    if (!managerId) {
        throw createHttpError('An authenticated manager is required', 401);
    }

    if (!VALID_CLAIM_ACTIONS.includes(action)) {
        throw createHttpError("Invalid action. Must be 'approve' or 'reject'.", 400);
    }

    const ShiftModel = dependencies.ShiftModel || Shift;
    const WorkplaceModel = dependencies.WorkplaceModel || Workplace;

    const workplace = await WorkplaceModel.findOne({
        manager_id: managerId,
        active: true,
    });

    if (!workplace) {
        throw createHttpError('Shift claim not found.', 404);
    }

    const shift = await ShiftModel.findOne({
        _id: shiftId,
        workplace: workplace._id,
        status: 'pending',
        claimed_by: { $ne: null },
    });

    if (!shift) {
        throw createHttpError('Shift claim not found.', 404);
    }

    if (action === 'approve') {
        shift.status = 'covered';
    } else {
        // Reject: back to the open pool for someone else to claim.
        shift.status = 'open';
        shift.claimed_by = null;
    }

    await shift.save();
    return shift;
}

module.exports = {
    getShiftsService,
    listPendingClaims,
    postShiftsService,
    withdrawShiftsService,
    withdrawPostedShiftService,
    claimShift,
    processShiftClaim,
};
    
