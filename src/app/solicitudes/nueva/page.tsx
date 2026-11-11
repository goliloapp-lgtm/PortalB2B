"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import {
  createTripCallable,
  createScheduledTripCallable,
  createTravellerCallable,
  listCostCentresCallable,
  listTravellersCallable,
  listCompanyRatesCallable,
  listVehicleTypesCallable,
  CompanyRateRow,
  VehicleTypeSummary,
  getFareQuoteCallable,
  GetFareQuoteResponse,
  db,
} from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
  B2BTraveller,
  CostCenter,
  FrozenFareBreakdown,
  RoutePoint,
  TripLegInput,
  VehicleCategory,
} from "@/types/b2b";
import {
  EL_SALVADOR_LOCATIONS,
  MAX_VEHICLE_PASSENGER_CAPACITY,
  LILO_DIRECT_CONTACT,
  SV_DEFAULT_MINIMUM_DISTANCE_KM,
  SV_DEFAULT_NEGOTIATED_RATE,
  SV_DEFAULT_TAX_RATE,
  SV_DEFAULT_TAX_LABEL,
  LILO_COMMISSION_RATE,
  calculateB2BTariff,
  calculateRoadDistanceKm,
  calculateMultiStopRouteDistanceKm,
  getAllowedCategoriesForPassengers,
  B2B_RESERVATION_CONFIG,
  CAPACITY_EXCEEDED_MESSAGE_ES,
} from "@/lib/b2bPricing";
import GoogleAddressAutocomplete from "@/components/maps/GoogleAddressAutocomplete";
import GoogleRouteMap from "@/components/maps/GoogleRouteMap";
import { useLanguage } from "@/context/LanguageContext";
import { formatFriendlyError } from "@/lib/friendlyError";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Calculator,
  CheckCircle2,
  AlertTriangle,
  Globe,
  PhoneCall,
  Clock,
  MapPin,
  Building,
  ChevronDown,
} from "lucide-react";

export const getMinReservationDateTime = (hours = B2B_RESERVATION_CONFIG.minAdvanceHours) => {
  // Se agregan 15 minutos de margen para evitar que el reloj alcance la hora mínima mientras se llena el formulario
  const target = new Date(Date.now() + hours * 60 * 60 * 1000 + 15 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(target.getHours())}:${pad(target.getMinutes())}`;
};

export default function NuevaSolicitudPortalB2BPage() {
  const router = useRouter();
  const { user, company, companyRole, mustChangePassword, loading } = useAuth();
  const { isEn, toggleLang } = useLanguage();
  const isCompanyAdmin = companyRole === "company_admin";

  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [costCenterId, setCostCenterId] = useState("");
  const [travellers, setTravellers] = useState<B2BTraveller[]>([]);
  const [travellerId, setTravellerId] = useState("");
  const [passengersCount, setPassengersCount] = useState<number>(2);
  const [passengerNamesInput, setPassengerNamesInput] = useState("");
  const [passengerPhone, setPassengerPhone] = useState("+503 ");
  const [vehicleCategory, setVehicleCategory] =
    useState<VehicleCategory>("suv");

  const [hasCargo, setHasCargo] = useState(false);
  const [cargoDescription, setCargoDescription] = useState("");
  const [roundTrip, setRoundTrip] = useState(false);
  const [advanceHours, setAdvanceHours] = useState<number>(B2B_RESERVATION_CONFIG.minAdvanceHours);
  const [isImmediate, setIsImmediate] = useState(B2B_RESERVATION_CONFIG.allowImmediate);
  const [scheduledDateTime, setScheduledDateTime] = useState(() =>
    getMinReservationDateTime(B2B_RESERVATION_CONFIG.minAdvanceHours)
  );

  const [originIndex, setOriginIndex] = useState<number>(0);
  const [originCoord, setOriginCoord] = useState<{
    lat: number;
    lng: number;
    address: string;
    isVerified?: boolean;
  }>({
    lat: EL_SALVADOR_LOCATIONS[0].lat,
    lng: EL_SALVADOR_LOCATIONS[0].lng,
    address: EL_SALVADOR_LOCATIONS[0].address,
    isVerified: true,
  });

  const [destinationIndex, setDestinationIndex] = useState<number>(10);
  const [destinationCoord, setDestinationCoord] = useState<{
    lat: number;
    lng: number;
    address: string;
    isVerified?: boolean;
  }>({
    lat: EL_SALVADOR_LOCATIONS[10].lat,
    lng: EL_SALVADOR_LOCATIONS[10].lng,
    address: EL_SALVADOR_LOCATIONS[10].address,
    isVerified: true,
  });

  const [stops, setStops] = useState<
    Array<{
      presetIndex: number;
      address: string;
      lat: number;
      lng: number;
      isVerified?: boolean;
    }>
  >([]);
  const [googleDistanceKm, setGoogleDistanceKm] = useState<number | null>(null);
  const [googleDurationMinutes, setGoogleDurationMinutes] = useState<number | null>(null);
  const [openOriginHubs, setOpenOriginHubs] = useState(false);
  const [openDestHubs, setOpenDestHubs] = useState(false);
  const [openStopHubsIdx, setOpenStopHubsIdx] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parámetros de countries/sv leídos de Firestore
  const [countryPricingConfig, setCountryPricingConfig] = useState<{
    minimumDistance: number;
    taxRate: number;
    taxLabel: string;
    commissionRate: number;
  }>({
    minimumDistance: SV_DEFAULT_MINIMUM_DISTANCE_KM,
    taxRate: SV_DEFAULT_TAX_RATE,
    taxLabel: SV_DEFAULT_TAX_LABEL,
    commissionRate: LILO_COMMISSION_RATE,
  });

  // Cotización devuelta por el backend (getFareQuote)
  const [serverQuote, setServerQuote] = useState<
    GetFareQuoteResponse["quote"] | null
  >(null);
  const [companyRates, setCompanyRates] = useState<CompanyRateRow[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleTypeSummary[]>([]);

  useEffect(() => {
    if (!loading && !user) {
      const timer = setTimeout(() => {
        if (typeof window !== "undefined") {
          router.replace("/login");
        }
      }, 100);
      return () => clearTimeout(timer);
    } else if (!loading && mustChangePassword) {
      const timer = setTimeout(() => {
        if (typeof window !== "undefined") {
          router.replace("/");
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [user, loading, mustChangePassword, router]);

  // Sincronizar restricciones de la empresa (allowsImmediateTrips, minimumBookingLeadMinutes)
  useEffect(() => {
    if (!company) return;
    const minLeadMins =
      typeof company.minimumBookingLeadMinutes === "number" &&
      company.minimumBookingLeadMinutes >= 0
        ? company.minimumBookingLeadMinutes
        : B2B_RESERVATION_CONFIG.minAdvanceHours * 60;
    const minHours = Math.max(1, Math.ceil(minLeadMins / 60));
    setAdvanceHours(minHours);
    setScheduledDateTime(getMinReservationDateTime(minHours));
    if (company.allowsImmediateTrips !== true) {
      setIsImmediate(false);
    }
  }, [company?.id, company?.minimumBookingLeadMinutes, company?.allowsImmediateTrips]);

  // Cargar catálogo de tipos de vehículo B2B (listVehicleTypes) y tarifas de empresa (CF-45)
  useEffect(() => {
    if (!user) return;
    listVehicleTypesCallable({ b2bSuitable: true })
      .then((res) => {
        if (Array.isArray(res.data?.types)) {
          setVehicleTypes(res.data.types);
        }
      })
      .catch(() => {});

    if (isCompanyAdmin) {
      listCompanyRatesCallable()
        .then((res) => {
          if (Array.isArray(res.data?.rates)) {
            setCompanyRates(res.data.rates);
          }
        })
        .catch(() => {});
    }
  }, [user, isCompanyAdmin]);

  useEffect(() => {
    getDoc(doc(db, "countries", "sv"))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setCountryPricingConfig({
            minimumDistance:
              typeof data.minimumDistance === "number" && data.minimumDistance > 0
                ? data.minimumDistance
                : SV_DEFAULT_MINIMUM_DISTANCE_KM,
            taxRate:
              typeof data.taxRate === "number" && data.taxRate >= 0
                ? data.taxRate
                : SV_DEFAULT_TAX_RATE,
            taxLabel:
              typeof data.taxLabel === "string" && data.taxLabel.trim()
                ? data.taxLabel.trim()
                : SV_DEFAULT_TAX_LABEL,
            commissionRate:
              typeof data.commissionRate === "number" && data.commissionRate >= 0
                ? data.commissionRate
                : LILO_COMMISSION_RATE,
          });
        }
      })
      .catch((err) =>
        console.warn("[NuevaSolicitud] Fallback countries/sv config:", err)
      );
  }, []);

  useEffect(() => {
    if (!company?.id) return;
    const targetCountryId = String(company.countryId || "sv").toLowerCase();

    // CF-46 / CF-47: cargar por callables cuando es company_admin
    if (isCompanyAdmin) {
      listCostCentresCallable()
        .then((res) => {
          if (Array.isArray(res.data?.costCentres) && res.data.costCentres.length > 0) {
            const mapped: CostCenter[] = res.data.costCentres
              .filter((c) => c.active !== false)
              .map((c) => ({
                id: c.costCentreId,
                name: c.name,
                department: c.name,
                budgetLimit: c.budgetLimit ?? null,
                spent: c.spent ?? 0,
                reserved: c.reserved ?? 0,
                status: c.active ? "active" : "inactive",
              }));
            setCostCenters(mapped);
            if (mapped.length > 0) {
              setCostCenterId((prev) =>
                prev && mapped.some((c) => c.id === prev) ? prev : mapped[0].id
              );
            }
          }
        })
        .catch(() => {});

      listTravellersCallable()
        .then((res) => {
          if (Array.isArray(res.data?.travellers) && res.data.travellers.length > 0) {
            const mapped: B2BTraveller[] = res.data.travellers
              .filter((t) => t.active !== false)
              .map((t) => ({
                id: t.travellerId,
                companyId: company.id,
                name: t.name,
                fullName: t.name,
                phone: t.phone || "+503 0000-0000",
                email: t.email,
                active: t.active,
                status: t.active ? "active" : "inactive",
              }));
            setTravellers(mapped);
            if (mapped.length > 0) {
              setTravellerId((prev) => prev || mapped[0].id);
            }
          }
        })
        .catch(() => {});
    }

    const unsubCC = onSnapshot(
      collection(
        db,
        "countries",
        targetCountryId,
        "b2bCompanies",
        company.id,
        "costCenters"
      ),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as CostCenter))
          .filter((c: any) => c.active !== false && c.status !== "inactive");
        setCostCenters(list);
        if (list.length > 0) {
          setCostCenterId((prev) =>
            prev && list.some((c) => c.id === prev) ? prev : list[0].id
          );
        } else {
          setCostCenterId("");
        }
      },
      (err) => console.error("Error cargando centros de costo:", err)
    );

    const unsubTrav = onSnapshot(
      collection(
        db,
        "countries",
        targetCountryId,
        "b2bCompanies",
        company.id,
        "travellers"
      ),
      (snap) => {
        const list = snap.docs
          .map((d) => {
            const raw = d.data();
            return {
              id: d.id,
              ...raw,
              fullName: raw.fullName || raw.name || "Viajero Corporativo",
              phone: raw.phone || "+503 0000-0000",
            } as B2BTraveller;
          })
          .filter((t) => t.active !== false && t.status !== "inactive");
        setTravellers(list);
        if (list.length > 0) {
          setTravellerId((prev) => prev || list[0].id);
        }
      },
      (err) => console.error("Error cargando viajeros hospedados:", err)
    );

    return () => {
      unsubCC();
      unsubTrav();
    };
  }, [company?.id, company?.countryId, isCompanyAdmin]);

  const allowedCategories = useMemo(
    () => getAllowedCategoriesForPassengers(passengersCount),
    [passengersCount]
  );

  useEffect(() => {
    if (!allowedCategories.includes(vehicleCategory)) {
      setVehicleCategory("microbus");
    }
  }, [allowedCategories, vehicleCategory]);

  const oneWayDistanceKm = useMemo(() => {
    if (!originCoord.lat || !destinationCoord.lat) return 0;
    if (googleDistanceKm && googleDistanceKm > 0) {
      return roundTrip ? Number((googleDistanceKm / 2).toFixed(1)) : googleDistanceKm;
    }
    const pts = [
      { lat: originCoord.lat, lng: originCoord.lng },
      ...stops.filter((s) => s.lat && s.lng).map((s) => ({ lat: s.lat, lng: s.lng })),
      { lat: destinationCoord.lat, lng: destinationCoord.lng },
    ];
    return calculateMultiStopRouteDistanceKm(pts);
  }, [googleDistanceKm, roundTrip, originCoord, destinationCoord, stops]);

  const negotiatedRate = useMemo(() => {
    const suvRate = companyRates.find((r) => r.categoryId === "suv")?.fareRate;
    if (typeof suvRate === "number" && suvRate > 0) return suvRate;
    const raw = Number(company?.negotiatedFareRate);
    return Number.isFinite(raw) && raw > 0 ? raw : SV_DEFAULT_NEGOTIATED_RATE;
  }, [company?.negotiatedFareRate, companyRates]);

  const tariff = useMemo(
    () =>
      calculateB2BTariff(vehicleCategory, oneWayDistanceKm, roundTrip, {
        negotiatedFareRate: negotiatedRate,
        minimumDistanceKm: countryPricingConfig.minimumDistance,
        taxRate: countryPricingConfig.taxRate,
        taxLabel: countryPricingConfig.taxLabel,
        commissionRate: countryPricingConfig.commissionRate,
      }),
    [
      vehicleCategory,
      oneWayDistanceKm,
      roundTrip,
      negotiatedRate,
      countryPricingConfig,
    ]
  );

  // Construir tramos (legs) reales a partir de los puntos de la ruta
  const routeLegs = useMemo<TripLegInput[]>(() => {
    if (!originCoord.lat || !destinationCoord.lat) return [];
    const waypoints = [
      { lat: originCoord.lat, lng: originCoord.lng },
      ...stops.filter((s) => s.lat && s.lng).map((s) => ({ lat: s.lat, lng: s.lng })),
      { lat: destinationCoord.lat, lng: destinationCoord.lng },
    ];
    if (roundTrip) {
      waypoints.push({ lat: originCoord.lat, lng: originCoord.lng });
    }
    const builtLegs: TripLegInput[] = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const dist = calculateRoadDistanceKm(
        waypoints[i].lat,
        waypoints[i].lng,
        waypoints[i + 1].lat,
        waypoints[i + 1].lng
      );
      const dur = Math.max(5, Math.round((dist / 35) * 60 + 2));
      builtLegs.push({ distance: dist, durationMinutes: dur });
    }
    return builtLegs.length > 0
      ? builtLegs
      : [
          {
            distance: tariff.chargedDistanceKm,
            durationMinutes: tariff.estimatedDurationMinutes,
          },
        ];
  }, [originCoord, destinationCoord, stops, roundTrip, tariff.chargedDistanceKm, tariff.estimatedDurationMinutes]);

  const backendCategoryId = useMemo(() => {
    if (vehicleCategory === "pickup") {
      const hasPickupSimple = vehicleTypes.some((t) => t.id === "pickup");
      return hasPickupSimple ? "pickup" : "pickup-doble-cabina";
    }
    if (vehicleCategory === "microbus") {
      const hasVan = vehicleTypes.some((t) => t.id === "van");
      const hasMicrobus = vehicleTypes.some((t) => t.id === "microbus");
      return hasMicrobus ? "microbus" : hasVan ? "van" : "microbus";
    }
    return "suv";
  }, [vehicleCategory, vehicleTypes]);

  // Consultar cotización oficial en el backend (getFareQuote — CF-38)
  useEffect(() => {
    if (!user || routeLegs.length === 0) {
      setServerQuote(null);
      return;
    }
    let active = true;
    getFareQuoteCallable({ legs: routeLegs, categoryId: backendCategoryId })
      .then((res) => {
        if (active && res.data?.quote) {
          setServerQuote(res.data.quote);
        }
      })
      .catch(() => {
        // Fallback sin categoryId en caso de que la categoría específica no tenga fila en fareRates
        getFareQuoteCallable({ legs: routeLegs })
          .then((res) => {
            if (active && res.data?.quote) {
              setServerQuote(res.data.quote);
            }
          })
          .catch(() => {
            if (active) {
              setServerQuote(null);
            }
          });
      });
    return () => {
      active = false;
    };
  }, [user, routeLegs, backendCategoryId]);

  const effectiveChargedDistance =
    serverQuote?.billableDistance ??
    serverQuote?.chargedDistance ??
    tariff.chargedDistanceKm;
  const effectiveMinDistance = countryPricingConfig.minimumDistance;
  const effectiveRate = serverQuote?.appliedFareRate ?? tariff.ratePerKm;
  const effectiveBaseAmount = serverQuote?.baseAmount ?? tariff.baseAmount;
  const effectiveTaxRate = serverQuote?.taxRate ?? tariff.taxRate;
  const effectiveTaxLabel = serverQuote?.taxLabel ?? tariff.taxLabel;
  const effectiveTaxAmount = serverQuote?.taxAmount ?? tariff.taxAmount;
  const effectiveTotalAmount = serverQuote?.totalAmount ?? tariff.totalAmount;
  const effectiveRateSourceLabel =
    serverQuote?.rateSource === "negotiated"
      ? "Tarifa negociada"
      : serverQuote
        ? "Precio de país"
        : "Tarifa B2B";

  const handleAddStop = () => {
    setStops((prev) => [
      ...prev,
      {
        presetIndex: 3,
        address: EL_SALVADOR_LOCATIONS[3].address,
        lat: EL_SALVADOR_LOCATIONS[3].lat,
        lng: EL_SALVADOR_LOCATIONS[3].lng,
        isVerified: true,
      },
    ]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passengersCount > MAX_VEHICLE_PASSENGER_CAPACITY) {
      const msg =
        "Para viajes de más de 12 pasajeros, por favor contáctanos por WhatsApp o teléfono y con gusto te atenderemos de inmediato.";
      setError(msg);
      toast.error(msg);
      return;
    }

    let effectiveScheduledIso = new Date(scheduledDateTime).toISOString();
    if (!isImmediate) {
      const scheduledMs = new Date(scheduledDateTime).getTime();
      const strictMinMs = Date.now() + advanceHours * 60 * 60 * 1000 + 2 * 60 * 1000;
      const graceWindowMs = Date.now() + (advanceHours * 60 - 20) * 60 * 1000;

      if (isNaN(scheduledMs) || scheduledMs < graceWindowMs) {
        const msg = `La hora de salida elegida es muy próxima. Por política de tu empresa, las reservas deben programarse con al menos ${advanceHours} horas de anticipación.`;
        const nextValid = getMinReservationDateTime(advanceHours);
        setScheduledDateTime(nextValid);
        setError(msg);
        toast.error(msg);
        return;
      }

      // Si el usuario dejó la hora por defecto y transcurrieron algunos minutos llenando el formulario, ajustamos automáticamente
      if (scheduledMs < strictMinMs) {
        const adjusted = new Date(Date.now() + (advanceHours * 60 + 5) * 60 * 1000);
        effectiveScheduledIso = adjusted.toISOString();
      }
    }

    if (
      !originCoord.address.trim() ||
      originCoord.isVerified === false ||
      !originCoord.lat ||
      !originCoord.lng
    ) {
      const msg =
        "Por favor selecciona una dirección real de la lista desplegable de Google Maps para el Punto de Origen.";
      setError(msg);
      toast.error(msg);
      return;
    }

    if (
      !destinationCoord.address.trim() ||
      destinationCoord.isVerified === false ||
      !destinationCoord.lat ||
      !destinationCoord.lng
    ) {
      const msg =
        "Por favor selecciona una dirección real de la lista desplegable de Google Maps para el Punto de Destino.";
      setError(msg);
      toast.error(msg);
      return;
    }

    const unverifiedStop = stops.find(
      (s) => !s.address.trim() || s.isVerified === false || !s.lat || !s.lng
    );
    if (unverifiedStop) {
      const msg =
        "Por favor selecciona una dirección real de la lista desplegable de Google Maps para todas las paradas intermedias.";
      setError(msg);
      toast.error(msg);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const originPoint: RoutePoint = {
        address: originCoord.address.trim(),
        lat: originCoord.lat,
        lng: originCoord.lng,
      };
      const destPoint: RoutePoint = {
        address: destinationCoord.address.trim(),
        lat: destinationCoord.lat,
        lng: destinationCoord.lng,
      };
      const stopPoints: RoutePoint[] = stops.map((s) => ({
        address: s.address.trim(),
        lat: s.lat,
        lng: s.lng,
      }));

      if (costCenters.length > 1 && !costCenterId) {
        throw new Error(
          "Por favor selecciona el departamento o centro de costo al que corresponde este traslado."
        );
      }
      const selectedCC =
        costCenters.find((c) => c.id === costCenterId) || costCenters[0];
      let resolvedTraveller =
        travellers.find((t) => t.id === travellerId) || travellers[0];

      // CF-47: Si no hay viajero registrado, crearlo vía createTravellerCallable (la escritura directa a travellers está cerrada)
      if (!resolvedTraveller && company?.id) {
        const manualName =
          passengerNamesInput
            .split(",")
            .map((n) => n.trim())
            .filter(Boolean)[0] ||
          company.contactName ||
          "Viajero Corporativo";
        const manualPhone =
          passengerPhone.trim() || company.phone || "+503 7000-0000";
        try {
          const createdTrav = await createTravellerCallable({
            name: manualName,
            phone: manualPhone,
          });
          resolvedTraveller = {
            id: createdTrav.data.travellerId,
            companyId: company.id,
            fullName: manualName,
            phone: manualPhone,
            active: true,
          };
        } catch (travErr) {
          console.warn("[PortalB2B] createTravellerCallable warning:", travErr);
        }
      }

      if (!resolvedTraveller?.id) {
        throw new Error(
          "Por favor selecciona un pasajero corporativo o solicita al administrador de tu empresa registrarlo en el directorio."
        );
      }

      const folio = `B2B-SV-${new Date().getFullYear()}-${Math.floor(
        1000 + Math.random() * 9000
      )}`;

      const legs = routeLegs;
      const totalRideTimeMinutes = Math.max(
        1,
        googleDurationMinutes && googleDurationMinutes > 0
          ? Math.round(googleDurationMinutes)
          : legs.reduce((acc, l) => acc + Math.round(l.durationMinutes), 0)
      );

      let createdTripId: string | undefined;
      let createdScheduledTripId: string | undefined;
      let serverFareBreakdown: any;

      try {
        if (!isImmediate) {
          // CF-48: Reserva programada B2B via createScheduledTripCallable
          // NO se envían categoryId, companyId ni countryId (el servidor los deriva)
          const scheduledRes = await createScheduledTripCallable({
            travellerId: resolvedTraveller.id,
            passengerCount: passengersCount,
            scheduledPickupAt: effectiveScheduledIso,
            originAddress: originPoint.address,
            originLatitude: originPoint.lat,
            originLongitude: originPoint.lng,
            destinationAddress: destPoint.address,
            destinationLatitude: destPoint.lat,
            destinationLongitude: destPoint.lng,
            legs,
            rideTimeMinutes: totalRideTimeMinutes,
            etaMinutes: 15,
            paymentMethod: String(company?.paymentCondition || "credit"),
            costCentreId: selectedCC?.id,
          });
          createdScheduledTripId = scheduledRes.data?.scheduledTripId;
          createdTripId = createdScheduledTripId;
          serverFareBreakdown = scheduledRes.data?.quote;
        } else {
          // Viaje inmediato B2B (solo cuando company.allowsImmediateTrips === true)
          const res = await createTripCallable<
            any,
            { tripId: string; fareBreakdown?: any }
          >({
            originAddress: originPoint.address,
            originLatitude: originPoint.lat,
            originLongitude: originPoint.lng,
            destinationAddress: destPoint.address,
            destinationLatitude: destPoint.lat,
            destinationLongitude: destPoint.lng,
            rideTimeMinutes: totalRideTimeMinutes,
            travellerId: resolvedTraveller.id,
            categoryId: backendCategoryId,
            costCentreId: selectedCC?.id,
            legs,
          });
          createdTripId = res.data?.tripId;
          serverFareBreakdown = res.data?.fareBreakdown;
        }
      } catch (callableErr: any) {
        throw new Error(
          formatFriendlyError(
            callableErr,
            "No pudimos registrar tu reserva en este momento. Por favor revisa los datos e intenta de nuevo."
          )
        );
      }

      const baseFareAmount =
        typeof serverFareBreakdown?.baseAmount === "number"
          ? serverFareBreakdown.baseAmount
          : typeof serverFareBreakdown?.farePrice === "number"
            ? serverFareBreakdown.farePrice
            : effectiveBaseAmount;
      const taxAmount =
        typeof serverFareBreakdown?.taxAmount === "number"
          ? serverFareBreakdown.taxAmount
          : Number((baseFareAmount * effectiveTaxRate).toFixed(2));
      const totalWithTax =
        typeof serverFareBreakdown?.totalAmount === "number"
          ? serverFareBreakdown.totalAmount
          : Number((baseFareAmount + taxAmount).toFixed(2));

      const fallbackBreakdown = {
        countryId: String(company?.countryId || "sv").toLowerCase(),
        currency: "USD",
        currencyCode: "USD",
        distanceUnit: "km",
        chargedDistance: effectiveChargedDistance,
        appliedFareRate: effectiveRate,
        farePrice: baseFareAmount,
        baseAmount: baseFareAmount,
        taxRate: effectiveTaxRate,
        taxLabel: effectiveTaxLabel,
        taxAmount,
        totalAmount: totalWithTax,
        driverEarning: Number((baseFareAmount * 0.7).toFixed(2)),
        commissionRate: 0.3,
        commissionAmount: Number((baseFareAmount * 0.3).toFixed(2)),
        minimumApplied: effectiveChargedDistance <= effectiveMinDistance,
      };

      // CF-48 / CF-75: La reserva ha sido creada atómicamente por el backend (createScheduledTrip o createTrip)
      // D-01 / D-23: NINGUNA escritura directa de cliente a b2bRequests (reglas allow write: if false)

      toast.success(
        isImmediate
          ? "¡Tu solicitud de traslado inmediato fue recibida! En breve te asignaremos un conductor."
          : "¡Tu reserva de traslado ha sido confirmada con éxito! Podrás seguir su estado en tiempo real."
      );

      router.push("/");
    } catch (err: any) {
      const friendlyMsg = formatFriendlyError(
        err,
        "No pudimos registrar tu solicitud de traslado. Por favor intenta nuevamente."
      );
      setError(friendlyMsg);
      toast.error(friendlyMsg);
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="min-h-screen bg-[#F2F6FA] text-[#2A3547] py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="px-3 py-2 bg-white border border-[#DFE5EF] rounded-[7px] text-xs font-semibold flex items-center space-x-1.5 hover:bg-slate-50 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{isEn ? "Back to Dashboard" : "Volver al Dashboard"}</span>
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-[#2A3547]">
                {isEn
                  ? "Request Corporate Transfer (El Salvador)"
                  : "Solicitar Traslado Corporativo (El Salvador)"}
              </h1>
              <p className="text-xs text-[#7C8FAC]">
                {company?.tradeName || "Portal Corporativo B2B"} ·{" "}
                {isEn
                  ? "Corporate Transfer Service"
                  : "Servicio de Transporte Corporativo"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleLang}
            className="px-3 py-2 bg-white border border-[#DFE5EF] rounded-[7px] text-xs font-bold text-[#5D87FF] flex items-center space-x-1.5 hover:bg-slate-50 cursor-pointer"
          >
            <Globe className="w-4 h-4" />
            <span>{isEn ? "EN 🇺🇸 / ES" : "ES 🇸🇻 / EN"}</span>
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              (e.target as HTMLElement)?.tagName === "INPUT"
            ) {
              e.preventDefault();
            }
          }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          {/* Formulario Principal */}
          <div className="lg:col-span-2 space-y-5">
            {/* Ruta */}
            <div className="modern-card p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-[#E5EAEF] pb-3">
                <h2 className="text-sm font-bold text-[#2A3547]">
                  1. Origen, Paradas Intermedias y Destino
                </h2>
                <button
                  type="button"
                  onClick={handleAddStop}
                  className="text-xs font-semibold text-[#5D87FF] flex items-center space-x-1 hover:underline cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar Parada</span>
                </button>
              </div>

              {/* Origen con Google Places y Dropdown de Hubs */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#2A3547]">
                    Punto de Origen <span className="text-[#FA896B]">*</span>
                  </span>
                </div>

                <GoogleAddressAutocomplete
                  placeholder="Buscar dirección o punto de interés (ej. WTC, Sheraton, Hilton, Calle El Mirador...)"
                  value={originCoord.address}
                  isVerified={originCoord.isVerified}
                  required
                  onChange={(sel) => {
                    setOriginCoord({
                      address: sel.address,
                      lat: sel.lat,
                      lng: sel.lng,
                      isVerified: Boolean(sel.isVerified),
                    });
                  }}
                />
              </div>

              {/* Paradas Intermedias */}
              {stops.map((st, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-[#F8FAFC] border border-[#E5EAEF] rounded-[7px] space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#5D87FF] uppercase">
                      Parada Intermedia #{idx + 1}
                    </span>
                    <div className="flex items-center space-x-2">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            setOpenStopHubsIdx(openStopHubsIdx === idx ? null : idx);
                            setOpenOriginHubs(false);
                            setOpenDestHubs(false);
                          }}
                          className="text-[11px] font-semibold text-[#5D87FF] bg-white border border-[#DFE5EF] hover:border-[#5D87FF] px-2 py-0.5 rounded-[5px] flex items-center space-x-1 transition cursor-pointer"
                        >
                          <Building className="w-3 h-3" />
                          <span>Hubs SV</span>
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        {openStopHubsIdx === idx && (
                          <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-[8px] shadow-xl border border-[#DFE5EF] z-30 py-1.5 max-h-64 overflow-y-auto">
                            <div className="px-3 py-1 text-[10px] font-bold text-[#7C8FAC] uppercase tracking-wide border-b border-[#E5EAEF] mb-1">
                              Seleccionar Parada Corporativa
                            </div>
                            {EL_SALVADOR_LOCATIONS.map((loc, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => {
                                  setStops((prev) =>
                                    prev.map((item, itIdx) =>
                                      itIdx === idx
                                        ? {
                                            ...item,
                                            address: loc.address,
                                            lat: loc.lat,
                                            lng: loc.lng,
                                            isVerified: true,
                                          }
                                        : item
                                    )
                                  );
                                  setOpenStopHubsIdx(null);
                                }}
                                className={`w-full text-left px-3 py-1.5 text-xs flex flex-col transition cursor-pointer ${
                                  st.address === loc.address
                                    ? "bg-[#ECF2FF] text-[#5D87FF]"
                                    : "hover:bg-[#F2F6FA] text-[#2A3547]"
                                }`}
                              >
                                <span className="font-bold flex items-center space-x-1.5">
                                  <MapPin className="w-3 h-3 text-[#5D87FF] shrink-0" />
                                  <span className="truncate">{loc.label}</span>
                                </span>
                                <span className="text-[10px] text-[#7C8FAC] truncate pl-4.5">
                                  {loc.address}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setStops((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="p-1 text-[#FA896B] hover:bg-[#FDEDE8] rounded cursor-pointer"
                        title="Eliminar parada"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <GoogleAddressAutocomplete
                    placeholder="Buscar punto intermedio en El Salvador..."
                    value={st.address}
                    isVerified={st.isVerified}
                    onChange={(sel) => {
                      setStops((prev) =>
                        prev.map((item, i) =>
                          i === idx
                            ? {
                                ...item,
                                address: sel.address,
                                lat: sel.lat,
                                lng: sel.lng,
                                isVerified: Boolean(sel.isVerified),
                              }
                            : item
                        )
                      );
                    }}
                  />
                </div>
              ))}

              {/* Destino con Google Places y Dropdown de Hubs */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#2A3547]">
                    Punto de Destino <span className="text-[#FA896B]">*</span>
                  </span>
                </div>

                <GoogleAddressAutocomplete
                  placeholder="Buscar destino en El Salvador (ej. Aeropuerto Comalapa, Zona Franca, Hotel...)"
                  value={destinationCoord.address}
                  isVerified={destinationCoord.isVerified}
                  required
                  onChange={(sel) => {
                    setDestinationCoord({
                      address: sel.address,
                      lat: sel.lat,
                      lng: sel.lng,
                      isVerified: Boolean(sel.isVerified),
                    });
                  }}
                />
              </div>

              {/* Mapa Interactivo de Ruta con Google Maps API */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#2A3547] flex items-center space-x-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#5D87FF]" />
                    <span>Ruta Vial y Tiempo Estimado en Vivo (Google Maps API SV)</span>
                  </span>
                  {googleDistanceKm !== null && googleDistanceKm > 0 && (
                    <span className="text-[11px] font-semibold text-[#13DEB9]">
                      Calculado por DirectionsService
                    </span>
                  )}
                </div>
                <GoogleRouteMap
                  origin={originCoord}
                  destination={destinationCoord}
                  stops={stops}
                  roundTrip={roundTrip}
                  height="260px"
                  onRouteCalculated={({ distanceKm, durationMinutes }) => {
                    setGoogleDistanceKm(distanceKm > 0 ? distanceKm : null);
                    setGoogleDurationMinutes(durationMinutes > 0 ? durationMinutes : null);
                  }}
                />
              </div>

              <div className="pt-3 border-t border-[#E5EAEF] space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center space-x-2 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={roundTrip}
                      onChange={(e) => setRoundTrip(e.target.checked)}
                      className="rounded text-[#5D87FF]"
                    />
                    <span>Viaje Ida y Vuelta (2x km)</span>
                  </label>

                  <div className="flex items-center space-x-1.5 text-[11px] text-[#5A6A85] bg-[#F6F9FC] px-2.5 py-1 rounded border border-[#E5EAEF]">
                    <Clock className="w-3.5 h-3.5 text-[#5D87FF]" />
                    <span>Anticipación mínima requerida:</span>
                    <select
                      value={advanceHours}
                      onChange={(e) => {
                        const h = Number(e.target.value);
                        setAdvanceHours(h);
                        setScheduledDateTime(getMinReservationDateTime(h));
                      }}
                      className="bg-white border border-[#DFE5EF] rounded px-1.5 py-0.5 text-[11px] font-bold text-[#5D87FF]"
                    >
                      <option value={3}>3 horas (Requisito general SV)</option>
                      <option value={6}>6 horas (Recomendado corporativo)</option>
                      <option value={12}>12 horas</option>
                      <option value={24}>24 horas</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-[#2A3547]">Fecha y Hora de Salida *:</span>
                    <input
                      type="datetime-local"
                      value={scheduledDateTime}
                      onChange={(e) => setScheduledDateTime(e.target.value)}
                      className="text-xs border border-[#DFE5EF] rounded-[6px] px-2.5 py-2 font-medium"
                      required
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-[#D97706] bg-[#FEF5E5] px-2 py-0.5 rounded border border-[#FFAE1F]/30">
                    Viajes inmediatos inhabilitados hasta habilitar flota cercana
                  </span>
                </div>
              </div>
            </div>

            {/* Pasajeros, Categoría, Centro de Costo y Carga */}
            <div className="modern-card p-6 space-y-4">
              <h2 className="text-sm font-bold text-[#2A3547] border-b border-[#E5EAEF] pb-3">
                2. Pasajeros, Categoría Vehicular, Centro de Costo y Carga
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#5A6A85] block mb-1">
                    {isEn ? "Passenger Count *" : "N° Pasajeros *"}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={passengersCount}
                    onChange={(e) =>
                      setPassengersCount(
                        Math.max(1, Number(e.target.value) || 1)
                      )
                    }
                    className={`w-full text-xs border rounded-[6px] px-3 py-2.5 ${
                      passengersCount > MAX_VEHICLE_PASSENGER_CAPACITY
                        ? "border-[#FA896B] bg-[#FDEDE8]/30 font-bold"
                        : "border-[#DFE5EF]"
                    }`}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-[#5A6A85] block mb-1">
                    {isEn
                      ? "Required Vehicle Category *"
                      : "Categoría Vehicular Requerida *"}
                  </label>
                  <select
                    disabled={passengersCount > MAX_VEHICLE_PASSENGER_CAPACITY}
                    value={vehicleCategory}
                    onChange={(e) =>
                      setVehicleCategory(e.target.value as VehicleCategory)
                    }
                    className="w-full text-xs border border-[#DFE5EF] rounded-[6px] px-3 py-2.5 bg-white disabled:opacity-60"
                  >
                    <option
                      value="suv"
                      disabled={!allowedCategories.includes("suv")}
                    >
                      SUV Corporativa (Máx. 4 pax) — Tarifa negociada $
                      {negotiatedRate.toFixed(2)}/km · Mín.{" "}
                      {effectiveMinDistance} km
                    </option>
                    <option
                      value="pickup"
                      disabled={!allowedCategories.includes("pickup")}
                    >
                      Pick-up Doble Cabina (Máx. 4 pax) — Tarifa carga $0.75/km · Mín.{" "}
                      {effectiveMinDistance} km
                    </option>
                    <option value="microbus">
                      Microbús Corporativo (Máx. 12 pax) — Tarifa grupal $0.90/km · Mín.{" "}
                      {effectiveMinDistance} km
                    </option>
                  </select>
                </div>
              </div>

              {passengersCount > MAX_VEHICLE_PASSENGER_CAPACITY && (
                <div className="p-4 bg-[#FDEDE8] border border-[#FA896B] text-[#B91C1C] rounded-[7px] text-xs space-y-2">
                  <div className="flex items-center space-x-2 font-bold text-sm">
                    <PhoneCall className="w-4 h-4 shrink-0" />
                    <span>
                      {isEn
                        ? `Capacity Exceeded (${passengersCount} passengers > max ${MAX_VEHICLE_PASSENGER_CAPACITY})`
                        : `Capacidad Máxima Excedida (${passengersCount} pasajeros > límite de ${MAX_VEHICLE_PASSENGER_CAPACITY})`}
                    </span>
                  </div>
                  <p className="leading-relaxed whitespace-pre-line text-[13px] font-semibold text-[#8B0000]">
                    {isEn
                      ? `For trips with more than 12 passengers, please contact us by WhatsApp or phone and we will gladly assist you immediately.\nWe are at your service.`
                      : `Para viajes de más de 12 pasajeros, contáctenos por WhatsApp o llamada y con gusto le ayudaremos de inmediato.\nEstamos para servirle.`}
                  </p>
                  <div className="pt-1 flex flex-wrap items-center gap-2">
                    <a
                      href={`https://wa.me/${LILO_DIRECT_CONTACT.whatsapp.replace(/[^\d]/g, "")}?text=${encodeURIComponent(
                        `Hola Lilo, requiero cotizar un viaje corporativo para ${passengersCount} pasajeros en El Salvador.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#25D366] text-white rounded font-bold hover:opacity-95 transition"
                    >
                      <span>WhatsApp {LILO_DIRECT_CONTACT.whatsapp}</span>
                    </a>
                    <a
                      href={`tel:${LILO_DIRECT_CONTACT.phone}`}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-[#DFE5EF] text-[#2A3547] rounded font-bold hover:bg-slate-50 transition"
                    >
                      <span>Llamar: {LILO_DIRECT_CONTACT.phone}</span>
                    </a>
                    <span className="text-[11px] text-[#5A6A85]">· {LILO_DIRECT_CONTACT.email}</span>
                  </div>
                </div>
              )}

              {passengersCount > 4 &&
                passengersCount <= MAX_VEHICLE_PASSENGER_CAPACITY && (
                  <div className="p-3 bg-[#FEF5E5] text-[#B45309] rounded-[6px] text-xs flex items-center space-x-2 font-medium">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      {isEn
                        ? `For ${passengersCount} passengers (more than 4), Corporate Minibus (up to 12 passengers) is automatically assigned.`
                        : `Para ${passengersCount} pasajeros (más de 4), el sistema asigna automáticamente Microbús Corporativo (hasta 12 pasajeros).`}
                    </span>
                  </div>
                )}

              {travellers.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-[#5A6A85] block mb-1">
                    Viajero Corporativo Hospedado (Directorio de Empresa · LO-4.2)
                  </label>
                  <select
                    value={travellerId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setTravellerId(id);
                      const found = travellers.find((t) => t.id === id);
                      if (found) {
                        setPassengerNamesInput(found.fullName);
                        if (found.phone) setPassengerPhone(found.phone);
                        if (found.costCenterId)
                          setCostCenterId(found.costCenterId);
                      }
                    }}
                    className="w-full text-xs border border-[#DFE5EF] rounded-[6px] px-3 py-2.5 bg-white"
                  >
                    <option value="">
                      -- Seleccionar viajero frecuente o ingresar manual --
                    </option>
                    {travellers.map((tr) => (
                      <option key={tr.id} value={tr.id}>
                        {tr.fullName} ({tr.phone})
                        {tr.department ? ` · ${tr.department}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#5A6A85] block mb-1">
                    Centro de Costo / Departamento
                  </label>
                  <select
                    value={costCenterId}
                    onChange={(e) => setCostCenterId(e.target.value)}
                    className="w-full text-xs border border-[#DFE5EF] rounded-[6px] px-3 py-2.5 bg-white"
                  >
                    {costCenters.length === 0 ? (
                      <option value="">
                        Sin centro de costo registrado en la empresa
                      </option>
                    ) : (
                      costCenters.map((cc) => {
                        const limit =
                          cc.budgetLimit ?? cc.monthlyBudget ?? null;
                        const spentVal = Number(cc.spent || 0);
                        const limitText = isCompanyAdmin
                          ? limit === null
                            ? ` · SIN LÍMITE · Consumido $${spentVal.toFixed(2)}`
                            : ` · Techo $${Number(limit).toFixed(2)} · Consumido $${spentVal.toFixed(2)}`
                          : "";
                        return (
                          <option key={cc.id} value={cc.id}>
                            {cc.code ? `${cc.code} — ` : ""}
                            {cc.name}
                            {limitText}
                          </option>
                        );
                      })
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#5A6A85] block mb-1">
                    Teléfono de Contacto (+503)
                  </label>
                  <input
                    type="text"
                    value={passengerPhone}
                    onChange={(e) => setPassengerPhone(e.target.value)}
                    className="w-full text-xs border border-[#DFE5EF] rounded-[6px] px-3 py-2.5"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#5A6A85] block mb-1">
                  Nombres de Pasajeros (separados por coma)
                </label>
                <input
                  type="text"
                  placeholder="Ej. Carlos Rivas, María Hernández"
                  value={passengerNamesInput}
                  onChange={(e) => setPassengerNamesInput(e.target.value)}
                  className="w-full text-xs border border-[#DFE5EF] rounded-[6px] px-3 py-2.5"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center pt-2">
                <label className="flex items-center space-x-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasCargo}
                    onChange={(e) => setHasCargo(e.target.checked)}
                    className="rounded text-[#5D87FF]"
                  />
                  <span>Incluye Carga / Equipos</span>
                </label>

                {hasCargo && (
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      placeholder="Describe la carga, herramientas o muestras..."
                      value={cargoDescription}
                      onChange={(e) => setCargoDescription(e.target.value)}
                      className="w-full text-xs border border-[#DFE5EF] rounded-[6px] px-3 py-2"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Resumen de Tarifa Oficial El Salvador */}
          <div className="space-y-4">
            <div className="modern-card p-6 border-2 border-[#5D87FF] space-y-4 sticky top-6">
              <div className="flex items-center space-x-2 border-b border-[#E5EAEF] pb-3">
                <Calculator className="w-5 h-5 text-[#5D87FF]" />
                <h3 className="text-sm font-bold text-[#2A3547]">
                  {isCompanyAdmin
                    ? "Cotización Oficial B2B (SV)"
                    : "Resumen Operativo del Traslado (Analista)"}
                </h3>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#7C8FAC]">Categoría:</span>
                  <span className="font-bold text-[#2A3547] uppercase">
                    {tariff.rule.shortLabel}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7C8FAC]">Modalidad:</span>
                  <span className="font-semibold text-[#2A3547]">
                    {roundTrip ? "Ida y Vuelta (2x)" : "Solo Ida (1x)"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7C8FAC]">Distancia a cobrar:</span>
                  <span className="font-bold text-[#2A3547]">
                    {effectiveChargedDistance} km{" "}
                    <span className="text-[11px] font-normal text-[#7C8FAC]">
                      (Mín: {effectiveMinDistance} km)
                    </span>
                  </span>
                </div>
                {isCompanyAdmin && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-[#7C8FAC]">
                        {effectiveRateSourceLabel}:
                      </span>
                      <span className="font-semibold text-[#2A3547]">
                        ${effectiveRate.toFixed(2)} USD/km
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-[#E5EAEF] pt-2">
                      <span className="text-[#7C8FAC]">
                        Subtotal Base ({effectiveChargedDistance} km):
                      </span>
                      <span className="font-semibold text-[#2A3547]">
                        ${effectiveBaseAmount.toFixed(2)} USD
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#7C8FAC]">
                        {effectiveTaxLabel} ({Math.round(effectiveTaxRate * 100)}
                        %):
                      </span>
                      <span className="font-semibold text-[#2A3547]">
                        +${effectiveTaxAmount.toFixed(2)} USD
                      </span>
                    </div>
                  </>
                )}
              </div>

              {isCompanyAdmin ? (
                <div className="bg-[#ECF2FF] p-4 rounded-[8px] text-center">
                  <span className="text-[10px] font-bold uppercase text-[#5D87FF] block">
                    {isEn
                      ? `Estimated Total (Base + ${effectiveTaxLabel})`
                      : `Total Estimado (Base + ${effectiveTaxLabel} ${Math.round(
                          effectiveTaxRate * 100
                        )}%)`}
                  </span>
                  <span className="text-3xl font-extrabold text-[#5D87FF] block mt-1">
                    ${effectiveTotalAmount.toFixed(2)} USD
                  </span>
                  <span className="text-[11px] text-[#5A6A85] block mt-1">
                    {effectiveChargedDistance} km × ${effectiveRate.toFixed(2)}
                    /km = ${effectiveBaseAmount.toFixed(2)} +{" "}
                    {effectiveTaxLabel} ${effectiveTaxAmount.toFixed(2)}
                  </span>
                </div>
              ) : (
                <div className="bg-[#ECF2FF] p-3.5 rounded-[8px] text-center text-xs text-[#5A6A85]">
                  Los montos financieros y techos de consumo son visibles únicamente para el Administrador de Empresa (LO-4.2).
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || passengersCount > MAX_VEHICLE_PASSENGER_CAPACITY}
                className="w-full py-3 bg-[#5D87FF] hover:bg-[#4570EA] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-[7px] text-xs transition flex items-center justify-center space-x-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {passengersCount > MAX_VEHICLE_PASSENGER_CAPACITY
                    ? isEn
                      ? "Capacity Exceeded — Contact Lilo"
                      : "Capacidad Excedida — Comunícate con Lilo"
                    : submitting
                    ? isEn
                      ? "Submitting Request..."
                      : "Emitiendo Solicitud..."
                    : isEn
                    ? "Confirm Transfer Request"
                    : "Confirmar Solicitud de Traslado"}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

