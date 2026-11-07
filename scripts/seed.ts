import { deleteApp, initializeApp } from "firebase/app";
import {
  connectFirestoreEmulator,
  doc,
  getFirestore,
  terminate,
  writeBatch,
} from "firebase/firestore";
const app = initializeApp({
  projectId: "demo-listenerledger",
  apiKey: "emulator-only",
});
const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", 8080);
const response = await fetch(
  "http://127.0.0.1:8080/emulator/v1/projects/demo-listenerledger/databases/(default)/documents",
  { method: "DELETE" },
);
if (!response.ok) throw new Error("Emulator reset failed");
const batch = writeBatch(db);
for (const screen of ["inbox", "conversation", "activity"])
  for (let i = 0; i < 10; i++)
    batch.set(doc(db, "demo", screen, "items", String(i)), {
      title: screen + " item " + i,
      revision: 0,
    });
await batch.commit();
await terminate(db);
await deleteApp(app);
console.log("Reset and seeded local demo data.");
