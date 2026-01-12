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
  const navigate = useNavigate();

  const ZONES_API_BASE_URL = import.meta.env.VITE_ZONES_API_BASE_URL || "http://localhost:5000";

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) =>
      setUserId(user ? user.uid : null)
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchZones = async () => {
      try {
        setZonesError(null);
        // Use standard URL fallback
        const apiUrl = ZONES_API_BASE_URL;
        const res = await axios.get(apiUrl);
        const zonesData = Array.isArray(res.data) ? res.data : [];
        setZones(zonesData);
      } catch (err) {
        console.error("Error fetching zones", err);
        setZonesError("Failed to load zones.");
      } finally {
        setLoadingZones(false);
      }
    };

    fetchZones();
    const interval = setInterval(fetchZones, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen p-5 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
      <h1 className="text-3xl md:text-4xl font-bold mb-6 text-white underline underline-offset-8">
        Parking Zones
      </h1>

      {zonesError && (
        <div className="mb-4 rounded-lg bg-red-500/20 border border-red-500/50 p-4 text-white">
          {zonesError}
        </div>
      )}

      {loadingZones && (
        <div className="text-white text-lg font-bold">Loading Zones...</div>
      )}

      {!loadingZones && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {zones.map((zone) => {
            // Backend provides computed fields
            const reserved = zone.reserved || 0;
            const prebooked = zone.prebooked || 0;
            const capacity = zone.capacity || 0;
            // Use server-provided availability
            const available = zone.available !== undefined ? zone.available : (capacity - reserved - prebooked);
            const isFull = available <= 0;

            return (
              <div
                key={zone._id}
                className="border border-white/30 p-4 rounded-xl bg-white/10 backdrop-blur-sm shadow-xl hover:shadow-2xl transition cursor-pointer flex flex-col justify-between"
                onClick={() => navigate("/map", { state: zone })}
              >
                <div>
                  <h2 className="text-xl font-bold text-white mb-4">{zone.name || "Unnamed Zone"}</h2>
                  <div className="space-y-2 text-white/90">
                    <div className="flex justify-between">
                      <span>Capacity:</span>
                      <span className="font-bold">{capacity}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Reserved:</span>
                      <span className="font-bold">{zone.reserved || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Prebooked:</span>
                      <span className="font-bold">{zone.prebooked || 0}</span>
                    </div>
                    {/* Occupied/Reserved details removed as they are no longer tracked individually */}
                    <div className="mt-2 pt-2 border-t border-white/20 flex justify-between text-lg">
                      <span className="font-bold">Available:</span>
                      <span className={`font-bold ${!isFull ? "text-green-300" : "text-red-300"}`}>
                        {isFull ? "Full" : available}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex gap-2">
                  <button
                    className="flex-1 bg-white text-purple-700 font-bold py-2 rounded shadow hover:bg-gray-100 transition text-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate("/map", { state: zone });
                    }}
                  >
                    Park Now
                  </button>
                  <button
                    className="flex-1 bg-yellow-400 text-purple-900 font-bold py-2 rounded shadow hover:bg-yellow-300 transition text-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Navigate to PreBooking with selected zone
                      navigate("/prebooking", { state: { zoneId: zone._id } });
                    }}
                  >
                    Pre-Book
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loadingZones && zones.length === 0 && !zonesError && (
        <div className="text-white text-center mt-10 opacity-70">No zones found.</div>
      )}
    </div>
  );
};

export default Dashboard;


