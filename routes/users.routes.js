const express = require('express');
const router = express.Router();
const { updateProfile, changePassword } = require('../controllers/users.controller');
const { requireAuth } = require('../middleware/auth.middleware');

function notImplemented(req, res) {
    return res.status(501).json({
        error: 'This user operation has not been implemented yet',
    });
}

// The signed-in user's own profile and password (FR-22). These act on the
// id in the token, so they must stay above the /:id routes below or Express
// would treat "me" as an id. (Reading the profile is GET /api/auth/me.)
router.put('/me', requireAuth, updateProfile);
router.put('/me/password', requireAuth, changePassword);

// Get user/profile details
router.get('/:id', notImplemented);

// Update profile details
router.put('/:id', notImplemented);

// Change password
router.put('/:id/password', notImplemented);

// Approve/reject an employee  
router.put('/:id/status', notImplemented);

module.exports = router;