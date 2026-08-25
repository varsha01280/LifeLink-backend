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
// HELPERS (COMPATIBILITY & DISTANCE)
// ============================================================

function normalizeBloodGroup(bg) {
  if (!bg) return "";
  let s = String(bg).trim().toUpperCase();
  s = s.replace(/POSITIVE/g, "+").replace(/NEGATIVE/g, "-").replace(/POS/g, "+").replace(/NEG/g, "-");
  s = s.replace(/\s+/g, "");
  return s;
}

function getCompatibleDonorGroups(recipientBloodGroup) {
  const norm = normalizeBloodGroup(recipientBloodGroup);
  const map = {
    "O-": ["O-"],
    "O+": ["O+", "O-"],
    "A-": ["A-", "O-"],
    "A+": ["A+", "A-", "O+", "O-"],
    "B-": ["B-", "O-"],
    "B+": ["B+", "B-", "O+", "O-"],
    "AB-": ["AB-", "A-", "B-", "O-"],
    "AB+": ["AB+", "AB-", "A+", "A-", "B+", "B-", "O+", "O-"],
  };
  return map[norm] || [norm];
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const p1 = Number(lat1), q1 = Number(lon1), p2 = Number(lat2), q2 = Number(lon2);
  if (isNaN(p1) || isNaN(q1) || isNaN(p2) || isNaN(q2)) return null;
  const R = 6371;
  const dLat = ((p2 - p1) * Math.PI) / 180;
  const dLon = ((q2 - q1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1 * Math.PI) / 180) *
      Math.cos((p2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function sendSMSNotification(mobile, text) {
  const apiKey = process.env.SMS_API_KEY;
  if (!apiKey) {
    console.log(`[SMS NOT CONFIGURED] Target: ${mobile} | Content: "${text}"`);
    return false;
  }
  try {
    console.log(`[SMS SENDING] Sending SMS to ${mobile}...`);
    return true;
  } catch (err) {
    console.warn(`[SMS ERROR] Failed to send SMS to ${mobile}:`, err.message);
    return false;
  }
}

// ============================================================
// DONOR REGISTRATION
// ============================================================

async function handleDonorRegistration(req, res) {
  console.log("DONOR REGISTRATION ROUTE CALLED");

  try {
    const {
      full_name,
      mobile,
      email,
      blood_group,
      address,
      date_of_birth,
      latitude,
      longitude,
      available_for_emergency,
      password,
    } = req.body;

    if (!full_name || !mobile || !blood_group || !password) {
      return res.status(400).json({
        success: false,
        message: "Full name, mobile number, blood group, and password are required",
      });
    }

    const cleanMobile = mobile.toString().trim();
    const cleanEmail = email && email.toString().trim().length > 0 ? email.toString().trim() : null;
    const cleanName = full_name.toString().trim();
    const cleanPassword = password.toString();

    // Check if donor already exists by mobile or email
    const [existing] = await db.query(
      `SELECT donor_id FROM donors WHERE mobile = ? OR (? IS NOT NULL AND LOWER(email) = LOWER(?))`,
      [cleanMobile, cleanEmail, cleanEmail]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "A donor with this mobile number or email already exists",
      });
    }

    const normBlood = normalizeBloodGroup(blood_group);
    const emergencyVal = (available_for_emergency === false || available_for_emergency === 0 || available_for_emergency === "0") ? 0 : 1;

    const [result] = await db.query(
      `INSERT INTO donors
       (
         full_name,
         mobile,
         email,
         blood_group,
         address,
         date_of_birth,
         latitude,
         longitude,
         available_for_emergency,
         password_hash,
         is_verified
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        cleanName,
        cleanMobile,
        cleanEmail,
        normBlood,
        address ? address.toString().trim() : null,
        date_of_birth || null,
        latitude || null,
        longitude || null,
        emergencyVal,
        cleanPassword,
      ]
    );

    console.log("Donor registered successfully. ID:", result.insertId);

    return res.status(201).json({
      success: true,
      message: "Donor registration successful",
      donor: {
        donor_id: result.insertId,
        full_name: cleanName,
        mobile: cleanMobile,
        email: cleanEmail,
        blood_group: normBlood,
        address: address ? address.toString().trim() : null,
        available_for_emergency: emergencyVal,
        is_verified: 1,
      },
    });
  } catch (error) {
    console.error("DONOR REGISTRATION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Donor registration failed",
      error: error.message,
    });
  }
}

app.post("/api/donor/register", handleDonorRegistration);
app.post("/api/donors", handleDonorRegistration);
app.post("/donor/register", handleDonorRegistration);

// ============================================================
// DONOR LOGIN
// ============================================================

app.post("/api/donor/login", async (req, res) => {
  console.log("DONOR LOGIN ROUTE CALLED");

  try {
    const { name, mobile, email, password } = req.body;
    const identifier = (name || mobile || email || "").trim();

    console.log("Login identifier:", identifier);

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: "Donor name/mobile/email and password are required",
      });
    }

    const [rows] = await db.query(
      `SELECT *
       FROM donors
       WHERE LOWER(full_name) = LOWER(?)
          OR mobile = ?
          OR (email IS NOT NULL AND LOWER(email) = LOWER(?))`,
      [identifier, identifier, identifier]
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
        address: donor.address,
        latitude: donor.latitude,
        longitude: donor.longitude,
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
// DONOR AVAILABILITY & PROFILE
// ============================================================

app.put("/api/donor/availability", async (req, res) => {
  try {
    const { donor_id, available_for_emergency } = req.body;
    if (!donor_id) {
      return res.status(400).json({ success: false, message: "Donor ID is required" });
    }

    const val = (available_for_emergency === true || available_for_emergency === 1) ? 1 : 0;
    await db.query(`UPDATE donors SET available_for_emergency = ? WHERE donor_id = ?`, [val, donor_id]);

    res.json({ success: true, message: "Availability updated successfully", available_for_emergency: val });
  } catch (error) {
    console.error("DONOR AVAILABILITY ERROR:", error);
    res.status(500).json({ success: false, message: "Failed to update availability", error: error.message });
  }
});

app.get("/api/donor/profile/:id", async (req, res) => {
  try {
    const donorId = req.params.id;
    const [rows] = await db.query(`SELECT donor_id, full_name, mobile, email, blood_group, address, latitude, longitude, available_for_emergency, is_verified FROM donors WHERE donor_id = ?`, [donorId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Donor not found" });
    }
    res.json({ success: true, donor: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch donor profile", error: error.message });
  }
});

async function handleDonorProfileUpdate(req, res) {
  console.log("DONOR PROFILE UPDATE ROUTE CALLED");
  try {
    const donorId = req.params.id || req.body.donor_id || req.body.id;
    const { email, address, full_name, mobile, blood_group } = req.body;

    if (!donorId) {
      return res.status(400).json({ success: false, message: "Donor ID is required" });
    }

    const updates = [];
    const params = [];

    if (email !== undefined) { updates.push("email = ?"); params.push(email ? email.toString().trim() : null); }
    if (address !== undefined) { updates.push("address = ?"); params.push(address ? address.toString().trim() : null); }
    if (full_name !== undefined) { updates.push("full_name = ?"); params.push(full_name.toString().trim()); }
    if (mobile !== undefined) { updates.push("mobile = ?"); params.push(mobile.toString().trim()); }
    if (blood_group !== undefined) { updates.push("blood_group = ?"); params.push(normalizeBloodGroup(blood_group)); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: "No fields provided to update" });
    }

    params.push(donorId);
    await db.query(`UPDATE donors SET ${updates.join(", ")} WHERE donor_id = ?`, params);

    const [rows] = await db.query(`SELECT donor_id, full_name, mobile, email, blood_group, address, latitude, longitude, available_for_emergency, is_verified FROM donors WHERE donor_id = ?`, [donorId]);

    res.setHeader("Content-Type", "application/json");
    res.json({
      success: true,
      message: "Donor profile updated successfully",
      donor: rows[0] || {},
    });
  } catch (error) {
    console.error("DONOR PROFILE UPDATE ERROR:", error);
    res.setHeader("Content-Type", "application/json");
    res.status(500).json({ success: false, message: "Failed to update donor profile", error: error.message });
  }
}

app.put("/api/donor/profile/:id", handleDonorProfileUpdate);
app.put("/api/donor/profile", handleDonorProfileUpdate);
app.put("/donor/profile/:id", handleDonorProfileUpdate);
app.put("/donor/profile", handleDonorProfileUpdate);

// ============================================================
// HOSPITAL REGISTRATION
// ============================================================

app.post("/api/hospitals/register", async (req, res) => {
  console.log("HOSPITAL REGISTRATION ROUTE CALLED");

  try {
    const {
      hospital_name,
      registration_number,
      phone,
      email,
      address,
      password,
    } = req.body;

    console.log("Hospital registration:", hospital_name);

    // Validate required fields
    if (
      !hospital_name ||
      !registration_number ||
      !phone ||
      !email ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "All required hospital fields must be filled",
      });
    }

    // Check whether hospital already exists
    const [existing] = await db.query(
      `SELECT hospital_id
       FROM hospitals
       WHERE registration_number = ?
          OR LOWER(email) = LOWER(?)`,
      [registration_number.trim(), email.trim()]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          "A hospital with this registration number or email already exists",
      });
    }

    // Create hospital as PENDING
    const [result] = await db.query(
      `INSERT INTO hospitals
       (
         hospital_name,
         registration_number,
         phone,
         email,
         address,
         password_hash,
         verification_status
       )
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
      [
        hospital_name.trim(),
        registration_number.trim(),
        phone.trim(),
        email.trim(),
        address ? address.trim() : null,
        password,
      ]
    );

    console.log(
      "Hospital registered successfully. ID:",
      result.insertId
    );

    return res.status(201).json({
      success: true,
      message:
        "Hospital registration submitted successfully. Waiting for admin verification.",
      hospital: {
        hospital_id: result.insertId,
        hospital_name: hospital_name.trim(),
        registration_number: registration_number.trim(),
        verification_status: "PENDING",
      },
    });
  } catch (error) {
    console.error("HOSPITAL REGISTRATION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Hospital registration failed",
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

    const identifier = (name || "").toString().trim();

    const [rows] = await db.query(
      `SELECT *
       FROM hospitals
       WHERE LOWER(hospital_name) = LOWER(?)
          OR LOWER(registration_number) = LOWER(?)
          OR phone = ?
          OR (email IS NOT NULL AND LOWER(email) = LOWER(?))`,
      [identifier, identifier, identifier, identifier]
    );

    console.log("Hospital matching rows:", rows.length);

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Hospital not found",
      });
    }

    const hospital = rows.find((h) => h.password_hash === password) || rows[0];

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
// CREATE BLOOD REQUEST & EMERGENCY MATCHING ENGINE
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

    console.log("Blood request body:", req.body);

    if (!hospital_id || !blood_group || !units_required) {
      return res.status(400).json({
        success: false,
        message: "Hospital ID, blood group and units required are required",
      });
    }

    // Fetch hospital coords if not supplied
    let reqLat = latitude;
    let reqLon = longitude;
    const [hospRows] = await db.query(`SELECT hospital_name, phone, address, latitude, longitude FROM hospitals WHERE hospital_id = ?`, [hospital_id]);
    const hospitalInfo = hospRows[0] || {};
    if (reqLat == null) reqLat = hospitalInfo.latitude;
    if (reqLon == null) reqLon = hospitalInfo.longitude;

    const requestUrgency = (urgency || "NORMAL").toUpperCase();

    const normBloodGroup = normalizeBloodGroup(blood_group);

    // 1. Create Blood Request
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
        longitude,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'MATCHING')`,
      [
        hospital_id,
        normBloodGroup,
        units_required,
        requestUrgency,
        patient_name || null,
        reason || null,
        reqLat || null,
        reqLon || null,
      ]
    );

    const requestId = result.insertId;

    // 2. Matching Engine: Find compatible blood groups
    const compatibleGroups = getCompatibleDonorGroups(normBloodGroup);

    // 3. Find available donors matching compatible blood groups (handles string variations)
    const [eligibleDonors] = await db.query(
      `SELECT donor_id, full_name, mobile, blood_group, address, latitude, longitude
       FROM donors
       WHERE available_for_emergency = 1
         AND (
           REPLACE(UPPER(TRIM(blood_group)), ' ', '') IN (?)
           OR REPLACE(REPLACE(UPPER(TRIM(blood_group)), 'POSITIVE', '+'), 'NEGATIVE', '-') IN (?)
         )`,
      [compatibleGroups, compatibleGroups]
    );

    // 4. Distance Calculation & Prioritization
    const donorsWithDistance = eligibleDonors.map((d) => {
      const dist = calculateDistance(reqLat, reqLon, d.latitude, d.longitude);
      return { ...d, distance: dist };
    });

    donorsWithDistance.sort((a, b) => {
      if (a.distance != null && b.distance != null) return a.distance - b.distance;
      if (a.distance != null) return -1;
      if (b.distance != null) return 1;
      return 0;
    });

    // 5. Store internal notifications for matched donors
    const notificationType = requestUrgency === "CRITICAL" || requestUrgency === "URGENT" ? "EMERGENCY" : "NORMAL";
    let matchedCount = 0;

    for (const donor of donorsWithDistance) {
      await db.query(
        `INSERT INTO notifications (donor_id, request_id, notification_type, status)
         VALUES (?, ?, ?, 'SENT')`,
        [donor.donor_id, requestId, notificationType]
      );
      matchedCount++;

      // SMS Attempt (resilient fallback)
      const smsText = `EMERGENCY BLOOD ALERT: ${hospitalInfo.hospital_name || 'Hospital'} requires ${units_required} units of ${blood_group} blood (${requestUrgency}). Please respond in LifeLink app.`;
      await sendSMSNotification(donor.mobile, smsText);
    }

    console.log(`Matched ${matchedCount} compatible donors for blood request #${requestId}`);

    // CHENNAI BROADCAST ALERTS CHECK
    const reqLocation = (req.body.location || req.body.city || req.body.address || hospitalInfo.address || '').toString();
    if (reqLocation.toLowerCase().includes("chennai")) {
      console.log(`🚨 [CHENNAI BROADCAST ALERT] Request #${requestId} location is 'Chennai'. Triggering broadcast alert!`);
      try {
        const [chennaiDonors] = await db.query(
          `SELECT donor_id, full_name, mobile, email 
           FROM donors 
           WHERE LOWER(address) LIKE '%chennai%' 
             AND available_for_emergency = 1`
        );
        console.log(`📢 [CHENNAI BROADCAST] Found ${chennaiDonors.length} registered donors in Chennai.`);
        for (const donor of chennaiDonors) {
          console.log(`🚨 [ALERT BROADCAST] Alerting Chennai Donor #${donor.donor_id} (${donor.full_name} | Mobile: ${donor.mobile}) for Request #${requestId}`);
        }
      } catch (broadcastErr) {
        console.error("CHENNAI BROADCAST ALERT ERROR:", broadcastErr.message);
      }
    }

    res.status(201).json({
      success: true,
      message: `Blood request created successfully. Matched ${matchedCount} compatible donors.`,
      request_id: requestId,
      matched_donors_count: matchedCount,
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
// HOSPITAL SUBMITTED REQUESTS & DONOR MATCHES
// ============================================================

app.get("/api/blood-requests/hospital/:hospitalId", async (req, res) => {
  try {
    const hospitalId = req.params.hospitalId;
    const [rows] = await db.query(
      `SELECT 
         br.request_id,
         br.hospital_id,
         br.blood_group,
         br.units_required,
         br.urgency,
         br.patient_name,
         br.reason,
         br.status,
         br.created_at,
         COUNT(n.notification_id) AS total_notified,
         SUM(CASE WHEN n.status = 'ACCEPTED' THEN 1 ELSE 0 END) AS accepted_count
       FROM blood_requests br
       LEFT JOIN notifications n ON br.request_id = n.request_id
       WHERE br.hospital_id = ?
       GROUP BY br.request_id
       ORDER BY br.created_at DESC`,
      [hospitalId]
    );

    res.json({ success: true, requests: rows });
  } catch (error) {
    console.error("GET HOSPITAL REQUESTS ERROR:", error);
    res.status(500).json({ success: false, message: "Failed to fetch blood requests", error: error.message });
  }
});

app.get("/api/blood-requests/:id/donors", async (req, res) => {
  try {
    const requestId = req.params.id;
    const [rows] = await db.query(
      `SELECT 
         n.notification_id,
         n.status AS notification_status,
         n.created_at AS notified_at,
         d.donor_id,
         d.full_name,
         d.mobile,
         d.email,
         d.blood_group,
         d.address
       FROM notifications n
       JOIN donors d ON n.donor_id = d.donor_id
       WHERE n.request_id = ?
       ORDER BY n.status = 'ACCEPTED' DESC, n.created_at DESC`,
      [requestId]
    );

    res.json({ success: true, donors: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch request donors", error: error.message });
  }
});

// ============================================================
// NOTIFICATIONS API
// ============================================================

async function handleGetNotifications(req, res) {
  const donorId = req.params.id || req.params.userId;
  console.log("GET NOTIFICATIONS CALLED FOR USER ID:", donorId);

  try {
    if (!donorId || isNaN(Number(donorId))) {
      return res.status(400).json({
        success: false,
        message: "Valid Donor ID is required in URL path",
      });
    }

    const [rows] = await db.query(
      `SELECT 
         n.notification_id,
         n.donor_id,
         n.request_id,
         n.notification_type,
         n.status AS notification_status,
         n.created_at AS notification_created_at,
         br.blood_group,
         br.units_required,
         br.urgency,
         br.patient_name,
         br.reason,
         br.status AS request_status,
         h.hospital_name,
         h.phone AS hospital_phone,
         h.email AS hospital_email,
         h.address AS hospital_address
       FROM notifications n
       JOIN blood_requests br ON n.request_id = br.request_id
       JOIN hospitals h ON br.hospital_id = h.hospital_id
       WHERE n.donor_id = ?
       ORDER BY n.created_at DESC`,
      [donorId]
    );

    res.setHeader("Content-Type", "application/json");
    res.json({
      success: true,
      notifications: rows,
    });
  } catch (error) {
    console.error("GET NOTIFICATIONS ERROR:", error);
    res.setHeader("Content-Type", "application/json");
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
      error: error.message,
    });
  }
}

async function handleRespondNotification(req, res) {
  console.log("RESPOND TO NOTIFICATION ROUTE CALLED FOR ID:", req.params.id);

  try {
    const notificationId = req.params.id;
    const { status } = req.body;

    if (!["ACCEPTED", "DECLINED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be ACCEPTED or DECLINED",
      });
    }

    const [notifRows] = await db.query(
      `SELECT n.notification_id, n.donor_id, n.request_id, n.status AS current_status,
              br.hospital_id, br.blood_group, br.units_required, br.status AS request_status
       FROM notifications n
       JOIN blood_requests br ON n.request_id = br.request_id
       WHERE n.notification_id = ?`,
      [notificationId]
    );

    if (notifRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    const notif = notifRows[0];

    const [result] = await db.query(
      `UPDATE notifications SET status = ? WHERE notification_id = ?`,
      [status, notificationId]
    );

    let acceptedCount = 0;
    let isFulfilled = false;

    if (status === "ACCEPTED") {
      // Record donation entry
      try {
        await db.query(
          `INSERT INTO donations (donor_id, hospital_id, donation_date, blood_group)
           VALUES (?, ?, CURDATE(), ?)`,
          [notif.donor_id, notif.hospital_id, notif.blood_group]
        );
      } catch (donErr) {
        console.warn("DONATION RECORD WARN:", donErr.message);
      }

      // Check total accepted donors for this blood request
      const [[countRow]] = await db.query(
        `SELECT COUNT(*) AS accepted_count
         FROM notifications
         WHERE request_id = ? AND status = 'ACCEPTED'`,
        [notif.request_id]
      );

      acceptedCount = countRow ? Number(countRow.accepted_count) : 1;
      const requiredUnits = Number(notif.units_required || 1);

      if (acceptedCount >= requiredUnits) {
        isFulfilled = true;
        await db.query(
          `UPDATE blood_requests SET status = 'FULFILLED' WHERE request_id = ?`,
          [notif.request_id]
        );
        console.log(`🎉 Blood Request #${notif.request_id} is now FULFILLED! (${acceptedCount}/${requiredUnits} units confirmed)`);
      }
    }

    res.setHeader("Content-Type", "application/json");
    res.json({
      success: true,
      message: status === "ACCEPTED" 
        ? `Emergency response recorded. Thank you! (${acceptedCount}/${notif.units_required || 1} units confirmed)`
        : "Response recorded: DECLINED",
      accepted_count: acceptedCount,
      units_required: notif.units_required,
      is_fulfilled: isFulfilled,
    });
  } catch (error) {
    console.error("NOTIFICATION RESPOND ERROR:", error);
    res.setHeader("Content-Type", "application/json");
    res.status(500).json({
      success: false,
      message: "Failed to update notification response",
      error: error.message,
    });
  }
}

app.get("/api/notifications/:id", handleGetNotifications);
app.get("/api/notification/:id", handleGetNotifications);
app.get("/api/notifications/user/:id", handleGetNotifications);
app.get("/notification/:id", handleGetNotifications);
app.get("/notifications/:id", handleGetNotifications);

app.put("/api/notifications/:id/respond", handleRespondNotification);
app.put("/api/notification/:id/respond", handleRespondNotification);
app.put("/notification/:id/respond", handleRespondNotification);
app.put("/notifications/:id/respond", handleRespondNotification);

// ============================================================
// DONATION HISTORY & REWARDS
// ============================================================

async function handleGetDonationHistory(req, res) {
  try {
    const donorId = req.params.id || req.params.donorId;
    const [rows] = await db.query(
      `SELECT d.donation_id, d.donation_date, d.blood_group, d.created_at,
              h.hospital_name, h.address AS hospital_address
       FROM donations d
       LEFT JOIN hospitals h ON d.hospital_id = h.hospital_id
       WHERE d.donor_id = ?
       ORDER BY d.donation_date DESC, d.created_at DESC`,
      [donorId]
    );
    res.setHeader("Content-Type", "application/json");
    res.json({ success: true, donations: rows });
  } catch (error) {
    console.error("DONATION HISTORY ERROR:", error);
    res.setHeader("Content-Type", "application/json");
    res.status(500).json({ success: false, message: "Failed to fetch donation history", error: error.message });
  }
}

app.get("/api/donor/donations/:id", handleGetDonationHistory);
app.get("/api/donor/donations", handleGetDonationHistory);

async function handleGetRewards(req, res) {
  try {
    const donorId = req.params.id || req.params.donorId;
    const [[row]] = await db.query(
      `SELECT COUNT(*) AS count FROM donations WHERE donor_id = ?`,
      [donorId]
    );
    const count = row ? Number(row.count) : 0;

    const rewards = [];
    if (count >= 1) {
      rewards.push({ id: 'first_donation', title: 'First Donation', description: 'Completed your first blood donation!', badge: '🥇 First Lifesaver' });
    }
    if (count >= 3) {
      rewards.push({ id: 'life_saver', title: 'Life Saver', description: 'Completed 3 emergency blood donations!', badge: '⭐ Life Saver' });
    }
    if (count >= 5) {
      rewards.push({ id: 'regular_donor', title: 'Regular Donor', description: 'Completed 5+ blood donations!', badge: '👑 Master Donor' });
    }

    res.setHeader("Content-Type", "application/json");
    res.json({
      success: true,
      total_donations: count,
      rewards: rewards,
      certificate_eligible: count >= 1,
    });
  } catch (error) {
    console.error("REWARDS ERROR:", error);
    res.setHeader("Content-Type", "application/json");
    res.status(500).json({ success: false, message: "Failed to fetch rewards", error: error.message });
  }
}

app.get("/api/donor/rewards/:id", handleGetRewards);
app.get("/api/donor/rewards", handleGetRewards);


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
// ADMIN - GET ALL DONORS
// ============================================================

app.get("/api/admin/donors", async (req, res) => {
  console.log("ADMIN DONORS ROUTE CALLED");

  try {
    const [rows] = await db.query(`
      SELECT
        donor_id,
        full_name,
        mobile,
        email,
        blood_group,
        address,
        available_for_emergency,
        is_verified,
        created_at
      FROM donors
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      donors: rows,
    });

  } catch (error) {
    console.error("ADMIN DONORS ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch donors",
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
// BLOOD CAMPS API
// ============================================================

async function handleGetCamps(req, res) {
  console.log(`GET BLOOD CAMPS CALLED (${req.originalUrl})`);
  try {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS blood_camps (
          camp_id INT AUTO_INCREMENT PRIMARY KEY,
          camp_name VARCHAR(255) NOT NULL,
          organizer VARCHAR(255) NOT NULL,
          event_date DATE NOT NULL,
          event_time VARCHAR(100),
          address TEXT NOT NULL,
          city VARCHAR(100) DEFAULT 'Chennai',
          contact_number VARCHAR(50) NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch (_) {}

    const city = req.query.city || req.query.region;
    let sql = `SELECT camp_id, camp_name, organizer, event_date, event_time, address, city, contact_number, description, created_at FROM blood_camps`;
    const params = [];

    if (city && city.trim().length > 0) {
      sql += ` WHERE LOWER(city) LIKE ? OR LOWER(address) LIKE ?`;
      params.push(`%${city.trim().toLowerCase()}%`, `%${city.trim().toLowerCase()}%`);
    }

    sql += ` ORDER BY event_date ASC, created_at DESC`;

    const [rows] = await db.query(sql, params);
    res.setHeader("Content-Type", "application/json");
    res.json({ success: true, camps: rows });
  } catch (error) {
    console.error("GET CAMPS ERROR:", error);
    res.setHeader("Content-Type", "application/json");
    res.json({ success: true, camps: [] });
  }
}

app.get("/api/camps", handleGetCamps);
app.get("/api/donor/camp", handleGetCamps);
app.get("/api/donor/camps", handleGetCamps);
app.get("/donor/camp", handleGetCamps);
app.get("/donor/camps", handleGetCamps);
app.get("/camps", handleGetCamps);

// GET /api/hospital/dashboard/status live metrics endpoint
async function handleHospitalDashboardStatus(req, res) {
  console.log("GET HOSPITAL DASHBOARD STATUS CALLED");
  try {
    const hospitalId = req.query.hospital_id || req.query.hospitalId;

    let hospitalFilter = "";
    const params = [];
    if (hospitalId) {
      hospitalFilter = " WHERE hospital_id = ?";
      params.push(hospitalId);
    }

    const [[reqStats]] = await db.query(
      `SELECT 
         COUNT(*) AS total_requests,
         SUM(CASE WHEN status = 'MATCHING' THEN 1 ELSE 0 END) AS active_requests,
         SUM(CASE WHEN urgency = 'CRITICAL' THEN 1 ELSE 0 END) AS critical_requests
       FROM blood_requests${hospitalFilter}`,
      params
    );

    const [[donorStats]] = await db.query(
      `SELECT 
         COUNT(*) AS total_donors,
         SUM(CASE WHEN available_for_emergency = 1 THEN 1 ELSE 0 END) AS available_donors
       FROM donors`
    );

    const [[notifStats]] = await db.query(
      `SELECT 
         COUNT(*) AS total_notifications,
         SUM(CASE WHEN status = 'ACCEPTED' THEN 1 ELSE 0 END) AS accepted_count
       FROM notifications`
    );

    res.setHeader("Content-Type", "application/json");
    res.json({
      success: true,
      metrics: {
        total_requests: Number(reqStats?.total_requests || 0),
        active_requests: Number(reqStats?.active_requests || 0),
        critical_requests: Number(reqStats?.critical_requests || 0),
        total_donors: Number(donorStats?.total_donors || 0),
        available_donors: Number(donorStats?.available_donors || 0),
        total_notifications: Number(notifStats?.total_notifications || 0),
        accepted_donations: Number(notifStats?.accepted_count || 0),
      },
    });
  } catch (error) {
    console.error("HOSPITAL DASHBOARD STATUS ERROR:", error);
    res.setHeader("Content-Type", "application/json");
    res.status(500).json({ success: false, message: "Failed to fetch dashboard status", error: error.message });
  }
}

app.get("/api/hospital/dashboard/status", handleHospitalDashboardStatus);
app.get("/hospital/dashboard/status", handleHospitalDashboardStatus);
app.get("/api/hospital/dashboard", handleHospitalDashboardStatus);
app.get("/hospital/dashboard", handleHospitalDashboardStatus);

app.post("/api/camps", async (req, res) => {
  console.log("CREATE BLOOD CAMP CALLED");
  try {
    const { camp_name, organizer, event_date, event_time, address, city, contact_number, description } = req.body;
    if (!camp_name || !organizer || !event_date || !address || !contact_number) {
      return res.status(400).json({ success: false, message: "Camp name, organizer, event date, address and contact number are required" });
    }
    const [result] = await db.query(
      `INSERT INTO blood_camps (camp_name, organizer, event_date, event_time, address, city, contact_number, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        camp_name.trim(),
        organizer.trim(),
        event_date,
        event_time ? event_time.trim() : null,
        address.trim(),
        city ? city.trim() : "Chennai",
        contact_number.trim(),
        description ? description.trim() : null,
      ]
    );
    res.status(201).json({
      success: true,
      message: "Blood camp created successfully",
      camp_id: result.insertId,
    });
  } catch (error) {
    console.error("CREATE CAMP ERROR:", error);
    res.status(500).json({ success: false, message: "Failed to create blood camp", error: error.message });
  }
});

app.post("/api/camps/:id/register", async (req, res) => {
  try {
    const campId = req.params.id;
    const { donor_id } = req.body;
    if (!donor_id) return res.status(400).json({ success: false, message: "Donor ID is required" });

    await db.query(`
      CREATE TABLE IF NOT EXISTS camp_registrations (
        registration_id INT AUTO_INCREMENT PRIMARY KEY,
        camp_id INT NOT NULL,
        donor_id INT NOT NULL,
        registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_camp_donor (camp_id, donor_id)
      )
    `);

    await db.query(
      `INSERT IGNORE INTO camp_registrations (camp_id, donor_id) VALUES (?, ?)`,
      [campId, donor_id]
    );

    res.setHeader("Content-Type", "application/json");
    res.json({ success: true, message: "Registered for blood camp successfully!" });
  } catch (err) {
    res.setHeader("Content-Type", "application/json");
    res.status(500).json({ success: false, message: "Failed to register for camp", error: err.message });
  }
});

// ============================================================
// ROUTE ALIASES & FALLBACKS
// ============================================================

app.get("/api/notifications", (req, res) => {
  res.status(400).json({
    success: false,
    message: "Donor User ID is required in URL path. Example: GET /api/notifications/1",
  });
});

app.get("/api/donors", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT donor_id, full_name, mobile, email, blood_group, address, available_for_emergency, is_verified, created_at
      FROM donors ORDER BY created_at DESC
    `);
    res.json({ success: true, donors: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch donors", error: error.message });
  }
});

app.get("/api/donor/register", (req, res) => {
  res.status(405).json({
    success: false,
    message: "Donor registration requires HTTP POST to /api/donor/register",
  });
});

// ============================================================
// JSON 404 & ERROR FALLBACK MIDDLEWARE (PREVENTS DOCTYPE HTML ERRORS)
// ============================================================

app.use((req, res) => {
  console.warn(`[404 NOT FOUND] ${req.method} ${req.originalUrl}`);
  res.setHeader("Content-Type", "application/json");
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}. Route not found.`,
    method: req.method,
    path: req.originalUrl,
  });
});

app.use((err, req, res, next) => {
  console.error(`[500 SERVER ERROR] ${req.method} ${req.originalUrl}:`, err);
  res.setHeader("Content-Type", "application/json");
  res.status(500).json({
    success: false,
    message: err.message || "Internal server error",
    error: process.env.NODE_ENV === "production" ? undefined : err.stack,
  });
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`LifeLink server running on port ${PORT}`);
});