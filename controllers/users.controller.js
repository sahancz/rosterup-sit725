const usersService = require('../services/users.service');

function errorResponse(res, error, fallbackMessage) {
    const statusCode = error.statusCode || 500;

    return res.status(statusCode).json({
        success: false,
        message: statusCode === 500 ? fallbackMessage : error.message,
    });
}

// PUT /api/users/me — update the signed-in user's name and email (FR-22).
function buildUpdateProfileController(service = usersService) {
    return async function updateProfile(req, res) {
        try {
            const userId = req.user?.id || req.user?._id;
            const user = await service.updateProfileService(userId, req.body || {});

            return res.status(200).json({
                success: true,
                message: 'Profile updated.',
                user,
            });
        } catch (error) {
            return errorResponse(res, error, 'Unable to update profile');
        }
    };
}

// PUT /api/users/me/password — change the signed-in user's password (FR-22).
function buildChangePasswordController(service = usersService) {
    return async function changePassword(req, res) {
        try {
            const userId = req.user?.id || req.user?._id;
            await service.changePasswordService(userId, req.body || {});

            return res.status(200).json({
                success: true,
                message: 'Password updated.',
            });
        } catch (error) {
            return errorResponse(res, error, 'Unable to change password');
        }
    };
}

module.exports = {
    buildUpdateProfileController,
    updateProfile: buildUpdateProfileController(),
    buildChangePasswordController,
    changePassword: buildChangePasswordController(),
};
