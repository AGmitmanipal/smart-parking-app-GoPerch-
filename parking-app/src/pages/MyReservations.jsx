import React, { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import axios from "axios";


const MyReservations = () => {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  const auth = getAuth();
  const user = auth.currentUser;
  const navigate = useNavigate();

  const ZONES_API_BASE_URL = import.meta.env.VITE_ZONES_API_BASE_URL || "http://localhost:5000";
  const RESERVATIONS_API_BASE_URL = import.meta.env.VITE_ZONES_API_BASE_URL || "http://localhost:5000";

  const cancelReservation = async (reservationId) => {
    if (!window.confirm("Cancel this reservation?")) return;

    try {
      setCancellingId(reservationId);
      setError(null);

      const res = await fetch(`${RESERVATIONS_API_BASE_URL}/reserve/${reservationId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to cancel reservation");
      }

      // Optimistically update UI
      setReservations((prev) =>
        prev.map((r) => (r._id === reservationId ? { ...r, status: "cancelled" } : r))
      );
    } catch (err) {
      console.error(err);
      setError("Failed to cancel reservation.");
    } finally {
      setCancellingId(null);
    }
  };

  const handleViewOnMap = async (reservation) => {
    try {
      // Fetch zone data to pass state
      const res = await axios.get(`${ZONES_API_BASE_URL}/`);
      const zones = res.data;
      const zone = zones.find((z) => z._id === reservation.zoneId);

      if (zone) {
        navigate("/map", { state: zone });
      } else {
        alert("Zone unavailable");
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchReservations = async () => {
      setLoading(true);
      setError(null);
      try {
        const userId = user.uid;
        const res = await fetch(`${RESERVATIONS_API_BASE_URL}/reserve/book?userId=${encodeURIComponent(userId)}`);

        if (res.ok) {
          const data = await res.json();
          setReservations(data);
        } else {
          throw new Error("Failed to load");
        }
      } catch (err) {
        console.error(err);
        setError("Could not load reservations");
      } finally {
        setLoading(false);
      }
    };

    fetchReservations();
  }, [user]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-700 font-semibold">Please log in.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">My Reservations</h1>

        {loading && <div className="text-gray-500">Loading...</div>}

        {error && <div className="text-red-500 mb-4">{error}</div>}

        {!loading && !error && reservations.length === 0 && (
          <div className="text-center p-10 bg-white rounded-xl shadow-sm border border-dashed border-gray-300">
            <p className="text-gray-500">No reservations found.</p>
          </div>
        )}

        <div className="space-y-4">
          {reservations.map((r) => {
            const start = new Date(r.fromTime || r.startTime);
            const end = new Date(r.toTime || r.endTime);

            return (
              <div key={r._id} className="bg-white p-4 rounded-xl shadow border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center">
                <div className="mb-4 md:mb-0">
                  <h3 className="font-bold text-lg text-gray-800">{r.zoneName}</h3>
                  <div className="text-sm text-gray-500 mt-1 space-y-1">
                    <p>From: <span className="font-medium text-gray-700">{start.toLocaleString()}</span></p>
                    <p>To: <span className="font-medium text-gray-700">{end.toLocaleString()}</span></p>
                  </div>
                  <div className={`mt-2 inline-block px-2 py-1 rounded text-xs font-bold uppercase ${r.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {r.status}
                  </div>
                </div>

                <div className="flex gap-2">
                  {['active', 'booked', 'reserved'].includes(r.status) && (
                    <button
                      onClick={() => cancelReservation(r._id)}
                      disabled={cancellingId === r._id}
                      className={`px-3 py-2 rounded font-bold text-sm disabled:opacity-50 transition-colors ${r.status === 'reserved'
                        ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                        : 'bg-red-50 text-red-600 hover:bg-red-100'
                        }`}
                    >
                      {cancellingId === r._id
                        ? "Processing..."
                        : r.status === 'reserved' ? "Check Out" : "Cancel Booking"
                      }
                    </button>
                  )}
                  <button
                    onClick={() => handleViewOnMap(r)}
                    className="bg-blue-50 text-blue-600 px-3 py-2 rounded font-bold text-sm hover:bg-blue-100"
                  >
                    View Map
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MyReservations;
