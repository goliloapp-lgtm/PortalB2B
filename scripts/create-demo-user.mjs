import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBF_SrtsqjpgbGNSQ5q0ut0SbZOA0Y-mYY",
  authDomain: "lilo-23fef.firebaseapp.com",
  projectId: "lilo-23fef",
  storageBucket: "lilo-23fef.firebasestorage.app",
  messagingSenderId: "950183292908",
  appId: "G-7FPZ6SREX3",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const DEMO_EMAIL = "empresa.demo@lilo.com";
const DEMO_PASS = "LiloB2B2026!";

async function main() {
  console.log("=== REGISTRANDO USUARIO DEMO EN FIREBASE AUTH ===");
  let uid = null;

  try {
    const cred = await createUserWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASS);
    uid = cred.user.uid;
    console.log(`[AUTH] Usuario creado exitosamente con UID: ${uid}`);
  } catch (err) {
    if (err.code === "auth/email-already-in-use") {
      console.log(`[AUTH] El usuario ya existía. Probando login con contraseña...`);
      const cred = await signInWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASS);
      uid = cred.user.uid;
      console.log(`[AUTH] Login exitoso con UID: ${uid}`);
    } else {
      console.error("[AUTH ERROR]", err);
      process.exit(1);
    }
  }

  console.log("=== VINCULANDO EMPRESA DEMO EN FIRESTORE ===");
  const q = query(collection(db, "b2b_companies"), where("email", "==", DEMO_EMAIL));
  const snap = await getDocs(q);

  const companyData = {
    tradeName: "Industrias El Ángel S.A. de C.V.",
    legalName: "Industrias El Ángel Sociedad Anónima de Capital Variable",
    nit: "0614-120595-102-3",
    nrc: "234567-8",
    contactName: "Carlos Mendoza",
    phone: "+503 2250-4000",
    whatsapp: "+503 7890-1234",
    email: DEMO_EMAIL,
    address: "Carretera al Puerto de La Libertad Km 10.5, Santa Tecla, La Libertad",
    paymentCondition: "credit_30",
    requiresInvoice: false,
    requiresCCF: true,
    balance: 485.50,
    status: "active",
    countryId: "SV",
    updatedAt: serverTimestamp(),
  };

  if (!snap.empty) {
    const companyId = snap.docs[0].id;
    console.log(`[FIRESTORE] Actualizando empresa existente ID: ${companyId}`);
    await updateDoc(doc(db, "b2b_companies", companyId), companyData);
  } else {
    console.log(`[FIRESTORE] Creando nueva empresa B2B...`);
    const docRef = await addDoc(collection(db, "b2b_companies"), {
      ...companyData,
      createdAt: serverTimestamp(),
    });
    console.log(`[FIRESTORE] Empresa creada con ID: ${docRef.id}`);
  }

  console.log("\n==========================================");
  console.log("CREDENCIALES DE PRUEBA REGISTRADAS CON ÉXITO:");
  console.log(`  Email:       ${DEMO_EMAIL}`);
  console.log(`  Contraseña:  ${DEMO_PASS}`);
  console.log(`  Empresa:     ${companyData.tradeName}`);
  console.log(`  NIT:         ${companyData.nit} | NRC: ${companyData.nrc}`);
  console.log(`  Saldo Demo:  $${companyData.balance} USD`);
  console.log("==========================================\n");
  process.exit(0);
}

main().catch(console.error);
