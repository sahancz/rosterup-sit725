const express = require('express');
const router = express.Router();
const managerController = require('../controllers/manager.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');

//GET request to fetch pending rows
router.get('/pending-employees', requireAuth, requireRole('manager'), managerController.getPendingEmployees);

router.get('/employees', requireAuth, requireRole('manager'), managerController.getManagerEmployees);

router.get('/shifts', requireAuth, requireRole('manager'), managerController.getManagerShifts);

//PATCH request to update pending status triggers
router.patch('/process-employee/:id', requireAuth, requireRole('manager'), managerController.processEmployeeRequest);

module.exports = router;
