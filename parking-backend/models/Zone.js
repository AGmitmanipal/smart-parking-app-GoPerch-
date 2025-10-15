const mongoose = require('mongoose');

const ZoneSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  polygon: {
    type: [
      {
        lat: Number,
        lng: Number,
      }
    ],
    required: true,
  },
  capacity: {
    type: Number,
    required: true,
  },
  available: {
    type: Number,
    required: true,
  }
});

module.exports = mongoose.model('parkingzones', ZoneSchema);
