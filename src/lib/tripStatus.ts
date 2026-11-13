/**
 * Shared Trip Status Contract - Frontend Portal B2B
 * Identical replicate of backend canonical trip status contract.
 */

export type B2BRequestStatus =
  | "requested"
  | "seeking_driver"
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

export const TERMINAL_STATUSES: readonly B2BRequestStatus[] = [
  "completed",
  "invoiced",
  "cancelled",
  "rejected",
];

export interface LifecycleStep {
  status: B2BRequestStatus;
  label: string;
}

export const LIFECYCLE_STEPS: readonly LifecycleStep[] = [
  { status: "requested", label: "Solicitada" },
  { status: "seeking_driver", label: "Buscando Conductor" },
  { status: "confirmed", label: "Confirmada" },
  { status: "assigned", label: "Conductor Asignado" },
  { status: "enRoute", label: "En Camino al Origen" },
  { status: "driverArrived", label: "Conductor en Punto" },
  { status: "inService", label: "En Curso (Viajando)" },
  { status: "arrived", label: "Llegada a Destino" },
  { status: "completed", label: "Completado" },
];

export function mapRawTripStatus(rawStatus: string | null | undefined): B2BRequestStatus {
  if (!rawStatus) return "requested";

  const s = rawStatus.trim();
  switch (s) {
    case "requested":
      return "requested";

    case "available":
    case "offered":
    case "seeking_driver":
    case "driver_rejected":
    case "pending_driver":
      return "seeking_driver";

    case "confirmed":
      return "confirmed";

    case "assigned":
    case "driver_assigned":
      return "assigned";

    case "accepted":
    case "dispatched":
    case "enRoute":
      return "enRoute";

    case "driver_arrived":
    case "driverArrived":
      return "driverArrived";

    case "in_progress":
    case "inService":
      return "inService";

    case "arrived":
      return "arrived";

    case "completed":
      return "completed";

    case "invoiced":
      return "invoiced";

    case "cancelled":
    case "cancelled_by_company":
    case "expired":
      return "cancelled";

    case "rejected":
      return "rejected";

    case "pending_approval":
      return "requested";

    default:
      return "requested";
  }
}

export function getLifecycleStepIndex(status: string): number {
  const norm = mapRawTripStatus(status);
  if (norm === "invoiced") return LIFECYCLE_STEPS.length;
  const idx = LIFECYCLE_STEPS.findIndex((step) => step.status === norm);
  return idx >= 0 ? idx : 0;
}

export function isTerminalStatus(status: string): boolean {
  const norm = mapRawTripStatus(status);
  return TERMINAL_STATUSES.includes(norm);
}

/**
 * Los estados NORMALIZADOS desde los que la empresa todavía puede cancelar.
 *
 * La fuente es el backend, no este archivo: `CANCELLABLE_SCHEDULED_TRIP_STATUSES`
 * (`functions/src/b2b/scheduledTripStatus.ts:103`) acepta CINCO estados crudos y
 * `cancelScheduledTrip` responde `failed-precondition` con la lista para cualquier
 * otro. Acá se guardan ya normalizados, porque los objetos de este portal
 * sobrescriben el estado crudo con `mapRawTripStatus` al construirse:
 *
 * ```
 *   pending_approval                       -> requested        (cancelable)
 *   available | offered | driver_rejected  -> seeking_driver   (cancelable)
 *   driver_assigned                        -> assigned         (cancelable)
 *   dispatched                             -> enRoute          (NO: ya es un viaje)
 * ```
 *
 * `requested` no es un estado de reserva del backend. Se conserva porque es el
 * cubo que hoy recibe `pending_approval` —que SÍ se cancela, y cancelarlo libera
 * su techo— y porque es el destino por defecto de un estado ausente o desconocido
 * (`mapRawTripStatus`); un estado desconocido lo rechaza el backend nombrando la
 * lista.
 *
 * Todo lo que no está acá es post-despacho o terminal —`dispatched`, `completed`,
 * `expired`, `cancelled`— y la empresa no lo cancela: un viaje en curso se reporta
 * y se reasigna (CF-87).
 */
export const COMPANY_CANCELLABLE_STATUSES: readonly B2BRequestStatus[] = [
  "requested",
  "seeking_driver",
  "assigned",
];

/**
 * ¿La empresa todavía puede cancelar esta reserva?
 *
 * Acepta el estado crudo del backend o el ya normalizado: `mapRawTripStatus` es
 * idempotente sobre todo valor de {@link B2BRequestStatus}.
 */
export function isCompanyCancellableStatus(
  status: string | null | undefined
): boolean {
  return COMPANY_CANCELLABLE_STATUSES.includes(mapRawTripStatus(status));
}

export interface TripStatusFeedEntry {
  tripId: string;
  status: B2BRequestStatus;
  rawStatus: string;
  source: "rideRequests" | "trips" | "scheduledTrips";
  companyId: string;
  driverId: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  vehicleId: string | null;
  vehiclePlate?: string | null;
  passengerName?: string | null;
  passengerPhone?: string | null;
  countryId: string;
  isTerminal: boolean;
  updatedAt: number;
}
