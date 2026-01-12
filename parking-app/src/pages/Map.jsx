import React, { useState, useEffect, useRef, useMemo } from "react";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { getAuth, onAuthStateChanged } from "firebase/auth";
// 🔐 Mapbox token

// 🔐 Mapbox token
const MAPBOX_TOKEN = "pk.eyJ1Ijoic3ViaGFtcHJlZXQiLCJhIjoiY2toY2IwejF1MDdodzJxbWRuZHAweDV6aiJ9.Ys8MP5kVTk5P9V2TDvnuDg" || "";

const ensureClosed = (points) => {
  if (!points || points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return [...points, first];
  }
  return points;
};

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

const loadStyle = (href) => {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
};

const Map = () => {
  const location = useLocation();
  const navigate = useNavigate();
  // We expect zone data to be passed, but we should refresh it to get latest counts
  const initialZone = location.state;

  const [zone, setZone] = useState(initialZone);
  const [currentUser, setCurrentUser] = useState(null);
  const [libsLoaded, setLibsLoaded] = useState(false);
  const [currentPos, setCurrentPos] = useState(null);
  const [isInsideZone, setIsInsideZone] = useState(false);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [loading, setLoading] = useState(false);

  // Refs
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);

  // 1️⃣ Auth
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => setCurrentUser(user));
    return () => unsubscribe();
  }, []);

  // 2️⃣ Polling Zone Data (Counts)
  // We use a ref to track if we have initialized the map to prevent re-centering on every poll
  const isMapReady = useRef(false);
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (!initialZone?._id) return;

    const fetchZoneData = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_ZONES_API_BASE_URL || "http://localhost:5000"}/`);
        if (res.ok) {
          const zones = await res.json();
          const updated = zones.find(z => z._id === initialZone._id);
          if (updated) {
            // Only update state if meaningful data changed to reduce re-renders
            setZone(prev => {
              if (JSON.stringify(prev) !== JSON.stringify(updated)) return updated;
              return prev;
            });
          }
        }
      } catch (e) {
        console.error("Polling error", e);
      }
    };

    fetchZoneData(); // Initial
    const interval = setInterval(fetchZoneData, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, [initialZone]);

  // 3️⃣ Load Map Libs
  useEffect(() => {
    const loadLibs = async () => {
      try {
        loadStyle("https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css");
        await loadScript("https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js");
        await loadScript("https://npmcdn.com/@turf/turf/turf.min.js");

        setTimeout(() => {
          if (window.mapboxgl) {
            window.mapboxgl.accessToken = MAPBOX_TOKEN;
            setLibsLoaded(true);
          }
        }, 100);
      } catch (err) {
        console.error("Failed to load mapbox", err);
      }
    };
    loadLibs();
  }, []);

  // 4️⃣ Init Map (Runs ONCE when libs are loaded)
  useEffect(() => {
    if (!libsLoaded || !mapContainerRef.current || mapRef.current || !initialZone?.polygon) return;

    const mapboxgl = window.mapboxgl;

    // Center map on initial zone
    const centerLat = initialZone.polygon.reduce((sum, p) => sum + p.lat, 0) / initialZone.polygon.length;
    const centerLng = initialZone.polygon.reduce((sum, p) => sum + p.lng, 0) / initialZone.polygon.length;

    console.log("🗺️ Initializing Map...");

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [centerLng, centerLat],
      zoom: 17,
      pitch: 40,
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl(), "bottom-right");

    map.on("load", () => {
      isMapReady.current = true;
      drawZone(map, initialZone);

      // If we already have a cached position, center/draw it now? 
      // GPS effect will handle marker drawing.
    });

    return () => {
      // Cleanup map strictly on unmount
      if (map) map.remove();
      mapRef.current = null;
      isMapReady.current = false;
    };
  }, [libsLoaded]); // ⚠️ Removed 'zone' dependency to prevent reload loop

  // Helper to draw/update zone
  const drawZone = (map, zoneData) => {
    if (!map || !map.getSource || !window.turf) return;

    let poly = zoneData.polygon.map(p => [p.lng, p.lat]);
    poly = ensureClosed(poly);
    const geoJson = window.turf.polygon([poly]);

    const source = map.getSource("zone-source");
    if (source) {
      source.setData(geoJson);
    } else {
      map.addSource("zone-source", { type: "geojson", data: geoJson });

      map.addLayer({
        id: "zone-fill",
        type: "fill",
        source: "zone-source",
        paint: { "fill-color": "#3b82f6", "fill-opacity": 0.1 }
      });
      map.addLayer({
        id: "zone-outline",
        type: "line",
        source: "zone-source",
        paint: { "line-color": "#2563eb", "line-width": 3 }
      });
    }
  };

  // 4.5 Update Zone Shape if it changes (without reloading map)
  useEffect(() => {
    if (isMapReady.current && mapRef.current && zone) {
      drawZone(mapRef.current, zone);
    }
  }, [zone]);


  // Keep zone ref updated for the GPS closure
  const zoneRef = useRef(zone);
  useEffect(() => { zoneRef.current = zone; }, [zone]);

  // 5️⃣ User Location & Geofencing (STABLE, PERSISTENT)
  const [gpsError, setGpsError] = useState(null);

  useEffect(() => {
    // 1. Recover from Cache immediately
    const cached = localStorage.getItem("lastGpsPos");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setCurrentPos(parsed);
        console.log("📍 Restored location from cache:", parsed);
      } catch (e) { }
    }

    if (!navigator.geolocation) {
      setGpsError("Geolocation not supported");
      return;
    }

    // 2. Start Watcher
    console.log("🛰️ Starting GPS Watcher...");

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const newPos = [lat, lng];

        // Update State & Cache
        setCurrentPos(newPos);
        setGpsError(null);
        localStorage.setItem("lastGpsPos", JSON.stringify(newPos));

        // Logic that needs latest state refs
        const currentZone = zoneRef.current;

        // Check Geofence
        if (window.turf && currentZone?.polygon && currentZone.polygon.length > 2) {
          const pt = window.turf.point([lng, lat]);
          let polyCoords = currentZone.polygon.map(p => [p.lng, p.lat]);
          polyCoords = ensureClosed(polyCoords);
          const poly = window.turf.polygon([polyCoords]);
          const isInside = window.turf.booleanPointInPolygon(pt, poly);
          setIsInsideZone(isInside);
        }

        // Direct Map Marker Manipulation (bypassing React render cycle for smoothness)
        if (mapRef.current && window.mapboxgl) {
          const lnglat = [lng, lat];
          if (!userMarkerRef.current) {
            const el = document.createElement("div");
            el.className = "gps-marker-container";
            const ring = document.createElement("div");
            ring.className = "gps-ring";
            el.appendChild(ring);
            const icon = document.createElement("div");
            icon.className = "gps-icon";
            icon.innerHTML = `<svg viewBox="0 0 24 24" fill="#2563eb" style="width: 100%; height: 100%; display: block;"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" stroke="white" stroke-width="1.5"/></svg>`;
            el.appendChild(icon);

            userMarkerRef.current = new window.mapboxgl.Marker({ element: el })
              .setLngLat(lnglat)
              .addTo(mapRef.current);
          } else {
            userMarkerRef.current.setLngLat(lnglat);
          }
        }
      },
      (err) => {
        console.warn("GPS Warning:", err);
        // Don't clear state immediately on temporary errors
        if (err.code === 1) setGpsError("Location Denied");
        else if (err.code === 2) console.log("Position Unavailable (Retrying...)");
        else if (err.code === 3) console.log("Timeout (Retrying...)");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        console.log("🛑 Stopping GPS Watcher");
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []); // ✅ Dependency array is explicitly empty to prevent restarts

  // Center on user
  const locateMe = () => {
    if (!currentPos || !mapRef.current) {
      // Try fallback to cache logic if state is empty but cache exists (edge case)
      const cached = localStorage.getItem("lastGpsPos");
      if (cached) {
        const p = JSON.parse(cached);
        mapRef.current?.flyTo({ center: [p[1], p[0]], zoom: 18 });
        return;
      }
      return alert("Waiting for GPS signal...");
    }
    mapRef.current.flyTo({ center: [currentPos[1], currentPos[0]], zoom: 18, speed: 1.5 });
  };


  // Handle Reserve
  const handleReserve = async () => {
    if (!currentUser) return alert("Please login first");
    if (!fromTime || !toTime) return alert("Select time range");

    // STRICT VALIDATION: Past time check
    const selectedStart = new Date(fromTime);
    if (selectedStart.getTime() <= Date.now()) {
      return alert("Cannot book or reserve past time.");
    }

    setLoading(true);
    try {
      const payload = {
        userId: currentUser.uid,
        zoneId: zone._id,
        fromTime,
        toTime
      };

      const res = await fetch(`${import.meta.env.VITE_ZONES_API_BASE_URL || "http://localhost:5000"}/reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok) {
        alert("It's currently parked!");
        setShowModal(false);
        // Re-fetch zone data immediately
      } else {
        alert(data.message || "Reservation Failed");
      }
    } catch (err) {
      console.error(err);
      alert("Server Error");
    } finally {
      setLoading(false);
    }
  };

  if (!zone) return <div className="p-10 font-bold">No zone selected</div>;

  const isFull = (zone.available || 0) <= 0;
  const canBook = isInsideZone && !isFull;

  return (
    <div className="flex flex-col h-screen w-full relative bg-gray-50">

      {/* HEADER INFO */}
      <div className="bg-white p-4 shadow-md z-10 flex flex-col md:flex-row justify-between items-center border-b gap-4">
        <div>
          <h1 className="text-2xl font-bold">{zone.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-gray-600 font-medium">
              Available: <span className="text-blue-600 font-bold text-lg">
                {Math.max(0, (zone.capacity || 0) - ((zone.reserved || 0) + (zone.prebooked || 0)))}
              </span>
              <span className="text-gray-400 mx-1">/</span>
              Total: {zone.capacity || zone.totalCapacity}
            </p>
            {/* Geofence Status Badge */}
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${isInsideZone ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {isInsideZone ? "✅ Inside Zone" : "❌ Outside Zone"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/my-reservations" className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-4 py-2 rounded font-bold">
            My Bookings
          </Link>
          <button
            onClick={() => {
              // Set default 2 mins in future to pass "past time" check
              // Also ensure we use LOCAL time string for datetime-local input
              const now = new Date();
              const future = new Date(now.getTime() + 2 * 60000);
              const offset = future.getTimezoneOffset() * 60000;
              const localISO = new Date(future.getTime() - offset).toISOString().slice(0, 16);
              setFromTime(localISO);
              setShowModal(true);
            }}
            disabled={!canBook}
            className={`px-4 py-2 rounded font-bold text-white transition ${!canBook
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
              }`}
          >
            {isFull
              ? "Zone Full"
              : !isInsideZone
                ? "Go Inside to Park"
                : "Park Here"
            }
          </button>
        </div>
      </div>

      {/* MAP */}
      <div className="flex-1 relative">
        <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" />

        {/* Floating Location Controls */}
        <div className="absolute bottom-6 right-4 flex flex-col items-end gap-2 z-20">
          {gpsError && (
            <div className="bg-red-500 text-white text-xs font-bold px-3 py-1 rounded shadow-lg animate-pulse">
              ⚠️ {gpsError}
            </div>
          )}

          <button
            onClick={locateMe}
            className="bg-white p-3 rounded-full shadow-xl hover:bg-gray-50 active:scale-95 transition-transform"
            title="Locate Me"
          >
            <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>

      {/* RESERVATION MODAL */}
      {
        showModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <h2 className="text-xl font-bold mb-4">Reserve Spot</h2>
              <div className="mb-4">
                <p className="text-sm text-gray-500 mb-1">Zone</p>
                <p className="font-bold text-lg">{zone.name}</p>
              </div>

              <div className="space-y-3 mb-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">From</label>
                  <input
                    type="datetime-local"
                    className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={fromTime}
                    onChange={e => setFromTime(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">To</label>
                  <input
                    type="datetime-local"
                    className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={toTime}
                    onChange={e => setToTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-3 text-gray-600 font-bold bg-gray-100 rounded hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReserve}
                  disabled={loading}
                  className="flex-1 py-3 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 shadow-lg disabled:opacity-50"
                >
                  {loading ? "Booking..." : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )
      }

    </div >
  );
};

export default Map;
