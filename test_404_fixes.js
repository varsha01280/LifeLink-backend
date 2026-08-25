require("dotenv").config();
const http = require("http");

// Ensure PORT is 5000 for this test run
process.env.PORT = "5000";

async function run404RouteVerification() {
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
            resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) });
          } catch (_) {
            resolve({ status: res.statusCode, headers: res.headers, data });
          }
        });
      });
      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  console.log("============================================================");
  console.log("VERIFYING ALL 404 ROUTE FIXES ON PORT 5000");
  console.log("============================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      failed++;
    }
  }

  // Test 1: Donor Registration Routes
  const mobile1 = "98" + Math.floor(10000000 + Math.random() * 90000000);
  const donorReg1 = await request("/api/donor/register", "POST", {
    full_name: "Test Donor 404 Fix",
    mobile: mobile1,
    email: `donor_${mobile1}@test.com`,
    blood_group: "O+",
    address: "Chennai, Tamil Nadu",
    password: "password123",
  });
  assert(donorReg1.status === 201 && donorReg1.data.success === true, `POST /api/donor/register returned 201 JSON (Status: ${donorReg1.status})`);

  const mobile2 = "98" + Math.floor(10000000 + Math.random() * 90000000);
  const donorReg2 = await request("/donor/register", "POST", {
    full_name: "Test Donor Alias",
    mobile: mobile2,
    email: `donor_${mobile2}@test.com`,
    blood_group: "A+",
    address: "Chennai, Tamil Nadu",
    password: "password123",
  });
  assert(donorReg2.status === 201 && donorReg2.data.success === true, `POST /donor/register alias returned 201 JSON (Status: ${donorReg2.status})`);

  // Test 2: Emergency Notification Route Parsing Dynamic ID
  const notif1 = await request("/api/notification/1", "GET");
  assert(notif1.status === 200 && notif1.data.success === true && Array.isArray(notif1.data.notifications), `GET /api/notification/1 dynamic ID parsed cleanly without 404/redirect (Status: ${notif1.status})`);

  const notif2 = await request("/api/notifications/1", "GET");
  assert(notif2.status === 200 && notif2.data.success === true && Array.isArray(notif2.data.notifications), `GET /api/notifications/1 dynamic ID parsed cleanly (Status: ${notif2.status})`);

  // Test 3: Express GET /api/donor/camp JSON response
  const camp1 = await request("/api/donor/camp", "GET");
  assert(camp1.status === 200 && camp1.data.success === true && Array.isArray(camp1.data.camps), `GET /api/donor/camp returned 200 clean JSON (Status: ${camp1.status})`);

  const camp2 = await request("/api/donor/camps", "GET");
  assert(camp2.status === 200 && camp2.data.success === true && Array.isArray(camp2.data.camps), `GET /api/donor/camps returned 200 clean JSON (Status: ${camp2.status})`);

  // Test 4: Hospital Dashboard Status Endpoint
  const status1 = await request("/api/hospital/dashboard/status", "GET");
  assert(status1.status === 200 && status1.data.success === true && status1.data.metrics != null, `GET /api/hospital/dashboard/status returned 200 live metrics JSON (Status: ${status1.status})`);

  // Test 5: Donor Profile Update Endpoint
  const profileUpdate = await request("/api/donor/profile/1", "PUT", {
    email: "updated_donor@test.com",
    address: "Updated Address Chennai",
  });
  assert(profileUpdate.status === 200 && profileUpdate.data.success === true, `PUT /api/donor/profile/1 returned 200 JSON (Status: ${profileUpdate.status})`);

  console.log("============================================================");
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("============================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run404RouteVerification().catch((err) => {
  console.error("❌ TEST RUNNER ERROR:", err);
  process.exit(1);
});
