import React, { useEffect, useState } from "react";
import axios from "axios";
import { getAuth } from "firebase/auth";
import { useLocation } from "react-router-dom";


const CollectReservation = () => {
  const location = useLocation();

  // ⬅️ EXPECTED FROM MAP PAGE
  const { zoneId, zoneName, slotId, slotTag } = location.state || {};

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [bookings, setBookings] = useState([]);

  const auth = getAuth();
  const user = auth.currentUser;

  const RESERVATIONS_API_BASE_URL = import.meta.env.VITE_ZONES_API_BASE_URL || "http://localhost:5000";

  /* 🚨 GUARD: page opened without slot */
  if (!zoneId || !slotId) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-600 font-bold">
        No slot selected. Please choose a slot from the map.
      </div>
    );
  }

  /* 🟢 CREATE SLOT RESERVATION */
  const handleReservation = async () => {
    if (!user) {
      alert("Please log in first!");
      return;
    }

    const startTime = new Date(start);
    const endTime = new Date(end);
    const now = new Date();

    if (startTime < now || endTime < now) {
      alert("You cannot select a past time.");
      return;
    }

    if (startTime >= endTime) {
      alert("End time must be after start time.");
      return;
    }

    try {
      const res = await axios.post(`${RESERVATIONS_API_BASE_URL}/reserve`, {
        userId: user.email,
        zoneId,
        slotId,
        startTime: startTime,
        endTime: endTime,
      });

      alert(res.data.message);
    } catch (err) {
      alert(err.response?.data?.message || "Reservation failed");
    }
  };

  /* 📖 FETCH USER BOOKINGS */
  useEffect(() => {
    if (!user) return;

    const fetchBookings = async () => {
      try {
        const res = await axios.get(
          `${RESERVATIONS_API_BASE_URL}/reserve/book?email=${encodeURIComponent(user.email)}`
        );
        setBookings(res.data);
      } catch (err) {
        console.error("Error fetching bookings:", err);
      }
    };

    fetchBookings();
    const interval = setInterval(fetchBookings, 10000);
    return () => clearInterval(interval);
  }, [user]);

  /* ❌ CANCEL RESERVATION */
  const delReserve = async (id) => {
    try {
      await axios.delete(`${RESERVATIONS_API_BASE_URL}/reserve/del/${id}`);
      setBookings((prev) => prev.filter((b) => b._id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-4 min-h-screen w-full bg-linear-to-t from-sky-500 to-indigo-500">
      <h1 className="text-white text-2xl font-bold mb-4">
        🅿 {slotTag} — {zoneName}
      </h1>

      {/* START TIME */}
      <label className="text-white font-bold">Start Time</label>
      <input
        type="datetime-local"
        value={start}
        min={new Date().toISOString().slice(0, 16)}
        onChange={(e) => setStart(e.target.value)}
        className="block w-full p-2 rounded bg-indigo-500 text-white border mb-4"
      />

      {/* END TIME */}
      <label className="text-white font-bold">End Time</label>
      <input
        type="datetime-local"
        value={end}
        min={start}
        onChange={(e) => setEnd(e.target.value)}
        className="block w-full p-2 rounded bg-indigo-500 text-white border mb-6"
      />

      <button
        onClick={handleReservation}
        className="w-[220px] h-[50px] bg-white text-blue-900 font-bold rounded hover:bg-blue-900 hover:text-white transition"
      >
        Confirm Slot Reservation
      </button>

      {/* BOOKINGS */}
      <h2 className="text-white font-bold text-2xl mt-10 mb-4">
        Your Reservations
      </h2>

      {bookings.length > 0 ? (
        bookings.map((b) => (
          <div
            key={b._id}
            className="bg-blue-400 border-4 border-white rounded-2xl p-5 mb-4 flex justify-between"
          >
            <div className="text-white">
              <p className="font-bold">{b.zoneName}</p>
              <p>🅿 {b.slotTag}</p>
              <p>
                {new Date(b.timestampStart).toLocaleString()} ⮕{" "}
                {new Date(b.timestampEnd).toLocaleString()}
              </p>
            </div>
            <button
              onClick={() => delReserve(b._id)}
              className="bg-red-600 text-white font-bold px-4 py-2 rounded hover:bg-white hover:text-red-600"
            >
              Cancel
            </button>
          </div>
        ))
      ) : (
        <p className="text-white">No bookings yet.</p>
      )}
    </div>
  );
};

export default CollectReservation;
