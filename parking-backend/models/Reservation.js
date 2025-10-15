const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true
  },
  zoneName: {
    type: String,
    required: true
  },
  timestampStart: {
    type: Date,
    required: true
  },
  timestampEnd: {
    type: Date,
    required: true
  }
});

module.exports = mongoose.model('Reservation', reservationSchema);
