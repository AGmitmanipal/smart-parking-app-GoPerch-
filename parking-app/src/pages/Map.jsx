import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { MapContainer, TileLayer, Polygon, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import * as turf from "@turf/turf";
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
import Routing from '../components/Routing';

/* ----------------------------------
   Smoothly pan the map to new position
---------------------------------- */
const SmoothRecenter = ({ position }) => {
  const map = useMap();
  const prevPos = useRef(null);

  useEffect(() => {
    if (!position || !map) return;

    const [lat, lng] = position;
    if (!prevPos.current) {
      prevPos.current = position;
      map.setView(position, 19);
      return;
    }

    const [prevLat, prevLng] = prevPos.current;
    const distance = map.distance([prevLat, prevLng], [lat, lng]);

    // If moved more than 2 meters, pan smoothly
    if (distance > 2) {
      map.panTo(position, { animate: true, duration: 0.8 });
      prevPos.current = position;
    }
  }, [position, map]);

  return null;
};

/* ----------------------------------
   Auto-fit map to polygon once
---------------------------------- */
const FitBoundsMap = ({ bounds }) => {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) map.fitBounds(bounds);
  }, [bounds]);
  return null;
};

/* ----------------------------------
   Main Map Component
---------------------------------- */
const Map = () => {
  const location = useLocation();
  const zone = location.state;
  const [currentPos, setCurrentPos] = useState(null);
  const [isInsideZone, setIsInsideZone] = useState(false);
  const markerRef = useRef(null);

  if (!zone) return <p>No zone selected</p>;

  // Compute zone center
  const avgLat = zone.polygon.reduce((sum, p) => sum + p.lat, 0) / zone.polygon.length;
  const avgLng = zone.polygon.reduce((sum, p) => sum + p.lng, 0) / zone.polygon.length;
  const destination = [avgLat, avgLng];

  
  useEffect(() => {
    if (!navigator.geolocation) return console.log("GPS not supported");

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        // Smooth marker update without re-rendering
        if (markerRef.current) markerRef.current.setLatLng([lat, lng]);

        setCurrentPos((prev) => {
          // Skip if same coordinates (prevents flicker)
          if (prev && Math.abs(prev[0] - lat) < 0.00001 && Math.abs(prev[1] - lng) < 0.00001)
            return prev;

          // Turf polygon check
          const point = turf.point([lng, lat]);
          const polygonCoords = zone.polygon.map(p => [p.lng, p.lat]);
          if (polygonCoords[0][0] !== polygonCoords[polygonCoords.length - 1][0] ||
              polygonCoords[0][1] !== polygonCoords[polygonCoords.length - 1][1]) {
            polygonCoords.push(polygonCoords[0]);
          }
          const polygon = turf.polygon([polygonCoords]);
          const inside = turf.booleanPointInPolygon(point, polygon);
          setIsInsideZone(inside);

          return [lat, lng];
        });
      },
      (err) => console.log("GPS error:", err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [zone]);

  /* ----------------------------------
     Marker Styles
  ---------------------------------- */
  const insideIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/190/190411.png',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  const outsideIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/64/64113.png',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  const destIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/447/447031.png',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  if (!currentPos) return <p>Loading your location...</p>;

  return (
    <div className="h-screen w-full">
      <h1 className="text-2xl font-bold mb-4 p-4">
        {zone.name} —{" "}
        <span className={isInsideZone ? "text-green-600" : "text-red-600"}>
          {isInsideZone ? "Inside Zone" : "Outside Zone"}
        </span>
      </h1>

      <MapContainer
        center={currentPos}
        zoom={19}
        style={{ height: "100vh", width: "100%" }}
        zoomControl={true}
        scrollWheelZoom={true}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
        />

        {/* Zone polygon */}
        <Polygon
          positions={zone.polygon.map((p) => [p.lat, p.lng])}
          pathOptions={{
            color: isInsideZone ? "green" : "blue",
            fillOpacity: 0.3,
          }}
        />

        {/* Live marker — smooth updates via ref */}
        <Marker
          ref={markerRef}
          position={currentPos}
          icon={isInsideZone ? insideIcon : outsideIcon}
        >
          <Popup>
            You are {isInsideZone ? "inside" : "outside"} the zone
          </Popup>
        </Marker>

        {/* Destination marker */}
        <Marker position={destination} icon={destIcon}>
          <Popup>Destination</Popup>
        </Marker>

        <Routing from={currentPos} to={destination} />
        <SmoothRecenter position={currentPos} />
        <FitBoundsMap bounds={zone.polygon.map((p) => [p.lat, p.lng])} />
      </MapContainer>
    </div>
  );
};

export default Map;