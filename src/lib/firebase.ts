import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
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

// CF-65: el idioma del correo sale del país del usuario; el payload NO lleva `locale`.
export const requestPasswordResetCodeCallable = (data: { email: string }) =>
  httpsCallable<{ email: string }, { success: boolean; message: string }>(
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


// --- CF-48: createScheduledTrip (reserva programada B2B) ---
export interface CreateScheduledTripPayload {
  travellerId: string;
  passengerCount: number;
  /** ISO 8601 con zona, futuro. */
  scheduledPickupAt: string;
  originAddress: string;
  originLatitude: number;
  originLongitude: number;
  destinationAddress: string;
  destinationLatitude: number;
  destinationLongitude: number;
  legs: Array<{ distance: number; durationMinutes: number }>;
  rideTimeMinutes: number;
  etaMinutes: number;
  paymentMethod: string;
  costCentreId?: string;
}

export interface CreateScheduledTripResponse {
  scheduledTripId: string;
  status: "available";
  countryId: string;
  companyId: string;
  travellerId: string;
  scheduledPickupAt: string;
  passengerCount: number;
  categoryId: string;
  quote: FareQuote & { minimumDistance: number };
  ceilingReservedAt: string;
  ceilingReservedAmount: number;
  costCentreId: string;
}

// `categoryId`, `companyId` y `countryId` NO se mandan: el servidor los deriva.
export const createScheduledTripCallable = (data: CreateScheduledTripPayload) =>
  httpsCallable<CreateScheduledTripPayload, CreateScheduledTripResponse>(
    functions,
    "createScheduledTrip"
  )(data);

// --- CF-54: cancelScheduledTrip ---
export const cancelScheduledTripCallable = (data: { scheduledTripId: string }) =>
  httpsCallable<
    { scheduledTripId: string },
    { scheduledTripId: string; status: string; releasedAmount?: number }
  >(functions, "cancelScheduledTrip")(data);

// --- CF-47: viajeros ---
export interface TravellerRow {
  travellerId: string;
  name: string;
  documentNumber?: string;
  phone?: string;
  email?: string;
  active: boolean;
}

export const createTravellerCallable = (data: {
  name: string;
  phone?: string;
  email?: string;
  documentNumber?: string;
}) =>
  httpsCallable<typeof data, { travellerId: string }>(
    functions,
    "createTraveller"
  )(data);

export const updateTravellerCallable = (data: {
  travellerId: string;
  name?: string;
  phone?: string;
  email?: string;
  documentNumber?: string;
  active?: boolean;
}) =>
  httpsCallable<typeof data, { travellerId: string }>(
    functions,
    "updateTraveller"
  )(data);

export const listTravellersCallable = () =>
  httpsCallable<
    Record<string, never>,
    { travellers: TravellerRow[]; count: number }
  >(functions, "listTravellers")({});

// --- CF-46: centros de costo ---
export interface CostCentreRow {
  costCentreId: string;
  name: string;
  /** ausente = sin techo */
  budgetLimit?: number;
  reserved: number;
  spent: number;
  active: boolean;
  budgetWindowStartAt?: number;
}

export const listCostCentresCallable = () =>
  httpsCallable<
    Record<string, never>,
    { costCentres: CostCentreRow[]; count: number }
  >(functions, "listCostCentres")({});

/** `budgetLimit: null` quita el techo. El `company_admin` solo puede mover `budgetLimit`. */
export const updateCostCentreCallable = (data: {
  costCentreId: string;
  budgetLimit?: number | null;
}) =>
  httpsCallable<typeof data, CostCentreRow>(
    functions,
    "updateCostCentre"
  )(data);

// --- listVehicleTypes: catálogo de categorías (única lectura de categorías) ---
export interface VehicleTypeModel {
  maxPassengers?: number;
  [key: string]: unknown;
}

export interface VehicleTypeSummary {
  id: string;
  name: string;
  definition: string;
  hasCargoBed: boolean;
  b2bSuitable: boolean;
  selectable: boolean;
  sortOrder: number;
  models: VehicleTypeModel[];
}

export const listVehicleTypesCallable = (data: {
  b2bSuitable?: boolean;
  minPassengers?: number;
}) =>
  httpsCallable<
    typeof data,
    { types: VehicleTypeSummary[]; modelsWithoutCapacity: unknown[] }
  >(functions, "listVehicleTypes")(data);

// --- CF-45: listCompanyRates ---
export interface CompanyRateRow {
  categoryId: string;
  categoryName: string;
  fareRate: number;
  source: "negotiated" | "country";
  hasNegotiatedRate: boolean;
}

export interface ListCompanyRatesResponse {
  companyId: string;
  countryId: string;
  rates: CompanyRateRow[];
  counts: {
    negotiated: number;
    inherited: number;
    missing: number;
    total: number;
  };
}

export const listCompanyRatesCallable = (params?: {
  companyId?: string;
  countryId?: string;
}) =>
  httpsCallable<
    { companyId?: string; countryId?: string },
    ListCompanyRatesResponse
  >(functions, "listCompanyRates")(params || {});

// --- CF-61: listTripEvents ---
export interface TripEventRow {
  eventId: string;
  tripId?: string;
  scheduledTripId?: string;
  countryId: string;
  companyId?: string;
  driverId?: string;
  eventType: string;
  fromStatus?: string;
  toStatus?: string;
  actorType?: string;
  source?: string;
  reason?: string;
  at: string;
}

export const listTripEventsCallable = (params: {
  tripId?: string;
  driverId?: string;
  from?: string;
  to?: string;
  limit?: number;
}) =>
  httpsCallable<typeof params, { events: TripEventRow[]; count: number }>(
    functions,
    "listTripEvents"
  )(params);

// --- CF-62: reportTripIncident ---
export type IncidentType =
  | "accident"
  | "breakdown"
  | "route_deviation"
  | "passenger_no_show"
  | "driver_no_show"
  | "safety"
  | "payment"
  | "other";

export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export const reportTripIncidentCallable = (data: {
  tripId: string;
  type: IncidentType;
  severity: IncidentSeverity;
  description: string;
  occurredAt?: string;
  attachments?: string[];
  requestId?: string;
}) =>
  httpsCallable<
    typeof data,
    {
      incidentId: string;
      tripId: string;
      status: "open";
      type: IncidentType;
      severity: IncidentSeverity;
      idempotent?: boolean;
    }
  >(functions, "reportTripIncident")(data);

// --- CF-63: listTripIncidents ---
export interface TripIncidentRow {
  incidentId: string;
  tripId: string;
  countryId: string;
  companyId?: string;
  driverId?: string;
  type: IncidentType;
  severity: IncidentSeverity;
  status: "open" | "under_review" | "resolved" | "dismissed";
  description: string;
  attachments?: string[];
  occurredAt: string;
  reportedAt: string;
  tripStatusAtReport?: string;
  resolvedAt?: string;
  resolutionCode?: string;
  resolutionNote?: string;
}

export const listTripIncidentsCallable = (params: {
  tripId?: string;
  status?: "open" | "under_review" | "resolved" | "dismissed";
  type?: IncidentType;
  limit?: number;
}) =>
  httpsCallable<typeof params, { incidents: TripIncidentRow[]; count: number }>(
    functions,
    "listTripIncidents"
  )(params);

// --- CF-68: cancelTrip ---
export const cancelTripCallable = (data: {
  rideId: string;
  reason?: string;
}) =>
  httpsCallable<
    typeof data,
    {
      rideId: string;
      status: "cancelled";
      cancelledBy: string;
      actor: string;
      cancelledAt: string;
      idempotent?: boolean;
    }
  >(functions, "cancelTrip")(data);

// --- CF-75: listCompanyScheduledTrips ---
export interface CompanyScheduledTripRow {
  scheduledTripId: string;
  status:
    | "available"
    | "offered"
    | "driver_rejected"
    | "driver_assigned"
    | "dispatched"
    | "completed"
    | "cancelled"
    | "expired";
  scheduledPickupAt: string;
  categoryId: string;
  originAddress: string;
  destinationAddress: string;
  totalAmount: number;
  currencyCode: string;
  travellerId?: string;
  acceptedVehicleId?: string;
}

export const listCompanyScheduledTripsCallable = (params?: {
  status?:
    | "available"
    | "offered"
    | "driver_rejected"
    | "driver_assigned"
    | "dispatched"
    | "completed"
    | "cancelled"
    | "expired";
  from?: string;
  to?: string;
  limit?: number;
}) =>
  httpsCallable<
    typeof params,
    { scheduledTrips: CompanyScheduledTripRow[]; count: number }
  >(functions, "listCompanyScheduledTrips")(params || {});

// --- CF-84: Solicitudes de nuevos centros de costo ---
export interface CostCentreRequestRow {
  requestId: string;
  countryId: string;
  companyId: string;
  requestedBy: string;
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
  proposedName: string;
  proposedBudgetLimit?: number;
  decidedBy: string | null;
  decidedAt: string | null;
  rejectionReason: string | null;
  createdCostCentreId: string | null;
}

export const requestCostCentreCallable = (data: {
  proposedName: string;
  proposedBudgetLimit?: number;
}) =>
  httpsCallable<typeof data, { requestId: string }>(
    functions,
    "requestCostCentre"
  )(data);

export const listCostCentreRequestsCallable = (params?: {
  status?: "pending" | "approved" | "rejected";
  limit?: number;
}) =>
  httpsCallable<
    typeof params,
    { requests: CostCentreRequestRow[]; count: number }
  >(functions, "listCostCentreRequests")(params || {});

// --- CF-39 & CF-44: Gestión de Usuarios Corporativos y Roles B2B ---
export interface CreateCompanyUserParams {
  email: string;
  roleId: string;
  firstName?: string;
  lastName?: string;
  companyId?: string;
  countryId?: string;
}

export interface CreateCompanyUserResponse {
  uid: string;
  countryId: string;
  companyId: string;
  roleId: string;
}

export const createCompanyUserCallable = (data: CreateCompanyUserParams) =>
  httpsCallable<CreateCompanyUserParams, CreateCompanyUserResponse>(
    functions,
    "createCompanyUser"
  )(data);

export interface UpdateCompanyUserParams {
  userId: string;
  firstName?: string;
  lastName?: string;
  roleId?: string;
  companyId?: string | null;
  isActive?: boolean;
}

export interface UpdateCompanyUserResponse {
  userId: string;
  updated: string[];
}

export const updateCompanyUserCallable = (data: UpdateCompanyUserParams) =>
  httpsCallable<UpdateCompanyUserParams, UpdateCompanyUserResponse>(
    functions,
    "updateCompanyUser"
  )(data);

export interface CompanyUserRow {
  uid: string;
  email: string;
  firstName?: string;
  lastName?: string;
  companyRole: "company_admin" | "operador";
  isActive: boolean;
  createdAt?: string;
}

const KNOWN_COMPANY_ROLE_IDS: Record<string, string> = {
  operador: "tFqyZ8nRFVIyRTWRLh8H",
  company_admin: "r6FdSmH65iZJeiRagA4f",
};

/**
 * Resuelve el ID del documento en `roles` cuyo nombre coincida con el rol de empresa.
 * Si no encuentra el documento o las reglas impiden la lectura directa, retorna el ID conocido de fallback.
 */
export async function resolveCompanyRoleId(
  roleName: "company_admin" | "operador"
): Promise<string> {
  try {
    const rolesSnap = await getDocs(collection(db, "roles"));
    const foundDoc = rolesSnap.docs.find(
      (d) => d.data()?.name === roleName || d.id === roleName
    );
    if (foundDoc) {
      return foundDoc.id;
    }
  } catch (err) {
    // Lectura denegada por reglas cliente: usar mapeo canónico
  }
  return KNOWN_COMPANY_ROLE_IDS[roleName] || roleName;
}



