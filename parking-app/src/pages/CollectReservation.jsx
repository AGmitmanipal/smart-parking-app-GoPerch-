import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { getAuth } from 'firebase/auth';
import { useLocation } from 'react-router-dom';

const CollectReservation = () => {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [endtime, setendtime] = useState(null)
  const [starttime, setstarttime] = useState(null)
  const location = useLocation()
  const { zoneName } = location.state
  const [bookings, setbookings] = useState([])
  const auth = getAuth();
  const user = auth.currentUser;

  const delReserve = async (id) => {
    try {
      const res = await axios.delete(`http://localhost:7000/reserve/del/${id}`);
      setbookings(prev=>prev.filter(p=> p._id!==id))
    } catch (err) {
      console.error(err);
    }
  };


  const handleReservation = async () => {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      alert("Please log in first!");
      return;
    }
    if (endtime < new Date()) {
      alert("You can't select a time before the Current Time!");
      return;
    }
    if (starttime > endtime) {
      alert("You can't select a time before the Start Time!");
      return;
    }


    const email = user.email;

    try {
      const response = await axios.post('http://localhost:7000/reserve', {
        email,
        zoneName,
        timestampStart: start,
        timestampEnd: end
      })
      alert(response.data.message);
    } catch (err) {
      alert(err.response.data.message)
    }
  };

  useEffect(() => {


    if (!user) return;
    const email = user.email;

    const fetchBookings = async () => {
      try {
        const booked = await axios.get(`http://localhost:7000/reserve/book?email=${email}`);
        setbookings(booked.data);
      } catch (err) {
        console.log("Error fetching bookings:", err);
      }
    };

    fetchBookings();

    const interval = setInterval(fetchBookings, 10000);

    return () => clearInterval(interval);
  }, []);



  return (
    <div className="p-4 min-h-screen w-full bg-gradient-to-t from-sky-500 to-indigo-500">
      <label className='text-amber-50 font-bold'>Start Time:</label><br />
      <input
        type="datetime-local"
        value={start}
        min={new Date().toISOString().slice(0, 16)}
        onChange={(e) => {
          const selected = new Date(e.target.value);
          const now = new Date();

          if (selected < now) {
            alert("You can't select a time before the current moment!");
            return;
          }

          setStart(e.target.value);
        }}
        className="border-2 p-2 rounded bg-indigo-500 border-amber-50 text-white"
      />
      <br /><br />

      <label className='text-amber-50 font-bold'>End Time:</label><br />
      <input
        type="datetime-local"
        value={end}
        min={new Date().toISOString().slice(0, 16)}
        onChange={(e) => {
          const selected = new Date(e.target.value);
          const startTime = new Date(start);

          setEnd(e.target.value)
          setendtime(selected)
          setstarttime(startTime)
        }}
        className="border-2 p-2 rounded bg-indigo-500 border-amber-50 text-white"
      /><br /><br />

      <button type='button'
        onClick={handleReservation}
        className="border border-black rounded p-2 bg-white font-bold text-blue-950 hover:border-2 transition-all duration-300 h-[50px] w-[200px] hover:scale-105 hover:bg-blue-900 hover:border-white hover:text-white"
      >
        Confirm Your Seat!
      </button>
      <h1 className="font-bold text-white mt-6 mb-4 text-2xl">Your Reserved Seats:</h1>
      {bookings.length > 0 ? (
        bookings.map((b, index) => (
          <div key={index}>
            <br />
            <div className='lg: flex flex-row gap-10 border-4 border-white items-center justify-between rounded-2xl p-5 bg-blue-400'>
              <div className='lg: flex flex-col gap-2 text-amber-50 text-xl'>
                <p className='font-bold'>{b.zoneName}</p>
                <p className='text-left'>{new Date(b.timestampStart).toLocaleString()} ⮕ {new Date(b.timestampEnd).toLocaleString()}</p>
              </div>
              <div>
                <button className='w-auto h-13 p-2 rounded border-3 bg-red-600 text-white font-bold border-white mr-3 sm:mr-5 hover:scale-110 transition-all duration-200 hover:bg-white hover:text-red-600 hover:border-red-600' onClick={() => { delReserve(b._id) }}>Cancel</button>
              </div>
            </div>
          </div>
        ))
      ) : (
        <p>No bookings yet.</p>
      )}

    </div>
  );
};

export default CollectReservation;

