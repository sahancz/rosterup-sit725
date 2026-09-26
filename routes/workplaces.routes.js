const express = require('express');
const router = express.Router();
const {
    createWorkplace,
    getMyWorkplace,
    updateMyWorkplace,
    regenerateInviteCode,
    sendInviteEmail,
} = require('../controllers/workplaces.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');

function notImplemented(req, res) {
    return res.status(501).json({
        error: 'This workplace operation has not been implemented yet',
    });
}

// Create workplace
// (The controller reads req.user to attach the workplace to its manager —
// without requireAuth here req.user was never set, so this unconditionally
// 401'd regardless of token. Same class of bug already fixed on
// shifts.routes.js's GET /claims.)
router.post('/', requireAuth, requireRole('manager'), createWorkplace);

// Does the signed-in manager already have a workplace? Used by the
// frontend to decide whether to send a manager to workplace setup after
// login, or straight to their dashboard. Must be declared before GET /:id
// so "mine" isn't swallowed as an :id value.
router.get('/mine', requireAuth, requireRole('manager'), getMyWorkplace);
router.put('/mine', requireAuth, requireRole('manager'), updateMyWorkplace);
router.post('/mine/invite-code', requireAuth, requireRole('manager'), regenerateInviteCode);
// Email the invite code to a new employee (FR-24).
router.post('/mine/invite-email', requireAuth, requireRole('manager'), sendInviteEmail);

// Get all workplaces
router.get('/', notImplemented);

// Get workplace details
router.get('/:id', notImplemented);

// Update workplace details 
router.put('/:id', notImplemented);

// Employee joins using invite code
router.post('/join', notImplemented);

// Regenerate invite code   
router.post('/:id/invite-code', notImplemented);

module.exports = router;
