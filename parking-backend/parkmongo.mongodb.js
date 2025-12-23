use("parkingappDB");

// ===== CONFIG =====
const ZONE_NAME = "Home";
const PARTS = 10;

// Center of parking area
const CENTER = {
  lat: 15.268866,
  lng: 74.003251
};

// 300m square (~0.0027 degrees)
const HALF = 0.00135;

// ===== BIG POLYGON (300m x 300m) =====
const polygon = [
  { lat: CENTER.lat - HALF, lng: CENTER.lng - HALF },
  { lat: CENTER.lat - HALF, lng: CENTER.lng + HALF },
  { lat: CENTER.lat + HALF, lng: CENTER.lng + HALF },
  { lat: CENTER.lat + HALF, lng: CENTER.lng - HALF }
];

// Bounds
const minLat = CENTER.lat - HALF;
const maxLat = CENTER.lat + HALF;
const minLng = CENTER.lng - HALF;
const maxLng = CENTER.lng + HALF;

// Slot width (divide by parts)
const slotWidth = (maxLng - minLng) / PARTS;

// ===== GENERATE SLOTS =====
const slots = [];

for (let i = 0; i < PARTS; i++) {
  const lngStart = minLng + i * slotWidth;
  const lngEnd = lngStart + slotWidth;

  slots.push({
    slotId: `slot-${i + 1}`,
    index: i,
    tag: `P${i + 1}`,
    polygon: [
      { lat: minLat, lng: lngStart },
      { lat: minLat, lng: lngEnd },
      { lat: maxLat, lng: lngEnd },
      { lat: maxLat, lng: lngStart }
    ],
    status: "free",
    occupiedBy: null,
    lastUpdated: new Date()
  });
}

// ===== UPDATE ZONE =====
db.parkingzones.updateOne(
  { name: ZONE_NAME },
  {
    $set: {
      polygon,
      slots,
      capacity: PARTS,
      available: PARTS,
      parts: PARTS,
      loc: CENTER,
      isActive: true
    }
  }
);

print(`✅ Zone "${ZONE_NAME}" updated with ${PARTS} slots (300m x 300m area)`);
