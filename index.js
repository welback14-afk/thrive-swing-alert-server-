const message = {
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
      swing_level: String(isBullish ? swing_high : swing_low),
      title: String(title),
      body: String(body)
    },
    android: {
      priority: "high",
    },
    tokens,
};
