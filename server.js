// ============================================================
// LOAD ENVIRONMENT VARIABLES FIRST
// ============================================================

require("dotenv").config();


// ============================================================
// IMPORT PACKAGES
// ============================================================

const express = require("express");
const cors = require("cors");
const db = require("./config/db");
const dns = require("dns");

console.log("DB_HOST =", process.env.DB_HOST);
console.log("DB_PORT =", process.env.DB_PORT);
console.log("DB_NAME =", process.env.DB_NAME);

dns.lookup(process.env.DB_HOST, { all: true }, (err, addresses) => {
  if (err) {
    console.error("AIVEN DNS ERROR:", err);
  } else {
    console.log("AIVEN DNS SUCCESS:", addresses);
  }
});
// ============================================================
// CREATE APP
// ============================================================

const app = express();


// ============================================================
// MIDDLEWARE
// ============================================================

app.use(cors());
app.use(express.json());


// ============================================================
// PORT
// ============================================================

const PORT = process.env.PORT || 5000;


// ============================================================
// HOME
// ============================================================

app.get("/", (req, res) => {
  res.send("LifeLink Backend is running");
});


// ============================================================
// DATABASE TEST
// ============================================================

app.get("/api/test-db", async (req, res) => {
  try {
    const [result] = await db.query("SELECT 1 AS test");

    res.json({
      success: true,
      message: "MySQL connected successfully",
      result,
    });
  } catch (error) {
    console.error("DATABASE TEST ERROR:", error);

    res.status(500).json({
      success: false,
      message: "MySQL connection failed",
      error: error.message,
    });
  }
});


// ============================================================
// DONOR LOGIN
// ============================================================

app.post("/api/donor/login", async (req, res) => {
  console.log("DONOR LOGIN ROUTE CALLED");

  try {
    const { name, password } = req.body;

    console.log("Login name:", name);

    if (!name || !password) {
      return res.status(400).json({
        success: false,
        message: "Name and password are required",
      });
    }

    const [rows] = await db.query(
      `SELECT *
       FROM donors
       WHERE LOWER(full_name) = LOWER(?)`,
      [name.trim()]
    );

    console.log("Donor rows:", rows.length);

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Donor not found",
      });
    }

    const donor = rows[0];

    if (donor.password_hash !== password) {
      return res.status(401).json({
        success: false,
        message: "Incorrect password",
      });
    }

    res.json({
      success: true,
      message: "Donor login successful",

      donor: {
        donor_id: donor.donor_id,
        full_name: donor.full_name,
        mobile: donor.mobile,
        email: donor.email,
        blood_group: donor.blood_group,
        available_for_emergency: donor.available_for_emergency,
        is_verified: donor.is_verified,
      },
    });
  } catch (error) {
    console.error("DONOR LOGIN ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Donor login failed",
      error: error.message,
    });
  }
});


// ============================================================
// HOSPITAL LOGIN
// ============================================================

app.post("/api/hospital/login", async (req, res) => {
  console.log("HOSPITAL LOGIN ROUTE CALLED");

  try {
    const { name, password } = req.body;

    console.log("Hospital login name:", name);

    if (!name || !password) {
      return res.status(400).json({
        success: false,
        message: "Hospital name and password are required",
      });
    }

    const [rows] = await db.query(
      `SELECT *
       FROM hospitals
       WHERE LOWER(hospital_name) = LOWER(?)`,
      [name.trim()]
    );

    console.log("Hospital rows:", rows.length);

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Hospital not found",
      });
    }

    const hospital = rows[0];

    if (hospital.password_hash !== password) {
      return res.status(401).json({
        success: false,
        message: "Incorrect password",
      });
    }

    if (hospital.verification_status !== "VERIFIED") {
      return res.status(403).json({
        success: false,
        message:
          "Hospital is not verified yet. Please wait for admin verification.",
      });
    }

    res.json({
      success: true,
      message: "Hospital login successful",

      hospital: {
        hospital_id: hospital.hospital_id,
        hospital_name: hospital.hospital_name,
        registration_number: hospital.registration_number,
        phone: hospital.phone,
        email: hospital.email,
        address: hospital.address,
        verification_status: hospital.verification_status,
      },
    });
  } catch (error) {
    console.error("HOSPITAL LOGIN ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Hospital login failed",
      error: error.message,
    });
  }
});

dns.lookup(process.env.DB_HOST, (err, address, family) => {
  if (err) {
    console.error("AIVEN DNS ERROR:", err);
  } else {
    console.log("AIVEN DNS SUCCESS:", address, "IPv" + family);
  }
});

// ============================================================
// CREATE BLOOD REQUEST
// ============================================================

app.post("/api/blood-requests", async (req, res) => {
  console.log("BLOOD REQUEST ROUTE CALLED");

  try {
    const {
      hospital_id,
      blood_group,
      units_required,
      urgency,
      patient_name,
      reason,
      latitude,
      longitude,
    } = req.body;

    console.log("Blood request:", req.body);

    // Basic validation
    if (
      !hospital_id ||
      !blood_group ||
      !units_required
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Hospital ID, blood group and units required are required",
      });
    }

    const [result] = await db.query(
      `INSERT INTO blood_requests
      (
        hospital_id,
        blood_group,
        units_required,
        urgency,
        patient_name,
        reason,
        latitude,
        longitude
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        hospital_id,
        blood_group,
        units_required,
        urgency || "NORMAL",
        patient_name || null,
        reason || null,
        latitude || null,
        longitude || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Blood request created successfully",
      request_id: result.insertId,
    });
  } catch (error) {
    console.error("BLOOD REQUEST ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create blood request",
      error: error.message,
    });
  }
});

// ============================================================
// ADMIN LOGIN
// ============================================================

app.post("/api/admin/login", async (req, res) => {
  console.log("ADMIN LOGIN ROUTE CALLED");

  try {
    const { username, password } = req.body;

    console.log("Admin username:", username);

    // Fixed admin credentials
    const ADMIN_USERNAME = "admin";
    const ADMIN_PASSWORD = "admin123";

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    if (
      username.trim().toLowerCase() !== ADMIN_USERNAME ||
      password !== ADMIN_PASSWORD
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin username or password",
      });
    }

    res.json({
      success: true,
      message: "Admin login successful",
      admin: {
        username: ADMIN_USERNAME,
        role: "ADMIN",
      },
    });
  } catch (error) {
    console.error("ADMIN LOGIN ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Admin login failed",
      error: error.message,
    });
  }
});

// ============================================================
// ADMIN - GET ALL HOSPITALS
// ============================================================

app.get("/api/admin/hospitals", async (req, res) => {
  console.log("ADMIN HOSPITALS ROUTE CALLED");

  try {
    const [rows] = await db.query(`
      SELECT
        hospital_id,
        hospital_name,
        registration_number,
        phone,
        email,
        address,
        verification_status,
        created_at
      FROM hospitals
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      hospitals: rows,
    });

  } catch (error) {
    console.error("ADMIN HOSPITALS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch hospitals",
      error: error.message,
    });
  }
});

// ============================================================
// ADMIN - VERIFY / REJECT HOSPITAL
// ============================================================

app.put("/api/admin/hospitals/:id/verify", async (req, res) => {
  console.log("ADMIN VERIFY HOSPITAL ROUTE CALLED");

  try {
    const hospitalId = req.params.id;
    const { status } = req.body;

    if (!["VERIFIED", "REJECTED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification status",
      });
    }

    const [result] = await db.query(
      `
      UPDATE hospitals
      SET verification_status = ?
      WHERE hospital_id = ?
      `,
      [status, hospitalId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Hospital not found",
      });
    }

    res.json({
      success: true,
      message:
        status === "VERIFIED"
          ? "Hospital approved successfully"
          : "Hospital rejected successfully",
    });

  } catch (error) {
    console.error("ADMIN VERIFY ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update hospital verification",
      error: error.message,
    });
  }
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`LifeLink server running on port ${PORT}`);
});