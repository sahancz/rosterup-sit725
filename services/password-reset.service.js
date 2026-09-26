const crypto = require('crypto');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const emailService = require('./email.service');
const { validateNewPassword } = require('./users.service');

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createHttpError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// FR-03 step 1: "Forgot password?". Emails a one-time reset link valid for
// one hour. Resolves the same way whether or not the email has an account —
// the caller always shows the same message, so the form can't be used to
// find out who is registered. A failed send is logged rather than returned
// for the same reason (only real accounts trigger a send).
async function requestPasswordReset(email, resetUrl, dependencies = {}) {
    const UserModel = dependencies.UserModel || User;
    const sendEmail = dependencies.sendEmail || emailService.sendEmail;
    const createToken = dependencies.createToken || (() => crypto.randomBytes(32).toString('hex'));
    const now = dependencies.now || (() => Date.now());

    const address = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!address || address.length > 254 || !EMAIL_PATTERN.test(address)) {
        throw createHttpError('Please enter a valid email address.', 400);
    }

    const user = await UserModel.findOne({ email: address, active: true });
    if (!user) {
        return;
    }

    const token = createToken();
    user.password_reset_token_hash = hashToken(token);
    user.password_reset_expires = new Date(now() + RESET_TOKEN_TTL_MS);
    await user.save();

    const link = `${resetUrl}?token=${encodeURIComponent(token)}`;

    try {
        const result = await sendEmail({
            to: address,
            subject: 'Reset your RosterUp password',
            text: [
                `Hi ${user.first_name},`,
                '',
                'We received a request to reset your RosterUp password.',
                'Choose a new password here (the link works for 1 hour):',
                link,
                '',
                'If you didn\'t ask for this, you can ignore this email — your password won\'t change.',
            ].join('\n'),
            html: `
                <p>Hi ${escapeHtml(user.first_name)},</p>
                <p>We received a request to reset your RosterUp password.</p>
                <p><a href="${escapeHtml(link)}">Choose a new password</a> — the link works for 1 hour.</p>
                <p>If you didn't ask for this, you can ignore this email — your password won't change.</p>
            `,
        });

        // Test-inbox mode only (no SMTP configured): print where to read the
        // email, since it isn't delivered to a real inbox.
        if (result && result.previewUrl) {
            console.log(`Password reset email for ${address}: ${result.previewUrl}`);
        }
    } catch (error) {
        console.error('Failed to send password reset email:', error);
    }
}

// FR-03 step 2: set a new password using the token from the email link.
// The token only works once and only until it expires.
async function resetPassword(token, newPassword, dependencies = {}) {
    const UserModel = dependencies.UserModel || User;
    const hash = dependencies.hashPassword || ((password) => bcrypt.hash(password, 10));
    const now = dependencies.now || (() => Date.now());

    if (typeof token !== 'string' || !token) {
        throw createHttpError('This reset link is invalid or has expired.', 400);
    }

    validateNewPassword(newPassword);

    const user = await UserModel.findOne({
        password_reset_token_hash: hashToken(token),
        password_reset_expires: { $gt: new Date(now()) },
        active: true,
    });

    if (!user) {
        throw createHttpError('This reset link is invalid or has expired.', 400);
    }

    user.password_hashed = await hash(newPassword);
    user.password_reset_token_hash = null;
    user.password_reset_expires = null;
    await user.save();
}

module.exports = {
    requestPasswordReset,
    resetPassword,
    hashToken,
    RESET_TOKEN_TTL_MS,
};
