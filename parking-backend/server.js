const express = require("express");
const app = express();
const cors = require("cors");
const mongoose = require("mongoose");
const Zone = require("./models/Zone");
const Reservation = require("./models/Reservation");

app.use(cors());
app.use(express.json());

mongoose
  .connect("mongodb://127.0.0.1:27017/parkingappDB")
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log("Mongo error", err));


app.get("/", async (req, res) => {
  try {
    const zones = await Zone.find();
    const now = new Date();

    // Get all active reservations across all zones for accurate counting
    const activeReservations = await Reservation.find({
      status: "active"
    });

    // Create a map: zoneId -> Set of reserved slotIds
    const reservedSlotsByZone = new Map();
    activeReservations.forEach((res) => {
      const zoneIdStr = res.zoneId.toString();
      if (!reservedSlotsByZone.has(zoneIdStr)) {
        reservedSlotsByZone.set(zoneIdStr, new Set());
      }
      reservedSlotsByZone.get(zoneIdStr).add(res.slotId);
    });

    const response = zones.map(zone => {
      const totalSlots = zone.slots.length;
      const zoneIdStr = zone._id.toString();
      
      // Count reserved slots based on ACTIVE reservations (not stale Zone document)
      const reservedSlotIds = reservedSlotsByZone.get(zoneIdStr) || new Set();
      const reservedCount = reservedSlotIds.size;
      
      // Calculate available: Total - Reserved
      // Ensure it never goes negative (safety check)
      const availableSlots = Math.max(0, totalSlots - reservedCount);

      // Validation: Ensure capacity matches total slots and available is correct
      if (availableSlots + reservedCount !== totalSlots) {
        console.warn(`Zone ${zone.name}: Calculation mismatch. Total: ${totalSlots}, Reserved: ${reservedCount}, Available: ${availableSlots}`);
      }

      return {
        _id: zone._id,
        name: zone.name,
        polygon: zone.polygon,
        loc: zone.loc,
        capacity: totalSlots, // Total number of slots
        available: availableSlots, // Available = Total - Reserved (from active reservations)
        reserved: reservedCount, // Reserved count for display
        parts: totalSlots,
        slots: zone.slots.map(s => ({
          slotId: s.slotId,
          tag: s.tag,
          status: reservedSlotIds.has(s.slotId) ? "reserved" : "free", // Calculate from active reservations
          polygon: s.polygon
        }))
      };
    });

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
});

app.listen(5000, () =>
  console.log("Backend running on http://localhost:5000")
);
