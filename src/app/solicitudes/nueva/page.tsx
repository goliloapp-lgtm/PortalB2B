"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
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
  listScheduledTripCategoriesCallable,
  AssignableCategoryRow,
  CompanyRateRow,
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
} from "@/types/b2b";
import {
  EL_SALVADOR_LOCATIONS,
  LILO_DIRECT_CONTACT,
  SV_DEFAULT_MINIMUM_DISTANCE_KM,
  SV_DEFAULT_TAX_RATE,
  SV_DEFAULT_TAX_LABEL,
  LILO_COMMISSION_RATE,
  calculateB2BTariff,
  calculateRoadDistanceKm,
  calculateMultiStopRouteDistanceKm,
  B2B_RESERVATION_CONFIG,
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
  Globe,
  PhoneCall,
  Clock,
  MapPin,
  Building,
  ChevronDown,
} from "lucide-react";

const getMinReservationDateTime = (hours = B2B_RESERVATION_CONFIG.minAdvanceHours) => {
  // Se agregan 15 minutos de margen para evitar que el reloj alcance la hora mínima mientras se llena el formulario
  const target = new Date(Date.now() + hours * 60 * 60 * 1000 + 15 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(target.getHours())}:${pad(target.getMinutes())}`;
};

// F6: el techo real de un centro de costo. La fórmula es `spent + reserved` contra
// `budgetLimit` (CONTRATO_FRONTEND.md, CF-23 y los centros de costo de `createScheduledTrip`).
// `monthlyBudget` es un campo legado y NO es el techo: si falta `budgetLimit` el centro está
// «sin límite definido», y no se inventa un número con el que compararlo.
const formatCostCentreCeiling = (cc: CostCenter): string => {
  const used = Number(cc.spent || 0) + Number(cc.reserved || 0);
  const limit =
    typeof cc.budgetLimit === "number" ? cc.budgetLimit : null;
  const usedText = ` · Consumido + reservado $${used.toFixed(2)}`;
  return limit === null
    ? ` · sin límite definido${usedText}`
    : ` · Techo $${limit.toFixed(2)}${usedText}`;
};

// F6: el selector no elige solo. Se conserva la elección previa mientras siga siendo
// válida y solo se autoselecciona cuando la empresa tiene exactamente un centro: con
// varios, la elección es del operador y el envío la exige (`handleSubmit`).
const resolveCostCentreSelection = (
  list: CostCenter[],
  previous: string
): string => {
  if (previous && list.some((c) => c.id === previous)) return previous;
  return list.length === 1 ? list[0].id : "";
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
  // La categoría es el `categoryId` del catálogo, no la unión de tres valores: el
  // backend publica cuáles son asignables y con qué nombre mostrarlas.
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [assignableCategories, setAssignableCategories] = useState<
    AssignableCategoryRow[]
  >([]);
  const [assignedCategoryId, setAssignedCategoryId] = useState("");
  // El error acompaña a la cantidad con la que se intentó cargar: el de una cantidad
  // anterior no describe la reserva que se está armando.
  const [categoryLoadError, setCategoryLoadError] = useState<{
    passengerCount: number;
    message: string;
  } | null>(null);
  // La cantidad para la que se cargó la lista vigente. Mientras difiera de
  // `passengersCount`, la lista anterior no dice nada de esta reserva.
  const [categoriesLoadedFor, setCategoriesLoadedFor] = useState<number | null>(
    null
  );
  // El techo de pasajeros es la categoría más amplia que el backend ofrece hoy
  // para el país, no el 12 que estaba escrito en esta pantalla.
  const [maxCategoryCapacity, setMaxCategoryCapacity] = useState<number | null>(
    null
  );

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

  // Cargar las tarifas de la empresa por categoría (CF-45)
  useEffect(() => {
    if (!user) return;
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
            setCostCenterId((prev) => resolveCostCentreSelection(mapped, prev));
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
        setCostCenterId((prev) => resolveCostCentreSelection(list, prev));
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

  // Las categorías asignables las decide el backend para esta cantidad exacta:
  // filtra capacidad, tarifa de país y flota activa del país, cosas que la pantalla
  // no puede conocer. El rebote evita una llamada por tecla y el error NO se traga:
  // una lista vacía dejaría al operador adivinando por qué no puede reservar.
  useEffect(() => {
    if (!user) return;
    let active = true;
    const timer = setTimeout(() => {
      setCategoryLoadError(null);
      listScheduledTripCategoriesCallable({ passengerCount: passengersCount })
        .then((res) => {
          if (!active) return;
          const rows = Array.isArray(res.data?.categories)
            ? res.data.categories
            : [];
          setAssignableCategories(rows);
          setAssignedCategoryId(res.data?.assignedCategoryId || "");
          setCategoriesLoadedFor(passengersCount);
          setMaxCategoryCapacity(
            rows.length > 0
              ? Math.max(...rows.map((row) => row.maxPassengers))
              : null
          );
          setCategoryLoadError(
            rows.length > 0
              ? null
              : {
                  passengerCount: passengersCount,
                  message:
                    "No hay categorías disponibles para esta cantidad de pasajeros.",
                }
          );
        })
        .catch((err) => {
          if (!active) return;
          setAssignableCategories([]);
          setAssignedCategoryId("");
          setCategoriesLoadedFor(null);
          setCategoryLoadError({
            passengerCount: passengersCount,
            message: formatFriendlyError(
              err,
              "No pudimos cargar las categorías disponibles para esta cantidad de pasajeros. Por favor intenta nuevamente o contáctanos por WhatsApp o teléfono."
            ),
          });
        });
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [user, passengersCount]);

  // La lista solo vale para la cantidad con la que se cargó: mientras la cantidad
  // pedida y la cargada difieran —rebote en curso o carga fallida— la elección, el
  // tope y las opciones de la lista anterior no describen esta reserva.
  const categoriesReadyForCurrentCount =
    categoriesLoadedFor === passengersCount;

  // El mensaje de error también es de una cantidad concreta: al cambiar de cantidad
  // queda viejo hasta que la nueva carga responda.
  const categoryErrorMessage =
    categoryLoadError !== null &&
    categoryLoadError.passengerCount === passengersCount
      ? categoryLoadError.message
      : null;

  // La elección efectiva: la del operador mientras siga siendo asignable. Si el
  // backend ya no la ofrece para esta cantidad —o es la primera carga—, se
  // preselecciona la que el alta elegiría hoy (`assignedCategoryId`), que es la más
  // ajustada del conjunto. Derivarla evita imponerla por estado. Sin lista válida
  // para esta cantidad no hay elección: el alta no puede llevarse una categoría que
  // se cargó para otra cantidad.
  const effectiveCategoryId = useMemo(() => {
    if (!categoriesReadyForCurrentCount) return "";
    const keepsChoice = assignableCategories.some(
      (row) => row.categoryId === selectedCategoryId
    );
    if (keepsChoice) return selectedCategoryId;
    return assignedCategoryId || assignableCategories[0]?.categoryId || "";
  }, [
    categoriesReadyForCurrentCount,
    assignableCategories,
    selectedCategoryId,
    assignedCategoryId,
  ]);

  // El tope solo se compara contra una lista que corresponde a esta cantidad; el
  // máximo de una lista vieja produciría un falso «capacidad excedida».
  const capacityExceeded =
    categoriesReadyForCurrentCount &&
    maxCategoryCapacity !== null &&
    passengersCount > maxCategoryCapacity;

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

  // La tarifa del estimado local sale de la categoría ELEGIDA: para el
  // administrador, la de `listCompanyRates` —que ya trae la negociada o, en su
  // defecto, la del país—; para el resto, la cotización del servidor, que es el
  // mismo precio resuelto. Nunca se cae a la tarifa del SUV.
  const selectedFareRate = useMemo(() => {
    if (!effectiveCategoryId) return undefined;

    if (isCompanyAdmin) {
      const row = companyRates.find(
        (r) => r.categoryId === effectiveCategoryId
      );
      const fareRate = row?.fareRate;
      if (
        typeof fareRate === "number" &&
        Number.isFinite(fareRate) &&
        fareRate > 0
      ) {
        return fareRate;
      }
    }

    const quoted = serverQuote?.appliedFareRate;
    return typeof quoted === "number" && Number.isFinite(quoted) && quoted > 0
      ? quoted
      : undefined;
  }, [isCompanyAdmin, companyRates, effectiveCategoryId, serverQuote]);

  const selectedCategoryName = useMemo(
    () =>
      assignableCategories.find(
        (row) => row.categoryId === effectiveCategoryId
      )?.name || "",
    [assignableCategories, effectiveCategoryId]
  );

  const tariff = useMemo(
    () =>
      calculateB2BTariff(effectiveCategoryId, oneWayDistanceKm, roundTrip, {
        ratePerKm: selectedFareRate,
        minimumDistanceKm: countryPricingConfig.minimumDistance,
        taxRate: countryPricingConfig.taxRate,
        taxLabel: countryPricingConfig.taxLabel,
        commissionRate: countryPricingConfig.commissionRate,
      }),
    [
      effectiveCategoryId,
      oneWayDistanceKm,
      roundTrip,
      selectedFareRate,
      countryPricingConfig,
    ]
  );

  // Los dos números que los tramos necesitan salen del objeto `tariff`: una
  // dependencia de propiedad no es verificable por el analizador de memoización.
  const { chargedDistanceKm, estimatedDurationMinutes } = tariff;

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
            distance: chargedDistanceKm,
            durationMinutes: estimatedDurationMinutes,
          },
        ];
  }, [originCoord, destinationCoord, stops, roundTrip, chargedDistanceKm, estimatedDurationMinutes]);

  // Consultar la cotización oficial en el backend (getFareQuote — CF-38) SIEMPRE
  // con la categoría elegida: sin `categoryId` el servidor cotiza la que él derive y
  // el precio mostrado podía pertenecer a una categoría distinta de la que se
  // congela al reservar. Si el backend la rechaza se muestra el estimado local, no un
  // precio que no corresponde.
  useEffect(() => {
    if (!user || routeLegs.length === 0 || !effectiveCategoryId) {
      setServerQuote(null);
      return;
    }
    let active = true;
    getFareQuoteCallable({ legs: routeLegs, categoryId: effectiveCategoryId })
      .then((res) => {
        if (active) {
          setServerQuote(res.data?.quote ?? null);
        }
      })
      .catch((err) => {
        if (!active) return;
        setServerQuote(null);
        console.warn("[NuevaSolicitud] Cotización con la categoría elegida:", err);
      });
    return () => {
      active = false;
    };
  }, [user, routeLegs, effectiveCategoryId]);

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
  // Solo hay importe si existe una tasa resuelta para la categoría (la del servidor
  // o la de `listCompanyRates`). Sin ella no se imprime $0.00 ni la tarifa publicada
  // de la tabla: el precio está pendiente de cotización.
  const hasResolvedRate = effectiveRate > 0;

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
    if (!effectiveCategoryId) {
      const msg =
        categoryErrorMessage ||
        (categoriesReadyForCurrentCount
          ? "Por favor selecciona la categoría del vehículo antes de confirmar la reserva."
          : "Por favor espera a que se carguen las categorías disponibles para esta cantidad de pasajeros.");
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
      // F6: con varios centros la elección es del operador. `costCenters[0]` solo es un
      // atajo legítimo cuando la empresa tiene exactamente un centro.
      const selectedCC =
        costCenters.find((c) => c.id === costCenterId) ||
        (costCenters.length === 1 ? costCenters[0] : undefined);
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
          // El teléfono de contacto de la empresa vive en `contactPhone`; `phone` es
          // el campo legacy. Y no se inventa un número: un pasajero con un teléfono
          // falso es peor que uno sin teléfono, que el portal ya sabe mostrar.
          passengerPhone.trim() || company.contactPhone || company.phone || "";
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
          // La categoría la elige el operador entre las asignables y el servidor la
          // valida contra ese mismo conjunto; `companyId` y `countryId` los deriva.
          const scheduledRes = await createScheduledTripCallable({
            travellerId: resolvedTraveller.id,
            passengerCount: passengersCount,
            categoryId: effectiveCategoryId,
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
            categoryId: effectiveCategoryId,
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
                      capacityExceeded
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
                    disabled={
                      !categoriesReadyForCurrentCount ||
                      assignableCategories.length === 0
                    }
                    value={effectiveCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                    className="w-full text-xs border border-[#DFE5EF] rounded-[6px] px-3 py-2.5 bg-white disabled:opacity-60"
                  >
                    {!categoriesReadyForCurrentCount ||
                    assignableCategories.length === 0 ? (
                      <option value="">
                        {categoryErrorMessage
                          ? isEn
                            ? "No categories available"
                            : "Sin categorías disponibles"
                          : isEn
                          ? "Loading categories..."
                          : "Cargando categorías..."}
                      </option>
                    ) : (
                      assignableCategories.map((category) => (
                        <option
                          key={category.categoryId}
                          value={category.categoryId}
                        >
                          {category.name} (Máx. {category.maxPassengers} pax)
                        </option>
                      ))
                    )}
                  </select>
                  {categoryErrorMessage && (
                    <p className="mt-2 text-[11px] font-semibold text-[#B91C1C] whitespace-pre-line">
                      {categoryErrorMessage}
                    </p>
                  )}
                </div>
              </div>

              {capacityExceeded && maxCategoryCapacity !== null && (
                <div className="p-4 bg-[#FDEDE8] border border-[#FA896B] text-[#B91C1C] rounded-[7px] text-xs space-y-2">
                  <div className="flex items-center space-x-2 font-bold text-sm">
                    <PhoneCall className="w-4 h-4 shrink-0" />
                    <span>
                      {isEn
                        ? `Capacity Exceeded (${passengersCount} passengers > max ${maxCategoryCapacity})`
                        : `Capacidad Máxima Excedida (${passengersCount} pasajeros > límite de ${maxCategoryCapacity})`}
                    </span>
                  </div>
                  <p className="leading-relaxed whitespace-pre-line text-[13px] font-semibold text-[#8B0000]">
                    {isEn
                      ? `For trips with more than ${maxCategoryCapacity} passengers, please contact us by WhatsApp or phone and we will gladly assist you immediately.\nWe are at your service.`
                      : `Para viajes de más de ${maxCategoryCapacity} pasajeros, contáctenos por WhatsApp o llamada y con gusto le ayudaremos de inmediato.\nEstamos para servirle.`}
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
                      <>
                        {costCenters.length > 1 && (
                          <option value="">
                            -- Seleccionar centro de costo --
                          </option>
                        )}
                        {costCenters.map((cc) => (
                          <option key={cc.id} value={cc.id}>
                            {cc.code ? `${cc.code} — ` : ""}
                            {cc.name}
                            {isCompanyAdmin ? formatCostCentreCeiling(cc) : ""}
                          </option>
                        ))}
                      </>
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
                    {!categoriesReadyForCurrentCount
                      ? isEn
                        ? "Loading..."
                        : "Cargando…"
                      : selectedCategoryName || "Sin categoría asignable"}
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
                {isCompanyAdmin && hasResolvedRate && (
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
                hasResolvedRate ? (
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
                  <div className="bg-[#FEF5E5] p-4 rounded-[8px] text-center">
                    <span className="text-[10px] font-bold uppercase text-[#B45309] block">
                      {isEn ? "Pending quote" : "Pendiente de cotización"}
                    </span>
                    <span className="text-[11px] text-[#92400E] block mt-1 leading-relaxed">
                      {isEn
                        ? "The price is quoted by the server with the rate of the chosen category. We do not show an amount until we have it."
                        : "El precio lo calcula el servidor con la tarifa de la categoría elegida. No mostramos un monto hasta tenerlo."}
                    </span>
                  </div>
                )
              ) : (
                <div className="bg-[#ECF2FF] p-3.5 rounded-[8px] text-center text-xs text-[#5A6A85]">
                  Los montos financieros y techos de consumo son visibles únicamente para el Administrador de Empresa (LO-4.2).
                </div>
              )}

              <button
                type="submit"
                disabled={
                  submitting ||
                  !categoriesReadyForCurrentCount ||
                  capacityExceeded ||
                  !effectiveCategoryId
                }
                className="w-full py-3 bg-[#5D87FF] hover:bg-[#4570EA] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-[7px] text-xs transition flex items-center justify-center space-x-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {capacityExceeded
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

