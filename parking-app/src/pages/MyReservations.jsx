import React, { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const MyReservations = () => {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingZone, setLoadingZone] = useState(null); // Track which reservation is loading zone
  const [cancellingId, setCancellingId] = useState(null); // Track which reservation is being cancelled

  const auth = getAuth();
  const user = auth.currentUser;
  const navigate = useNavigate();

  const cancelReservation = async (reservationId) => {
    if (!window.confirm("Cancel this reservation?")) return;

    try {
      setCancellingId(reservationId);
      setError(null);

      const res = await fetch(`http://localhost:7000/reserve/${reservationId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || data?.error || "Failed to cancel reservation");
      }

      // Optimistically update UI; polling will re-sync shortly as well.
      setReservations((prev) =>
        prev.map((r) => (r._id === reservationId ? { ...r, status: "cancelled" } : r))
      );
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to cancel reservation. Please try again.");
    } finally {
      setCancellingId(null);
    }
  };

  // Navigate to map and highlight specific slot
  const handleViewOnMap = async (reservation) => {
    try {
      setLoadingZone(reservation._id);
      // Fetch zone data
      const res = await axios.get("http://localhost:5000/");
      const zones = res.data;
      const zone = zones.find((z) => z._id === reservation.zoneId || z._id.toString() === reservation.zoneId);

      if (zone) {
        // Navigate to map with zone data and slotId to highlight
        navigate("/map", {
          state: {
            ...zone,
            highlightSlotId: reservation.slotId, // Pass slotId to highlight
          },
        });
      } else {
        alert("Zone not found. Please try again.");
      }
    } catch (err) {
      console.error("Error fetching zone:", err);
      alert("Failed to load zone. Please try again.");
    } finally {
      setLoadingZone(null);
    }
  };

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchReservations = async (isInitialLoad = false) => {
      // Only show loading spinner on initial load, not on periodic refreshes
      if (isInitialLoad) {
        setLoading(true);
      }
      setError(null);
      try {
        // Backend: "Reservation history for the logged-in user"
        // Use email as userId for consistency
        const userId = user.email || user.uid;
        const res = await fetch(
          `http://localhost:7000/reserve/book?userId=${encodeURIComponent(userId)}`
        );
        if (!res.ok) {
          throw new Error("Failed to load reservations");
        }
        const data = await res.json();

        // Sort most recent first by endTime (fallback to startTime)
        const sorted = [...data].sort((a, b) => {
          const aTime = new Date(a.endTime || a.startTime).getTime();
          const bTime = new Date(b.endTime || b.startTime).getTime();
          return bTime - aTime;
        });
        setReservations(sorted);
      } catch (err) {
        console.error(err);
        setError("Unable to load reservations. Please try again.");
      } finally {
        if (isInitialLoad) {
          setLoading(false);
        }
      }
    };

    // Initial load
    fetchReservations(true);

    // Poll every 20 seconds to keep reservation status up-to-date
    // This ensures status changes (active -> completed, cancellations) are reflected
    const intervalId = setInterval(() => {
      fetchReservations(false);
    }, 20000); // 20 seconds

    return () => clearInterval(intervalId);
  }, [user]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-700 font-semibold">
          Please log in to view your reservations.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">
          My Reservations
        </h1>

        {loading && (
          <div className="flex items-center gap-2 text-gray-600">
            <span className="animate-spin">↻</span>
            <span>Loading your reservations...</span>
          </div>
        )}

        {error && !loading && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && reservations.length === 0 && (
          <div className="rounded-xl bg-white border border-dashed border-gray-300 px-6 py-10 text-center">
            <p className="text-lg font-semibold text-gray-800 mb-1">
              No reservations yet
            </p>
            <p className="text-sm text-gray-500">
              Your future and past parking reservations will appear here.
            </p>
          </div>
        )}

        {!loading && reservations.length > 0 && (
          <div className="space-y-4">
            {reservations.map((r) => {
              const start = new Date(r.startTime);
              const end = new Date(r.endTime);
              const status =
                r.status ||
                (end.getTime() < Date.now() ? "completed" : "active");

              const badgeClasses =
                status === "active"
                  ? "bg-emerald-100 text-emerald-700"
                  : status === "cancelled"
                  ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-700";

              return (
                <div
                  key={r._id}
                  className="bg-white border border-gray-200 rounded-2xl px-4 py-3 md:px-6 md:py-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {r.zoneName || r.zoneId}
                    </p>
                    <p className="text-xs text-gray-500">
                      Slot:{" "}
                      <span className="font-medium text-gray-700">
                        {r.slotTag || r.slotId}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-gray-600">
                      <span className="font-medium">From:</span>{" "}
                      {start.toLocaleString()}{" "}
                      <span className="font-medium ml-2">To:</span>{" "}
                      {end.toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center justify-between md:flex-col md:items-end gap-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${badgeClasses}`}
                    >
                      {status}
                    </span>

                    {/* Cancel is ONLY available here in "My Reservations" */}
                    {status === "active" && (
                      <button
                        onClick={() => cancelReservation(r._id)}
                        disabled={cancellingId === r._id}
                        className="mt-2 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {cancellingId === r._id ? "Cancelling..." : "Cancel Reservation"}
                      </button>
                    )}

                    <button
                      onClick={() => handleViewOnMap(r)}
                      disabled={loadingZone === r._id}
                      className="mt-2 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {loadingZone === r._id ? "Loading..." : "📍 View on Map"}
                    </button>
                    <span className="text-[11px] text-gray-400">
                      Created at{" "}
                      {new Date(r.createdAt || r.startTime).toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyReservations;


