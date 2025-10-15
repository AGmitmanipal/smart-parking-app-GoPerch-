import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { auth } from "../services/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
  const [userId, setUserId] = useState(null);
  const [showLoc, setShowLoc] = useState([]);
  const navigate = useNavigate();


  useEffect(() => {
    const fetchZones = () => {
      axios.get('http://localhost:5000/').then((res) => {
        setShowLoc(res.data)
      }).catch((err) => {
        console.log('Error', err)
      })
    }
    fetchZones()
    const interval = setInterval(fetchZones, 5000)
    return () => clearInterval(interval);
  }, [])

  useEffect(() => { const unsubscribe = onAuthStateChanged(auth, (user) => setUserId(user ? user.uid : null)); return () => unsubscribe(); }, []);

  return (
    <div className="min-h-screen p-5 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
      <h1 className="relative inline-block text-2xl md:text-4xl font-bold mb-6 text-white 
           after:content-[''] after:absolute after:left-0 after:bottom-0 
           after:h-[3px] after:bg-pink-500 after:w-0 
           hover:after:w-[60%] after:transition-all after:duration-700 after:ease-in-out underline underline-offset-5">
        Parking Zones
      </h1>


      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {showLoc.map((loc, i) => (
          <div
            key={i}
            className="border border-white p-4 rounded-lg hover:shadow-sm transition-shadow shadow-amber-50 duration-300 flex flex-col cursor-pointer bg-gradient-to-t from-purple-400 to-indigo-500"
          >
            <h2 className="text-lg font-bold mb-2 text-white">{loc.name}</h2>
            <p className="text-white font-semibold">Capacity: {loc.capacity}</p>
            <p className="text-white font-semibold">Available: {loc.available}</p>
            <div className='mt-5 flex flex-row gap-2 justify-around'>
              <button className='border bg-purple-800 text-white font-bold border-white rounded p-2 hover:scale-105 hover:border-purple-800 hover:text-purple-800 hover:bg-white transition-all duration-300 cursor-pointer' onClick={() => navigate('/map', { state: loc })}>Show Directions</button>
              <button className='border bg-purple-800 text-white font-bold border-white rounded p-2 hover:scale-105 hover:border-purple-800 hover:text-purple-800 hover:bg-white transition-all duration-300 cursor-pointer' onClick={() => navigate('/reserve', { state: { zoneName: loc.name } })}>Reserve</button>
            </div>
          </div>
        ))}
      </div>

      {showLoc.length === 0 && (
        <p className="text-yellow-300 font-bold mt-4 text-center">No parking zones available</p>
      )}
    </div>
  );
};

export default Dashboard

