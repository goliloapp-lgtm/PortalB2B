import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

export const db = getFirestore(firebaseApp);
export const rtdb = getDatabase(firebaseApp);
export const auth = getAuth(firebaseApp);
export const storage = getStorage(firebaseApp);
export const functions = getFunctions(firebaseApp, "us-central1");

export const createTripCallable = <Req = unknown, Res = unknown>(data: Req) =>
  httpsCallable<Req, Res>(functions, "createTrip")(data);

export interface FareQuote {
  farePrice: number;
  discountAmount: number;
  baseAmount: number;
  taxAmount: number;
  totalAmount: number;
  discountType: "porcentaje" | "monto" | "none";
  taxRate: number;
  taxLabel: string;
  rateSource: string;
  chargedDistance: number;
  billableDistance: number;
  distanceUnit: string;
  appliedFareRate: number;
  countryFloorRate: number;
  currencyCode: string;
  currencyDecimals: number;
  commissionRate: number;
  commissionAmount: number;
  driverEarning: number;
}

export interface GetFareQuoteResponse {
  quote: FareQuote;
  countryId: string;
  flow: "direct" | "b2b";
}

export const getFareQuoteCallable = <
  Req = {
    legs: Array<{ distance: number; durationMinutes: number }>;
    categoryId?: string;
  },
  Res = GetFareQuoteResponse
>(
  data: Req
) => httpsCallable<Req, Res>(functions, "getFareQuote")(data);

export const requestPasswordResetCodeCallable = (data: {
  email: string;
  locale?: "es" | "en";
}) =>
  httpsCallable<
    { email: string; locale?: "es" | "en" },
    { success: boolean; message: string }
  >(
    functions,
    "requestPasswordResetCode"
  )(data);

export const verifyPasswordResetCodeAndUpdatePasswordCallable = (data: {
  email: string;
  code: string;
  newPassword: string;
}) =>
  httpsCallable<
    { email: string; code: string; newPassword: string },
    { success: boolean; message: string }
  >(
    functions,
    "verifyPasswordResetCodeAndUpdatePassword"
  )(data);

export const cancelCompanyReservationCallable = <
  Req = { tripId: string },
  Res = { cancelled: boolean; alreadyCancelled?: boolean; releasedAmount?: number }
>(
  data: Req
) => httpsCallable<Req, Res>(functions, "cancelCompanyReservation")(data);

// --- CF-32: List Company Trips Callable ---
export interface ListCompanyTripsParams {
  status?: string;
  limit?: number;
}

export interface ListCompanyTripsResponse {
  trips: Array<{
    tripId: string;
    status: string;
    requestedAt: string;
    totalAmount: number;
    categoryId?: string;
    originAddress?: string;
    destinationAddress?: string;
    driverId?: string;
    [key: string]: any;
  }>;
}

export const listCompanyTripsCallable = (params?: ListCompanyTripsParams) =>
  httpsCallable<ListCompanyTripsParams, ListCompanyTripsResponse>(
    functions,
    "listCompanyTrips"
  )(params || {});

// --- CF-33: Get Company Period Summary Callable ---
export interface GetCompanyPeriodSummaryParams {
  at?: string;
}

export interface GetCompanyPeriodSummaryResponse {
  period: string;
  startsOn: string;
  endsOn: string;
  tripCount: number;
  excludedCount: number;
  billableTotal: number;
  taxTotal: number;
  commissionTotal: number;
  driverEarnings: Array<{ driverId: string; amount: number; tripCount: number }>;
}

export const getCompanyPeriodSummaryCallable = (params?: GetCompanyPeriodSummaryParams) =>
  httpsCallable<GetCompanyPeriodSummaryParams, GetCompanyPeriodSummaryResponse>(
    functions,
    "getCompanyPeriodSummary"
  )(params || {});

