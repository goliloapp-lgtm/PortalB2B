/**
 * Shared Trip Status Contract - Frontend Portal B2B
 *
 * El vocabulario es el del backend, no el que este portal suponía.
 * `Backend/Firebase/docs/CONTRATO_FRONTEND.md` (CF-75) enumera los OCHO estados
 * que escribe una reserva —`available`, `offered`, `driver_rejected`,
 * `driver_assigned`, `dispatched`, `completed`, `cancelled`, `expired`— y la vía
 * de excepción de plataforma agrega `pending_approval` (CF-84,
 * `functions/src/b2b/scheduledTripStatus.ts:22`). No hay `confirmed`, `enRoute`,
 * `driverArrived`, `inService`, `arrived` ni `invoiced`: ninguna reserva los
 * escribe. La escalera de {@link LIFECYCLE_STEPS} se deriva de los que sí, y
 * `expired` no se colapsa en `cancelled`: una reserva vencida y una cancelada
 * cuentan cosas distintas.
 */

export type ScheduledTripStatus =
  | "pending_approval"
  | "available"
  | "offered"
  | "driver_rejected"
  | "driver_assigned"
  | "dispatched"
  | "completed"
  | "expired"
  | "cancelled";

export const TERMINAL_STATUSES: readonly ScheduledTripStatus[] = [
  "completed",
  "expired",
  "cancelled",
];

export interface LifecycleStep {
  status: ScheduledTripStatus;
  label: string;
}

/**
 * La escalera de una reserva, con los estados que el backend escribe: nace en
 * `available` (el pool), se ofrece o se asigna a un conductor, se despacha y
 * termina en `completed`.
 *
 * `pending_approval` y `driver_rejected` no son pasos —son la reserva esperando
 * una decisión o de vuelta en el pool— y `cancelled` / `expired` no son un paso
 * hacia adelante: la escalera no los marca como alcanzados.
 */
export const LIFECYCLE_STEPS: readonly LifecycleStep[] = [
  { status: "available", label: "Reserva creada (en el pool)" },
  { status: "offered", label: "Ofrecida a un conductor" },
  { status: "driver_assigned", label: "Conductor asignado" },
  { status: "dispatched", label: "Despachada (en viaje)" },
  { status: "completed", label: "Completada" },
];

/**
 * Traduce un estado CRUDO al estado que muestra la consola.
 *
 * Es la única normalización del portal: `page.tsx` la aplica a cada reserva
 * (`scheduledTrips`), a los documentos legados de `b2bRequests` y al viaje vivo
 * que reemplaza a la reserva cuando ya se despachó (`listCompanyTrips`). La
 * tabla completa, con la regla de cancelación que consume
 * {@link isCompanyCancellableStatus}:
 *
 * | Crudo | Quién lo escribe | Normalizado | ¿Se cancela? |
 * |---|---|---|---|
 * | `pending_approval` | `createScheduledTripForCompany` (CF-84) | `pending_approval` | sí |
 * | `available` | `createScheduledTrip` (CF-48), `releaseScheduledTrip`, `onVehicleUnavailable` | `available` | sí |
 * | `offered` | `offerScheduledTrip` (CF-59) | `offered` | sí |
 * | `driver_rejected` | `rejectScheduledTrip` (CF-58) | `driver_rejected` | sí |
 * | `driver_assigned` | `acceptScheduledTrip` (CF-57) | `driver_assigned` | sí |
 * | `dispatched` | `dispatchScheduledTrip` (CF-62) | `dispatched` | no: ya es un viaje |
 * | `completed` | cierre del viaje | `completed` | no |
 * | `expired` | `expireScheduledTrips` | `expired` | no |
 * | `cancelled` | `cancelScheduledTrip` (CF-54) | `cancelled` | no |
 * | `requested` · `accepted` · `seeking_driver` · `driver_arrived` · `arrived` · `in_progress` | `trips` (`functions/src/b2b/listCompanyTrips.ts:44-54`) | `dispatched` | no |
 * | ausente o desconocido | — | `available` | sí |
 *
 * La última fila de viajes no inventa un paso de reserva: si existe un viaje, la
 * reserva ya se despachó, y el detalle del viaje (en camino, en punto, a bordo)
 * se lee en el mapa y en la bitácora, no en el estado de la reserva.
 */
export function mapRawTripStatus(
  rawStatus: string | null | undefined
): ScheduledTripStatus {
  if (!rawStatus) return "available";

  switch (rawStatus.trim()) {
    case "pending_approval":
      return "pending_approval";

    case "available":
      return "available";

    case "offered":
      return "offered";

    case "driver_rejected":
      return "driver_rejected";

    case "driver_assigned":
      return "driver_assigned";

    case "dispatched":
      return "dispatched";

    case "completed":
      return "completed";

    case "expired":
      return "expired";

    case "cancelled":
      return "cancelled";

    // Estados del viaje (`trips`), no de la reserva. Llegan cuando la reserva
    // ya se despachó y el viaje reemplaza su estado en la consola.
    case "requested":
    case "accepted":
    case "seeking_driver":
    case "driver_arrived":
    case "arrived":
    case "in_progress":
      return "dispatched";

    // Sin estado no hay reserva creada: `createScheduledTrip` la escribe en
    // `available`. Un valor desconocido cae acá y el backend lo rechaza al
    // cancelar nombrando su propia lista.
    default:
      return "available";
  }
}

/**
 * El índice del paso alcanzado en {@link LIFECYCLE_STEPS}.
 *
 * Devuelve `-1` para `cancelled` y `expired`: son terminales que no son un paso
 * de la escalera, y marcarlos como «creada» o «despachada» afirmaría un avance
 * que no ocurrió. `pending_approval` y `driver_rejected` son el paso 0: la
 * reserva existe y todavía no tiene conductor comprometido.
 */
export function getLifecycleStepIndex(status: string | null | undefined): number {
  const norm = mapRawTripStatus(status);
  if (norm === "cancelled" || norm === "expired") return -1;
  if (norm === "pending_approval" || norm === "driver_rejected") return 0;
  const idx = LIFECYCLE_STEPS.findIndex((step) => step.status === norm);
  return idx >= 0 ? idx : 0;
}

export function isTerminalStatus(status: string | null | undefined): boolean {
  return TERMINAL_STATUSES.includes(mapRawTripStatus(status));
}

/**
 * ¿La reserva todavía no tiene un conductor comprometido?
 *
 * Son los estados anteriores al compromiso —esperando aprobación, en el pool,
 * ofrecida o devuelta al pool por el conductor rechazante—, los mismos que la
 * consola muestra sin conductor ni vehículo aunque el vehículo del pool tenga
 * uno.
 */
export function isAwaitingDriverStatus(
  status: string | null | undefined
): boolean {
  const norm = mapRawTripStatus(status);
  return (
    norm === "pending_approval" ||
    norm === "available" ||
    norm === "offered" ||
    norm === "driver_rejected"
  );
}

/**
 * Los estados NORMALIZADOS desde los que la empresa todavía puede cancelar.
 *
 * La fuente es el backend, no este archivo: `CANCELLABLE_SCHEDULED_TRIP_STATUSES`
 * (`functions/src/b2b/scheduledTripStatus.ts:103`) acepta CINCO estados crudos y
 * `cancelScheduledTrip` responde `failed-precondition` con la lista para cualquier
 * otro. Antes de F7 esta lista tenía tres valores porque el mapeo colapsaba
 * `available`, `offered` y `driver_rejected` en un solo cubo; ahora es la lista
 * del backend, valor por valor:
 *
 * | Crudo | Normalizado | ¿Se cancela? |
 * |---|---|---|
 * | `pending_approval` | `pending_approval` | sí |
 * | `available` | `available` | sí |
 * | `offered` | `offered` | sí |
 * | `driver_rejected` | `driver_rejected` | sí |
 * | `driver_assigned` | `driver_assigned` | sí |
 * | `dispatched` | `dispatched` | no: ya es un viaje |
 * | `completed` | `completed` | no |
 * | `expired` | `expired` | no |
 * | `cancelled` | `cancelled` | no |
 *
 * Todo lo que no está acá es post-despacho o terminal, y la empresa no lo
 * cancela: un viaje en curso se reporta y se reasigna (CF-87).
 */
export const COMPANY_CANCELLABLE_STATUSES: readonly ScheduledTripStatus[] = [
  "pending_approval",
  "available",
  "offered",
  "driver_rejected",
  "driver_assigned",
];

/**
 * ¿La empresa todavía puede cancelar esta reserva?
 *
 * Acepta el estado crudo del backend o el ya normalizado: `mapRawTripStatus` es
 * idempotente sobre todo valor de {@link ScheduledTripStatus}.
 */
export function isCompanyCancellableStatus(
  status: string | null | undefined
): boolean {
  return COMPANY_CANCELLABLE_STATUSES.includes(mapRawTripStatus(status));
}

export interface TripStatusFeedEntry {
  tripId: string;
  status: ScheduledTripStatus;
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
