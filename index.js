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

  const title = symbol + " " + tfLabel + " Swing Breakout" + zoneTag;
  const body = (trend || signal) + " | Price: " + parseFloat(price).toFixed(4) + "\n" +
    (isBullish
      ? "Broke above: " + (swing_high ? parseFloat(swing_high).toFixed(4) : "N/A")
      : "Broke below: " + (swing_low ? parseFloat(swing_low).toFixed(4) : "N/A")) +
    "\nSMA50: " + parseFloat(sma50).toFixed(2) + " | SMA200: " + parseFloat(sma200).toFixed(2);

  console.log(title);

  if (!firebaseReady || deviceTokens.size === 0)
    return res.json({ received: true, pushed: false });

  const tokens = Array.from(deviceTokens);
  const message = {
    notification: { title, body },
    data: {
      signal: String(signal),
      symbol: String(symbol),
      timeframe: String(tfLabel),
      price: String(price),
      trend: String(trend || ""),
      zone: String(zone || ""),
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
