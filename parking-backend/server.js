const express = require("express");
const app = express();
const admin = require("firebase-admin");
const cors = require("cors");
const mongoose = require("mongoose");
const Zone = require('./models/Zone')
const Reservation = require('./models/Reservation')

app.use(cors());
app.use(express.json());


mongoose.connect('mongodb://127.0.0.1:27017/parkingappDB', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(()=>{
  console.log('Mongodb is connected')
}).catch((err)=>{
  console.log('Error', err)
})


app.get('/', async (req, res) => {
  try {
    const zones = await Zone.find();

    const zonesWithAvailability = await Promise.all(
      zones.map(async (zone) => {
        
        const reservedCount = await Reservation.countDocuments({ zoneName: zone.name });
        return {
          name: zone.name,
          polygon: zone.polygon,
          capacity: zone.capacity,
          available: zone.capacity - reservedCount
        };
      })
    );

    res.json(zonesWithAvailability);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err });
  }
});


app.listen(5000, () => console.log('Backend running on http://localhost:5000'));
