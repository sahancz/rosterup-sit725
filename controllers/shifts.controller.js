const shiftsService = require('../services/shifts.service');

function buildPostShiftsController(service = shiftsService) {
    return async function postShiftsController(req, res) {
        try {
            const employeeId = req.user?.id || req.user?._id;

            if (!employeeId) {
                return res.status(401).json({ message: 'Authentication required.' });
            }

            const shiftBody = req.body;

            const postedShift = await service.postShiftsService(shiftBody, employeeId);

            res.status(200).json(postedShift);
        } catch (error) {
            const statusCode = error.statusCode || 500;

            if (error.name == "ValidationError") {
                res.status(500).json({message: `Data inputted incorrectly. Please check the ${Object.keys(error.errors).join(", ")} fields and ensure they are inputted correctly.`})
            } else if (statusCode !== 500) {
                res.status(statusCode).json({ message: error.message });
            } else {
                res.status(500).json({ message: error.message, error: error });
            }
        }
    };
}

const postShiftsController = buildPostShiftsController();

function buildWithdrawShiftsController(service = shiftsService) {
    return async function withdrawShiftsController(req, res) {
        try {
            const employeeId = req.user?.id || req.user?._id;

            if (!employeeId) {
                return res.status(401).json({ message: 'Authentication required.' });
            }

            const { shiftId } = req.query;

            if (!shiftId) {
                return res.status(400).json({
                    message: 'shiftId is required'
                });
            }

            const withdrawnShift = await service.withdrawShiftsService(shiftId, employeeId);

            if (!withdrawnShift) {
                return res.status(404).json({
                    message: 'Shift not found, or it is not a pending claim of yours'
                });
            }

            return res.status(200).json(withdrawnShift);

        } catch (error) {
            const statusCode = error.statusCode || 500;
            return res.status(statusCode).json({
                message: error.message
            });
        }
    };
}

const withdrawShiftsController = buildWithdrawShiftsController();

function buildGetOpenShiftsController(service = shiftsService) {
    return async function getOpenShifts(req, res) {
        try {
            const userId = req.user?.id || req.user?._id;

            if (!userId) {
                return res.status(401).json({ message: 'Authentication required.' });
            }

            const { status, claimed_by, posted_by } = req.query || {};
            const filter = { status: status || 'open' };

            if (claimed_by) filter.claimed_by = claimed_by;
            if (posted_by) filter.posted_by = posted_by;

            const shifts = await service.getShiftsService(filter, userId);

            return res.status(200).json(shifts);
        } catch (error) {
            const statusCode = error.statusCode || 500;

            return res.status(statusCode).json({ message: error.message });
        }
    };
}

const getOpenShiftsController = buildGetOpenShiftsController();

// GET /shifts/history — the caller's own shift history (FR-16).
function buildGetShiftHistoryController(service = shiftsService) {
    return async function getShiftHistory(req, res) {
        try {
            const userId = req.user?.id || req.user?._id;

            if (!userId) {
                return res.status(401).json({
                    error: 'An authenticated user is required',
                });
            }

            const history = await service.getShiftHistoryService(userId);

            return res.status(200).json({ history });
        } catch (error) {
            const statusCode = error.statusCode || 500;

            return res.status(statusCode).json({
                error: statusCode === 500
                    ? 'Unable to load shift history'
                    : error.message,
            });
        }
    };
}

const getShiftHistory = buildGetShiftHistoryController();

function buildListPendingClaimsController(service = shiftsService) {
    return async function listPendingClaims(req, res) {
        try {
            const managerId = req.user?.id || req.user?._id;

            if (!managerId) {
                return res.status(401).json({
                    error: 'An authenticated manager is required',
                });
            }

            if (req.user.role && req.user.role !== 'manager') {
                return res.status(403).json({
                    error: 'Manager access is required',
                });
            }

            const claims = await service.listPendingClaims(managerId);

            return res.status(200).json({ claims });
        } catch (error) {
            const statusCode = error.statusCode || 500;

            return res.status(statusCode).json({
                error: statusCode === 500
                    ? 'Unable to load pending claims'
                    : error.message,
            });
        }
    };
}

const listPendingClaims = buildListPendingClaimsController();

// PUT /shifts/:id/claim — manager approves or rejects a pending claim.
function buildProcessShiftClaimController(service = shiftsService) {
    return async function processShiftClaim(req, res) {
        try {
            const managerId = req.user?.id || req.user?._id;
            const { id } = req.params;
            const { action, reason } = req.body || {};

            const shift = await service.processShiftClaim(id, managerId, action, reason);

            return res.status(200).json({ shift });
        } catch (error) {
            const statusCode = error.statusCode || 500;

            return res.status(statusCode).json({
                error: statusCode === 500
                    ? 'Unable to process shift claim'
                    : error.message,
            });
        }
    };
}

const processShiftClaim = buildProcessShiftClaimController();

// POST /shifts/:id/claim — employee claims an open shift (FR-13 / FR-14).
function buildClaimShiftController(service = shiftsService) {
    return async function claimShift(req, res) {
        try {
            const employeeId = req.user?.id || req.user?._id;
            const { id } = req.params;

            if (!employeeId) {
                return res.status(401).json({
                    error: 'An authenticated employee is required',
                });
            }

            const shift = await service.claimShift(id, employeeId);

            return res.status(200).json({ shift });
        } catch (error) {
            const statusCode = error.statusCode || 500;

            return res.status(statusCode).json({
                error: statusCode === 500
                    ? 'Unable to claim shift'
                    : error.message,
            });
        }
    };
}

const claimShift = buildClaimShiftController();

// POST /shifts/:id/withdraw — employee withdraws a shift they posted (FR-23).
function buildWithdrawPostedShiftController(service = shiftsService) {
    return async function withdrawPostedShift(req, res) {
        try {
            const userId = req.user?.id || req.user?._id;
            const { id } = req.params;

            if (!userId) {
                return res.status(401).json({
                    error: 'An authenticated user is required',
                });
            }

            const { reason } = req.body || {};

            const shift = await service.withdrawPostedShiftService(id, userId, reason);

            return res.status(200).json({ shift });
        } catch (error) {
            const statusCode = error.statusCode || 500;

            return res.status(statusCode).json({
                error: statusCode === 500
                    ? 'Unable to withdraw shift'
                    : error.message,
            });
        }
    };
}

const withdrawPostedShift = buildWithdrawPostedShiftController();

module.exports = {
    buildGetOpenShiftsController,
    getOpenShiftsController,
    buildGetShiftHistoryController,
    getShiftHistory,
    buildListPendingClaimsController,
    listPendingClaims,
    buildProcessShiftClaimController,
    processShiftClaim,
    buildClaimShiftController,
    claimShift,
    buildPostShiftsController,
    postShiftsController,
    buildWithdrawShiftsController,
    withdrawShiftsController,
    buildWithdrawPostedShiftController,
    withdrawPostedShift
};