const express = require("express");
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "YOUR_SECRET_TOKEN";
const TOKENS_FILE = path.join("/tmp", "device_tokens.json");

function loadTokens() {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      const data = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8"));
      return new Set(data);
    }
  } catch (e) {
    console.warn("Could not load tokens:", e.message);
  }
  return new Set();
}

function saveTokens(tokens) {
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(Array.from(tokens)));
  } catch (e) {
    console.warn("Could not save tokens:", e.message);
  }
}

let firebaseReady = false;
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SA || "{}");
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  firebaseReady = true;
  console.log("Firebase ready");
} catch (e) {
  console.warn("Firebase not configured:", e.message);
}

const deviceTokens = loadTokens();
console.log("Loaded " + deviceTokens.size + " saved tokens");

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Swing Alert Server running" });
});

app.post("/register", (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "token required" });
  deviceTokens.add(token);
  saveTokens(deviceTokens);
  console.log("Device registered. Total: " + deviceTokens.size);
  res.json({ success: true });
});

app.post("/webhook", async (req, res) => {
  const payload = req.body;
  if (payload.secret !== WEBHOOK_SECRET)
    return res.status(401).json({ error: "Unauthorized" });

  const { signal, symbol, timeframe, price, swing_high,
          swing_low, sma50, sma200, trend, zone, zone_type } = payload;

  const tfLabel = timeframe === "240" ? "4H" :
                  timeframe === "60" ? "1H" :
                  timeframe === "4H" ? "4H" :
                  timeframe === "1H" ? "1H" :
                  timeframe + "m";

  const isBullish = signal === "Bullish Swing Breakout";
  const zoneTag = zone === "true" ? " " + zone_type + " ZONE" : "";

  const swingLevel = isBullish
    ? (swing_high ? parseFloat(swing_high).toFixed(4) : "N/A")
    : (swing_low ? parseFloat(swing_low).toFixed(4) : "N/A");

  const sma50Rounded = parseFloat(sma50 || 0).toFixed(2);
  const sma200Rounded = parseFloat(sma200 || 0).toFixed(2);
  const priceRounded = parseFloat(price || 0).toFixed(4);

  const title = symbol + " " + tfLabel + " Swing Breakout" + zoneTag;
  const body = (signal || trend || "") + " | Price: " + priceRounded + "\n" +
    (isBullish
      ? "Broke above: " + swingLevel
      : "Broke below: " + swingLevel) +
    "\nSMA50: " + sma50Rounded + " | SMA200: " + sma200Rounded;

  console.log(title);

  if (!firebaseReady || deviceTokens.size === 0)
    return res.json({ received: true, pushed: false });

  const tokens = Array.from(deviceTokens);
  const message = {
    data: {
      signal: String(signal || ""),
      symbol: String(symbol || ""),
      timeframe: String(tfLabel || ""),
      price: String(priceRounded),
      trend: String(trend || ""),
      zone: String(zone || ""),
      zone_type: String(zone_type || ""),
      swing_high: String(swing_high || ""),
      swing_low: String(swing_low || ""),
      sma50: String(sma50Rounded),
      sma200: String(sma200Rounded),
      swing_level: String(swingLevel),
      title: String(title),
      body: String(body)
    },
    android: { priority: "high" },
    tokens,
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    response.responses.forEach((r, i) => {
      if (!r.success) {
        deviceTokens.delete(tokens[i]);
        saveTokens(deviceTokens);
      }
    });
    res.json({ received: true, pushed: true, successCount: response.successCount });
  } catch (err) {
    res.status(500).json({ error: "Push failed", detail: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server on port " + PORT));
