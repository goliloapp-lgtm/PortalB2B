import { Timestamp } from "firebase/firestore";

export type PaymentCondition =
  | "cash"
  | "transfer"
  | "card"
  | "immediate"
  | "credit15"
  | "credit30"
  | "credit_15"
  | "credit_30";

export type BillingPeriodId =
  | "daily"
  | "weekly"
  | "semi-monthly"
  | "monthly"
  | "biweekly";

export type CompanyStatus = "active" | "suspended" | "inactive";

export interface B2BCompany {
  id: string;
  tradeName: string;
  legalName: string;
  nit: string;
  nrc: string;
  contactName: string;
  contactPerson?: string;
  phone: string;
  contactPhone?: string;
  whatsapp: string;
  email: string;
  address: string;
  paymentCondition: PaymentCondition;
  billingPeriod?: BillingPeriodId | null;
  negotiatedFareRate?: number;
  validFrom?: Timestamp | any;
  creditLimit?: number | null;
  requiresInvoice: boolean;
  requiresCCF: boolean;
  balance: number;
  status: CompanyStatus;
  countryId: "SV" | "sv" | string;
  authUid?: string;
  mustChangePassword?: boolean;
  passwordUpdatedAt?: Timestamp | any;
  createdAt?: Timestamp | any;
  updatedAt?: Timestamp | any;
}

export interface CostCenter {
  id: string;
  code?: string;
  name: string;
  department: string;
  /** null o ausente = SIN LÍMITE (CF-23) */
  budgetLimit: number | null;
  monthlyBudget?: number | null;
  spent: number;
  reserved?: number;
  budgetWindowStart?: number | null;
  status: "active" | "inactive";
  createdAt?: Timestamp | any;
}

export interface LimitRequest {
  id?: string;
  companyId: string;
  costCenterId?: string | null;
  requestedLimit: number | null;
  previousLimit?: number | null;
  reason?: string;
  requestedByUid?: string;
  requestedByEmail?: string;
  status: "pending" | "approved" | "applied" | "rejected";
  createdAt?: Timestamp | any;
}

export interface B2BTraveller {
  id: string;
  companyId: string;
  name?: string;
  fullName: string;
  email?: string;
  phone: string;
  department?: string;
  costCenterId?: string;
  notes?: string;
  active?: boolean;
  status?: "active" | "inactive";
  createdAt?: Timestamp | any;
}

export interface TripLegInput {
  distance: number;
  durationMinutes: number;
}

export interface FrozenFareBreakdown {
  baseFare: number;
  distanceCharge: number;
  timeCharge: number;
  bookingFee: number;
  minimumApplied: boolean;
  subtotal: number;
  commissionAmount: number;
  driverEarning: number;
  totalFare: number;
  currency: string;
  distanceUnit: "mi" | "km";
  chargedDistance?: number;
  legCount?: number;
}

export type B2BRequestStatus =
  | "requested"
  | "seeking_driver" // Conductor B2B se retiró (markDriverUnavailable), techo intacto
  | "confirmed"
  | "assigned"
  | "enRoute"
  | "driverArrived"
  | "inService"
  | "arrived"
  | "completed"
  | "invoiced"
  | "cancelled"
  | "rejected";

export type VehicleCategory = "suv" | "pickup" | "microbus";
export type B2BVehicleType = VehicleCategory;

export interface RoutePoint {
  address: string;
  lat: number;
  lng: number;
  reference?: string;
}

export type GeoLocation = RoutePoint;

export interface B2BServiceRequest {
  id: string;
  folio: string;
  tripId?: string;
  countryId: string;
  companyId: string;
  companyName: string;
  costCenterId?: string;
  costCenterName?: string;
  requestedByUid: string;
  requestedByName: string;
  travellerId?: string;
  travellerName?: string;
  passengersCount: number;
  passengerNames?: string[];
  passengerPhone?: string;
  vehicleCategory: VehicleCategory;
  hasCargo: boolean;
  cargoDescription?: string;
  origin: RoutePoint;
  stops?: RoutePoint[];
  destination: RoutePoint;
  legs?: TripLegInput[];
  roundTrip: boolean;
  scheduledAt: string | Timestamp | any;
  isImmediate: boolean;
  estimatedDistanceKm: number;
  estimatedDurationMinutes?: number;
  tariffApplied: {
    category: VehicleCategory;
    ratePerKm: number;
    minFare: number;
    baseDistanceKm: number;
    calculatedAmount: number;
  };
  fareBreakdown?: FrozenFareBreakdown;
  finalAmount?: number;
  assignedDriverId?: string;
  assignedDriverName?: string;
  assignedDriverPhone?: string;
  assignedVehicleId?: string;
  assignedVehiclePlate?: string;
  status: B2BRequestStatus;
  notes?: string;
  createdAt?: Timestamp | any;
  updatedAt?: Timestamp | any;
  completedAt?: Timestamp | any;
}

export type B2BRequest = B2BServiceRequest;

