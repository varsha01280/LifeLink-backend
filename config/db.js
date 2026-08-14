const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "Varsha28!",
  database: "lifelink_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function testConnection() {
  try {
    const connection = await pool.getConnection();

    console.log("MySQL connected successfully");
    console.log("Database: lifelink_db");

    connection.release();
  } catch (error) {
    console.error("MySQL connection failed:");
    console.error(error.message);
  }
}

testConnection();

module.exports = pool;