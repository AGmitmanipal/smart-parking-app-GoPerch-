const express = require("express");
const mongoose = require("mongoose");
const cron = require("node-cron");
const Reservation = require("../models/Reservation");
const Zone = require("../models/Zone");

const router = express.Router();
let cronStarted = false;

function startReservationCron() {
  if (cronStarted) return;
  cronStarted = true;

  // ================= CRON JOB =================
  cron.schedule("* * * * *", async () => {
    const now = new Date();
    try {
      // Find expired reservations
      const expiredList = await Reservation.find({
        status: { $in: ["active", "booked", "reserved", "parked"] },
        toTime: { $lt: now }
      });

      if (expiredList.length > 0) {
        console.log(`♻️ Found ${expiredList.length} expired reservations. Processing cleanup...`);
        await Reservation.updateMany(
          { _id: { $in: expiredList.map(r => r._id) } },
          { $set: { status: "expired" } }
        );
      }
    } catch (err) {
      console.error("❌ Cron error:", err);
    }
  });
}

// ================= GET USER BOOKINGS =================
router.get("/reserve/book", async (req, res) => {
  const userId = req.query.userId || req.query.email;
  if (!userId) {
    return res.status(400).json({ message: "userId required" });
  }

  try {
    const bookings = await Reservation.find({ userId }).sort({ toTime: -1 });
    const detailed = await Promise.all(bookings.map(async b => {
      const z = await Zone.findById(b.zoneId).select("name");
      return {
        ...b.toObject(),
        zoneName: z ? z.name : "Unknown Zone"
      };
    }));
    res.json(detailed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load bookings" });
  }
});

// ================= MAKE RESERVATION =================
router.post("/reserve", async (req, res) => {
  const { userId, zoneId, fromTime, toTime } = req.body;

  if (!userId || !zoneId || !fromTime || !toTime) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const start = new Date(fromTime);
  const end = new Date(toTime);

  if (start >= end) {
    return res.status(400).json({ message: "Invalid time range" });
  }

  // STRICT VALIDATION: Check for past time
  if (start.getTime() <= Date.now()) {
    return res.status(400).json({
      message: "Cannot book or reserve past time. Please select a future time."
    });
  }

  try {
    const zone = await Zone.findById(zoneId);
    if (!zone) return res.status(404).json({ message: "Zone not found" });

    // 1. Check Existing Active Reservation (STRICT 1-PER-USER)
    // "if it has active reservation dont let the same user reserve again"
    // 3. USER CONSTRAINT CHECK (STRICT 1-PER-USER)
    // Single Source of Truth: Check if user has ANY active claim in this zone regardless of time.
    // "User can never create more than one active parking action within the same zone"
    const existing = await Reservation.findOne({
      userId,
      zoneId,
      status: { $in: ["active", "booked", "reserved", "parked"] }
    });

    // Check Intent: Is the user physically arriving NOW? (within 5 min buffer)
    const isAccessingNow = start.getTime() <= (Date.now() + 5 * 60000);

    if (existing) {
      // 3a. CHECK-IN LOGIC (Conversion)
      // Only allowed if User is Arriving Now AND Times Overlap with their EXISTING slot
      const overlapsOwn = (existing.fromTime < end) && (existing.toTime > start);

      if (isAccessingNow && overlapsOwn) {
        // Convert 'booked' -> 'reserved' (Parked)
        if (existing.status === 'booked') {
          existing.status = 'reserved';
          existing.parkedAt = new Date();
          await existing.save();
          return res.json({
            message: "Welcome! Pre-booking activated.",
            reservationId: existing._id,
            status: "reserved"
          });
        }
        // If already parked
        if (['reserved', 'parked'].includes(existing.status)) {
          return res.json({
            message: "Welcome back!",
            reservationId: existing._id,
            status: existing.status
          });
        }
      }

      // 3b. REJECTION
      // If we found ANY record and it wasn't a valid check-in, we strictly block.
      return res.status(409).json({
        message: "You already have an active reservation or booking in this zone. Limit 1 per user."
      });
    }

    // 4. ATOMIC VISUALIZATION & CAPACITY CHECK
    // Determine target status
    const targetStatus = isAccessingNow ? "reserved" : "booked";

    // Count all records that consume capacity ("booked", "reserved", "parked")
    // and overlap with the Requested Window.
    const capacityConsumers = await Reservation.countDocuments({
      zoneId: zoneId,
      status: { $in: ["active", "booked", "reserved", "parked"] },
      $and: [
        { fromTime: { $lt: end } },
        { toTime: { $gt: start } }
      ]
    });

    if (capacityConsumers >= zone.capacity) {
      return res.status(409).json({ message: "Zone is fully booked for this time range." });
    }

    // 5. CREATE (Atomic Insertion)
    const newReservation = new Reservation({
      userId,
      zoneId,
      fromTime: start,
      toTime: end,
      status: targetStatus,
      parkedAt: targetStatus === 'reserved' ? new Date() : undefined
    });

    await newReservation.save();

    res.json({
      message: targetStatus === 'booked' ? "Pre-booking Confirmed" : "Parking Confirmed",
      reservationId: newReservation._id,
      status: targetStatus
    });

  } catch (err) {
    console.error("Reservation Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

// ================= CANCEL RESERVATION =================
router.delete("/reserve/:id", async (req, res) => {
  try {
    const r = await Reservation.findById(req.params.id);
    if (!r) return res.status(404).json({ message: "Reservation not found" });

    r.status = "cancelled";
    await r.save();

    res.json({ message: "Cancelled successfully" });
  } catch (err) {
    res.status(500).json({ message: "Cancel failed" });
  }
});

module.exports = { reserveRouter: router, startReservationCron };
