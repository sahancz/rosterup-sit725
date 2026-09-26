const mongoose = require('mongoose');

const ShiftSchema = new mongoose.Schema({
    workplace: {type: mongoose.Schema.Types.ObjectId, ref: 'Workplace', required: true},
    posted_by: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    claimed_by: {type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null},
    shift_date: {type: Date, required: true},
    start_time: {type: String, required: true},
    end_time: {type: String, required: true},
    shift_role: {type: String, required: true, trim: true, maxlength: 100},
    note: {type: String, trim: true, maxlength: 500},
    status: {type: String, enum: ['open', 'pending', 'covered', 'cancelled'], default: 'open'},
    // Every manager decision on a claim, kept so shift history can still
    // show a rejected claim after claimed_by has been cleared (FR-16).
    claim_history: [{
        _id: false,
        employee: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
        outcome: {type: String, enum: ['approved', 'rejected'], required: true},
        decided_at: {type: Date, default: Date.now},
        // Why the manager rejected the claim — required for 'rejected'.
        reason: {type: String, trim: true, maxlength: 300}
    }],
    // Why the poster withdrew their own shift — optional (FR-23).
    cancel_reason: {type: String, trim: true, maxlength: 300}
}, {
    timestamps: true,
    toJSON: {getters: true, virtuals: false},
    toObject: {getters: true, virtuals: false}
});

module.exports = mongoose.model('Shift', ShiftSchema);