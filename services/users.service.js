const bcrypt = require('bcrypt');
const userModel = require('../models/User');
const workplaceModel = require('../models/Workplace');

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createHttpError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

// The same user shape login and /api/auth/me return — never the password hash.
function toPublicUser(user) {
    return {
        id: user._id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: user.role,
        workplace_status: user.workplace_status,
    };
}

// Shared by change password (FR-22) and password reset (FR-03), so both
// apply the same rule.
function validateNewPassword(password) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        throw createHttpError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`, 400);
    }
}

async function getUsersService(filter) {

    const users = await userModel.find(filter);
    return users;
};

async function getWorkplaceEmployeesService(managerId, dependencies = {}) {
    if (!managerId) {
        const error = new Error('An authenticated manager is required');
        error.statusCode = 401;
        throw error;
    }

    const UserModel = dependencies.UserModel || userModel;
    const WorkplaceModel = dependencies.WorkplaceModel || workplaceModel;
    const workplace = await WorkplaceModel.findOne({
        manager_id: managerId,
        active: true,
    });

    if (!workplace) {
        return [];
    }

    return UserModel.find({
        role: 'employee',
        workplace: workplace._id,
        workplace_status: { $in: ['approved', 'pending'] },
        active: true,
    })
        .select('first_name last_name email workplace_status')
        .sort({ first_name: 1, last_name: 1 })
        .lean();
}

// Employees awaiting approval into the manager's own workplace. Scoped the
// same way getWorkplaceEmployeesService is scoped, so one manager can't see
// another manager's pending requests just by hitting the endpoint.
async function getPendingEmployeesService(managerId, dependencies = {}) {
    if (!managerId) {
        const error = new Error('An authenticated manager is required');
        error.statusCode = 401;
        throw error;
    }

    const UserModel = dependencies.UserModel || userModel;
    const WorkplaceModel = dependencies.WorkplaceModel || workplaceModel;

    const workplace = await WorkplaceModel.findOne({
        manager_id: managerId,
        active: true,
    });

    if (!workplace) {
        return [];
    }

    return UserModel.find({
        role: 'employee',
        workplace_status: 'pending',
        workplace: workplace._id,
        active: true,
    }).select('first_name last_name email role workplace_status');
}

// FR-22: the signed-in user updates their own name and email. Always acts
// on the id from the token, never an id from the URL, so nobody can edit
// someone else's profile.
async function updateProfileService(userId, input = {}, dependencies = {}) {
    if (!userId) {
        throw createHttpError('An authenticated user is required', 401);
    }

    const UserModel = dependencies.UserModel || userModel;
    const firstName = typeof input.first_name === 'string' ? input.first_name.trim() : '';
    const lastName = typeof input.last_name === 'string' ? input.last_name.trim() : '';
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';

    if (!firstName || !lastName || !email) {
        throw createHttpError('First name, last name and email are required.', 400);
    }
    if (firstName.length > 50 || lastName.length > 50) {
        throw createHttpError('Names must be 50 characters or fewer.', 400);
    }
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
        throw createHttpError('Please enter a valid email address.', 400);
    }

    const user = await UserModel.findById(userId);
    if (!user || !user.active) {
        throw createHttpError('Account not found.', 404);
    }

    if (email !== user.email) {
        const taken = await UserModel.findOne({ email, _id: { $ne: user._id } });
        if (taken) {
            throw createHttpError('An account with this email address already exists.', 409);
        }
    }

    user.first_name = firstName;
    user.last_name = lastName;
    user.email = email;
    await user.save();

    return toPublicUser(user);
}

// FR-22: change password. The current password has to be confirmed first,
// so a session left open on a shared computer can't be used to lock the
// owner out. A wrong current password is a 400, not a 401 — the session
// itself is still valid, so the client shouldn't sign the user out.
async function changePasswordService(userId, input = {}, dependencies = {}) {
    if (!userId) {
        throw createHttpError('An authenticated user is required', 401);
    }

    const UserModel = dependencies.UserModel || userModel;
    const compare = dependencies.comparePassword || bcrypt.compare;
    const hash = dependencies.hashPassword || ((password) => bcrypt.hash(password, 10));
    const { current_password: currentPassword, new_password: newPassword } = input;

    if (!currentPassword || !newPassword) {
        throw createHttpError('Please enter your current password and a new password.', 400);
    }

    validateNewPassword(newPassword);

    if (newPassword === currentPassword) {
        throw createHttpError('New password must be different from your current password.', 400);
    }

    const user = await UserModel.findById(userId);
    if (!user || !user.active) {
        throw createHttpError('Account not found.', 404);
    }

    const matches = await compare(currentPassword, user.password_hashed);
    if (!matches) {
        throw createHttpError('Current password is incorrect.', 400);
    }

    user.password_hashed = await hash(newPassword);
    await user.save();
}

module.exports = {
    getUsersService,
    updateProfileService,
    changePasswordService,
    validateNewPassword,
    toPublicUser,
    MIN_PASSWORD_LENGTH,
    getWorkplaceEmployeesService,
    getPendingEmployeesService,
};