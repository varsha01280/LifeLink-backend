// ============================================================
// MYSQL CONNECTION
// ============================================================

const mysql = require("mysql2/promise");


// ============================================================
// CREATE MYSQL CONNECTION POOL
// ============================================================

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",

  port: Number(process.env.DB_PORT) || 3306,

  user: process.env.DB_USER || "root",

  password: process.env.DB_PASSWORD || "",

  database: process.env.DB_NAME || "lifelink_db",

  waitForConnections: true,

  connectionLimit: 10,

  queueLimit: 0,
});


// ============================================================
// TEST MYSQL CONNECTION
// ============================================================

async function testConnection() {
  try {
    const connection = await pool.getConnection();

    console.log("MySQL connected successfully");

    console.log(
      `Database: ${process.env.DB_NAME || "lifelink_db"}`
    );

    connection.release();
  } catch (error) {
    console.error("MySQL connection failed:");

    console.error(error.message);
  }
}


// ============================================================
// RUN CONNECTION TEST
// ============================================================

testConnection();


// ============================================================
// EXPORT DATABASE POOL
// ============================================================

module.exports = pool;