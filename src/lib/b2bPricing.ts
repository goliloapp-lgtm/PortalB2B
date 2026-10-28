import { VehicleCategory } from "@/types/b2b";

/** Tarifas y parámetros fiscales para traslados corporativos B2B (countries/sv) */
export const DRIVER_SHARE_RATE = 0.70;
export const LILO_COMMISSION_RATE = 0.30;
export const SV_DEFAULT_MINIMUM_DISTANCE_KM = 1;
export const SV_DEFAULT_NEGOTIATED_RATE = 0.67;
export const SV_DEFAULT_COUNTRY_FLOOR_RATE = 0.45;
export const SV_DEFAULT_TAX_RATE = 0.13;
export const SV_DEFAULT_TAX_LABEL = "IVA";
export const MAX_VEHICLE_PASSENGER_CAPACITY = 12;
export const LILO_DIRECT_CONTACT = {
  phone: "+503 2200-5456",
  whatsapp: "+503 7000-5456",
  email: "corporativo@lilo.app",
};

export interface B2BTariffRule {
  category: VehicleCategory;
  label: string;
  shortLabel: string;
  ratePerKm: number;
  minFare: number;
  baseDistanceKm: number;
  maxPassengers: number;
  description: string;
}

export const EL_SALVADOR_B2B_TARIFFS: Record<VehicleCategory, B2BTariffRule> = {
  suv: {
    category: "suv",
    label: "SUV Corporativa (máx. 4 pasajeros)",
    shortLabel: "SUV",
    ratePerKm: SV_DEFAULT_NEGOTIATED_RATE,
    minFare: SV_DEFAULT_NEGOTIATED_RATE,
    baseDistanceKm: SV_DEFAULT_MINIMUM_DISTANCE_KM,
    maxPassengers: 4,
    description: "Tarifa negociada por km · Distancia mínima 1 km + IVA 13%",
  },
  pickup: {
    category: "pickup",
    label: "Pick-up Doble Cabina (máx. 4 pasajeros)",
    shortLabel: "Pick-up",
    ratePerKm: SV_DEFAULT_NEGOTIATED_RATE,
    minFare: SV_DEFAULT_NEGOTIATED_RATE,
    baseDistanceKm: SV_DEFAULT_MINIMUM_DISTANCE_KM,
    maxPassengers: 4,
    description: "Tarifa negociada por km · Distancia mínima 1 km + IVA 13%",
  },
  microbus: {
    category: "microbus",
    label: "Microbús Corporativo (máx. 12 pasajeros)",
    shortLabel: "Microbús",
    ratePerKm: SV_DEFAULT_NEGOTIATED_RATE,
    minFare: SV_DEFAULT_NEGOTIATED_RATE,
    baseDistanceKm: SV_DEFAULT_MINIMUM_DISTANCE_KM,
    maxPassengers: 12,
    description: "Tarifa negociada por km · Distancia mínima 1 km + IVA 13%",
  },
};

export interface SVLocationPreset {
  label: string;
  address: string;
  lat: number;
  lng: number;
  zone: string;
}

export const EL_SALVADOR_LOCATIONS: SVLocationPreset[] = [
  {
    label: "World Trade Center San Salvador (Col. Escalón)",
    address: "89 Av. Norte y Calle El Mirador, Colonia Escalón, San Salvador",
    lat: 13.7086,
    lng: -89.2408,
    zone: "San Salvador",
  },
  {
    label: "Zona Rosa / Blvd. del Hipódromo (San Benito)",
    address: "Bulevar del Hipódromo, Colonia San Benito, San Salvador",
    lat: 13.6914,
    lng: -89.2392,
    zone: "San Salvador",
  },
  {
    label: "Centro Financiero Gigante (Alameda Roosevelt)",
    address: "63 Av. Sur y Alameda Roosevelt, San Salvador",
    lat: 13.6987,
    lng: -89.2261,
    zone: "San Salvador",
  },
  {
    label: "Santa Elena / Embajada Americana (Antiguo Cuscatlán)",
    address: "Bulevar Santa Elena, Antiguo Cuscatlán, La Libertad",
    lat: 13.6695,
    lng: -89.2549,
    zone: "La Libertad",
  },
  {
    label: "Zona Franca Santa Tecla / Ciudad Merliot",
    address: "Carretera al Puerto de La Libertad Km 12, Santa Tecla",
    lat: 13.6731,
    lng: -89.2798,
    zone: "La Libertad",
  },
  {
    label: "Parque Industrial Plan de La Laguna (Antiguo Cuscatlán)",
    address: "Zona Industrial Plan de La Laguna, Antiguo Cuscatlán",
    lat: 13.6698,
    lng: -89.2425,
    zone: "La Libertad",
  },
  {
    label: "Planta Soyapango / Blvd. del Ejército",
    address: "Bulevar del Ejército Nacional Km 5.5, Soyapango, San Salvador",
    lat: 13.7012,
    lng: -89.1523,
    zone: "Soyapango",
  },
  {
    label: "Planta Industrial Apopa (Ingenio El Ángel)",
    address: "Km 14 Carretera Troncal del Norte, Apopa, San Salvador",
    lat: 13.8022,
    lng: -89.1783,
    zone: "Apopa",
  },
  {
    label: "Zona Franca American Park (Ciudad Arce)",
    address: "Km 36 Carretera a Santa Ana, Ciudad Arce, La Libertad",
    lat: 13.8251,
    lng: -89.4316,
    zone: "La Libertad",
  },
  {
    label: "Zona Franca Miramar (Olocuilta)",
    address: "Km 30.5 Autopista a Comalapa, Olocuilta, La Paz",
    lat: 13.5418,
    lng: -89.1172,
    zone: "La Paz",
  },
  {
    label: "Aeropuerto Internacional de El Salvador (SAL - Comalapa)",
    address: "San Luis Talpa, Departamento de La Paz, El Salvador",
    lat: 13.4409,
    lng: -89.0557,
    zone: "Comalapa",
  },
  {
    label: "Puerto de Acajutla (Sonsonate)",
    address: "Recinto Portuario CEPA, Acajutla, Sonsonate",
    lat: 13.5928,
    lng: -89.8336,
    zone: "Sonsonate",
  },
  {
    label: "Santa Ana Centro Corporativo",
    address: "Av. Independencia Sur, Santa Ana, El Salvador",
    lat: 13.9942,
    lng: -89.5597,
    zone: "Santa Ana",
  },
  {
    label: "San Miguel Centro Industrial",
    address: "Carretera Panamericana Km 136, San Miguel, El Salvador",
    lat: 13.4833,
    lng: -88.1833,
    zone: "San Miguel",
  },
];

export function calculateRoadDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightDistance = R * c;
  const roadDistance = straightDistance * 1.28;
  return Math.max(1.5, Number(roadDistance.toFixed(1)));
}

export function calculateMultiStopRouteDistanceKm(
  points: Array<{ lat: number; lng: number }>
): number {
  if (!points || points.length < 2) return 0;
  let totalKm = 0;
  for (let i = 0; i < points.length - 1; i++) {
    totalKm += calculateRoadDistanceKm(
      points[i].lat,
      points[i].lng,
      points[i + 1].lat,
      points[i + 1].lng
    );
  }
  return Number(totalKm.toFixed(1));
}

export interface B2BTariffBreakdown {
  category: VehicleCategory;
  rule: B2BTariffRule;
  oneWayDistanceKm: number;
  billableDistanceKm: number;
  chargedDistanceKm: number;
  minimumDistanceKm: number;
  roundTrip: boolean;
  ratePerKm: number;
  minFare: number;
  baseDistanceKm: number;
  extraDistanceKm: number;
  rawDistanceFare: number;
  baseAmount: number;
  taxRate: number;
  taxLabel: string;
  taxAmount: number;
  totalAmount: number;
  finalFare: number;
  driverEarning: number;
  liloCommission: number;
  driverShareRate: number;
  liloCommissionRate: number;
  appliedMinimum: boolean;
  estimatedDurationMinutes: number;
  breakdownSummary: string;
}

export interface B2BTariffOptions {
  negotiatedFareRate?: number;
  minimumDistanceKm?: number;
  taxRate?: number;
  taxLabel?: string;
  commissionRate?: number;
}

export function calculateB2BTariff(
  category: VehicleCategory,
  oneWayDistanceKm: number,
  roundTrip: boolean = false,
  options?: B2BTariffOptions
): B2BTariffBreakdown {
  const baseRule =
    EL_SALVADOR_B2B_TARIFFS[category] || EL_SALVADOR_B2B_TARIFFS.suv;
  const ratePerKm =
    typeof options?.negotiatedFareRate === "number" &&
    Number.isFinite(options.negotiatedFareRate) &&
    options.negotiatedFareRate > 0
      ? options.negotiatedFareRate
      : baseRule.ratePerKm;
  const minimumDistanceKm =
    typeof options?.minimumDistanceKm === "number" &&
    Number.isFinite(options.minimumDistanceKm) &&
    options.minimumDistanceKm > 0
      ? options.minimumDistanceKm
      : SV_DEFAULT_MINIMUM_DISTANCE_KM;
  const taxRate =
    typeof options?.taxRate === "number" &&
    Number.isFinite(options.taxRate) &&
    options.taxRate >= 0
      ? options.taxRate
      : SV_DEFAULT_TAX_RATE;
  const taxLabel = options?.taxLabel || SV_DEFAULT_TAX_LABEL;
  const commissionRate =
    typeof options?.commissionRate === "number" &&
    Number.isFinite(options.commissionRate)
      ? options.commissionRate
      : LILO_COMMISSION_RATE;

  const cleanOneWay = Math.max(0, Number(oneWayDistanceKm) || 0);
  const billableDistanceKm = Number(
    (roundTrip ? cleanOneWay * 2 : cleanOneWay).toFixed(1)
  );
  const chargedDistanceKm = Math.max(minimumDistanceKm, billableDistanceKm);
  const appliedMinimum = billableDistanceKm < minimumDistanceKm;

  const baseAmount = Number((chargedDistanceKm * ratePerKm).toFixed(2));
  const taxAmount = Number((baseAmount * taxRate).toFixed(2));
  const totalAmount = Number((baseAmount + taxAmount).toFixed(2));

  const liloCommission = Number((baseAmount * commissionRate).toFixed(2));
  const driverEarning = Number((baseAmount - liloCommission).toFixed(2));
  const minFare = Number((minimumDistanceKm * ratePerKm).toFixed(2));
  const extraDistanceKm = Math.max(
    0,
    Number((chargedDistanceKm - minimumDistanceKm).toFixed(1))
  );

  const estimatedDurationMinutes = Math.max(
    10,
    Math.round((chargedDistanceKm / 35) * 60 + 5)
  );

  const taxPct = Math.round(taxRate * 100);
  const breakdownSummary = `${chargedDistanceKm} km × $${ratePerKm.toFixed(
    2
  )}/km = $${baseAmount.toFixed(2)} + ${taxLabel} (${taxPct}%: $${taxAmount.toFixed(
    2
  )}) = $${totalAmount.toFixed(2)} USD`;

  const rule: B2BTariffRule = {
    ...baseRule,
    ratePerKm,
    minFare,
    baseDistanceKm: minimumDistanceKm,
  };

  return {
    category,
    rule,
    oneWayDistanceKm: cleanOneWay,
    billableDistanceKm,
    chargedDistanceKm,
    minimumDistanceKm,
    roundTrip,
    ratePerKm,
    minFare,
    baseDistanceKm: minimumDistanceKm,
    extraDistanceKm,
    rawDistanceFare: baseAmount,
    baseAmount,
    taxRate,
    taxLabel,
    taxAmount,
    totalAmount,
    finalFare: totalAmount,
    driverEarning,
    liloCommission,
    driverShareRate: Number((1 - commissionRate).toFixed(2)),
    liloCommissionRate: commissionRate,
    appliedMinimum,
    estimatedDurationMinutes,
    breakdownSummary,
  };
}

export function getAllowedCategoriesForPassengers(
  passengersCount: number
): VehicleCategory[] {
  if (passengersCount > 4) {
    return ["microbus"];
  }
  return ["suv", "pickup", "microbus"];
}
