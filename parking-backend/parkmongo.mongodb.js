use('parkingappDB');

db.parkingzones.updateOne(
  { name: "AB4 Manipal" },   // filter by zone name
  {
    $set: {
      polygon: [
        { lat: 13.3529996621550535, lng: 74.79246201891901 },
        { lat: 13.3529984651404832, lng: 74.79247735243494 },
        { lat: 13.352992628944945, lng: 74.79247910844694 },
        { lat: 13.352951844405364, lng: 74.79240078815428 }
      ]
    }
  }
);

print("✅ AB4 Manipal coordinates updated successfully");
