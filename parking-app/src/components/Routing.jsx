import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet-routing-machine";

const Routing = ({ from, to }) => {
  const map = useMap();

  useEffect(() => {
    if (!from || !to || !map) return;

    let routingControl = L.Routing.control({
      waypoints: [
        L.latLng(from[0], from[1]),
        L.latLng(to[0], to[1]),
      ],
      lineOptions: {
        styles: [{ color: "#3388ff", weight: 5, opacity: 0.7 }],
      },
      addWaypoints: false,
      draggableWaypoints: false,
      fitSelectedRoutes: false,
      createMarker: () => null, // Don't add new markers
    }).addTo(map);

    return () => map.removeControl(routingControl);
  }, [from, to, map]);

  return null;
};

export default Routing;
