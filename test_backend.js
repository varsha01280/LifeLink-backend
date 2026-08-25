require("dotenv").config();
const http = require("http");

// Force a unique test port so it runs the fresh code
process.env.PORT = "5001";

async function runTests() {
  const server = require("./server");
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const PORT = process.env.PORT || 5001;
  const baseUrl = `http://localhost:${PORT}`;

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
  console.log("STARTING LIFELINK MASTER END-TO-END BACKEND & COMPATIBILITY TESTS");
  console.log("============================================================");

  // 1. Health check & 404 test
  const health = await request("/");
  console.log("1. Health check status:", health.status, health.data);
  if (health.status !== 200) throw new Error("Health check failed");

  const notFound = await request("/api/nonexistent-route");
  console.log("2. 404 JSON fallback check:", notFound.status, notFound.data);
  if (notFound.status !== 404 || notFound.data.success !== false) {
    throw new Error("404 Middleware failed to return proper JSON response");
  }

  // 3. Register Tamil Nadu Donor 1 (Chennai - O POSITIVE)
  const mobile1 = "98" + Math.floor(10000000 + Math.random() * 90000000);
  const donor1 = await request("/api/donor/register", "POST", {
    full_name: "Karthik Raja Chennai",
    mobile: mobile1,
    email: `karthik_${mobile1}@lifelink.tn`,
    blood_group: "O POSITIVE",
    address: "Anna Nagar, Chennai, Tamil Nadu",
    latitude: 13.0827,
    longitude: 80.2707,
    available_for_emergency: true,
    password: "donorpass123",
  });
  console.log("3. Tamil Nadu Donor 1 Registration:", donor1.status, donor1.data);
  if (donor1.status !== 201 || !donor1.data.success) throw new Error("Donor registration failed");
  const testDonor1Id = donor1.data.donor.donor_id;

  // 4. Register Tamil Nadu Donor 2 (Madurai - AB POSITIVE)
  const mobile2 = "97" + Math.floor(10000000 + Math.random() * 90000000);
  const donor2 = await request("/api/donor/register", "POST", {
    full_name: "Meenakshi Sundaram Madurai",
    mobile: mobile2,
    email: `meenakshi_${mobile2}@lifelink.tn`,
    blood_group: "AB POSITIVE",
    address: "KK Nagar, Madurai, Tamil Nadu",
    latitude: 9.9252,
    longitude: 78.1198,
    available_for_emergency: true,
    password: "donorpass123",
  });
  console.log("4. Tamil Nadu Donor 2 Registration:", donor2.status, donor2.data);
  const testDonor2Id = donor2.data.donor.donor_id;

  // 5. Donor Login Test
  const donorLoginRes = await request("/api/donor/login", "POST", {
    name: mobile1,
    password: "donorpass123",
  });
  console.log("5. Donor Login Check:", donorLoginRes.status, donorLoginRes.data);
  if (donorLoginRes.status !== 200 || !donorLoginRes.data.success) throw new Error("Donor login failed");

  // 6. Admin Login Test
  const adminLoginRes = await request("/api/admin/login", "POST", {
    username: "admin",
    password: "admin123",
  });
  console.log("6. Admin Login Check:", adminLoginRes.status, adminLoginRes.data);
  if (adminLoginRes.status !== 200 || !adminLoginRes.data.success) throw new Error("Admin login failed");

  // 7. Register Tamil Nadu Hospital
  const hospRegNo = "TN-HOSP-" + Math.floor(1000 + Math.random() * 9000);
  const hospitalName = "Apollo Hospital " + hospRegNo + " Chennai";
  const hospReg = await request("/api/hospitals/register", "POST", {
    hospital_name: hospitalName,
    registration_number: hospRegNo,
    phone: "04428290200",
    email: `emergency_${hospRegNo}@apollo.tn`,
    address: "21 Greams Lane, Off Greams Road, Chennai, Tamil Nadu",
    password: "hosppassword123",
  });
  console.log("7. Hospital Registration:", hospReg.status, hospReg.data);
  if (hospReg.status !== 201) throw new Error("Hospital registration failed");
  const testHospitalId = hospReg.data.hospital.hospital_id;

  // 8. Unverified Hospital Login Attempt (Should fail with 403)
  const unverifiedLogin = await request("/api/hospital/login", "POST", {
    name: hospitalName,
    password: "hosppassword123",
  });
  console.log("8. Unverified Hospital Login Check:", unverifiedLogin.status, unverifiedLogin.data);
  if (unverifiedLogin.status !== 403) throw new Error("Unverified hospital should not be allowed login");

  // 9. Admin Approves Hospital
  const verifyRes = await request(`/api/admin/hospitals/${testHospitalId}/verify`, "PUT", { status: "VERIFIED" });
  console.log("9. Admin Verification:", verifyRes.status, verifyRes.data);
  if (verifyRes.status !== 200) throw new Error("Admin hospital verification failed");

  // 10. Verified Hospital Login
  const verifiedLogin = await request("/api/hospital/login", "POST", {
    name: hospitalName,
    password: "hosppassword123",
  });
  console.log("10. Verified Hospital Login:", verifiedLogin.status, verifiedLogin.data);
  if (verifiedLogin.status !== 200) throw new Error("Verified hospital login failed");

  // 11. Hospital Creates CRITICAL O+ Blood Request in Chennai
  const bloodReq = await request("/api/blood-requests", "POST", {
    hospital_id: testHospitalId,
    blood_group: "O+",
    units_required: 3,
    urgency: "CRITICAL",
    patient_name: "Emergency Surgery Patient",
    reason: "Cardiac Bypass Surgery",
    latitude: 13.0604,
    longitude: 80.2496,
  });
  console.log("11. Emergency Blood Request Created:", bloodReq.status, bloodReq.data);
  if (bloodReq.status !== 201 || !bloodReq.data.matched_donors_count) {
    throw new Error("Blood request matching engine failed");
  }

  // 12. Donor 1 Fetches Notifications
  const notif1 = await request(`/api/notifications/${testDonor1Id}`);
  console.log("12. Donor 1 Notifications:", notif1.status, notif1.data);
  if (!notif1.data.notifications || notif1.data.notifications.length === 0) {
    throw new Error("Donor received no emergency notification!");
  }
  const notifId = notif1.data.notifications[0].notification_id;

  // 13. Donor Responds ACCEPTED
  const respondRes = await request(`/api/notifications/${notifId}/respond`, "PUT", { status: "ACCEPTED" });
  console.log("13. Donor Response ACCEPTED:", respondRes.status, respondRes.data);
  if (respondRes.status !== 200) throw new Error("Donor response failed");

  // 14. Hospital Views Matched Donors for Request
  const reqId = bloodReq.data.request_id;
  const matchedDonorsRes = await request(`/api/blood-requests/${reqId}/donors`);
  console.log("14. Hospital Matched Donors View:", matchedDonorsRes.status, matchedDonorsRes.data);
  if (!matchedDonorsRes.data.donors || matchedDonorsRes.data.donors.length === 0) {
    throw new Error("Hospital failed to retrieve matched donors");
  }

  // 15. Create Blood Camp in Tamil Nadu
  const campRes = await request("/api/camps", "POST", {
    camp_name: "Chennai Mega Blood Donation Drive",
    organizer: "LifeLink & Rotary Club Chennai",
    event_date: "2026-09-15",
    event_time: "09:00 AM - 04:00 PM",
    address: "Marina Beach Grounds, Kamarajar Salai",
    city: "Chennai",
    contact_number: "04422334455",
    description: "Annual emergency blood donation drive for public hospitals in Chennai.",
  });
  console.log("15. Create Blood Camp:", campRes.status, campRes.data);
  if (campRes.status !== 201) throw new Error("Create blood camp failed");

  // 16. Fetch Blood Camps
  const getCampsRes = await request("/api/camps");
  console.log("16. Fetch Blood Camps:", getCampsRes.status, getCampsRes.data);
  if (getCampsRes.status !== 200 || !getCampsRes.data.camps) {
    throw new Error("Fetch blood camps failed");
  }

  console.log("============================================================");
  console.log("🎉 ALL LIFELINK END-TO-END BACKEND & MATCHING TESTS PASSED 100%!");
  console.log("============================================================");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});
