const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),
  ssl: {
    rejectUnauthorized: false,
  },
});

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
    console.error(error);

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

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
  console.log(`LifeLink server running on port ${PORT}`);
});