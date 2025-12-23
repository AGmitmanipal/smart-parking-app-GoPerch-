import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Map from "./pages/Map";
import Navbar from "./components/Navbar";
import { auth } from "./services/firebase";
import CollectReservation from "./pages/CollectReservation";
import MyReservations from "./pages/MyReservations";

const App = () => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(setUser);
    return () => unsubscribe();
  }, []);

  return (
    <>
      {user && <Navbar />}
      <Routes>
        <Route
          path="/"
          element={user ? <Navigate to="/dashboard" /> : <Login />}
        />
        <Route
          path="/dashboard"
          element={user ? <Dashboard /> : <Navigate to="/" />}
        />
        <Route
          path="/map"
          element={user ? <Map /> : <Navigate to="/" />}
        />
        <Route
          path="/reserve"
          element={user ? <CollectReservation /> : <Navigate to="/" />}
        />
        <Route
          path="/my-reservations"
          element={user ? <MyReservations /> : <Navigate to="/" />}
        />
      </Routes>
    </>
  );
};

export default App;
