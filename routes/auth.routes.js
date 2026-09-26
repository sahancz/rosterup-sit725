const express = require('express');
const router = express.Router();

const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { forgotPassword, resetPassword } = require('../controllers/password-reset.controller');

//POST /auth/register
router.post('/register', authController.register);

//POST /auth/login
router.post('/login', authController.login);

//POST /auth/logout
router.post('/logout', authController.logout);

//GET /auth/me — current user's fresh profile (see controller for why)
router.get('/me', requireAuth, authController.me);

//POST /auth/forgot-password — email a password reset link (FR-03)
router.post('/forgot-password', forgotPassword);

//POST /auth/reset-password — set a new password from that link (FR-03)
router.post('/reset-password', resetPassword);

module.exports = router;