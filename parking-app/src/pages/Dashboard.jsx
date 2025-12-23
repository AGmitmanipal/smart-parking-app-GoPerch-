import React, { useEffect, useState } from "react";
import axios from "axios";
import { auth } from "../services/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const [userId, setUserId] = useState(null);
  const [zones, setZones] = useState([]);
  const [loadingZones, setLoadingZones] = useState(true);
  const [zonesError, setZonesError] = useState(null);
  const [activeResByZoneId, setActiveResByZoneId] = useState({}); // { [zoneId]: Reservation[] }
  const navigate = useNavigate();

  // Backend (single source of truth for zone stats shown on dashboard)
  // This endpoint returns zones including capacity/available/reserved.
  const ZONES_API_BASE_URL =
    import.meta.env.VITE_ZONES_API_BASE_URL || "http://localhost:5000";

  // Reservations backend (single source of truth for reservation status)
  const RESERVATIONS_API_BASE_URL =
    import.meta.env.VITE_RESERVATIONS_API_BASE_URL || "http://localhost:7000";

  /* 🔐 AUTH */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) =>
      // Use email as userId consistently (fallback to uid)
      setUserId(user ? user.email || user.uid : null)
    );
    return () => unsubscribe();
  }, []);

  // Normalize stats strictly from backend response (no UI-invented states/colors)
  const getZoneStats = (zone) => {
    // Backend truth first. Only derive from slots[] when backend fields are missing.
    const totalSlotsFromBackend =
      typeof zone?.capacity === "number" ? zone.capacity : null;
    const reservedFromBackend =
      typeof zone?.reserved === "number" ? zone.reserved : null;
    const availableFromBackend =
      typeof zone?.available === "number" ? zone.available : null;

    const totalSlots =
      totalSlotsFromBackend ?? (Array.isArray(zone?.slots) ? zone.slots.length : 0);

    const reservedFromSlots = Array.isArray(zone?.slots)
      ? zone.slots.filter((s) => s?.status === "active" || s?.status === "reserved").length
      : 0;

    const reserved = reservedFromBackend ?? reservedFromSlots;
    const available = availableFromBackend ?? Math.max(0, totalSlots - reserved);

    return { totalSlots, reserved, available };
  };

  /* 🅿️ FETCH ZONES */
  useEffect(() => {
    const fetchZones = async () => {
      try {
        setZonesError(null);
        const res = await axios.get(`${ZONES_API_BASE_URL}/`);
        setZones(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error("Error fetching zones", err);
        setZones([]);
        setZonesError("Failed to load zones from backend.");
      } finally {
        setLoadingZones(false);
      }
    };

    fetchZones();
    const interval = setInterval(fetchZones, 5000);
    return () => clearInterval(interval);
  }, [ZONES_API_BASE_URL]);

  /* 📌 FETCH ACTIVE RESERVATIONS (for dashboard, grouped by zone) */
  useEffect(() => {
    if (!userId) {
      setActiveResByZoneId({});
      return;
    }

    const fetchActiveReservations = async () => {
      try {
        const res = await fetch(
          `${RESERVATIONS_API_BASE_URL}/reserve/book?userId=${encodeURIComponent(
            userId
          )}`
        );
        if (!res.ok) return;
        const data = await res.json();

        // Only show ACTIVE reservations on the dashboard
        const active = Array.isArray(data) ? data.filter((r) => r?.status === "active") : [];

        // Group by zoneId so we can render per-zone cards
        const grouped = {};
        active.forEach((r) => {
          const zid = (r.zoneId || "").toString();
          if (!zid) return;
          if (!grouped[zid]) grouped[zid] = [];
          grouped[zid].push(r);
        });

        setActiveResByZoneId(grouped);
      } catch (err) {
        console.error("Error fetching active reservations:", err);
      }
    };

    // Fetch immediately, then poll (no page refresh)
    fetchActiveReservations();
    const intervalId = setInterval(fetchActiveReservations, 15000);
    return () => clearInterval(intervalId);
  }, [userId, RESERVATIONS_API_BASE_URL]);

  return (
    <div className="min-h-screen p-5 bg-linear-to-br from-indigo-500 via-purple-500 to-pink-500">
      <h1 className="text-3xl md:text-4xl font-bold mb-6 text-white underline underline-offset-8">
        Parking Zones
      </h1>

      {zonesError && (
        <div className="mb-4 rounded-lg border border-white/30 bg-white/10 p-3 text-white">
          <p className="font-bold">Error</p>
          <p className="text-sm opacity-90">{zonesError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {zones.map((zone) => (
          (() => {
            const { totalSlots, reserved, available } = getZoneStats(zone);
            const zoneIdStr = (zone?._id ?? "").toString();
            const activeReservations = activeResByZoneId[zoneIdStr] || [];
            return (
          <div
            key={zoneIdStr}
            className="border border-white p-4 rounded-lg bg-linear-to-t from-purple-400 to-indigo-500 shadow hover:shadow-lg transition cursor-pointer"
          >
            <h2 className="text-lg font-bold text-white mb-2">
              {zone?.name ?? "Unnamed Zone"}
            </h2>

            <div className="space-y-1 mb-3">
              <p className="text-white font-semibold">
                Total Slots: <span className="font-bold">{totalSlots}</span>
              </p>
              
              <p className="text-white font-semibold">
                Reserved: <span className="font-bold text-orange-200">{reserved}</span>
              </p>

              <p
                className={`font-bold text-lg ${
                  available > 0
                    ? "text-green-200"
                    : "text-red-300"
                }`}
              >
                Available: {available}
              </p>
            </div>

            
            {/* ACTION */}
            <div className="mt-5 flex justify-center">
              <button
                className="border bg-purple-800 text-white font-bold border-white rounded p-2 hover:scale-105 hover:bg-white hover:text-purple-800 transition"
                onClick={() =>
                  // Ensure zone._id is passed consistently as a string
                  navigate("/map", { state: { ...zone, _id: zoneIdStr, id: zoneIdStr } })
                }
              >
                View Map & Select Slot
              </button>
            </div>
          </div>
            );
          })()
        ))}
      </div>

      {!loadingZones && zones.length === 0 && (
        <p className="text-yellow-300 font-bold mt-6 text-center">
          No parking zones available
        </p>
      )}
    </div>
  );
};

export default Dashboard;


