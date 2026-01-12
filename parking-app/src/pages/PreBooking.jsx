import React, { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { useLocation } from "react-router-dom";

export default function PreBooking() {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [myReservations, setMyReservations] = useState([]);

  const auth = getAuth();
  const userId = auth.currentUser?.uid || null;
  const location = useLocation();

  // State
  const [selectedZoneId, setSelectedZoneId] = useState(location.state?.zoneId || "");
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState(null);

  const API_BASE = import.meta.env.VITE_ZONES_API_BASE_URL || "http://localhost:5000";
  const RESERVATIONS_BASE = import.meta.env.VITE_ZONES_API_BASE_URL || "http://localhost:5000";

  const fetchZones = async () => {
    try {
      const res = await fetch(`${API_BASE}/`);
      if (res.ok) {
        const data = await res.json();
        setZones(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to fetch zones", err);
    }
  };

  const fetchMyReservations = async () => {
    if (!userId) return;
    try {
      // Use the general booking history endpoint
      const res = await fetch(`${RESERVATIONS_BASE}/reserve/book?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      // Filter for future/active bookings if desired, or show all. 
      // Let's show active ones.
      const active = Array.isArray(data) ? data.filter(d => ['active', 'booked', 'reserved'].includes(d.status)) : [];
      setMyReservations(active);
    } catch (err) {
      console.error("Failed to fetch reservations", err);
    }
  };

  useEffect(() => {
    fetchZones();
    if (userId) fetchMyReservations();
  }, [userId]);

  const handleBook = async () => {
    if (!userId) return alert("Please login");
    if (!selectedZoneId || !fromTime || !toTime) return alert("Please fill all fields");

    // STRICT VALIDATION: Past time check
    const selectedStart = new Date(fromTime);
    if (selectedStart.getTime() <= Date.now()) {
      return setMsg({ type: 'error', text: "Cannot book or reserve a past time." });
    }

    setProcessing(true);
    setMsg(null);

    try {
      const res = await fetch(`${RESERVATIONS_BASE}/reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          zoneId: selectedZoneId,
          fromTime,
          toTime
        })
      });

      const data = await res.json();
      if (res.ok) {
        setMsg({ type: 'success', text: 'Booking Successful!' });
        fetchMyReservations();
        fetchZones(); // Update availability counts
        // Reset form
        setFromTime("");
        setToTime("");
      } else {
        setMsg({ type: 'error', text: data.message || "Booking Failed" });
      }
    } catch (err) {
      console.error(err);
      setMsg({ type: 'error', text: "Server Error" });
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async (id) => {
    if (!confirm("Cancel reservation?")) return;
    setProcessing(true);
    try {
      const res = await fetch(`${RESERVATIONS_BASE}/reserve/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        alert("Cancelled");
        fetchMyReservations();
        fetchZones();
      } else {
        alert("Failed to cancel");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-purple-600 via-indigo-600 to-pink-500">
      <h1 className="text-3xl font-bold text-yellow-300 mb-6 underline underline-offset-8">
        Booking
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* BOOKING FORM */}
        <div className="bg-white/10 border border-white/30 rounded-xl p-6 shadow-xl backdrop-blur-md h-fit">
          <h2 className="text-xl font-bold text-white mb-4">Reserve a Spot</h2>

          {msg && (
            <div className={`p-3 rounded mb-4 ${msg.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {msg.text}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-white mb-1 font-bold">Select Zone</label>
              <select
                className="w-full p-3 rounded bg-white text-gray-800 font-bold focus:ring-4 focus:ring-yellow-400 outline-none"
                value={selectedZoneId}
                onChange={e => setSelectedZoneId(e.target.value)}
              >
                <option value="">-- Choose Zone --</option>
                {zones.map(z => {
                  const cap = z.capacity || 0;
                  const liveFree = z.available !== undefined ? z.available : cap;
                  return (
                    <option key={z._id} value={z._id}>
                      {z.name} (Live Free: {liveFree}/{cap})
                    </option>
                  )
                })}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-white mb-1 font-bold">From</label>
                <input
                  type="datetime-local"
                  className="w-full p-2 rounded text-gray-800 font-medium"
                  value={fromTime}
                  onChange={e => setFromTime(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-white mb-1 font-bold">To</label>
                <input
                  type="datetime-local"
                  className="w-full p-2 rounded text-gray-800 font-medium"
                  value={toTime}
                  onChange={e => setToTime(e.target.value)}
                />
              </div>
            </div>

            <button
              onClick={handleBook}
              disabled={processing}
              className="w-full py-3 bg-yellow-400 text-purple-900 font-bold rounded-lg shadow-lg hover:bg-yellow-300 hover:scale-105 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? "Booking..." : "Confirm Reservation"}
            </button>
          </div>
        </div>

        {/* ACTIVE RESERVATIONS LIST */}
        <div className="bg-white/10 border border-white/30 rounded-xl p-6 shadow-xl backdrop-blur-md">
          <h2 className="text-xl font-bold text-white mb-4">My Active Reservations</h2>

          {myReservations.length === 0 ? (
            <p className="text-white/70">No active reservations.</p>
          ) : (
            <div className="space-y-3">
              {myReservations.map(r => (
                <div key={r._id} className="bg-white/90 p-3 rounded-lg shadow-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-gray-800">{r.zoneName}</h3>
                      <p className="text-xs text-gray-500">
                        {new Date(r.fromTime).toLocaleString()} <br />
                        ⬇ <br />
                        {new Date(r.toTime).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${r.status === 'reserved' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                        {r.status}
                      </span>
                      <button
                        onClick={() => handleCancel(r._id)}
                        className="px-2 py-1 bg-red-100 text-red-600 text-xs font-bold rounded hover:bg-red-200 transition"
                      >
                        {r.status === 'reserved' ? "Check Out" : "Cancel"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div >
  );
}
