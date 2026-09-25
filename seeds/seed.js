require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const Workplace = require('../models/Workplace');
const Shift = require('../models/Shift');

// Fixed demo dataset used by the sign-in page's "Quick Demo Access" buttons.
//
// IMPORTANT: this script is idempotent and non-destructive. It only ever
// touches the specific demo records below (matched by their fixed email
// addresses / invite code), so it's safe to run again and again without
// wiping out anyone else's manually-registered test accounts, workplaces,
// or shifts. (Earlier versions of this script called deleteMany({}) on all
// three collections first, which is exactly the kind of thing that erases
// a teammate's own test data — don't reintroduce that.)
const DEMO_PASSWORD = 'Password123!';
const DEMO_INVITE_CODE = 'ROSTER123';

const seedDatabase = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const password = await bcrypt.hash(DEMO_PASSWORD, 10);

        // Upsert the manager first — the demo workplace links to them next.
        const manager = await User.findOneAndUpdate(
            { email: 'john.smith@test.com' },
            {
                $set: {
                    first_name: 'John',
                    last_name: 'Smith',
                    email: 'john.smith@test.com',
                    password_hashed: password,
                    role: 'manager',
                    workplace_status: 'approved',
                    active: true
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // Upsert the demo workplace (matched by its fixed invite code).
        const workplace = await Workplace.findOneAndUpdate(
            { invite_code: DEMO_INVITE_CODE },
            {
                $set: {
                    workplace_name: 'RosterUp Cafe',
                    workplace_type: 'Hospitality',
                    workplace_address: '100 Example Street',
                    workplace_town: 'Melbourne',
                    workplace_postcode: '3000',
                    invite_code: DEMO_INVITE_CODE,
                    manager_id: manager._id,
                    active: true
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        manager.workplace = workplace._id;
        await manager.save();

        // Upsert the three approved demo employees.
        const [sarah, michael, emily] = await Promise.all([
            User.findOneAndUpdate(
                { email: 'sarah.jones@test.com' },
                { $set: { first_name: 'Sarah', last_name: 'Jones', email: 'sarah.jones@test.com', password_hashed: password, role: 'employee', workplace: workplace._id, workplace_status: 'approved', active: true } },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            ),
            User.findOneAndUpdate(
                { email: 'michael.brown@test.com' },
                { $set: { first_name: 'Michael', last_name: 'Brown', email: 'michael.brown@test.com', password_hashed: password, role: 'employee', workplace: workplace._id, workplace_status: 'approved', active: true } },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            ),
            User.findOneAndUpdate(
                { email: 'emily.wilson@test.com' },
                { $set: { first_name: 'Emily', last_name: 'Wilson', email: 'emily.wilson@test.com', password_hashed: password, role: 'employee', workplace: workplace._id, workplace_status: 'approved', active: true } },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            )
        ]);

        // Upsert the one employee still awaiting approval.
        await User.findOneAndUpdate(
            { email: 'james.taylor@test.com' },
            { $set: { first_name: 'James', last_name: 'Taylor', email: 'james.taylor@test.com', password_hashed: password, role: 'employee', workplace: workplace._id, workplace_status: 'pending', active: true } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // Replace only THIS demo workplace's sample shifts — never touches
        // shifts belonging to any other workplace.
        await Shift.deleteMany({ workplace: workplace._id });
        await Shift.insertMany([
            {
                workplace: workplace._id,
                posted_by: sarah._id,
                shift_date: new Date('2026-09-10'),
                start_time: '09:00',
                end_time: '17:00',
                shift_role: 'Barista',
                note: 'Unable to work due to an appointment.',
                status: 'open'
            },
            {
                workplace: workplace._id,
                posted_by: michael._id,
                claimed_by: sarah._id,
                shift_date: new Date('2026-09-12'),
                start_time: '12:00',
                end_time: '20:00',
                shift_role: 'Front of House',
                note: 'Looking for someone to cover my Saturday shift.',
                status: 'pending'
            },
            {
                workplace: workplace._id,
                posted_by: sarah._id,
                claimed_by: emily._id,
                shift_date: new Date('2026-09-14'),
                start_time: '07:00',
                end_time: '15:00',
                shift_role: 'Barista',
                note: 'Morning shift.',
                status: 'covered',
                claim_history: [{ employee: emily._id, outcome: 'approved', decided_at: new Date('2026-09-11') }]
            },
            {
                workplace: workplace._id,
                posted_by: emily._id,
                claimed_by: sarah._id,
                shift_date: new Date('2026-09-08'),
                start_time: '08:00',
                end_time: '14:00',
                shift_role: 'Barista',
                note: 'Family event.',
                status: 'covered',
                claim_history: [{ employee: sarah._id, outcome: 'approved', decided_at: new Date('2026-09-06') }]
            },
            {
                workplace: workplace._id,
                posted_by: emily._id,
                shift_date: new Date('2026-09-16'),
                start_time: '16:00',
                end_time: '22:00',
                shift_role: 'Front of House',
                note: 'No longer need cover.',
                status: 'cancelled'
            },
            {
                workplace: workplace._id,
                posted_by: michael._id,
                shift_date: new Date('2026-09-18'),
                start_time: '10:00',
                end_time: '18:00',
                shift_role: 'Kitchen Hand',
                note: 'Need someone to cover this shift.',
                status: 'open',
                claim_history: [{ employee: sarah._id, outcome: 'rejected', decided_at: new Date('2026-09-15') }]
            }
        ]);

        console.log('Demo data seeded successfully (existing non-demo data left untouched)');
        console.log(`Workplace: ${workplace.workplace_name}`);
        console.log(`Workplace ID: ${workplace._id}`);
        console.log(`Manager ID: ${manager._id}`);
        console.log(`Invite code: ${DEMO_INVITE_CODE}`);
        console.log(`Test password: ${DEMO_PASSWORD}`);

    } catch (error) {
        console.error('Error seeding database:', error);
    } finally {
        await mongoose.connection.close();
    }
};

seedDatabase();
