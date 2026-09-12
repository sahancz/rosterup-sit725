const User = require('../models/User');
const bcrypt = require('bcrypt');

exports.register = async (req, res) => {
    try {
        //FR-01/04/08 require a "name". expecting first_name and last_name from the client
        const { first_name, last_name, email, password, role, workplaceInviteCode } = req.body;

        //Basic field presence validation
        if (!first_name || !last_name || !email || !password || !role) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: first_name, last_name, email, password, and role are mandatory."
            });
        }

        //Convert incoming role string to lowercase to match schema enum ('manager' / 'employee')
        const normalizedRole = role.toLowerCase();
        if (normalizedRole !== 'manager' && normalizedRole !== 'employee') {
            return res.status(400).json({
                success: false,
                message: "Invalid role. Must be either 'Manager' or 'Employee'."
            });
        }

        //FR-08: If user is an employee, they MUST provide an invite code
        if (normalizedRole === 'employee' && !workplaceInviteCode) {
            return res.status(400).json({
                success: false,
                message: "Employee registration requires a workplace invite code."
            });
        }

        //Security: Check if email is already taken
        const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "An account with this email address already exists."
            });
        }

        //Security: Hash the raw text password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        //Structure payload to match User Schema architecture
        const newUserPayload = {
            first_name,
            last_name,
            email,
            password_hashed: hashedPassword,
            role: normalizedRole,
            active: true
        };

        if (normalizedRole === 'employee') {
            newUserPayload.workplace_status = 'pending';
            // Once workplace lookup logic is built: 
            // const targetWorkplace = await Workplace.findOne({ inviteCode: workplaceInviteCode });
            // newUserPayload.workplace = targetWorkplace._id;
        }

        //Save records into MongoDB
        const newUser = new User(newUserPayload);
        await newUser.save();

        //Send successful output response (excluding sensitive password data)
        return res.status(201).json({
            success: true,
            message: "Registration successful.",
            user: {
                id: newUser._id,
                first_name: newUser.first_name,
                last_name: newUser.last_name,
                email: newUser.email,
                role: newUser.role,
                workplace_status: newUser.workplace_status
            }
        });

    } catch (error) {
        console.error("Registration Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server validation error.",
            error: error.message
        });
    }
};
