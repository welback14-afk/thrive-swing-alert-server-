const express = require("express");
const admin = require("firebase-admin");

const app = express();
app.use(express.json());

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "YOUR_SECRET_TOKEN";

let firebaseReady = false;
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SA || "{}");
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  firebaseReady = true;
  console.log("Firebase ready");
} catch (e) {
  console.warn("Firebase not configured:", e.message);
}

const deviceTokens = new Set();

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Swing Alert Server running" });
});

app.post("/register", (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "token required" });
  deviceTokens.add(token);
  console.log("Device registered. Total: " + deviceTokens.size);
  res.json({ success: true });
});

app.post("/webhook", async (req, res) => {
  const payload = req.body;
  if (payload.secret !== WEBHOOK_SECRET)
    return res.status(401).json({ error: "Unauthorized" });

  const { type, symbol, timeframe, price, swing_high,
          swing_low, sma50, sma200, trend, zone, zone_type } = payload;

  const tfLabel = timeframe === "240" ? "4H" :
                  timeframe === "60" ? "1H" :
                  timeframe === "4H" ? "4H" :
                  timeframe === "1H" ? "1H" :
                  timeframe + "m";

  const isBullish = type === "BULLISH_BREAKOUT";
  const zoneTag = zone === "true" ? " " + zone_type + " ZONE" : "";

  const title = symbol + " " + tfLabel + " Swing Breakout" + zoneTag;
  const body = trend + " | Price: " + parseFloat(price).toFixed(4) + "\n" +
    (isBullish
      ? "Broke above: " + parseFloat(swing_high).toFixed(4)
      : "Broke below: " + parseFloat(swing_low).toFixed(4)) +
    "\nSMA50: " + parseFloat(sma50).toFixed(2) + " | SMA200: " + parseFloat(sma200).toFixed(2);

  console.log(title);

  if (!firebaseReady || deviceTokens.size === 0)
    return res.json({ received: true, pushed: false });

  const tokens = Array.from(deviceTokens);
  const message = {
    notification: { title, body },
    data: {
      type: String(type),
      symbol: String(symbol),
      timeframe: String(tfLabel),
      price: String(price),
      trend: String(trend),
      zone: String(zone),
      zone_type: String(zone_type || ""),
      swing_high: String(swing_high || ""),
      swing_low: String(swing_low || ""),
      sma50: String(sma50 || ""),
      sma200: String(sma200 || ""),
      swing_level: String(isBullish ? swing_high : swing_low)
    },
    android: {
      priority: "high",
      notification: { sound: "default", channelId: "swing_alerts", priority: "high" }
    },
    tokens,
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    response.responses.forEach((r, i) => {
      if (!r.success) deviceTokens.delete(tokens[i]);
    });
    res.json({ received: true, pushed: true, successCount: response.successCount });
  } catch (err) {
    res.status(500).json({ error: "Push failed", detail: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server on port " + PORT));
