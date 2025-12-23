import React, { useState } from "react";
import { auth } from "../services/firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { useNavigate } from "react-router-dom";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleAuth = async (e) => {
    e.preventDefault();
    setError("");

    if (isSignup && password !== confirmPassword) {
      setError("Passwords do not match!");
      return;
    }

    try {
      if (isSignup) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-linear-to-br from-indigo-500 via-purple-500 to-pink-500 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl p-6 sm:p-8 md:p-10 lg:p-12 space-y-6 rounded-2xl shadow-2xl backdrop-blur-lg bg-white/20 dark:bg-gray-900/40 border border-white/30">

        <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-center text-white drop-shadow-lg">
          {isSignup ? "Create Account" : "Welcome Back"}
        </h2>

        <form onSubmit={handleAuth} className="space-y-5">

          <div>
            <label htmlFor="email" className="block mb-1 text-sm sm:text-base font-medium text-white/90">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base text-white placeholder-gray-300 bg-white/10 border border-white/30 rounded-lg focus:ring-2 focus:ring-pink-400 focus:border-pink-400 backdrop-blur-md"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="password" className="block mb-1 text-sm sm:text-base font-medium text-white/90">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base text-white placeholder-gray-300 bg-white/10 border border-white/30 rounded-lg focus:ring-2 focus:ring-pink-400 focus:border-pink-400 backdrop-blur-md"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

         
          {isSignup && (
            <div>
              <label htmlFor="confirmPassword" className="block mb-1 text-sm sm:text-base font-medium text-white/90">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base text-white placeholder-gray-300 bg-white/10 border border-white/30 rounded-lg focus:ring-2 focus:ring-pink-400 focus:border-pink-400 backdrop-blur-md"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          )}

          <button
            type="submit"
            className="w-full py-2 sm:py-3 text-sm sm:text-base font-semibold text-white transition duration-200 ease-in-out transform rounded-lg bg-linear-to-r from-pink-500 to-indigo-500 hover:from-indigo-600 hover:to-pink-600 focus:outline-none focus:ring-4 focus:ring-pink-300 hover:scale-[1.02]"
          >
            {isSignup ? "Sign Up" : "Log In"}
          </button>
        </form>

        <div className="flex items-center justify-center">
          <p className="text-xs sm:text-sm text-white/80">
            {isSignup ? "Already have an account?" : "Don’t have an account?"}{" "}
            <button
              type="button"
              onClick={() => setIsSignup(!isSignup)}
              className="font-semibold underline decoration-pink-400 decoration-2 underline-offset-2 hover:text-pink-300 transition"
            >
              {isSignup ? "Log In" : "Sign Up"}
            </button>
          </p>
        </div>

        {error && (
          <p className="mt-3 text-xs sm:text-sm text-center text-red-300 bg-red-500/20 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}
      </div>
    </div>
  );
};

export default Login;

