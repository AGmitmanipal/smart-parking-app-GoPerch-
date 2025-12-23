const mongoose = require("mongoose");
const SlotSchema = require("./SlotSchema");

const ZoneSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },

    // Big geofence
    polygon: {
      type: [
        {
          lat: { type: Number, required: true },
          lng: { type: Number, required: true },
        },
      ],
      required: true,
    },

    // Slot-level geofencing (IMPORTANT)
    slots: {
      type: [SlotSchema],
      required: true,
      validate: v => v.length > 0,
    },

    capacity: {
      type: Number,
      required: true,
    },

    available: {
      type: Number,
      required: true,
    },

    parts: {
      type: Number,
      required: true, // number of slots
    },

    loc: {
      lat: Number,
      lng: Number,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("parkingzones", ZoneSchema);
