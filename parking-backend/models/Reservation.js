const mongoose = require("mongoose");

const reservationSchema = new mongoose.Schema(
  {
    zoneId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "parkingzones",
      required: true,
    },

    userId: {
      type: String,
      required: true,
    },

    fromTime: {
      type: Date,
      required: true,
    },

    toTime: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "expired", "cancelled", "booked", "reserved", "parked"],
      default: "booked",
    },
    parkedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Model name "Reservation" maps to "reservations" collection (Mongoose pluralizes) in parkingappDB database
module.exports = mongoose.model("Reservation", reservationSchema);
