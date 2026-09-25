const express = require('express');
const router = express.Router();
const { getOpenShiftsController, listPendingClaims, processShiftClaim, claimShift, postShiftsController, withdrawShiftsController, withdrawPostedShift } = require('../controllers/shifts.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');


function notImplemented(req, res) {
    return res.status(501).json({
        error: 'This shift operation has not been implemented yet',
    });
}

// Create / Post a shift for cover
router.post('/', requireAuth, postShiftsController);

// Get Shifts
router.get('/', requireAuth, getOpenShiftsController);

// Manager Lists Pending Shift Claims
// (The controller itself already checks req.user and the manager role, but
// without requireAuth here req.user is never set at all — every request
// hit the 401 branch regardless of token. Same class of bug as the
// manager.routes.js pattern this mirrors.)
router.get('/claims', requireAuth, requireRole('manager'), listPendingClaims);
// Employee who claimed shift withdraws claim
router.put('/withdraw', requireAuth, withdrawShiftsController);

// Get Shift by ID
router.get('/:id', notImplemented);

// Update Shift by ID
router.put('/:id', notImplemented);

// Employee Claims Shift
router.post('/:id/claim', requireAuth, claimShift);

// Manager Approves / Rejects Employee Shift Claim
// (The Trello card describes this as a PATCH endpoint, but this route was
// already scaffolded here as PUT before the card was picked up — kept PUT
// rather than adding a second route for the same action.)
router.put('/:id/claim', requireAuth, requireRole('manager'), processShiftClaim);

// Original Employee Withdraws Shift
router.post('/:id/withdraw', requireAuth, withdrawPostedShift);

module.exports = router;
