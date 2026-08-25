require("dotenv").config();
const http = require("http");

process.env.PORT = "5000";

async function testHospitalLogin() {
  const server = require("./server");
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const baseUrl = "http://localhost:5000";

  async function request(path, method = "GET", body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const options = {
        method,
        headers: { "Content-Type": "application/json" },
      };
      const req = http.request(url, options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (_) {
            resolve({ status: res.statusCode, data });
          }
        });
      });
      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  console.log("============================================================");
  console.log("TESTING HOSPITAL LOGIN WITH NAME, REG NO, EMAIL, PHONE");
  console.log("============================================================");

  // Test KMCH (Registration: HOC-KMCH, Phone: 6789543111, Email: kmch@gmail.com)
  const loginByRegNo = await request("/api/hospital/login", "POST", { name: "HOC-KMCH", password: "password123" });
  console.log("1. Login by Reg No (HOC-KMCH):", loginByRegNo.status, loginByRegNo.data.message || loginByRegNo.data.error);

  const loginByEmail = await request("/api/hospital/login", "POST", { name: "kmch@gmail.com", password: "password123" });
  console.log("2. Login by Email (kmch@gmail.com):", loginByEmail.status, loginByEmail.data.message || loginByEmail.data.error);

  const loginByPhone = await request("/api/hospital/login", "POST", { name: "6789543111", password: "password123" });
  console.log("3. Login by Phone (6789543111):", loginByPhone.status, loginByPhone.data.message || loginByPhone.data.error);

  const loginByName = await request("/api/hospital/login", "POST", { name: "KMCH", password: "password123" });
  console.log("4. Login by Name (KMCH):", loginByName.status, loginByName.data.message || loginByName.data.error);

  process.exit(0);
}

testHospitalLogin().catch(console.error);
