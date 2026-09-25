const User = require('../models/User');
const Workplace = require('../models/Workplace');
const usersService = require('../services/users.service');
const shiftsService = require('../services/shifts.service');

function buildGetManagerEmployeesController(service = usersService) {
    return async function getManagerEmployees(req, res) {
        try {
            const managerId = req.user?.id || req.user?._id;
            const employees = await service.getWorkplaceEmployeesService(managerId);

            return res.status(200).json({
                success: true,
                count: employees.length,
                employees,
            });
        } catch (error) {
            const statusCode = error.statusCode || 500;

            return res.status(statusCode).json({
                success: false,
                message: error.message,
            });
        }
    };
}

function buildGetManagerShiftsController(service = shiftsService) {
    return async function getManagerShifts(req, res) {
        try {
            const managerId = req.user?.id || req.user?._id;
            const shifts = await service.getShiftsService({}, managerId, {}, { withClaimHistory: true });

            return res.status(200).json({
                success: true,
                count: shifts.length,
                shifts,
            });
        } catch (error) {
            const statusCode = error.statusCode || 500;

            return res.status(statusCode).json({
                success: false,
                message: error.message,
            });
        }
    };
}

exports.buildGetManagerEmployeesController = buildGetManagerEmployeesController;
exports.buildGetManagerShiftsController = buildGetManagerShiftsController;
exports.getManagerEmployees = buildGetManagerEmployeesController();
exports.getManagerShifts = buildGetManagerShiftsController();

//GET /api/manager/pending-employees
//(This used to return every pending employee for every manager, with no
//workplace filter at all — any manager could see another manager's pending
//employees. Scoped to the signed-in manager's own workplace below, the
//same way listPendingClaims is already scoped for shifts.)

function buildGetPendingEmployeesController(service = usersService) {
    return async function getPendingEmployees(req, res) {
        try {
            const managerId = req.user?.id || req.user?._id;
            const employees = await service.getPendingEmployeesService(managerId);

            return res.status(200).json({
                success: true,
                count: employees.length,
                employees,
            });
        } catch (error) {
            const statusCode = error.statusCode || 500;

            return res.status(statusCode).json({
                success: false,
                message: error.message,
            });
        }
    };
}

exports.buildGetPendingEmployeesController = buildGetPendingEmployeesController;
exports.getPendingEmployees = buildGetPendingEmployeesController();

//PATCH /api/manager/process-employee/:id
exports.processEmployeeRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { action } = req.body; // Expecting either 'approve' or 'reject'

        if (!action || (action !== 'approve' && action !== 'reject')) {
            return res.status(400).json({
                success: false,
                message: "Invalid action. System requires 'approve' or 'reject'."
            });
        }

        //Same scoping as above — without this, a manager could approve or
        //reject another manager's pending employee just by knowing/guessing
        //their user id, even though the list itself is now scoped.
        const managerId = req.user?.id || req.user?._id;
        const workplace = await Workplace.findOne({ manager_id: managerId, active: true });
        if (!workplace) {
            return res.status(404).json({
                success: false,
                message: "Employee request record not found."
            });
        }

        const employee = await User.findById(id);
        if (!employee || String(employee.workplace) !== String(workplace._id)) {
            return res.status(404).json({
                success: false,
                message: "Employee request record not found."
            });
        }

        const fullName = `${employee.first_name} ${employee.last_name}`;

        if (action === 'approve') {
            employee.workplace_status = 'approved';
            await employee.save();
        } else if (action === 'reject') {
            //Keep document record but mark rejected
            employee.workplace_status = 'rejected';
            employee.active = false; // Soft-disable access profile
            await employee.save();

            // Option B (Alternative): deleting rejected requests completely:
            // await User.findByIdAndDelete(id);
        }

        return res.status(200).json({
            success: true,
            message: `Employee request successfully ${action}d.`,
            employeeName: fullName,
            action: action
        });

    } catch (error) {
        console.error("Process Employee Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error updating employee status.",
            error: error.message
        });
    }
};