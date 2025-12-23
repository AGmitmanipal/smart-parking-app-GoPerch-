const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cron = require("node-cron");

const Reservation = require("../models/Reservation");
const Zone = require("../models/Zone");

const app = express();
app.use(cors());
app.use(express.json());

// ================= DB =================
mongoose
  .connect("mongodb://127.0.0.1:27017/parkingappDB")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ Mongo error:", err));

// ================= CRON =================
// Runs every minute
cron.schedule("* * * * *", async () => {
  const now = new Date();

  try {
    const expired = await Reservation.find({
      endTime: { $lt: now },
      status: "active",
    });

    for (const r of expired) {
      await Zone.updateOne(
        { _id: r.zoneId, "slots.slotId": r.slotId },
        {
          $set: {
            "slots.$.status": "free",
            "slots.$.occupiedBy": null,
          },
        }
      );

      r.status = "completed";
      await r.save();
    }

    if (expired.length > 0) {
      console.log(`🧹 Cleared ${expired.length} expired reservations`);
    }
  } catch (err) {
    console.error("❌ Cron error:", err);
  }
});

// ================= GET BOOKINGS =================
app.get("/reserve/book", async (req, res) => {
  // Support both ?userId= and legacy ?email= so old frontends keep working
  const userId = req.query.userId || req.query.email;

  console.log("📥 Fetching bookings for userId:", userId);

  if (!userId) {
    return res.status(400).json({ message: "userId or email required" });
  }

  try {
    // Fetch ALL reservations for this userId (active, completed, cancelled)
    // Sort by most recent first (endTime descending)
    const bookings = await Reservation.find({ userId }).sort({
      endTime: -1, // Most recent first
    });

    console.log(`📊 Found ${bookings.length} reservations for userId: ${userId}`);

    // Populate zoneName and slotTag from Zone document for each reservation
    const bookingsWithDetails = await Promise.all(
      bookings.map(async (booking) => {
        try {
          const zone = await Zone.findById(booking.zoneId);
          if (zone) {
            const slot = zone.slots.find((s) => s.slotId === booking.slotId);
            return {
              ...booking.toObject(),
              zoneName: zone.name,
              slotTag: slot ? slot.tag : booking.slotId,
            };
          }
          return booking.toObject();
        } catch (err) {
          console.error(`Error populating booking ${booking._id}:`, err);
          return booking.toObject();
        }
      })
    );

    res.json(bookingsWithDetails);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load bookings" });
  }
});

// ================= RESERVE SLOT =================
app.post("/reserve", async (req, res) => {
  const { userId, zoneId, slotId, zoneName, slotTag, startTime, endTime } = req.body;

  console.log("📥 Incoming reservation:", req.body);

  // 🔍 Validate required fields
  const missing = [];
  if (!userId) missing.push("userId");
  if (!zoneId) missing.push("zoneId");
  if (!slotId) missing.push("slotId");
  if (!startTime) missing.push("startTime");
  if (!endTime) missing.push("endTime");

  if (missing.length > 0) {
    return res.status(400).json({
      missing
    });
  }

  try {
    const zone = await Zone.findById(zoneId);
    if (!zone) {
      return res.status(404).json({ message: "Zone not found" });
    }

    const slot = zone.slots.find(s => s.slotId === slotId);
    if (!slot) {
      console.error(`❌ Slot not found: zoneId=${zoneId}, slotId=${slotId}, available slots:`, 
        zone.slots.map(s => s.slotId));
      return res.status(404).json({ 
        message: `Slot not found. Slot ID: ${slotId}` 
      });
    }

    // 🔒 Check availability based on ACTIVE reservations (not stale Zone document status)
    // This ensures consistency with what the frontend displays
    const now = new Date();
    const requestedStartTime = new Date(startTime);
    const requestedEndTime = new Date(endTime);

    // Ensure zoneId is ObjectId for proper comparison
    const zoneObjectId = typeof zoneId === 'string' ? new mongoose.Types.ObjectId(zoneId) : zoneId;

    // Check for any active reservations that overlap with the requested time
    const clash = await Reservation.findOne({
      zoneId: zoneObjectId,
      slotId: slotId,
      status: "active",
      startTime: { $lt: requestedEndTime },
      endTime: { $gt: requestedStartTime },
    });

    if (clash) {
      console.log(`⚠️ Reservation clash detected: slotId=${slotId}, clash reservation:`, clash._id);
      return res
        .status(409)
        .json({ message: "Slot already reserved for that time" });
    }

    // Also check if there's a current active reservation (slot is currently occupied)
    const currentReservation = await Reservation.findOne({
      zoneId: zoneObjectId,
      slotId: slotId,
      status: "active",
      startTime: { $lte: now },
      endTime: { $gte: now },
    });

    if (currentReservation) {
      console.log(`⚠️ Slot currently reserved: slotId=${slotId}, reservation:`, currentReservation._id);
      return res.status(409).json({ 
        message: "Slot is currently reserved. Please select a different time slot." 
      });
    }

    console.log(`✅ Slot available for reservation: zoneId=${zoneId}, slotId=${slotId}`);
    console.log(`👤 Creating reservation for userId (email): ${userId}`);

    const reservation = new Reservation({
      userId,
      zoneId: zoneObjectId, // Use ObjectId version
      slotId,
      startTime,
      endTime,
    });

    await reservation.save();

    await Zone.updateOne(
      { _id: zoneId, "slots.slotId": slotId },
      {
        $set: {
          "slots.$.status": "reserved",
          "slots.$.occupiedBy": userId,
        },
      }
    );

    res.status(200).json({
      message: "✅ Slot reserved successfully",
      reservationId: reservation._id,
    });
  } catch (err) {
    console.error("❌ Reservation error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ================= CANCEL RESERVATION =================
const cancelReservationHandler = async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id);
    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    await Zone.updateOne(
      { _id: reservation.zoneId, "slots.slotId": reservation.slotId },
      {
        $set: {
          "slots.$.status": "free",
          "slots.$.occupiedBy": null,
        },
      }
    );

    reservation.status = "cancelled";
    await reservation.save();

    res.json({ message: "✅ Reservation cancelled" });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
};

app.delete("/reserve/:id", cancelReservationHandler);
// Legacy alias to support old frontend calling /reserve/del/:id
app.delete("/reserve/del/:id", cancelReservationHandler);

// ================= SLOT AVAILABILITY FOR A ZONE =================
// Returns slotId + status for each slot in a zone
// Status is calculated from ACTIVE reservations, not from stale Zone document
app.get("/zones/:zoneId/slots-status", async (req, res) => {
  const { zoneId } = req.params;

  try {
    const zone = await Zone.findById(zoneId);
    if (!zone) {
      return res.status(404).json({ message: "Zone not found" });
    }

    // Get all ACTIVE reservations for this zone
    // A slot should be RED if it has an active reservation with status="active"
    const now = new Date();
    
    // Find all active reservations that are currently valid (between startTime and endTime)
    // This ensures slots show RED only when they are actually reserved right now
    const activeReservations = await Reservation.find({
      zoneId: zoneId,
      status: "active" // Only check reservations with status="active"// Reservation hasn't ended yet
    });

    console.log(`🔍 Found ${activeReservations.length} currently active reservations for zone ${zoneId}`);

    // Create a map of slotId -> "reserved" status
    const reservedSlots = new Map();
    activeReservations.forEach((res) => {
      reservedSlots.set(res.slotId, "reserved");
      console.log(`  ✅ Slot ${res.slotId} → RED (has active reservation)`);
    });

    // Calculate status for each slot based on ACTIVE reservations
    const slots = zone.slots.map((s) => {
      // If there's an active reservation (status="active"), mark as reserved (RED)
      // Otherwise, mark as free (GREEN)
      const status = reservedSlots.has(s.slotId) ? "active" : "free";
      
      // Log for debugging
      if (status === "active") {
        console.log(`  🔴 Slot ${s.slotId} → RED (has active reservation)`);
      } else {
        console.log(`  🟢 Slot ${s.slotId} → GREEN (free)`);
      }
      
      return {
        slotId: s.slotId,
        status: status,
      };
    });

    res.json(slots);
  } catch (err) {
    console.error("Error fetching slot statuses:", err);
    res.status(500).json({ message: "Failed to load slot availability" });
  }
});

// ================= START =================
app.listen(7000, () => {
  console.log("🚀 Server running on port 7000");
});
