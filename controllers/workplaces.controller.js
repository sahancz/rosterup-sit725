const workplaceService = require('../services/workplaces.service');

function buildCreateWorkplaceController(service = workplaceService) {
    return async function createWorkplace(req, res) {
        try {
            const managerId = req.user?.id || req.user?._id;
            const workplace = await service.createWorkplace(
                req.body,
                managerId,
            );

            return res.status(201).json({
                message: 'Workplace created successfully',
                workplace,
            });
        } catch (error) {
            if (error.code === 11000 && error.keyPattern?.invite_code) {
                return res.status(409).json({
                    error: 'Invite code already exists. Please try again.',
                });
            }

            const statusCode = error.statusCode
                || (error.name === 'ValidationError' ? 400 : 500);

            return res.status(statusCode).json({
                error: statusCode === 500
                    ? 'Unable to create workplace'
                    : error.message,
            });
        }
    };
}

const createWorkplace = buildCreateWorkplaceController();

// GET /api/workplaces/mine — does the signed-in manager already have a
// workplace? Returns { workplace: null } rather than 404 when they don't,
// since "no workplace yet" is an expected state (e.g. right after
// registering), not an error.
function buildGetMyWorkplaceController(service = workplaceService) {
    return async function getMyWorkplace(req, res) {
        try {
            const managerId = req.user?.id || req.user?._id;
            const workplace = await service.getWorkplaceByManagerId(managerId);

            return res.status(200).json({ workplace: workplace || null });
        } catch (error) {
            const statusCode = error.statusCode || 500;

            return res.status(statusCode).json({
                error: statusCode === 500
                    ? 'Unable to load workplace'
                    : error.message,
            });
        }
    };
}

const getMyWorkplace = buildGetMyWorkplaceController();

function buildUpdateMyWorkplaceController(service = workplaceService) {
    return async function updateMyWorkplace(req, res) {
        try {
            const managerId = req.user?.id || req.user?._id;
            const workplace = await service.updateWorkplaceByManagerId(
                req.body,
                managerId,
            );

            return res.status(200).json({ workplace });
        } catch (error) {
            const statusCode = error.statusCode
                || (error.name === 'ValidationError' ? 400 : 500);

            return res.status(statusCode).json({
                error: statusCode === 500
                    ? 'Unable to update workplace'
                    : error.message,
            });
        }
    };
}

const updateMyWorkplace = buildUpdateMyWorkplaceController();

function buildRegenerateInviteCodeController(service = workplaceService) {
    return async function regenerateInviteCode(req, res) {
        try {
            const managerId = req.user?.id || req.user?._id;
            const workplace = await service.regenerateInviteCode(managerId);

            return res.status(200).json({ workplace });
        } catch (error) {
            const statusCode = error.statusCode || 500;

            return res.status(statusCode).json({
                error: statusCode === 500
                    ? 'Unable to regenerate invite code'
                    : error.message,
            });
        }
    };
}

const regenerateInviteCode = buildRegenerateInviteCodeController();

module.exports = {
    buildCreateWorkplaceController,
    createWorkplace,
    buildGetMyWorkplaceController,
    getMyWorkplace,
    buildUpdateMyWorkplaceController,
    updateMyWorkplace,
    buildRegenerateInviteCodeController,
    regenerateInviteCode,
};
