const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    first_name: {type: String, required: true, trim: true, maxlength: 50},
    last_name: {type: String, required: true, trim: true, maxlength: 50},
    email: {type: String, required: true, unique: true, index: true, trim: true, lowercase: true},
    password_hashed: {type: String, required: true},
    role: {type: String, required: true, enum: ['manager', 'employee']},
    workplace: {type: mongoose.Schema.Types.ObjectId, ref: 'Workplace', default: null},
    workplace_status: {type: String, enum: ['pending', 'approved', 'rejected'], default: null},
    active: {type: Boolean, default: true},
    // FR-03 password reset. Only a SHA-256 hash of the emailed token is
    // stored (like the password itself), so a leaked database can't be used
    // to reset anyone's password. Cleared once the reset is used.
    password_reset_token_hash: {type: String, default: null},
    password_reset_expires: {type: Date, default: null}
}, {
    timestamps: true,
    toJSON: {getters: true, virtuals: false},
    toObject: {getters: true, virtuals: false}
});

module.exports = mongoose.model('User', UserSchema);