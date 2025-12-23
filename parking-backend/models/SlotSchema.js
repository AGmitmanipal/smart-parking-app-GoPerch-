const mongoose = require("mongoose");

const SlotSchema = new mongoose.Schema(
  {
    slotId: {
      type: String,
      required: true,
    },

    index: {
      type: Number,
      required: true,
    },

    tag: {
      type: String,
      required: true,
    },

    polygon: {
      type: [
        {
          lat: { type: Number, required: true },
          lng: { type: Number, required: true },
        },
      ],
      required: true,
    },

    status: {
      type: String,
      enum: ["free", "reserved", "occupied"],
      default: "free",
    },

    occupiedBy: {
      type: String,
      default: null,
    },

    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false } // ✅ REQUIRED for embedded schemas
);

module.exports = SlotSchema; // ✅ EXPORT SCHEMA, NOT MODEL
