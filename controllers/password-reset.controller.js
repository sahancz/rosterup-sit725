const passwordResetService = require('../services/password-reset.service');

const RESET_REQUESTED_MESSAGE = 'If an account exists for that email, we\'ve sent a link to reset your password.';

function errorResponse(res, error, fallbackMessage) {
    const statusCode = error.statusCode || 500;

    return res.status(statusCode).json({
        success: false,
        message: statusCode === 500 ? fallbackMessage : error.message,
    });
}

// POST /api/auth/forgot-password — FR-03. Always the same answer whether or
// not the email has an account.
function buildForgotPasswordController(service = passwordResetService) {
    return async function forgotPassword(req, res) {
        try {
            const { email } = req.body || {};
            const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;

            await service.requestPasswordReset(email, `${baseUrl}/reset-password.html`);

            return res.status(200).json({ success: true, message: RESET_REQUESTED_MESSAGE });
        } catch (error) {
            return errorResponse(res, error, 'Unable to process the request');
        }
    };
}

// POST /api/auth/reset-password — FR-03. Sets a new password from the
// emailed token.
function buildResetPasswordController(service = passwordResetService) {
    return async function resetPassword(req, res) {
        try {
            const { token, password } = req.body || {};

            await service.resetPassword(token, password);

            return res.status(200).json({
                success: true,
                message: 'Your password has been reset. You can now sign in.',
            });
        } catch (error) {
            return errorResponse(res, error, 'Unable to reset password');
        }
    };
}

module.exports = {
    RESET_REQUESTED_MESSAGE,
    buildForgotPasswordController,
    forgotPassword: buildForgotPasswordController(),
    buildResetPasswordController,
    resetPassword: buildResetPasswordController(),
};
