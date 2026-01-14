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
  // Runs every minute to:
  // 1. Transition "booked" (pre-bookings) → "reserved" when time window starts (fromTime <= now)
  // 2. Expire "reserved" reservations when time window ends (toTime < now)
  cron.schedule("* * * * *", async () => {
    const now = new Date();
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();

      // ================= TRANSITION: booked → reserved =================
      // When pre-booking time window starts, convert to active reservation
      const bookingsToActivate = await Reservation.find({
        status: "booked",
        fromTime: { $lte: now },
        toTime: { $gt: now } // Still valid (not expired)
      }).session(session);

      if (bookingsToActivate.length > 0) {
        console.log(`🔄 Converting ${bookingsToActivate.length} pre-bookings to active reservations...`);
        await Reservation.updateMany(
          { 
            _id: { $in: bookingsToActivate.map(r => r._id) },
            status: "booked",
            fromTime: { $lte: now },
            toTime: { $gt: now }
          },
          { 
            $set: { 
              status: "reserved",
              parkedAt: now
            } 
          },
          { session }
        );
      }

      // ================= EXPIRE: reserved → expired =================
      // When reservation time window ends, mark as expired
      const expiredReservations = await Reservation.find({
        status: "reserved",
        toTime: { $lt: now }
      }).session(session);

      if (expiredReservations.length > 0) {
        console.log(`♻️ Expiring ${expiredReservations.length} reservations...`);
        await Reservation.updateMany(
          { 
            _id: { $in: expiredReservations.map(r => r._id) },
            status: "reserved",
            toTime: { $lt: now }
          },
          { $set: { status: "expired" } },
          { session }
        );
      }

      // ================= EXPIRE: booked → expired =================
      // Pre-bookings that never activated (expired before fromTime was reached)
      const expiredBookings = await Reservation.find({
        status: "booked",
        toTime: { $lt: now }
      }).session(session);

      if (expiredBookings.length > 0) {
        console.log(`♻️ Expiring ${expiredBookings.length} pre-bookings that never activated...`);
        await Reservation.updateMany(
          { 
            _id: { $in: expiredBookings.map(r => r._id) },
            status: "booked",
            toTime: { $lt: now }
          },
          { $set: { status: "expired" } },
          { session }
        );
      }

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      console.error("❌ Cron error:", err);
    } finally {
      session.endSession();
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

// ================= CREATE PRE-BOOKING =================
// Pre-bookings are future intent, marked as "booked" status, count as "prebooked"
router.post("/prebook", async (req, res) => {
  const { userId, zoneId, fromTime, toTime } = req.body;

  if (!userId || !zoneId || !fromTime || !toTime) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const start = new Date(fromTime);
  const end = new Date(toTime);
  const now = new Date();

  if (start >= end) {
    return res.status(400).json({ message: "Invalid time range" });
  }

  // Pre-bookings must be for future time
  if (start.getTime() <= now.getTime()) {
    return res.status(400).json({ 
      message: "Pre-bookings must be for future time. Use /reserve for immediate reservations." 
    });
  }

  // Use MongoDB session for atomic transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const zone = await Zone.findById(zoneId).session(session);
    if (!zone) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Zone not found" });
    }

    // ================= ENFORCE ONE ACTIVE ACTION PER ZONE =================
    const existing = await Reservation.findOne({
      userId,
      zoneId,
      status: { $in: ["booked", "reserved"] }
    }).session(session);

    if (existing) {
      await session.abortTransaction();
      return res.status(409).json({ 
        message: "You already have an active pre-booking or reservation in this zone." 
      });
    }

    // ================= CAPACITY CHECK =================
    const overlappingReservations = await Reservation.countDocuments({
      zoneId: zoneId,
      status: { $in: ["reserved", "booked"] },
      $and: [
        { fromTime: { $lt: end } },
        { toTime: { $gt: start } }
      ]
    }).session(session);

    const totalReserved = await Reservation.countDocuments({
      zoneId: zoneId,
      status: "reserved"
    }).session(session);

    const totalBooked = await Reservation.countDocuments({
      zoneId: zoneId,
      status: "booked"
    }).session(session);

    const overallAvailable = Math.max(0, zone.capacity - totalReserved - totalBooked);

    if (overlappingReservations >= zone.capacity) {
      await session.abortTransaction();
      return res.status(409).json({ 
        message: "Zone is fully booked for this time range." 
      });
    }

    if (overallAvailable <= 0) {
      await session.abortTransaction();
      return res.status(409).json({ 
        message: "Zone is fully booked. No available spots." 
      });
    }

    // ================= CREATE PRE-BOOKING =================
    // Pre-bookings are marked as "booked" status, count as "prebooked"
    const newPreBooking = new Reservation({
      userId,
      zoneId,
      fromTime: start,
      toTime: end,
      status: "booked", // Pre-booking status
      parkedAt: undefined // No parkedAt for pre-bookings
    });

    await newPreBooking.save({ session });
    await session.commitTransaction();

    res.json({
      message: "Pre-booking confirmed. Your reservation will activate at the scheduled time.",
      reservationId: newPreBooking._id,
      status: newPreBooking.status
    });

  } catch (err) {
    await session.abortTransaction();
    
    if (err.code === 11000) {
      return res.status(409).json({ 
        message: "You already have an active pre-booking or reservation in this zone." 
      });
    }
    
    console.error("❌ Pre-booking Error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  } finally {
    session.endSession();
  }
});

// ================= MAKE RESERVATION =================
// Reservations are active parking, marked as "reserved" status, count as "reserved"
router.post("/reserve", async (req, res) => {
  const { userId, zoneId, fromTime, toTime } = req.body;

  if (!userId || !zoneId || !fromTime || !toTime) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const start = new Date(fromTime);
  const end = new Date(toTime);
  const now = new Date();

  if (start >= end) {
    return res.status(400).json({ message: "Invalid time range" });
  }

  // Use MongoDB session for atomic transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const zone = await Zone.findById(zoneId).session(session);
    if (!zone) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Zone not found" });
    }

    // ================= ENFORCE ONE ACTIVE ACTION PER ZONE =================
    // Check for existing active reservation or pre-booking in the same zone
    const existing = await Reservation.findOne({
      userId,
      zoneId,
      status: { $in: ["booked", "reserved"] }
    }).session(session);

    if (existing) {
      // ================= CONVERSION LOGIC: Pre-booking → Reservation =================
      // If user has a pre-booking (booked) and is creating a reservation within valid window
      if (existing.status === 'booked') {
        // Check if user is within valid pre-booking window (fromTime <= now <= toTime)
        const isValidWindow = existing.fromTime <= now && now <= existing.toTime;
        // Check if new request overlaps with existing pre-booking
        const overlapsOwn = (existing.fromTime < end) && (existing.toTime > start);

        if (isValidWindow && overlapsOwn) {
          // ATOMIC CONVERSION: Pre-booking → Reservation
          // This decrements booked count and increments reserved count exactly once
          existing.status = 'reserved';
          existing.parkedAt = now;
          await existing.save({ session });

          await session.commitTransaction();
          return res.json({
            message: "Pre-booking converted to active reservation.",
            reservationId: existing._id,
            status: "reserved"
          });
        } else {
          // Pre-booking exists but not in valid window or doesn't overlap
          await session.abortTransaction();
          return res.status(409).json({ 
            message: "You already have a pre-booking in this zone. Cancel it first or wait for the valid time window." 
          });
        }
      }

      // If user already has an active reservation (reserved)
      if (existing.status === 'reserved') {
        // Check if it's the same time slot (idempotency)
        const isSameSlot = existing.fromTime.getTime() === start.getTime() && 
                          existing.toTime.getTime() === end.getTime();
        if (isSameSlot) {
          await session.abortTransaction();
          return res.json({
            message: "You already have an active reservation for this time slot.",
            reservationId: existing._id,
            status: "reserved"
          });
        } else {
          await session.abortTransaction();
          return res.status(409).json({ 
            message: "You already have an active reservation in this zone. Only one active action per zone allowed." 
          });
        }
      }
    }

    // ================= CAPACITY CHECK =================
    // Calculate availability for the requested time window
    // Check for overlapping reservations that would consume capacity
    // Reserved: active parking (status === "reserved")
    // Booked: future pre-bookings (status === "booked")
    // Both reserved and booked consume capacity, so we count both
    const overlappingReservations = await Reservation.countDocuments({
      zoneId: zoneId,
      status: { $in: ["reserved", "booked"] },
      $and: [
        { fromTime: { $lt: end } },  // Reservation starts before requested end
        { toTime: { $gt: start } }   // Reservation ends after requested start
      ]
    }).session(session);

    // Check overall availability: capacity - reserved - booked (all time)
    // This ensures we never exceed total capacity
    const totalReserved = await Reservation.countDocuments({
      zoneId: zoneId,
      status: "reserved"
    }).session(session);

    const totalBooked = await Reservation.countDocuments({
      zoneId: zoneId,
      status: "booked"
    }).session(session);

    const overallAvailable = Math.max(0, zone.capacity - totalReserved - totalBooked);

    // Check if there's capacity for the overlapping time window
    if (overlappingReservations >= zone.capacity) {
      await session.abortTransaction();
      return res.status(409).json({ 
        message: "Zone is fully booked for this time range." 
      });
    }

    // Also check overall availability to prevent exceeding capacity
    if (overallAvailable <= 0) {
      await session.abortTransaction();
      return res.status(409).json({ 
        message: "Zone is fully booked. No available spots." 
      });
    }

    // ================= CREATE NEW RESERVATION =================
    // Reservations are active parking, marked as "reserved" status immediately
    // This counts as "reserved" right away, not "booked"
    const newReservation = new Reservation({
      userId,
      zoneId,
      fromTime: start,
      toTime: end,
      status: "reserved", // Reservation status - active parking
      parkedAt: now // Set parkedAt immediately to mark as active
    });

    await newReservation.save({ session });
    await session.commitTransaction();

    res.json({
      message: "Reservation confirmed. Parking is active and counted as reserved.",
      reservationId: newReservation._id,
      status: newReservation.status
    });

  } catch (err) {
    await session.abortTransaction();
    
    if (err.code === 11000) {
      return res.status(409).json({ 
        message: "You already have an active reservation or pre-booking in this zone." 
      });
    }
    
    console.error("❌ Reservation Error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  } finally {
    session.endSession();
  }
});

// ================= CANCEL RESERVATION =================
router.delete("/reserve/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const r = await Reservation.findById(req.params.id).session(session);
    if (!r) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Reservation not found" });
    }

    // Only allow cancellation of active bookings/reservations
    if (!["booked", "reserved"].includes(r.status)) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: `Cannot cancel reservation with status: ${r.status}` 
      });
    }

    // Atomic cancellation: update status to cancelled
    r.status = "cancelled";
    await r.save({ session });
    await session.commitTransaction();

    res.json({ 
      message: "Cancelled successfully",
      reservationId: r._id
    });
  } catch (err) {
    await session.abortTransaction();
    console.error("❌ Cancel Error:", err);
    res.status(500).json({ message: "Cancel failed", error: err.message });
  } finally {
    session.endSession();
  }
});

module.exports = { reserveRouter: router, startReservationCron };
