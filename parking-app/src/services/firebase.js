import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBkjajLm_FbVSs2hTOVR75DPReXfpo89vg",
  authDomain: "smart-parking-app-7d081.firebaseapp.com",
  projectId: "smart-parking-app-7d081",
  storageBucket: "smart-parking-app-7d081.firebasestorage.app",
  messagingSenderId: "791884839345",
  appId: "1:791884839345:web:7f64227d10f26142c66590",
  measurementId: "G-QENGK3X3FR"
};


const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
