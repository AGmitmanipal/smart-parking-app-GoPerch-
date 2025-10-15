import L from 'leaflet';
import 'leaflet-routing-machine';
import { useMap } from 'react-leaflet';
import React, { useState, useEffect } from 'react';

const Routing = ({ from, to }) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const routingControl = L.Routing.control({
      waypoints: [L.latLng(...from), L.latLng(...to)],
      routeWhileDragging: true,
    }).addTo(map);

    return () => map.removeControl(routingControl);
  }, [map, from, to]);

  return null;
};

export default Routing;
