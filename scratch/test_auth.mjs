const KEY_ID = "rzp_test_TZq42rOUCeDOK1";
const KEY_SECRET = "Esj8Un1m83RfPnzVNlfMxYTi";

async function testAuth() {
  const basicAuth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64");
  console.log("Testing basicAuth:", basicAuth);

  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: 50000,
      currency: "INR",
      receipt: `test_${Date.now()}`,
    }),
  });

  const data = await res.json();
  console.log("Status:", res.status);
  console.log("Data:", data);
}

testAuth();
