import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { Link } from "react-router-dom";

// 🔐 Mapbox token - Replace with your valid public token
const MAPBOX_TOKEN = "pk.eyJ1Ijoic3ViaGFtcHJlZXQiLCJhIjoiY2toY2IwejF1MDdodzJxbWRuZHAweDV6aiJ9.Ys8MP5kVTk5P9V2TDvnuDg" || "";

// --- Helpers ---

// Haversine distance in meters
const getDistMeters = (p1, p2) => {
  if (!p1 || !p2) return 0;
  const toRad = (v) => (v * Math.PI) / 180;
  const [lng1, lat1] = p1;
  const [lng2, lat2] = p2;
  const R = 6371000; // Earth radius in meters
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Helper to ensure polygon rings are strictly closed for Turf.js
const ensureClosed = (points) => {
  if (!points || points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return [...points, first];
  }
  return points;
};

// Load external scripts (CDN)
const loadScript = (src) => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

// Load external styles (CDN)
const loadStyle = (href) => {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
};

const Map = () => {
  const location = useLocation();
  const zone = location.state; // passed via navigate('/map', { state: zoneObj })

  // Refs
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const destMarkerRef = useRef(null);
  const directionsRef = useRef(null);
  const lastRoutedPos = useRef(null);

  // Map & GPS State
  const [currentPos, setCurrentPos] = useState(null); // [lat, lng]
  const [gpsError, setGpsError] = useState(null);
  const [libsLoaded, setLibsLoaded] = useState(false);
  const [isInsideZone, setIsInsideZone] = useState(false);
  const [distanceToDest, setDistanceToDest] = useState(null);
  const [currentSector, setCurrentSector] = useState(null);

  // Booking & User State
  const [currentUser, setCurrentUser] = useState(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null); // Slot user is currently in (for booking)
  const [slotStatusById, setSlotStatusById] = useState({}); // slotId -> status
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [loadingBook, setLoadingBook] = useState(false);
  const [isInsideSelectedSlot, setIsInsideSelectedSlot] = useState(false); // Geofence validation


  // 0️⃣ Auth Listener
  useEffect(() => {
    try {
      const auth = getAuth();
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          setCurrentUser(user);
        } else {
          setCurrentUser(null);
        }
      });
      return () => unsubscribe();
    } catch (e) {
      console.warn("Firebase Auth not initialized. Using mock user for demo.");
      setCurrentUser({ email: "demo@example.com", uid: "demo123" });
    }
  }, []);

  // 1️⃣ Load Mapbox & Turf via CDN
  useEffect(() => {
    const loadLibs = async () => {
      try {
        loadStyle("https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css");
        loadStyle(
          "https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-directions/v4.1.1/mapbox-gl-directions.css"
        );

        await loadScript("https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js");
        await loadScript("https://npmcdn.com/@turf/turf/turf.min.js");
        await loadScript(
          "https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-directions/v4.1.1/mapbox-gl-directions.js"
        );

        // Small delay to ensure globals are attached
        setTimeout(() => {
          if (window.mapboxgl) {
            window.mapboxgl.accessToken = MAPBOX_TOKEN;
            setLibsLoaded(true);
          }
        }, 100);
      } catch (err) {
        console.error("Failed to load map libraries", err);
      }
    };
    loadLibs();
  }, []);

  // 2️⃣ Start GPS - Continuous tracking without page refresh
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by this browser.");
      return;
    }

    console.log("📍 Starting GPS tracking...");

    // Use watchPosition for continuous tracking (updates automatically as user moves)
    // This ensures location is always tracked without page refresh
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const newPos = [latitude, longitude];
        
        // Always update position to ensure continuous tracking
        // This ensures geofence checks happen on every GPS update
        setCurrentPos(newPos);
        setGpsError(null);
        
        // Log position updates for debugging (can be removed in production)
        if (accuracy) {
          console.log(`📍 GPS Update: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (accuracy: ${accuracy?.toFixed(0)}m)`);
        }
      },
      (err) => {
        console.error("GPS Error:", err);
        let errorMsg = "Unable to retrieve location.";
        
        // Provide specific error messages
        switch (err.code) {
          case err.PERMISSION_DENIED:
            errorMsg = "Location permission denied. Please enable location access.";
            break;
          case err.POSITION_UNAVAILABLE:
            errorMsg = "Location information unavailable.";
            break;
          case err.TIMEOUT:
            errorMsg = "Location request timed out. Retrying...";
            // Retry after timeout
            setTimeout(() => {
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  const { latitude, longitude } = pos.coords;
                  setCurrentPos([latitude, longitude]);
                  setGpsError(null);
                },
                () => {},
                { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
              );
            }, 1000);
            break;
        }
        setGpsError(errorMsg);
      },
      {
        enableHighAccuracy: true, // Use GPS if available (more accurate)
        maximumAge: 0, // Don't use cached positions - always get fresh data
        timeout: 10000, // 10 second timeout (reduced from 15s for faster updates)
      }
    );

    // Cleanup: Stop watching when component unmounts
    return () => {
      console.log("📍 Stopping GPS tracking");
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // Helper: Create circle polygon from center + radius using Turf.js
  const createCirclePolygon = (center, radiusMeters, steps = 64) => {
    if (!window.turf) return null;
    const turf = window.turf;
    const circle = turf.circle(center, radiusMeters, { steps, units: "meters" });
    return circle.geometry.coordinates[0]; // Return coordinates array
  };

  // 3️⃣ Construct GeoJSON for Slots (supports both Polygon and Circle)
  const [subZoneGeoJSON, setSubZoneGeoJSON] = useState(null);

  useEffect(() => {
    if (!libsLoaded || !window.turf || !zone?.slots) return;
    const turf = window.turf;

    // Only render slots that have been fetched from database
    // Supports both polygon and circle (center + radius) geofences
    const features = zone.slots
      .map((slot, index) => {
        // ONLY use status from database - no fallbacks to avoid stale/hardcoded data
        const statusFromBackend = slotStatusById[slot.slotId];
        
        // If database hasn't returned status for this slot yet, skip it
        if (statusFromBackend === undefined) {
          return null;
        }
        
        // Use ONLY the status from backend (single source of truth)
        const status = statusFromBackend;
        // STRICT color rule:
        // - status === "active"  -> RED
        // - otherwise           -> GREEN
        const isBooked = status === "active";

        let feature = null;
        let polygonLngLat = null;

        // Support both polygon and circle geofences
        if (slot.polygon && Array.isArray(slot.polygon) && slot.polygon.length >= 3) {
          // Polygon geofence
          polygonLngLat = slot.polygon.map((p) => [p.lng, p.lat]);
          polygonLngLat = ensureClosed(polygonLngLat);
          feature = turf.polygon([polygonLngLat]);
        } else if (slot.center && slot.radius) {
          // Circle geofence (center + radius in meters)
          const center = [slot.center.lng, slot.center.lat];
          const radiusMeters = slot.radius;
          polygonLngLat = createCirclePolygon(center, radiusMeters);
          if (polygonLngLat) {
            feature = turf.polygon([polygonLngLat]);
          }
        }

        if (!feature) {
          return null; // Skip invalid slots
        }

        const id = slot.slotId || slot._id || slot.id || `slot-${index}`;
        feature.id = id; // needed for feature-state

        feature.properties = {
          id,
          slotId: slot.slotId,
          tag: slot.tag || slot.name || `Slot ${index + 1}`,
          status, // Database status only
          isBooked, // Derived from database status (true = RED, false = GREEN)
          center: slot.center, // For circle geofence validation
          radius: slot.radius, // For circle geofence validation
          ...slot, // Pass all other slot props
        };

        return feature;
      })
      .filter(Boolean);

    const geojson = { type: "FeatureCollection", features };
    setSubZoneGeoJSON(geojson);

    // If map source already exists, update it to refresh colors without page reload
    // This ensures "active" slots turn red immediately when status changes
    if (mapRef.current && mapRef.current.getSource("subzones")) {
      try {
        // Update map source data - this automatically triggers a repaint
        // Active slots will turn RED, all others will turn GREEN (no other colors)
        mapRef.current.getSource("subzones").setData(geojson);
      } catch (err) {
        console.error("Error updating map source:", err);
      }
    }
  }, [zone, libsLoaded, slotStatusById]);

  // Calculate Zone Center
  const destination = useMemo(() => {
    if (!zone?.polygon?.length) return null;
    const avgLat = zone.polygon.reduce((sum, p) => sum + p.lat, 0) / zone.polygon.length;
    const avgLng = zone.polygon.reduce((sum, p) => sum + p.lng, 0) / zone.polygon.length;
    return [avgLng, avgLat];
  }, [zone]);

  // 4️⃣ Initialize Map
  useEffect(() => {
    if (!libsLoaded || !mapContainerRef.current || mapRef.current || !zone) return;

    const mapboxgl = window.mapboxgl;
    const turf = window.turf;
    const dest = destination || [zone.polygon[0].lng, zone.polygon[0].lat];

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: dest,
      zoom: 18.5,
      pitch: 45, // 3D effect
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl(), "bottom-right");

    if (window.MapboxDirections) {
      directionsRef.current = new window.MapboxDirections({
        accessToken: mapboxgl.accessToken,
        unit: "metric",
        profile: "mapbox/driving",
        interactive: false,
        controls: { inputs: false, instructions: false },
      });
      map.addControl(directionsRef.current, "top-left");
    }

    map.on("load", () => {
      // --- Zone Boundary ---
      let poly = zone.polygon.map((p) => [p.lng, p.lat]);
      poly = ensureClosed(poly);

      const fenceGeoJSON = turf.polygon([poly]);
      const bounds = new mapboxgl.LngLatBounds();
      poly.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, { padding: 80 });

      map.addSource("zone", { type: "geojson", data: fenceGeoJSON });
      map.addLayer({
        id: "zone-fill",
        type: "fill",
        source: "zone",
        paint: { "fill-color": "#3b82f6", "fill-opacity": 0.05 },
      });
      map.addLayer({
        id: "zone-outline",
        type: "line",
        source: "zone",
        paint: { "line-color": "#2563eb", "line-width": 4 },
      });

      // --- Slots ---
      if (subZoneGeoJSON?.features.length) {
        map.addSource("subzones", { type: "geojson", data: subZoneGeoJSON });

        map.addLayer({
          id: "subzone-line",
          type: "line",
          source: "subzones",
          paint: {
            "line-color": "#ffffff",
            "line-width": 2,
            "line-opacity": 0.8,
          },
        });

        // Simple coloring: GREEN for free, RED for booked (no selection, no other colors)
        map.addLayer({
          id: "subzone-active",
          type: "fill",
          source: "subzones",
          paint: {
            "fill-color": [
              "case",
              ["boolean", ["get", "isBooked"], false],
              "#ef4444", // RED if booked
              "#22c55e", // GREEN if free
            ],
            "fill-opacity": 0.3, // Consistent opacity for all slots
          },
        });

        map.addLayer({
          id: "subzone-labels",
          type: "symbol",
          source: "subzones",
          layout: {
            "text-field": ["get", "tag"],
            "text-size": 12,
            "text-anchor": "center",
          },
          paint: {
            "text-color": "#1f2937",
            "text-halo-color": "#ffffff",
            "text-halo-width": 2,
          },
        });
      }

      destMarkerRef.current = new mapboxgl.Marker({ color: "red" })
        .setLngLat(dest)
        .setPopup(new mapboxgl.Popup().setText(zone.name))
        .addTo(map);
    });

    return () => {
      if (map) map.remove();
      mapRef.current = null;
    };
  }, [libsLoaded, zone, subZoneGeoJSON, destination]);

  // 5️⃣ Real-time Logic (GPS & Intersection)
  useEffect(() => {
    if (!currentPos || !mapRef.current || !zone || !libsLoaded) return;

    const mapboxgl = window.mapboxgl;
    const turf = window.turf;
    const [lat, lng] = currentPos;
    const userPoint = [lng, lat];

    // Update User Marker - Smoothly updates as GPS tracks movement (no page refresh needed)
    // watchPosition continuously updates currentPos, which triggers this useEffect
    if (!userMarkerRef.current) {
      // First time: Create marker and fly to position
      userMarkerRef.current = new mapboxgl.Marker({ color: "#2563eb", scale: 0.8 })
        .setLngLat(userPoint)
        .addTo(mapRef.current);
      mapRef.current.flyTo({ center: userPoint, zoom: 19 });
    } else {
      // Subsequent updates: Smoothly move marker as user location changes
      // This happens automatically - no page refresh needed
      userMarkerRef.current.setLngLat(userPoint);
    }

    // Check Inside Main Zone
    let poly = zone.polygon.map((p) => [p.lng, p.lat]);
    poly = ensureClosed(poly);
    const insideZone = turf.booleanPointInPolygon(turf.point(userPoint), turf.polygon([poly]));
    setIsInsideZone(insideZone);

    // Check Inside Specific Slot & Validate Geofence for Selected Slot
    let foundSector = null;
    let foundSlotData = null;
    let userInsideSelectedSlot = false;

    if (subZoneGeoJSON && mapRef.current.getSource("subzones")) {
      // Detect new active slot (user's current location) for geofencing validation
      // Supports both polygon and circle geofences
      subZoneGeoJSON.features.forEach((feature) => {
        let isInside = false;
        const props = feature.properties;

        // Check polygon geofence
        if (feature.geometry.type === "Polygon") {
          isInside = turf.booleanPointInPolygon(turf.point(userPoint), feature);
        }
        // Check circle geofence (center + radius)
        else if (props.center && props.radius) {
          const center = [props.center.lng, props.center.lat];
          const radiusMeters = props.radius;
          const distance = turf.distance(turf.point(userPoint), turf.point(center), { units: "meters" });
          isInside = distance <= radiusMeters;
        }
        
        if (isInside) {
          foundSector = props.tag;
          foundSlotData = props;

          // Check if user is inside the slot they want to book (for geofence validation)
          if (selectedSlot && selectedSlot.slotId === props.slotId) {
            userInsideSelectedSlot = true;
          }
        }
      });
    }

    // Update geofence validation state
    setIsInsideSelectedSlot(userInsideSelectedSlot);

    // Handle Sector Change & Booking Modal
    if (foundSector !== currentSector) {
      setCurrentSector(foundSector);

      // Only open modal if:
      // 1. User is in a valid slot
      // 2. Slot is FREE (status !== "active" from backend)
      // 3. Modal is not already shown
      if (foundSector && foundSlotData) {
        setSelectedSlot(foundSlotData);
        // STRICT rule: active -> RED (booked), otherwise -> GREEN (free)
        // Only allow modal if slot is NOT active
        const isSlotFree = foundSlotData.status !== "active";
        if (!showBookingModal && isSlotFree) {
          setShowBookingModal(true);
        } else if (!isSlotFree && showBookingModal) {
          // Close modal if user enters a booked slot
          setShowBookingModal(false);
        }
      }
    }

    // Update Directions
    if (directionsRef.current) {
      const dest = destination || [zone.polygon[0].lng, zone.polygon[0].lat];
      if (!lastRoutedPos.current || getDistMeters(lastRoutedPos.current, userPoint) > 20) {
        directionsRef.current.setOrigin(userPoint);
        directionsRef.current.setDestination(dest);
        lastRoutedPos.current = userPoint;
        setDistanceToDest(getDistMeters(userPoint, dest));
      }
    }
  }, [currentPos, subZoneGeoJSON, zone, libsLoaded, currentSector, showBookingModal, destination, selectedSlot]);

  // 6️⃣ Booking Logic API Interactions

  // Fetch latest slot availability for this zone from backend
  // Memoized with useCallback so it can be used in both useEffect and after booking/cancellation
  const fetchSlotStatuses = useCallback(async () => {
    if (!zone) return;
    try {
      const res = await fetch(
        `http://localhost:7000/zones/${zone.id || zone._id}/slots-status`
      );
      if (!res.ok) return;
      const data = await res.json();
      // Expecting: [{ slotId: "SLOT_1", status: "active" | "free" }, ...]
      // Backend is the single source of truth - no fallbacks or hardcoded defaults
      const map = {};
      data.forEach((s) => {
        // Only include slots that have both slotId AND status from backend
        if (s.slotId && s.status !== undefined && s.status !== null) {
          map[s.slotId] = s.status; // Use ONLY backend value
        }
      });
      setSlotStatusById(map);
    } catch (err) {
      console.error("Error fetching slot availability:", err);
    }
  }, [zone]);

  // Initial load + periodic refresh when zone changes
  useEffect(() => {
    if (!zone) return;
    
    // Fetch immediately on mount/zone change
    fetchSlotStatuses();
    
    // Poll every 10 seconds to keep slot availability up-to-date
    // This ensures colors update when other users book/cancel or reservations expire
    const intervalId = setInterval(() => {
      fetchSlotStatuses();
    }, 10000); // 10 seconds
    
    return () => clearInterval(intervalId);
  }, [zone, fetchSlotStatuses]);

  // NOTE: Active bookings list and payment logic are intentionally not shown on the map.
  // Users can view/cancel their reservations in `MyReservations.jsx`.

  // Create Reservation
  const handleReservation = async () => {
    if (!currentUser) {
      alert("Please log in first!");
      return;
    }
    if (!start || !end) {
      alert("Please select start and end times.");
      return;
    }

    const startTime = new Date(start);
    const endTime = new Date(end);
    const now = new Date();

    if (startTime < now) {
      alert("You cannot select a past time.");
      return;
    }
    if (startTime >= endTime) {
      alert("End time must be after start time.");
      return;
    }

    // Double-check slot is still free before sending request (backend is source of truth)
    if (selectedSlot.status === "active") {
      alert("This slot is no longer available. Please select another slot.");
      setShowBookingModal(false);
      fetchSlotStatuses(); // Refresh to get latest status
      return;
    }

    // Geofence validation: User must be inside the selected slot's geofence
    if (!isInsideSelectedSlot) {
      alert("⚠️ Move closer to the selected slot to confirm parking.\n\nYou must be physically inside the slot's geofence to complete the reservation.");
      return;
    }

    setLoadingBook(true);
    try {
      // Ensure we use the correct slotId (must match database)
      const slotId = selectedSlot.slotId;
      if (!slotId) {
        alert("Error: Slot ID not found. Please try again.");
        setLoadingBook(false);
        return;
      }

      const payload = {
        userId: currentUser.email || currentUser.uid, // Prioritize email over uid
        zoneId: zone.id || zone._id,
        slotId: slotId, // Use slotId directly from selectedSlot
        zoneName: zone.name,
        slotTag: selectedSlot.tag || selectedSlot.name,
        startTime: startTime,
        endTime: endTime,
      };

      console.log("📤 Sending reservation request:", payload);
      console.log("📧 Using userId (email):", payload.userId);

      const res = await fetch("http://localhost:7000/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        alert(data.message || "Reservation Confirmed!");
        setShowBookingModal(false); // Close modal
        
        // Immediately refresh slot statuses so active slot turns red without page reload
        // Small delay ensures backend has processed the reservation
        setTimeout(() => {
          fetchSlotStatuses();
        }, 500);
      } else {
        console.error("Reservation error:", data);
        alert(data.message || data.error || "Reservation failed. Please try again.");
        // Refresh slot statuses in case they changed
        fetchSlotStatuses();
      }
    } catch (err) {
      alert("Network error: Check if backend is running on port 7000");
      console.error(err);
    } finally {
      setLoadingBook(false);
    }
  };

  // NOTE: Cancellation is intentionally handled only in `MyReservations.jsx`.

  if (!zone) {
    return (
      <div className="h-screen flex items-center justify-center text-red-600 font-bold">
        Error: No zone data found. Navigate from dashboard.
      </div>
    );
  }

  return (
    <div className="relative h-screen w-full flex flex-col bg-gray-50 overflow-hidden">
      {/* Hide default directions inputs via CSS */}
      <style>{`.mapboxgl-ctrl-directions { display: none !important; }`}</style>

      {/* Header Info Bar */}
      <div className="bg-white shadow-md z-10 p-4 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-gray-800">{zone.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${isInsideZone
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                  }`}
              >
                {isInsideZone ? "Inside Zone" : "Outside Zone"}
              </span>
              {currentSector && (
                <span className="px-2 py-0.5 rounded text-xs font-bold uppercase bg-blue-100 text-blue-700 animate-pulse">
                  📍 {currentSector}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            {distanceToDest != null && (
              <div className="text-sm font-medium text-gray-700">
                {(distanceToDest / 1000).toFixed(2)} km
              </div>
            )}
            {!currentUser && <div className="text-xs text-orange-500">Not Logged In</div>}
          </div>
          <Link
            to="/my-reservations"
            className="border bg-purple-800 text-white font-bold border-white rounded p-2 hover:scale-105 hover:bg-white hover:text-purple-800 transition inline-block text-center"
          >
            Your Reservations
          </Link>
        </div>
      </div>

      {/* Map Container */}
      <div className="relative flex-1 w-full">
        <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" />

        {(!libsLoaded || !currentPos) && (
          <div className="absolute inset-0 bg-black/40 z-20 flex items-center justify-center text-white backdrop-blur-sm">
            <div className="text-center">
              <div className="animate-spin text-4xl mb-2">🌍</div>
              <p>{!libsLoaded ? "Loading Maps..." : "Waiting for GPS..."}</p>
            </div>
          </div>
        )}
      </div>

      {/* 🟢 Booking Modal Overlay */}
      {showBookingModal && selectedSlot && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowBookingModal(false)}
          ></div>

          {/* Modal Card */}
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden relative z-10 animate-in fade-in zoom-in duration-300">
            {/* Modal Header */}
            <div className="bg-linear-to-r from-blue-600 to-indigo-600 p-6 text-white">
              <button
                onClick={() => setShowBookingModal(false)}
                className="absolute top-4 right-4 text-white/80 hover:text-white text-xl font-bold"
              >
                ✕
              </button>
              <h2 className="text-2xl font-bold">{selectedSlot.tag || selectedSlot.name}</h2>
              <p className="text-blue-100 text-sm opacity-90">{zone.name}</p>
              {/* Payment/price is intentionally not shown on the map */}
              {/* Geofence Validation Status */}
              <div className={`mt-3 px-3 py-2 rounded-lg ${isInsideSelectedSlot ? "bg-green-500/30" : "bg-yellow-500/30"}`}>
                <p className="text-sm font-semibold flex items-center gap-2">
                  {isInsideSelectedSlot ? (
                    <>
                      <span>✅</span> You are inside the slot geofence
                    </>
                  ) : (
                    <>
                      <span>⚠️</span> Move closer to the selected slot to confirm parking
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {/* Booking Form */}
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Start Time
                  </label>
                  <input
                    type="datetime-local"
                    value={start}
                    min={new Date().toISOString().slice(0, 16)}
                    onChange={(e) => setStart(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    End Time
                  </label>
                  <input
                    type="datetime-local"
                    value={end}
                    min={start}
                    onChange={(e) => setEnd(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                  />
                </div>

                <button
                  onClick={handleReservation}
                  disabled={loadingBook || !isInsideSelectedSlot}
                  className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingBook ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin">↻</span> Processing...
                    </span>
                  ) : !isInsideSelectedSlot ? (
                    "Move Inside Slot to Book"
                  ) : (
                    "Confirm Reservation"
                  )}
                </button>
              </div>

              {/* Active bookings list is intentionally not shown on the map */}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Map;