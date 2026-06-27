import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
    apiKey: "AIzaSyANO2d-RUXV0x5fvTjRT1UkpssP-T_Qz1Q",
    authDomain: "daily-tracker-a4092.firebaseapp.com",
    projectId: "daily-tracker-a4092",
    storageBucket: "daily-tracker-a4092.appspot.com",
    messagingSenderId: "1023352927583",
    appId: "1:1023352927583:web:2f0234b40a448390b6b2ea",
    measurementId: "G-G9GDW34WTS"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app); 