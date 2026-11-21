require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();

app.use(cors());
app.use(express.json());

// =====================================
// 1. HOME ROUTE
// =====================================
app.get('/', (req, res) => {
    res.send('Hospital Management API is running!');
});

// =====================================
// 2. TEST DATABASE CONNECTION
// =====================================
app.get('/api/test-db', (req, res) => {
    db.query(
        'SELECT COUNT(*) AS total FROM doctors',
        (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: 'Database connection failed'
                });
            }

            res.json({
                message: 'Hospital database connected successfully!',
                doctors: result[0].total
            });
        }
    );
});

// =====================================
// 3. GET ALL DOCTORS / FILTER BY SPECIALIZATION
// =====================================
app.get('/api/doctors', (req, res) => {
    const { specialization } = req.query;

    let sql = `
        SELECT d.doctor_id, d.name, d.specialization,
               d.experience, d.email, d.department_id,
               dep.department_name
        FROM doctors d
        LEFT JOIN departments dep
            ON d.department_id = dep.department_id
    `;

    const values = [];

    if (specialization) {
        sql += ' WHERE d.specialization = ?';
        values.push(specialization);
    }

    sql += ' ORDER BY d.doctor_id';

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: 'Could not fetch doctors'
            });
        }

        res.json(result);
    });
});

// =====================================
// 4. GET ONE DOCTOR
// =====================================
app.get('/api/doctors/:id', (req, res) => {
    const doctorId = req.params.id;

    const sql = `
        SELECT d.*, dep.department_name
        FROM doctors d
        LEFT JOIN departments dep
            ON d.department_id = dep.department_id
        WHERE d.doctor_id = ?
    `;

    db.query(sql, [doctorId], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: 'Database error'
            });
        }

        if (result.length === 0) {
            return res.status(404).json({
                error: 'Doctor not found'
            });
        }

        res.json(result[0]);
    });
});

// =====================================
// 5. ADD DOCTOR
// =====================================
app.post('/api/doctors', (req, res) => {
    const {
        name,
        specialization,
        experience,
        email,
        department_id
    } = req.body;

    if (!name || !specialization) {
        return res.status(400).json({
            error: 'Name and specialization are required'
        });
    }

    const sql = `
        INSERT INTO doctors
        (name, specialization, experience, email, department_id)
        VALUES (?, ?, ?, ?, ?)
    `;

    const values = [
        name,
        specialization,
        experience ?? 0,
        email || null,
        department_id || null
    ];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: 'Could not add doctor'
            });
        }

        res.status(201).json({
            message: 'Doctor added successfully',
            doctor_id: result.insertId
        });
    });
});

// =====================================
// 6. UPDATE DOCTOR
// =====================================
app.put('/api/doctors/:id', (req, res) => {
    const doctorId = req.params.id;

    const {
        name,
        specialization,
        experience,
        email,
        department_id
    } = req.body;

    const sql = `
        UPDATE doctors
        SET name = ?,
            specialization = ?,
            experience = ?,
            email = ?,
            department_id = ?
        WHERE doctor_id = ?
    `;

    const values = [
        name,
        specialization,
        experience ?? 0,
        email || null,
        department_id || null,
        doctorId
    ];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: 'Could not update doctor'
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: 'Doctor not found or no changes made'
            });
        }

        res.json({
            message: 'Doctor updated successfully'
        });
    });
});

// =====================================
// 7. DELETE DOCTOR
// =====================================
app.delete('/api/doctors/:id', (req, res) => {
    const doctorId = req.params.id;

    db.query(
        'DELETE FROM doctors WHERE doctor_id = ?',
        [doctorId],
        (err, result) => {
            if (err) {
                console.error(err);
                return res.status(409).json({
                    error: 'Could not delete doctor. The doctor may be referenced by schedules, slots, or records.'
                });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    error: 'Doctor not found'
                });
            }

            res.json({
                message: 'Doctor deleted successfully'
            });
        }
    );
});

// =====================================
// 8. GET SCHEDULES FOR A DOCTOR
// =====================================
app.get('/api/schedules/doctor/:id', (req, res) => {
    const doctorId = req.params.id;

    const sql = `
        SELECT schedule_id, doctor_id,
               day_of_week, start_time, end_time
        FROM doctor_schedules
        WHERE doctor_id = ?
        ORDER BY FIELD(
            day_of_week,
            'Monday', 'Tuesday', 'Wednesday',
            'Thursday', 'Friday', 'Saturday', 'Sunday'
        )
    `;

    db.query(sql, [doctorId], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: 'Could not fetch schedules'
            });
        }

        res.json(result);
    });
});

// =====================================
// 9. ADD DOCTOR SCHEDULE
// =====================================
app.post('/api/schedules', (req, res) => {
    const {
        doctor_id,
        day_of_week,
        start_time,
        end_time
    } = req.body;

    if (!doctor_id || !day_of_week || !start_time || !end_time) {
        return res.status(400).json({
            error: 'All schedule fields are required'
        });
    }

    const sql = `
        INSERT INTO doctor_schedules
        (doctor_id, day_of_week, start_time, end_time)
        VALUES (?, ?, ?, ?)
    `;

    db.query(
        sql,
        [doctor_id, day_of_week, start_time, end_time],
        (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: 'Could not add schedule'
                });
            }

            res.status(201).json({
                message: 'Schedule added successfully',
                schedule_id: result.insertId
            });
        }
    );
});

// =====================================
// 10. GET AVAILABLE SLOTS
// Example: /api/slots?doctor_id=1
// =====================================
app.get('/api/slots', (req, res) => {
    const doctorId = Number(req.query.doctor_id);

    if (!Number.isInteger(doctorId) || doctorId < 1) {
        return res.status(400).json({
            error: 'A valid doctor_id is required'
        });
    }

    const sql = `
        SELECT slot_id, doctor_id, slot_date, start_time
        FROM appointment_slots
        WHERE doctor_id = ?
          AND is_booked = FALSE
          AND slot_date >= CURDATE()
        ORDER BY slot_date, start_time
    `;

    db.query(sql, [doctorId], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: 'Could not fetch available slots'
            });
        }

        res.json(result);
    });
});

// =====================================
// 11. GET ALL APPOINTMENTS
// =====================================
app.get('/api/appointments', (req, res) => {
    const sql = `
        SELECT
            a.appointment_id,
            a.patient_id,
            p.name AS patient_name,
            s.slot_id,
            s.doctor_id,
            d.name AS doctor_name,
            s.slot_date AS appointment_date,
            s.start_time AS appointment_time,
            a.status
        FROM appointments a
        JOIN patients p ON a.patient_id = p.patient_id
        JOIN appointment_slots s ON a.slot_id = s.slot_id
        JOIN doctors d ON s.doctor_id = d.doctor_id
        ORDER BY s.slot_date, s.start_time
    `;

    db.query(sql, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: 'Could not fetch appointments'
            });
        }

        res.json(result);
    });
});

// =====================================
// 12. GET APPOINTMENTS FOR A DOCTOR
// =====================================
app.get('/api/appointments/doctor/:id', (req, res) => {
    const doctorId = req.params.id;

    const sql = `
        SELECT
            a.appointment_id,
            a.patient_id,
            p.name AS patient_name,
            s.slot_id,
            s.doctor_id,
            s.slot_date AS appointment_date,
            s.start_time AS appointment_time,
            a.status
        FROM appointments a
        JOIN patients p ON a.patient_id = p.patient_id
        JOIN appointment_slots s ON a.slot_id = s.slot_id
        WHERE s.doctor_id = ?
        ORDER BY s.slot_date, s.start_time
    `;

    db.query(sql, [doctorId], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: 'Could not fetch doctor appointments'
            });
        }

        res.json(result);
    });
});

// =====================================
// 13. BOOK APPOINTMENT
// Body: { "patient_id": 1, "slot_id": 2 }
// =====================================
app.post('/api/appointments', (req, res) => {
    const patientId = Number(req.body.patient_id);
    const slotId = Number(req.body.slot_id);

    if (
        !Number.isInteger(patientId) || patientId < 1 ||
        !Number.isInteger(slotId) || slotId < 1
    ) {
        return res.status(400).json({
            error: 'Valid patient_id and slot_id are required'
        });
    }

    db.getConnection((err, connection) => {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: 'Database connection failed'
            });
        }

        connection.beginTransaction(err => {
            if (err) {
                connection.release();
                return res.status(500).json({
                    error: 'Could not start transaction'
                });
            }

            connection.query(
                'SELECT patient_id FROM patients WHERE patient_id = ?',
                [patientId],
                (err, patients) => {
                    if (err || patients.length === 0) {
                        return connection.rollback(() => {
                            connection.release();
                            res.status(err ? 500 : 404).json({
                                error: err
                                    ? 'Database error'
                                    : 'Patient not found'
                            });
                        });
                    }

                    connection.query(
                        `UPDATE appointment_slots
                         SET is_booked = TRUE
                         WHERE slot_id = ?
                           AND is_booked = FALSE
                           AND slot_date >= CURDATE()`,
                        [slotId],
                        (err, result) => {
                            if (err || result.affectedRows === 0) {
                                return connection.rollback(() => {
                                    connection.release();
                                    res.status(err ? 500 : 409).json({
                                        error: err
                                            ? 'Database error'
                                            : 'Slot unavailable or already booked'
                                    });
                                });
                            }

                            connection.query(
                                `INSERT INTO appointments
                                 (patient_id, slot_id)
                                 VALUES (?, ?)`,
                                [patientId, slotId],
                                (err, booking) => {
                                    if (err) {
                                        return connection.rollback(() => {
                                            connection.release();
                                            res.status(500).json({
                                                error: 'Could not create appointment'
                                            });
                                        });
                                    }

                                    connection.commit(err => {
                                        if (err) {
                                            return connection.rollback(() => {
                                                connection.release();
                                                res.status(500).json({
                                                    error: 'Could not complete booking'
                                                });
                                            });
                                        }

                                        connection.release();

                                        res.status(201).json({
                                            message: 'Appointment booked successfully',
                                            appointment_id: booking.insertId
                                        });
                                    });
                                }
                            );
                        }
                    );
                }
            );
        });
    });
});

// =====================================
// 14. UPDATE APPOINTMENT STATUS
// =====================================
app.put('/api/appointments/:id/status', (req, res) => {
    const appointmentId = req.params.id;
    const { status } = req.body;

    const allowedStatuses = [
        'Booked',
        'Completed',
        'Cancelled'
    ];

    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
            error: 'Status must be Booked, Completed, or Cancelled'
        });
    }

    db.query(
        'UPDATE appointments SET status = ? WHERE appointment_id = ?',
        [status, appointmentId],
        (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: 'Could not update appointment status'
                });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    error: 'Appointment not found'
                });
            }

            res.json({
                message: 'Appointment status updated successfully'
            });
        }
    );
});

// ================================
// AMBULANCE MANAGEMENT API
// ================================

// GET: Fetch all ambulances
app.get('/api/ambulances', (req, res) => {
    const sql = `
        SELECT
            ambulance_id,
            vehicle_number,
            driver_name,
            phone,
            status
        FROM ambulances
        ORDER BY ambulance_id
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error fetching ambulances:', err);
            return res.status(500).json({
                error: 'Could not fetch ambulances'
            });
        }

        res.json(results);
    });
});


// PUT: Update an ambulance's status
app.put('/api/ambulances/:id/status', (req, res) => {
    const ambulanceId = Number(req.params.id);
    const { status } = req.body;

    const allowedStatuses = [
        'Available',
        'On Trip',
        'Maintenance'
    ];

    if (!Number.isInteger(ambulanceId) || ambulanceId < 1) {
        return res.status(400).json({
            error: 'Invalid ambulance ID'
        });
    }

    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
            error: 'Invalid status'
        });
    }

    const sql = `
        UPDATE ambulances
        SET status = ?
        WHERE ambulance_id = ?
    `;

    db.query(sql, [status, ambulanceId], (err, result) => {
        if (err) {
            console.error('Error updating ambulance:', err);
            return res.status(500).json({
                error: 'Could not update ambulance status'
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: 'Ambulance not found'
            });
        }

        res.json({
            message: 'Ambulance status updated successfully',
            ambulance_id: ambulanceId,
            status: status
        });
    });
});


/* GET: Fetch beds with their ward details */
app.get('/api/beds', (req, res) => {
    const sql = `
        SELECT
            b.bed_id,
            b.ward_id,
            b.bed_number,
            b.is_movable,
            b.status,
            w.ward_name,
            w.ward_type,
            w.location
        FROM beds b
        JOIN wards w ON b.ward_id = w.ward_id
        ORDER BY b.bed_id
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error fetching beds:', err);
            return res.status(500).json({
                error: 'Could not fetch beds'
            });
        }

        res.json(results);
    });
});

/* PUT: Update a bed's status */
app.put('/api/beds/:id/status', (req, res) => {
    const bedId = Number(req.params.id);
    const { status } = req.body;

    const allowedStatuses = [
        'Available',
        'Occupied',
        'Maintenance'
    ];

    if (!Number.isInteger(bedId) || bedId < 1) {
        return res.status(400).json({
            error: 'Invalid bed ID'
        });
    }

    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
            error: 'Invalid bed status'
        });
    }

    const sql = `
        UPDATE beds
        SET status = ?
        WHERE bed_id = ?
    `;

    db.query(sql, [status, bedId], (err, result) => {
        if (err) {
            console.error('Error updating bed status:', err);
            return res.status(500).json({
                error: 'Could not update bed status'
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: 'Bed not found'
            });
        }

        res.json({
            message: 'Bed status updated successfully',
            bed_id: bedId,
            status: status
        });
    });
});
        
        
/* GET: Fetch all patients */
app.get('/api/patients', (req, res) => {
    const sql = `
        SELECT patient_id, name, age, sex, email, phone
        FROM patients
        ORDER BY patient_id DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error fetching patients:', err);
            return res.status(500).json({
                error: 'Could not fetch patients'
            });
        }

        res.json(results);
    });
});

/* POST: Add a new patient */
app.post('/api/patients', (req, res) => {
    const { name, age, sex, email, phone } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({
            error: 'Patient name is required'
        });
    }

    const patientAge = age === '' || age == null
        ? null
        : Number(age);

    if (
        patientAge !== null &&
        (!Number.isInteger(patientAge) || patientAge < 0 || patientAge > 130)
    ) {
        return res.status(400).json({
            error: 'Enter a valid age'
        });
    }

    const sql = `
        INSERT INTO patients (name, age, sex, email, phone)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(
        sql,
        [
            name.trim(),
            patientAge,
            sex || null,
            email || null,
            phone || null
        ],
        (err, result) => {
            if (err) {
                console.error('Error adding patient:', err);

                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(409).json({
                        error: 'This email is already registered'
                    });
                }

                return res.status(500).json({
                    error: 'Could not add patient'
                });
            }

            res.status(201).json({
                message: 'Patient added successfully',
                patient_id: result.insertId
            });
        }
    );
});



 // ================= MEDICAL RECORDS =================

// GET all medical records
app.get('/api/medical-records', (req, res) => {
    const sql = `
        SELECT
            mr.record_id,
            mr.patient_id,
            p.name AS patient_name,
            mr.doctor_id,
            d.name AS doctor_name,
            mr.appointment_id,
            mr.diagnosis,
            mr.notes,
            mr.record_date
        FROM medical_records mr
        JOIN patients p ON mr.patient_id = p.patient_id
        JOIN doctors d ON mr.doctor_id = d.doctor_id
        ORDER BY mr.record_id DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Medical records error:', err);
            return res.status(500).json({
                error: 'Failed to fetch medical records'
            });
        }

        res.json(results);
    });
});

// POST a medical record
app.post('/api/medical-records', (req, res) => {
    const {
        patient_id,
        doctor_id,
        appointment_id,
        diagnosis,
        notes,
        record_date
    } = req.body;

    if (!patient_id || !doctor_id || !diagnosis || !record_date) {
        return res.status(400).json({
            error: 'Patient, doctor, diagnosis and date are required'
        });
    }

    const sql = `
        INSERT INTO medical_records
        (patient_id, doctor_id, appointment_id, diagnosis, notes, record_date)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    const values = [
        patient_id,
        doctor_id,
        appointment_id || null,
        diagnosis,
        notes || null,
        record_date
    ];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error('Add medical record error:', err);
            return res.status(500).json({
                error: 'Failed to add medical record'
            });
        }

        res.status(201).json({
            message: 'Medical record added successfully!',
            record_id: result.insertId
        });
    });
});


// ================= MEDICAL REPORTS =================

// GET all medical reports
app.get('/api/medical-reports', (req, res) => {
    const sql = `
        SELECT
            mr.report_id,
            mr.patient_id,
            p.name AS patient_name,
            mr.doctor_id,
            d.name AS doctor_name,
            mr.appointment_id,
            mr.report_type,
            mr.report_details,
            mr.report_date
        FROM medical_reports mr
        JOIN patients p ON mr.patient_id = p.patient_id
        LEFT JOIN doctors d ON mr.doctor_id = d.doctor_id
        ORDER BY mr.report_id DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Medical reports error:', err);
            return res.status(500).json({
                error: 'Failed to fetch medical reports'
            });
        }

        res.json(results);
    });
});

// POST a medical report
app.post('/api/medical-reports', (req, res) => {
    const {
        patient_id,
        doctor_id,
        appointment_id,
        report_type,
        report_details,
        report_date
    } = req.body;

    if (!patient_id || !report_type || !report_date) {
        return res.status(400).json({
            error: 'Patient, report type and date are required'
        });
    }

    const sql = `
        INSERT INTO medical_reports
        (patient_id, doctor_id, appointment_id, report_type,
         report_details, report_date)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    const values = [
        patient_id,
        doctor_id || null,
        appointment_id || null,
        report_type,
        report_details || null,
        report_date
    ];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error('Add medical report error:', err);
            return res.status(500).json({
                error: 'Failed to add medical report'
            });
        }

        res.status(201).json({
            message: 'Medical report added successfully!',
            report_id: result.insertId
        });
    });
});


/* PHARMACY - GET ALL MEDICINES */
app.get('/api/medicines', (req, res) => {
    const sql = `
        SELECT *
        FROM medicines
        ORDER BY medicine_id ASC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error fetching medicines:', err);
            return res.status(500).json({
                message: 'Failed to fetch medicines'
            });
        }

        res.json(results);
    });
});


/* PHARMACY - ADD NEW MEDICINE */
app.post('/api/medicines', (req, res) => {
    const {
        medicine_name,
        category,
        stock_quantity,
        unit_price,
        expiry_date
    } = req.body;

    if (!medicine_name || stock_quantity === undefined || unit_price === undefined) {
        return res.status(400).json({
            message: 'Medicine name, stock quantity and unit price are required'
        });
    }

    if (
        !Number.isInteger(Number(stock_quantity)) ||
        Number(stock_quantity) < 0 ||
        !Number.isFinite(Number(unit_price)) ||
        Number(unit_price) < 0
    ) {
        return res.status(400).json({
            message: 'Enter a valid stock quantity and unit price'
        });
    }

    const sql = `
        INSERT INTO medicines
        (medicine_name, category, stock_quantity, unit_price, expiry_date)
        VALUES (?, ?, ?, ?, ?)
    `;

    const values = [
        medicine_name.trim(),
        category || null,
        Number(stock_quantity),
        Number(unit_price),
        expiry_date || null
    ];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error('Error adding medicine:', err);
            return res.status(500).json({
                message: 'Failed to add medicine'
            });
        }

        res.status(201).json({
            message: 'Medicine added successfully!',
            medicine_id: result.insertId
        });
    });
});


/* PHARMACY - UPDATE MEDICINE STOCK */
app.put('/api/medicines/:id/stock', (req, res) => {
    const medicineId = req.params.id;
    const { stock_quantity } = req.body;

    if (
        stock_quantity === undefined ||
        !Number.isInteger(Number(stock_quantity)) ||
        Number(stock_quantity) < 0
    ) {
        return res.status(400).json({
            message: 'Enter a valid stock quantity'
        });
    }

    const sql = `
        UPDATE medicines
        SET stock_quantity = ?
        WHERE medicine_id = ?
    `;

    db.query(sql, [Number(stock_quantity), medicineId], (err, result) => {
        if (err) {
            console.error('Error updating stock:', err);
            return res.status(500).json({
                message: 'Failed to update medicine stock'
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: 'Medicine not found'
            });
        }

        res.json({
            message: 'Medicine stock updated successfully!'
        });
    });
});


/* PRESCRIPTION MANAGEMENT */

// GET all prescriptions
app.get('/api/prescriptions', (req, res) => {
    const sql = `
        SELECT
            p.prescription_id,
            p.patient_id,
            pat.name AS patient_name,
            p.doctor_id,
            d.name AS doctor_name,
            p.appointment_id,
            p.instructions,
            p.prescribed_at
        FROM prescriptions p
        JOIN patients pat ON p.patient_id = pat.patient_id
        JOIN doctors d ON p.doctor_id = d.doctor_id
        ORDER BY p.prescription_id DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error fetching prescriptions:', err);
            return res.status(500).json({
                message: 'Failed to fetch prescriptions'
            });
        }

        res.json(results);
    });
});


// ADD a new prescription
app.post('/api/prescriptions', (req, res) => {
    const {
        patient_id,
        doctor_id,
        appointment_id,
        instructions,
        prescribed_at
    } = req.body;

    if (!patient_id || !doctor_id || !prescribed_at) {
        return res.status(400).json({
            message: 'Patient, doctor and prescription date are required'
        });
    }

    const sql = `
        INSERT INTO prescriptions
        (patient_id, doctor_id, appointment_id, instructions, prescribed_at)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(
        sql,
        [
            patient_id,
            doctor_id,
            appointment_id || null,
            instructions || null,
            prescribed_at
        ],
        (err, result) => {
            if (err) {
                console.error('Error adding prescription:', err);
                return res.status(500).json({
                    message: 'Failed to add prescription'
                });
            }

            res.status(201).json({
                message: 'Prescription added successfully!',
                prescription_id: result.insertId
            });
        }
    );
});


/* PRESCRIPTION ITEMS */

// GET all prescription items
app.get('/api/prescription-items', (req, res) => {
    const sql = `
        SELECT
            pi.prescription_item_id,
            pi.prescription_id,
            pi.medicine_id,
            m.medicine_name,
            pi.dosage,
            pi.frequency,
            pi.duration_days,
            pi.quantity
        FROM prescription_items pi
        JOIN medicines m ON pi.medicine_id = m.medicine_id
        ORDER BY pi.prescription_item_id DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error fetching prescription items:', err);
            return res.status(500).json({
                message: 'Failed to fetch prescription items'
            });
        }

        res.json(results);
    });
});


// ADD medicine to a prescription

/* ADD MEDICINE TO PRESCRIPTION AND DEDUCT STOCK */

app.post('/api/prescription-items', (req, res) => {

    const {
        prescription_id,
        medicine_id,
        dosage,
        frequency,
        duration_days,
        quantity
    } = req.body;

    // Validate input
    if (
        !Number.isInteger(Number(prescription_id)) ||
        Number(prescription_id) <= 0 ||
        !Number.isInteger(Number(medicine_id)) ||
        Number(medicine_id) <= 0 ||
        !Number.isInteger(Number(quantity)) ||
        Number(quantity) <= 0
    ) {
        return res.status(400).json({
            message: 'Enter valid prescription, medicine and quantity'
        });
    }

    const qty = Number(quantity);

    // Get database connection
    db.getConnection((err, connection) => {

        if (err) {
            console.error('Database connection error:', err);
            return res.status(500).json({
                message: 'Database connection failed'
            });
        }

        // Start transaction
        connection.beginTransaction(err => {

            if (err) {
                connection.release();
                return res.status(500).json({
                    message: 'Could not start transaction'
                });
            }

            // Helper function to rollback and return an error
            const rollbackWithError = (status, message) => {
                connection.rollback(() => {
                    connection.release();
                    res.status(status).json({ message });
                });
            };

            // Check whether prescription exists
            connection.query(
                'SELECT prescription_id FROM prescriptions WHERE prescription_id = ?',
                [prescription_id],
                (err, prescriptions) => {

                    if (err) {
                        return rollbackWithError(500, 'Failed to check prescription');
                    }

                    if (prescriptions.length === 0) {
                        return rollbackWithError(404, 'Prescription not found');
                    }

                    // Lock medicine row and check available stock
                    connection.query(
                        'SELECT stock_quantity FROM medicines WHERE medicine_id = ? FOR UPDATE',
                        [medicine_id],
                        (err, medicines) => {

                            if (err) {
                                return rollbackWithError(500, 'Failed to check medicine stock');
                            }

                            if (medicines.length === 0) {
                                return rollbackWithError(404, 'Medicine not found');
                            }

                            const availableStock = Number(medicines[0].stock_quantity);

                            if (availableStock < qty) {
                                return rollbackWithError(
                                    400,
                                    `Insufficient stock. Available quantity: ${availableStock}`
                                );
                            }

                            // Insert prescription item
                            const insertSql = `
                                INSERT INTO prescription_items
                                (prescription_id, medicine_id, dosage,
                                 frequency, duration_days, quantity)
                                VALUES (?, ?, ?, ?, ?, ?)
                            `;

                            connection.query(
                                insertSql,
                                [
                                    prescription_id,
                                    medicine_id,
                                    dosage || null,
                                    frequency || null,
                                    duration_days || null,
                                    qty
                                ],
                                (err, result) => {

                                    if (err) {
                                        return rollbackWithError(500, 'Failed to add medicine to prescription');
                                    }

                                    // Deduct medicine stock
                                    connection.query(
                                        `UPDATE medicines
                                         SET stock_quantity = stock_quantity - ?
                                         WHERE medicine_id = ?`,
                                        [qty, medicine_id],
                                        (err) => {

                                            if (err) {
                                                return rollbackWithError(500, 'Failed to update medicine stock');
                                            }

                                            // Save both operations
                                            connection.commit(err => {

                                                if (err) {
                                                    return rollbackWithError(500, 'Transaction commit failed');
                                                }

                                                connection.release();

                                                res.status(201).json({
                                                    message: 'Medicine added and stock deducted successfully!',
                                                    prescription_item_id: result.insertId,
                                                    deducted_quantity: qty,
                                                    remaining_stock: availableStock - qty
                                                });

                                            });
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        });
    });
});

// AUTHENTICATION MIDDLEWARE

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];

    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            message: 'Access denied. Please login first.'
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({
                message: 'Invalid or expired token.'
            });
        }

        req.user = user;
        next();
    });
}

// ROLE AUTHORIZATION MIDDLEWARE

function authorizeRole(...allowedRoles) {
    return (req, res, next) => {
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                message: 'You do not have permission to access this resource.'
            });
        }

        next();
    };
}

// LOGIN API
app.post('/api/login', (req, res) => {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
        return res.status(400).json({
            message: 'Email, password and role are required.'
        });
    }

    const allowedRoles = ['admin', 'doctor', 'patient'];

    if (!allowedRoles.includes(role)) {
        return res.status(400).json({
            message: 'Invalid user role.'
        });
    }

    const table = role === 'admin' ? 'admins' :
                  role === 'doctor' ? 'doctors' : 'patients';

    const idColumn = role === 'admin' ? 'admin_id' :
                     role === 'doctor' ? 'doctor_id' : 'patient_id';

    db.query(
        `SELECT * FROM ${table} WHERE email = ?`,
        [email],
        async (err, results) => {
            if (err) {
                return res.status(500).json({
                    message: 'Database error.'
                });
            }

            if (results.length === 0) {
                return res.status(401).json({
                    message: 'Invalid email or password.'
                });
            }

            const user = results[0];

            if (!user.password_hash) {
                return res.status(401).json({
                    message: 'Password not configured for this account.'
                });
            }

            const validPassword = await bcrypt.compare(
                password,
                user.password_hash
            );

            if (!validPassword) {
                return res.status(401).json({
                    message: 'Invalid email or password.'
                });
            }

            const token = jwt.sign(
                {
                    id: user[idColumn],
                    role: role
                },
                process.env.JWT_SECRET,
                { expiresIn: '1d' }
            );

            res.json({
                message: 'Login successful!',
                token: token,
                user: {
                    id: user[idColumn],
                    name: user.name,
                    email: user.email,
                    role: role
                }
            });
        }
    );
});

// =====================================
// START SERVER
// =====================================
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Doctor, schedule and appointment routes loaded');
});
