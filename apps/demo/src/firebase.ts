import { initializeApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
const app = initializeApp({
  projectId: "demo-listenerledger",
  apiKey: "emulator-only",
  appId: "demo-only",
});
export const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", 8080);
