require("dotenv").config();
const db = require("./config/db");

async function checkHospitals() {
  try {
    const [rows] = await db.query("SELECT hospital_id, hospital_name, registration_number, phone, email, verification_status FROM hospitals");
    console.log(`Found ${rows.length} hospitals in database:`);
    console.table(rows);
    process.exit(0);
  } catch (err) {
    console.error("DB Error:", err);
    process.exit(1);
  }
}

checkHospitals();
