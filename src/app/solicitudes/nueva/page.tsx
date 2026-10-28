"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
} from "@/lib/b2bPricing";
import { useLanguage } from "@/context/LanguageContext";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Calculator,
  CheckCircle2,
  AlertTriangle,
  Globe,
  PhoneCall,
} from "lucide-react";

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
  const [isImmediate, setIsImmediate] = useState(true);
  const [scheduledDateTime, setScheduledDateTime] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  });

  const [originIndex, setOriginIndex] = useState<number>(0);
  const [originAddress, setOriginAddress] = useState(
    EL_SALVADOR_LOCATIONS[0].address
  );
  const [destinationIndex, setDestinationIndex] = useState<number>(10);
  const [destinationAddress, setDestinationAddress] = useState(
    EL_SALVADOR_LOCATIONS[10].address
  );
  const [stops, setStops] = useState<
    Array<{ presetIndex: number; address: string }>
  >([]);
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

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    } else if (!loading && mustChangePassword) {
      router.push("/");
    }
  }, [user, loading, mustChangePassword, router]);

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
        const list = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as CostCenter)
        );
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
  }, [company?.id, company?.countryId]);

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
    const o = EL_SALVADOR_LOCATIONS[originIndex] || EL_SALVADOR_LOCATIONS[0];
    const d =
      EL_SALVADOR_LOCATIONS[destinationIndex] || EL_SALVADOR_LOCATIONS[1];
    const pts = [
      { lat: o.lat, lng: o.lng },
      ...stops.map((s) => {
        const p =
          EL_SALVADOR_LOCATIONS[s.presetIndex] || EL_SALVADOR_LOCATIONS[2];
        return { lat: p.lat, lng: p.lng };
      }),
      { lat: d.lat, lng: d.lng },
    ];
    return calculateMultiStopRouteDistanceKm(pts);
  }, [originIndex, destinationIndex, stops]);

  const negotiatedRate = useMemo(() => {
    const raw = Number(company?.negotiatedFareRate);
    return Number.isFinite(raw) && raw > 0 ? raw : SV_DEFAULT_NEGOTIATED_RATE;
  }, [company?.negotiatedFareRate]);

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
    const o = EL_SALVADOR_LOCATIONS[originIndex] || EL_SALVADOR_LOCATIONS[0];
    const d =
      EL_SALVADOR_LOCATIONS[destinationIndex] || EL_SALVADOR_LOCATIONS[1];
    const waypoints = [
      { lat: o.lat, lng: o.lng },
      ...stops.map((s) => {
        const p =
          EL_SALVADOR_LOCATIONS[s.presetIndex] || EL_SALVADOR_LOCATIONS[2];
        return { lat: p.lat, lng: p.lng };
      }),
      { lat: d.lat, lng: d.lng },
    ];
    if (roundTrip) {
      waypoints.push({ lat: o.lat, lng: o.lng });
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
  }, [originIndex, destinationIndex, stops, roundTrip, tariff.chargedDistanceKm, tariff.estimatedDurationMinutes]);

  const backendCategoryId = useMemo(
    () =>
      vehicleCategory === "pickup"
        ? "pickup-doble-cabina"
        : vehicleCategory === "microbus"
        ? "microbus"
        : "suv",
    [vehicleCategory]
  );

  // Consultar cotización oficial en el backend (getFareQuote — CF-38)
  useEffect(() => {
    if (!user || routeLegs.length === 0) return;
    let active = true;
    getFareQuoteCallable({ legs: routeLegs, categoryId: backendCategoryId })
      .then((res) => {
        if (active && res.data?.quote) {
          setServerQuote(res.data.quote);
        }
      })
      .catch(() => {
        // Fallback sin categoryId en caso de que la categoría no tenga fila en fareRates
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

  const handleAddStop = () => {
    setStops((prev) => [
      ...prev,
      {
        presetIndex: 3,
        address: EL_SALVADOR_LOCATIONS[3].address,
      },
    ]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passengersCount > MAX_VEHICLE_PASSENGER_CAPACITY) {
      setError(
        isEn
          ? `Requested capacity (${passengersCount} passengers) exceeds maximum vehicle limit (${MAX_VEHICLE_PASSENGER_CAPACITY} passengers). Please contact Lilo directly at ${LILO_DIRECT_CONTACT.whatsapp} or ${LILO_DIRECT_CONTACT.email}.`
          : `La capacidad solicitada (${passengersCount} pasajeros) excede el límite máximo de los vehículos (${MAX_VEHICLE_PASSENGER_CAPACITY} pasajeros). Por favor comunícate con Lilo al ${LILO_DIRECT_CONTACT.whatsapp} o ${LILO_DIRECT_CONTACT.email}.`
      );
      return;
    }
    if (!originAddress.trim() || !destinationAddress.trim()) {
      setError("Completa la dirección de origen y destino.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const o = EL_SALVADOR_LOCATIONS[originIndex] || EL_SALVADOR_LOCATIONS[0];
      const d =
        EL_SALVADOR_LOCATIONS[destinationIndex] || EL_SALVADOR_LOCATIONS[1];

      const originPoint: RoutePoint = {
        address: originAddress.trim(),
        lat: o.lat,
        lng: o.lng,
      };
      const destPoint: RoutePoint = {
        address: destinationAddress.trim(),
        lat: d.lat,
        lng: d.lng,
      };
      const stopPoints: RoutePoint[] = stops.map((s) => {
        const p =
          EL_SALVADOR_LOCATIONS[s.presetIndex] || EL_SALVADOR_LOCATIONS[2];
        return {
          address: s.address.trim(),
          lat: p.lat,
          lng: p.lng,
        };
      });

      const selectedCC =
        costCenters.find((c) => c.id === costCenterId) || costCenters[0];
      let resolvedTraveller =
        travellers.find((t) => t.id === travellerId) || travellers[0];

      // Si la empresa aún no tiene un viajero registrado en countries/{countryId}/b2bCompanies/{companyId}/travellers
      if (!resolvedTraveller && company?.id) {
        const targetCountryId = String(company.countryId || "sv").toLowerCase();
        const manualName =
          passengerNamesInput
            .split(",")
            .map((n) => n.trim())
            .filter(Boolean)[0] ||
          company.contactName ||
          "Viajero Corporativo";
        try {
          const newTravRef = await addDoc(
            collection(
              db,
              "countries",
              targetCountryId,
              "b2bCompanies",
              company.id,
              "travellers"
            ),
            {
              companyId: company.id,
              name: manualName,
              fullName: manualName,
              phone: passengerPhone.trim() || company.phone || "+503 0000-0000",
              department: selectedCC?.department || "General",
              costCenterId: selectedCC?.id || null,
              active: true,
              status: "active",
              createdAt: serverTimestamp(),
            }
          );
          resolvedTraveller = {
            id: newTravRef.id,
            companyId: company.id,
            fullName: manualName,
            phone: passengerPhone.trim() || company.phone || "+503 0000-0000",
            active: true,
          };
        } catch {
          resolvedTraveller = {
            id: "travDemo001",
            companyId: company.id,
            fullName: manualName,
            phone: passengerPhone.trim() || company.phone || "+503 0000-0000",
            active: true,
          };
        }
      }

      const folio = `B2B-SV-${new Date().getFullYear()}-${Math.floor(
        1000 + Math.random() * 9000
      )}`;

      const legs = routeLegs;
      const totalRideTimeMinutes = Math.max(
        1,
        legs.reduce((acc, l) => acc + Math.round(l.durationMinutes), 0)
      );

      let createdTripId: string | undefined;
      let serverFareBreakdown: any;
      try {
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
          travellerId: resolvedTraveller?.id || "travDemo001",
          categoryId: backendCategoryId,
          legs,
        });
        createdTripId = res.data?.tripId;
        serverFareBreakdown = res.data?.fareBreakdown;
      } catch (callableErr: any) {
        const msg = String(callableErr?.message || "");
        if (
          msg.includes("resource-exhausted") ||
          msg.includes("budget") ||
          msg.includes("ceiling")
        ) {
          throw new Error(
            "El centro de costo de la empresa ha alcanzado su techo de consumo para este periodo."
          );
        }
        console.warn(
          "[PortalB2B] createTripCallable fallback to b2bRequests:",
          callableErr
        );
      }

      const baseFareAmount =
        typeof serverFareBreakdown?.farePrice === "number"
          ? serverFareBreakdown.farePrice
          : effectiveBaseAmount;
      const taxAmount = Number(
        (baseFareAmount * effectiveTaxRate).toFixed(2)
      );
      const totalWithTax = Number((baseFareAmount + taxAmount).toFixed(2));

      const fallbackBreakdown = {
        countryId: "sv",
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

      await addDoc(collection(db, "b2bRequests"), {
        folio,
        tripId: createdTripId || null,
        countryId: "sv",
        companyId: company?.id || "demoCompanySv",
        companyName:
          company?.tradeName || company?.legalName || "Empresa Corporativa SV",
        costCenterId: selectedCC?.id || null,
        costCenterName: selectedCC?.name || null,
        requestedByUid: user?.uid || "portalUser",
        requestedByName:
          company?.contactName ||
          company?.contactPerson ||
          user?.email ||
          "Usuario Corporativo",
        travellerId: resolvedTraveller?.id || null,
        travellerName: resolvedTraveller?.fullName || null,
        passengersCount,
        passengerNames: passengerNamesInput
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean),
        passengerPhone: passengerPhone.trim(),
        vehicleCategory,
        hasCargo,
        cargoDescription: hasCargo ? cargoDescription.trim() : null,
        origin: originPoint,
        stops: stopPoints,
        destination: destPoint,
        legs,
        roundTrip,
        scheduledAt: isImmediate
          ? new Date().toISOString()
          : new Date(scheduledDateTime).toISOString(),
        isImmediate,
        estimatedDistanceKm: effectiveChargedDistance,
        estimatedDurationMinutes: totalRideTimeMinutes,
        tariffApplied: {
          category: vehicleCategory,
          ratePerKm: effectiveRate,
          minFare: Number((effectiveMinDistance * effectiveRate).toFixed(2)),
          baseDistanceKm: effectiveMinDistance,
          baseAmount: baseFareAmount,
          taxRate: effectiveTaxRate,
          taxLabel: effectiveTaxLabel,
          taxAmount,
          calculatedAmount: totalWithTax,
        },
        fareBreakdown: serverFareBreakdown
          ? {
              ...serverFareBreakdown,
              baseAmount: baseFareAmount,
              taxRate: effectiveTaxRate,
              taxLabel: effectiveTaxLabel,
              taxAmount,
              totalAmount: totalWithTax,
            }
          : fallbackBreakdown,
        baseAmount: baseFareAmount,
        taxAmount,
        taxRate: effectiveTaxRate,
        finalAmount: totalWithTax,
        status: "requested",
        notes: notes.trim() || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      router.push("/");
    } catch (err: any) {
      setError(err.message || "Error al registrar la solicitud.");
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

        {error && (
          <div className="p-4 bg-[#FDEDE8] text-[#FA896B] rounded-[7px] text-xs font-semibold">
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#5A6A85] block mb-1">
                    Punto Corporativo Origen (SV)
                  </label>
                  <select
                    value={originIndex}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      setOriginIndex(idx);
                      setOriginAddress(EL_SALVADOR_LOCATIONS[idx].address);
                    }}
                    className="w-full text-xs border border-[#DFE5EF] rounded-[6px] px-3 py-2.5 bg-white"
                  >
                    {EL_SALVADOR_LOCATIONS.map((loc, i) => (
                      <option key={i} value={i}>
                        {loc.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#5A6A85] block mb-1">
                    Dirección Exacta de Origen *
                  </label>
                  <input
                    type="text"
                    value={originAddress}
                    onChange={(e) => setOriginAddress(e.target.value)}
                    className="w-full text-xs border border-[#DFE5EF] rounded-[6px] px-3 py-2.5"
                    required
                  />
                </div>
              </div>

              {/* Paradas Intermedias */}
              {stops.map((st, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-[#F8FAFC] border border-[#E5EAEF] rounded-[7px] grid grid-cols-1 sm:grid-cols-12 gap-2 items-end"
                >
                  <div className="sm:col-span-5">
                    <label className="text-[11px] font-semibold text-[#5D87FF] block mb-1">
                      Parada #{idx + 1} (Referencia)
                    </label>
                    <select
                      value={st.presetIndex}
                      onChange={(e) => {
                        const nIdx = Number(e.target.value);
                        setStops((prev) =>
                          prev.map((item, i) =>
                            i === idx
                              ? {
                                  presetIndex: nIdx,
                                  address: EL_SALVADOR_LOCATIONS[nIdx].address,
                                }
                              : item
                          )
                        );
                      }}
                      className="w-full text-xs border border-[#DFE5EF] rounded-[6px] px-2.5 py-2 bg-white"
                    >
                      {EL_SALVADOR_LOCATIONS.map((loc, i) => (
                        <option key={i} value={i}>
                          {loc.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-6">
                    <label className="text-[11px] font-semibold text-[#5A6A85] block mb-1">
                      Dirección Parada #{idx + 1}
                    </label>
                    <input
                      type="text"
                      value={st.address}
                      onChange={(e) => {
                        const val = e.target.value;
                        setStops((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, address: val } : item
                          )
                        );
                      }}
                      className="w-full text-xs border border-[#DFE5EF] rounded-[6px] px-2.5 py-2 bg-white"
                    />
                  </div>
                  <div className="sm:col-span-1 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setStops((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="p-2 text-[#FA896B] hover:bg-[#FDEDE8] rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#5A6A85] block mb-1">
                    Punto Corporativo Destino (SV)
                  </label>
                  <select
                    value={destinationIndex}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      setDestinationIndex(idx);
                      setDestinationAddress(EL_SALVADOR_LOCATIONS[idx].address);
                    }}
                    className="w-full text-xs border border-[#DFE5EF] rounded-[6px] px-3 py-2.5 bg-white"
                  >
                    {EL_SALVADOR_LOCATIONS.map((loc, i) => (
                      <option key={i} value={i}>
                        {loc.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#5A6A85] block mb-1">
                    Dirección Exacta de Destino *
                  </label>
                  <input
                    type="text"
                    value={destinationAddress}
                    onChange={(e) => setDestinationAddress(e.target.value)}
                    className="w-full text-xs border border-[#DFE5EF] rounded-[6px] px-3 py-2.5"
                    required
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-[#E5EAEF] grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                <label className="flex items-center space-x-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={roundTrip}
                    onChange={(e) => setRoundTrip(e.target.checked)}
                    className="rounded text-[#5D87FF]"
                  />
                  <span>Viaje Ida y Vuelta (2x km)</span>
                </label>

                <label className="flex items-center space-x-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!isImmediate}
                    onChange={(e) => setIsImmediate(!e.target.checked)}
                    className="rounded text-[#5D87FF]"
                  />
                  <span>Programar Fecha/Hora</span>
                </label>

                {!isImmediate && (
                  <input
                    type="datetime-local"
                    value={scheduledDateTime}
                    onChange={(e) => setScheduledDateTime(e.target.value)}
                    className="text-xs border border-[#DFE5EF] rounded-[6px] px-2.5 py-2"
                  />
                )}
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
                      {effectiveRate.toFixed(2)}/km · Mín.{" "}
                      {effectiveMinDistance} km
                    </option>
                    <option
                      value="pickup"
                      disabled={!allowedCategories.includes("pickup")}
                    >
                      Pick-up Doble Cabina (Máx. 4 pax) — Tarifa negociada $
                      {effectiveRate.toFixed(2)}/km · Mín.{" "}
                      {effectiveMinDistance} km
                    </option>
                    <option value="microbus">
                      Microbús Corporativo (Máx. 12 pax) — Tarifa negociada $
                      {effectiveRate.toFixed(2)}/km · Mín.{" "}
                      {effectiveMinDistance} km
                    </option>
                  </select>
                </div>
              </div>

              {passengersCount > MAX_VEHICLE_PASSENGER_CAPACITY && (
                <div className="p-4 bg-[#FDEDE8] border border-[#FA896B] text-[#B91C1C] rounded-[7px] text-xs space-y-1.5">
                  <div className="flex items-center space-x-2 font-bold text-sm">
                    <PhoneCall className="w-4 h-4 shrink-0" />
                    <span>
                      {isEn
                        ? `Capacity Exceeded (${passengersCount} passengers > max ${MAX_VEHICLE_PASSENGER_CAPACITY}) — Please Contact Lilo`
                        : `Capacidad Máxima Excedida (${passengersCount} pasajeros > límite de ${MAX_VEHICLE_PASSENGER_CAPACITY}) — Comunícate con Lilo`}
                    </span>
                  </div>
                  <p className="leading-relaxed">
                    {isEn
                      ? `When the requested passenger capacity exceeds our maximum single-vehicle limit (${MAX_VEHICLE_PASSENGER_CAPACITY} passengers), please contact Lilo directly to coordinate your transfer:`
                      : `Cuando la capacidad solicitada excede el límite máximo de los vehículos (${MAX_VEHICLE_PASSENGER_CAPACITY} pasajeros), por favor comunícate directamente con Lilo para coordinar tu pedido:`}{" "}
                    <strong>WhatsApp {LILO_DIRECT_CONTACT.whatsapp}</strong> ·{" "}
                    <strong>Tel. {LILO_DIRECT_CONTACT.phone}</strong> ·{" "}
                    <strong>{LILO_DIRECT_CONTACT.email}</strong>
                  </p>
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
                        Tarifa negociada B2B:
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

