import React from "react";
import { auth } from "../services/firebase";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";

const Navbar = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/");
  };

  return (
    <nav className="flex flex-row md:flex-row sm:py-5 justify-between bg-linear-to-r from-purple-500 to-yellow-500 h-[110px] gap-5 items-center text-center">
      <span className="relative inline-block text-amber-300 text-2xl font-bold after:content-[''] after:left-0 after:bottom-[-6px] after:h-[2px] after:bg-amber-900 after:absolute after:w-0 hover:after:bg-amber-400 hover:after:bottom-[-6px] after:transition-all after:duration-500 hover:after:w-[70%] underline decoration-amber-800 underline-offset-10 top-[7px] ml-2 sm:max-w-[372px] sm:ml-5 text-center">Smart Parking App</span>
      <button className="transform inline-block border border-amber-50 bg-amber-300 rounded p-2 hover:scale-120 hover:text-amber-50 hover:border-amber-700 transition-all duration-150 text-amber-700 font-bold hover:border-2 mr-2 text-sm sm:text-xl pb-2 sm:pb-2 mb-[-15px] sm:mr-5" onClick={handleLogout} >
        Log Out
      </button>
    </nav>
  );
};

export default Navbar;
