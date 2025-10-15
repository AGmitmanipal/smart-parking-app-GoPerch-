use('parkingappDB');

db.parkingzones.update({name: "Block 18"}, {$set: {available: 5, capacity: 10}});

console.log(`Done`);

