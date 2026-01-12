const express = require("express");
const mongoose = require("mongoose");
const app = express();
const cors = require("cors");
require("dotenv").config();
const Zone = require("./models/Zone");
const bookingRouter = require("./routes/book");
const { reserveRouter, startReservationCron } = require("./routes/reserve");
const Reservation = require("./models/Reservation");

app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`📨 [${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health Check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

// MongoDB Connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB connected");

    // Start cron jobs
    startReservationCron();
    console.log("📅 Reservation expiry cron started");
  } catch (err) {
    console.error("❌ Mongo connection error:", err);
    process.exit(1);
  }
};

connectDB();

// Mount booking router
app.use("/api/book", bookingRouter);

// GET ZONES
app.get("/", async (req, res) => {
  try {
    // 1. Fetch Zones
    const zones = await Zone.find({ isActive: true }).sort({ name: 1 }).lean();

    // 2. Fetch ALL Active Reservations
    const activeReservations = await Reservation.find({
      status: { $in: ["active", "booked", "reserved", "parked"] },
    }).lean();

    const response = zones.map((zone) => {
      // Filter reservations for this zone
      const zoneRes = activeReservations.filter(r => r.zoneId.toString() === zone._id.toString());

      // Strict Status-Based Counting
      // "reserved" & "parked" => HOLD capacity (Hard Booking)
      // "booked" => Soft Intent (Does not reduce availability)
      const reservedCount = zoneRes.filter(r => ["reserved", "parked"].includes(r.status)).length;
      const prebookedCount = zoneRes.filter(r => r.status === "booked").length;

      // Available = Capacity - (Reserved + Parked + Prebooked)
      // "booked" (Future) NOW reduces availability again (Hard Booking)
      const dynamicAvailable = Math.max(0, (zone.capacity || 0) - reservedCount - prebookedCount);

      return {
        _id: zone._id,
        name: zone.name || "Unnamed Zone",
        polygon: zone.polygon || [],

        // Return explicit counts
        capacity: zone.capacity || 0,
        available: dynamicAvailable,

        // Computed stats
        reserved: reservedCount,
        prebooked: prebookedCount,
      };
    });

    res.json(response);
  } catch (err) {
    console.error("❌ GET / ERROR:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Mount reserve router
app.use("/", reserveRouter);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend server listening on http://localhost:${PORT}`);
});
