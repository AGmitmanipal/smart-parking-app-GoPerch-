import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MapContainer, TileLayer, Polygon, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Routing from '../components/Routing';

const RecenterMap = ({ position }) => {
  const map = useMap();
  useEffect(() => {
    if (position && position[0] !== 0 && position[1] !== 0) {
      map.flyTo(position, map.getZoom(), { animate: true, duration: 0.7 });
    }
  }, [position]);
  return null;
};

const Map = () => {
  const location = useLocation();
  const zone = location.state;
  const [currentPos, setCurrentPos] = useState(null);

  if (!zone) return <p>No zone selected</p>;

  const avgLat = zone.polygon.reduce((sum, p) => sum + p.lat, 0) / zone.polygon.length;
  const avgLng = zone.polygon.reduce((sum, p) => sum + p.lng, 0) / zone.polygon.length;
  const destination = [avgLat, avgLng];

  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        // Only update if accuracy is better than 50 meters
        if (pos.coords.accuracy < 50) {
          setCurrentPos([pos.coords.latitude, pos.coords.longitude]);
        }
      },
      (err) => console.log('GPS error:', err),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const userIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/64/64113.png',
    iconSize: [40, 40],
    iconAnchor: [20, 40],
  });

  if (!currentPos) return <p>Loading your location...</p>; // wait until GPS available


  return (
    <div className="h-screen w-full">
      <h1 className="text-2xl font-bold mb-4 p-4">{zone.name}</h1>

      <MapContainer
        center={currentPos}
        zoom={16}
        style={{ height: '90%', width: '100%' }}
        scrollWheelZoom={true}
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
        />

        <Polygon
          positions={zone.polygon.map(p => [p.lat, p.lng])}
          pathOptions={{ color: 'blue', fillOpacity: 0.3 }}
        />

        {zone.polygon.map((p, idx) => (
          <Marker key={idx} position={[p.lat, p.lng]}>
            <Popup>Point {idx + 1}</Popup>
          </Marker>
        ))}

        <Marker position={currentPos} icon={userIcon}>
          <Popup>You are here</Popup>
        </Marker>

        <Marker position={destination} icon={destIcon}>
          <Popup>Destination</Popup>
        </Marker>

        <Routing from={currentPos} to={destination} />

        <RecenterMap position={currentPos} />

        <FitBoundsMap bounds={zone.polygon.map(p => [p.lat, p.lng])} />
      </MapContainer>

    </div>
  );
};

export default Map;


