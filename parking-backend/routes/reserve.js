const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Reservation = require('../models/Reservation');
const cron = require('node-cron');
const Zone = require('../models/Zone')

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect('mongodb://127.0.0.1:27017/parkingappDB')
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

cron.schedule('* * * * *', async () => {
  const now = new Date();
  try {
    const result = await Reservation.deleteMany({ timestampEnd: { $lt: now } });
    console.log(`Deleted ${result.deletedCount} expired reservations`);

  } catch (err) {
    console.error(err);
  }
});

app.get('/reserve/book', async (req, res) => {
  const { email } = req.query
  if (!email) {
    res.send(400).json({ message: "Email not found" })
  }
  const bookedemail = await Reservation.find({ email })
  try {
    res.json(bookedemail)
  }
  catch (err) {
    res.send(400).json({ message: "Couldn't load your bookings" })
  }
})

app.post('/reserve', async (req, res) => {
  const { email, zoneName, timestampStart, timestampEnd } = req.body;

  try {

    const zone = await Zone.findOne({ name: zoneName });
    if (!zone) {
      return res.status(404).json({ message: "Zone not found" });
    }


    const reservedCount = await Reservation.countDocuments({ zoneName });
    const available = zone.capacity - reservedCount;


    if (available <= 0) {
      return res.status(400).json({ message: "All seats are full in this zone" });
    }

    const overlapping = await Reservation.findOne({
      zoneName,
      $or: [{
        timestampStart: { $lt: new Date(timestampEnd) },
        timestampEnd: { $gt: new Date(timestampStart) }
      }]
    })

    if (overlapping) {
      return res.status(200).json({ message: "Reservation time clashes with an existing booking in this zone" })
    }


    const reservation = new Reservation({
      email,
      zoneName,
      timestampStart,
      timestampEnd
    });
    await reservation.save();

    res.status(200).json({ message: "Reservation saved!" });

  } catch (err) {
    console.error('Error saving reservation:', err);
    res.json({ error: 'Server error' });
  }
});

app.delete('/reserve/del/:id', async (req, res) => {
  try {
    const {id} = req.params
    const d = await Reservation.findByIdAndDelete(id)
    res.status(200).send({message: "deletion successful"})
  }
  catch (er) {
    res.status(400).send(er)
  }
})



app.listen(7000, () => console.log('Server running on port 7000'));
