"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { ref as rtdbRef, onValue as onRtdbValue } from "firebase/database";
import {
  cancelCompanyReservationCallable,
  cancelScheduledTripCallable,
  listCompanyTripsCallable,
  getCompanyPeriodSummaryCallable,
  GetCompanyPeriodSummaryResponse,
  listCostCentresCallable,
  updateCostCentreCallable,
  listTravellersCallable,
  createTravellerCallable,
  updateTravellerCallable,
  TravellerRow,
  listCompanyRatesCallable,
  CompanyRateRow,
  listTripEventsCallable,
  TripEventRow,
  reportTripIncidentCallable,
  listTripIncidentsCallable,
  TripIncidentRow,
  IncidentType,
  IncidentSeverity,
  listCompanyScheduledTripsCallable,
  CompanyScheduledTripRow,
  requestCostCentreCallable,
  listCostCentreRequestsCallable,
  CostCentreRequestRow,
  createCompanyUserCallable,
  updateCompanyUserCallable,
  resolveCompanyRoleId,
  CompanyUserRow,
  db,
  rtdb,
} from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { B2BRequestStatus, B2BServiceRequest, CostCenter } from "@/types/b2b";
import GoogleTripTrackingMap from "@/components/maps/GoogleTripTrackingMap";
import { formatFriendlyError } from "@/lib/friendlyError";
import {
  mapRawTripStatus,
  getLifecycleStepIndex,
  LIFECYCLE_STEPS,
} from "@/lib/tripStatus";
import {
  Wallet,
  Phone,
  Mail,
  MapPin,
  LogOut,
  FileText,
  AlertCircle,
  Plus,
  CreditCard,
  Building,
  Clock,
  CheckCircle2,
  Car,
  Navigation,
  Eye,
  XCircle,
  Package,
  Globe,
  Lock,
  ShieldCheck,
  Users,
  UserPlus,
  Shield,
  UserCheck,
  UserX,
} from "lucide-react";
import toast from "react-hot-toast";

const STATUS_LABELS: Record<
  B2BRequestStatus,
  { label: string; bg: string; text: string }
> = {
  requested: {
    label: "Solicitada",
    bg: "bg-[#FEF5E5]",
    text: "text-[#FFAE1F]",
  },
  seeking_driver: {
    label: "Buscando Conductor",
    bg: "bg-[#FEF5E5]",
    text: "text-[#D97706]",
  },
  confirmed: {
    label: "Confirmada",
    bg: "bg-[#E8F7FF]",
    text: "text-[#49BEFF]",
  },
  assigned: {
    label: "Conductor Asignado",
    bg: "bg-[#ECF2FF]",
    text: "text-[#5D87FF]",
  },
  enRoute: {
    label: "En Camino al Origen",
    bg: "bg-[#ECF2FF]",
    text: "text-[#5D87FF]",
  },
  driverArrived: {
    label: "Conductor en Punto",
    bg: "bg-[#E8F7FF]",
    text: "text-[#2563EB]",
  },
  inService: {
    label: "En Curso (Viajando)",
    bg: "bg-[#E8F7FF]",
    text: "text-[#0284C7]",
  },
  arrived: {
    label: "Llegada a Destino",
    bg: "bg-[#E6FFFA]",
    text: "text-[#0D9488]",
  },
  completed: {
    label: "Completado",
    bg: "bg-[#E6FFFA]",
    text: "text-[#13DEB9]",
  },
  invoiced: {
    label: "Facturado",
    bg: "bg-[#E6FFFA]",
    text: "text-[#13DEB9]",
  },
  cancelled: {
    label: "Cancelado",
    bg: "bg-[#FDEDE8]",
    text: "text-[#FA896B]",
  },
  rejected: {
    label: "Rechazado",
    bg: "bg-[#FDEDE8]",
    text: "text-[#FA896B]",
  },
};

export default function CorporatePortalPage() {
  const router = useRouter();
  const {
    user,
    company,
    companyRole,
    setCompanyRole,
    mustChangePassword,
    completeMandatoryPasswordChange,
    loading,
    signOut,
  } = useAuth();
  const { isEn, toggleLang } = useLanguage();
  const isCompanyAdmin = companyRole === "company_admin";

  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const [rawRequests, setRawRequests] = useState<B2BServiceRequest[]>([]);
  const [companyTrips, setCompanyTrips] = useState<any[]>([]);
  const [vehiclesMap, setVehiclesMap] = useState<Record<string, any>>({});

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [editingLimitMap, setEditingLimitMap] = useState<Record<string, string>>(
    {}
  );
  const [savingLimitId, setSavingLimitId] = useState<string | null>(null);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [selectedRequest, setSelectedRequest] =
    useState<B2BServiceRequest | null>(null);
  const [periodFilter, setPeriodFilter] = useState<"week" | "month" | "all">(
    "month"
  );

  // Hito 3 Callables State (CF-33, CF-45, CF-47, CF-61, CF-62, CF-63)
  const [periodSummary, setPeriodSummary] =
    useState<GetCompanyPeriodSummaryResponse | null>(null);
  const [companyRates, setCompanyRates] = useState<CompanyRateRow[]>([]);
  const [travellersList, setTravellersList] = useState<TravellerRow[]>([]);
  const [newTravName, setNewTravName] = useState("");
  const [newTravPhone, setNewTravPhone] = useState("+503 ");
  const [newTravDoc, setNewTravDoc] = useState("");
  const [newTravEmail, setNewTravEmail] = useState("");
  const [creatingTraveller, setCreatingTraveller] = useState(false);

  const [tripEvents, setTripEvents] = useState<TripEventRow[]>([]);
  const [tripIncidents, setTripIncidents] = useState<TripIncidentRow[]>([]);
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [incidentType, setIncidentType] = useState<IncidentType>("other");
  const [incidentSeverity, setIncidentSeverity] =
    useState<IncidentSeverity>("medium");
  const [incidentDesc, setIncidentDesc] = useState("");
  const [reportingIncident, setReportingIncident] = useState(false);

  // CF-75 y CF-84: Reservas oficiales de empresa y Solicitudes de centros de costo
  const [scheduledTrips, setScheduledTrips] = useState<CompanyScheduledTripRow[]>([]);
  const [costCentreRequests, setCostCentreRequests] = useState<CostCentreRequestRow[]>([]);
  const [showRequestCCModal, setShowRequestCCModal] = useState(false);
  const [proposedCCName, setProposedCCName] = useState("");
  const [proposedCCBudget, setProposedCCBudget] = useState("");
  const [requestingCC, setRequestingCC] = useState(false);

  // CF-39 & CF-44: Gestión de Usuarios Corporativos y Roles
  const [companyUsers, setCompanyUsers] = useState<CompanyUserRow[]>([]);
  const [showInviteUserModal, setShowInviteUserModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteRole, setInviteRole] = useState<"operador" | "company_admin">("operador");
  const [invitingUser, setInvitingUser] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      const timer = setTimeout(() => {
        if (typeof window !== "undefined") {
          router.replace("/login");
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [user, loading, router]);

  const fetchCompanyTripsAndScheduled = async () => {
    if (!user || !company?.id) return;
    try {
      const [schedRes, tripsRes] = await Promise.allSettled([
        listCompanyScheduledTripsCallable({ limit: 50 }),
        listCompanyTripsCallable({ limit: 50 }),
      ]);
      if (
        schedRes.status === "fulfilled" &&
        Array.isArray(schedRes.value.data?.scheduledTrips)
      ) {
        setScheduledTrips(schedRes.value.data.scheduledTrips);
      }
      if (
        tripsRes.status === "fulfilled" &&
        Array.isArray(tripsRes.value.data?.trips)
      ) {
        setCompanyTrips(tripsRes.value.data.trips);
      }
    } catch {
      // Silencio en polling
    } finally {
      setLoadingRequests(false);
    }
  };

  const reloadAdminData = async () => {
    if (!user || !company?.id) return;
    void fetchCompanyTripsAndScheduled();
    if (!isCompanyAdmin) return;
    try {
      const [summaryRes, ratesRes, ccRes, travRes, schedRes, ccReqRes] = await Promise.allSettled([
        getCompanyPeriodSummaryCallable(),
        listCompanyRatesCallable(),
        listCostCentresCallable(),
        listTravellersCallable(),
        listCompanyScheduledTripsCallable({ limit: 50 }),
        listCostCentreRequestsCallable(),
      ]);
      if (summaryRes.status === "fulfilled" && summaryRes.value.data) {
        setPeriodSummary(summaryRes.value.data);
      }
      if (ratesRes.status === "fulfilled" && Array.isArray(ratesRes.value.data?.rates)) {
        setCompanyRates(ratesRes.value.data.rates);
      }
      if (ccRes.status === "fulfilled" && Array.isArray(ccRes.value.data?.costCentres)) {
        setCostCenters(
          ccRes.value.data.costCentres.map((c) => ({
            id: c.costCentreId,
            name: c.name,
            department: c.name,
            budgetLimit: c.budgetLimit ?? null,
            spent: c.spent ?? 0,
            reserved: c.reserved ?? 0,
            status: c.active ? "active" : "inactive",
          }))
        );
      }
      if (travRes.status === "fulfilled" && Array.isArray(travRes.value.data?.travellers)) {
        setTravellersList(travRes.value.data.travellers);
      }
      if (schedRes.status === "fulfilled" && Array.isArray(schedRes.value.data?.scheduledTrips)) {
        setScheduledTrips(schedRes.value.data.scheduledTrips);
      }
      if (ccReqRes.status === "fulfilled" && Array.isArray(ccReqRes.value.data?.requests)) {
        setCostCentreRequests(ccReqRes.value.data.requests);
      }
    } catch {
      // Fallback a onSnapshot
    }
  };

  useEffect(() => {
    reloadAdminData();
    const refresh = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void fetchCompanyTripsAndScheduled();
    };
    const timer = setInterval(refresh, 10000);
    const onFocus = () => void fetchCompanyTripsAndScheduled();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchCompanyTripsAndScheduled();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user, company?.id, isCompanyAdmin]);

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
      }
    );
    return () => unsubCC();
  }, [company?.id, company?.countryId]);

  useEffect(() => {
    if (!company?.id) return;
    const cacheKey = `lilo_company_users_${company.id}`;
    let initialList: CompanyUserRow[] = [];
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) initialList = JSON.parse(cached);
    } catch {}

    if (user?.email) {
      const currentIdx = initialList.findIndex(
        (u) => u.email.toLowerCase() === user.email?.toLowerCase()
      );
      const currentUserRow: CompanyUserRow = {
        uid: user.uid,
        email: user.email,
        firstName: company.contactName || "Administrador",
        companyRole: companyRole === "operator" ? "operador" : "company_admin",
        isActive: true,
      };
      if (currentIdx === -1) {
        initialList = [currentUserRow, ...initialList];
      } else {
        initialList[currentIdx] = { ...initialList[currentIdx], ...currentUserRow };
      }
    }
    setCompanyUsers(initialList);

    getDocs(query(collection(db, "users"), where("companyId", "==", company.id)))
      .then((snap) => {
        if (!snap.empty) {
          const fetched: CompanyUserRow[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              uid: d.id,
              email: data.email || "",
              firstName: data.firstName,
              lastName: data.lastName,
              companyRole:
                data.companyRole === "company_admin" ? "company_admin" : "operador",
              isActive: data.isActive !== false,
              createdAt: data.createdAt,
            };
          });
          setCompanyUsers(fetched);
          try {
            localStorage.setItem(cacheKey, JSON.stringify(fetched));
          } catch {}
        }
      })
      .catch((err) => {
        console.warn("[companyUsers] Consulta users no accesible:", err);
      });
  }, [company?.id, company?.contactName, user?.email, user?.uid, companyRole]);

  useEffect(() => {
    if (!user || !company?.id) {
      if (!loading) setLoadingRequests(false);
      return;
    }
    const q = query(
      collection(db, "b2bRequests"),
      where("companyId", "==", company.id)
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() } as B2BServiceRequest)
        );
        setRawRequests(list);
        setLoadingRequests(false);
      },
      (err) => {
        console.warn("[PortalB2B] Error subscribing to b2bRequests:", err?.message || err);
        setLoadingRequests(false);
      }
    );

    return () => unsubscribe();
  }, [user, company?.id, loading]);

  const mappedScheduledRequests = useMemo<B2BServiceRequest[]>(() => {
    return scheduledTrips.map((st) => {
      const liveTrip = companyTrips.find(
        (t) =>
          t.scheduledTripId === st.scheduledTripId ||
          ((st as any).dispatchedTripId && t.tripId === (st as any).dispatchedTripId) ||
          t.tripId === st.scheduledTripId ||
          t.tripId === (st as any).id
      );
      const effectiveRawStatus = liveTrip?.status || st.status;
      const mappedStatus = mapRawTripStatus(effectiveRawStatus);

      const effectiveTripId =
        liveTrip?.tripId ||
        (st as any).dispatchedTripId ||
        st.scheduledTripId;

      const vehId = st.acceptedVehicleId;
      const veh = vehId ? vehiclesMap[vehId] : undefined;
      const cc = costCenters.find(
        (c) => c.id === (st as any).costCentreId || c.id === (st as any).costCenterId
      );
      const trav = travellersList.find((t) => t.travellerId === st.travellerId);

      const isSeeking =
        mappedStatus === "seeking_driver" || mappedStatus === "requested";
      const driverId = isSeeking
        ? undefined
        : liveTrip?.driverId || (st as any).driverId || veh?.driverId || undefined;
      const driverName = isSeeking
        ? undefined
        : veh?.driverName || (st as any).driverName || undefined;
      const driverPhone = isSeeking
        ? undefined
        : veh?.driverPhone || (st as any).driverPhone || undefined;
      const vehiclePlate = isSeeking
        ? undefined
        : veh?.plate || (st as any).vehiclePlate || undefined;

      const rawCat = String(st.categoryId || "suv").toLowerCase();
      let vehicleCategory: "suv" | "pickup" | "microbus" = "suv";
      if (
        rawCat.includes("microbus") ||
        rawCat.includes("minibus") ||
        rawCat.includes("furgon") ||
        rawCat.includes("coaster") ||
        rawCat.includes("van-minivan")
      ) {
        vehicleCategory = "microbus";
      } else if (rawCat.includes("pickup")) {
        vehicleCategory = "pickup";
      }

      return {
        id: st.scheduledTripId,
        tripId: effectiveTripId,
        scheduledTripId: st.scheduledTripId,
        folio:
          (st as any).folio ||
          `B2B-SV-${st.scheduledTripId.slice(0, 6).toUpperCase()}`,
        countryId: "sv",
        companyId: company?.id || "",
        companyName: company?.tradeName || company?.legalName || "Empresa B2B",
        costCenterId: (st as any).costCentreId || cc?.id || "",
        costCenterName:
          (st as any).costCentreName || cc?.name || "General",
        requestedByUid: user?.uid || "",
        requestedByName: company?.contactName || "Coordinador Corporativo",
        travellerId: st.travellerId || "",
        travellerName:
          (st as any).travellerName ||
          trav?.name ||
          (st.travellerId ? "Viajero Corporativo" : ""),
        passengersCount:
          (st as any).passengerCount || (vehicleCategory === "microbus" ? 8 : 1),
        passengerNames: trav?.name ? [trav.name] : [],
        passengerPhone: trav?.phone || "",
        vehicleCategory: vehicleCategory as any,
        hasCargo: Boolean((st as any).hasCargo),
        origin: {
          address: st.originAddress,
          lat: 13.7086,
          lng: -89.2408,
        },
        stops: [],
        destination: {
          address: st.destinationAddress,
          lat: 13.7,
          lng: -89.23,
        },
        roundTrip: false,
        legs: [
          {
            distance: Number((st as any).chargedDistance || 15),
            durationMinutes: 25,
          },
        ],
        scheduledAt: st.scheduledPickupAt,
        createdAt: (st as any).createdAt || undefined,
        isImmediate: false,
        estimatedDistanceKm: Number((st as any).chargedDistance || 15),
        estimatedDurationMinutes: 25,
        tariffApplied: {
          category: (st.categoryId as any) || "suv",
          ratePerKm: 0.67,
          minFare: 13.56,
          baseDistanceKm: 20,
          calculatedAmount: st.totalAmount,
        },
        finalAmount: st.totalAmount,
        assignedDriverId: driverId,
        assignedDriverName: driverName,
        assignedDriverPhone: driverPhone,
        assignedVehicleId: isSeeking ? undefined : vehId,
        assignedVehiclePlate: vehiclePlate,
        status: mappedStatus,
        notes: (liveTrip as any)?.notes,
      } as B2BServiceRequest;
    });
  }, [
    scheduledTrips,
    companyTrips,
    vehiclesMap,
    costCenters,
    travellersList,
    company?.id,
    company?.tradeName,
    company?.legalName,
    company?.contactName,
    user?.uid,
  ]);

  const requests = useMemo<B2BServiceRequest[]>(() => {
    const list: B2BServiceRequest[] = rawRequests.map((r) => {
      const resolvedStatus = mapRawTripStatus(r.status);
      const isSeeking =
        resolvedStatus === "seeking_driver" || resolvedStatus === "requested";
      const vehId = r.assignedVehicleId;
      const veh = vehId ? vehiclesMap[vehId] : undefined;

      return {
        ...r,
        status: resolvedStatus,
        assignedDriverId: isSeeking ? undefined : r.assignedDriverId ?? veh?.driverId,
        assignedDriverName: isSeeking ? undefined : r.assignedDriverName ?? veh?.driverName,
        assignedDriverPhone: isSeeking ? undefined : r.assignedDriverPhone ?? veh?.driverPhone,
        assignedVehicleId: isSeeking ? undefined : vehId,
        assignedVehiclePlate: isSeeking ? undefined : r.assignedVehiclePlate ?? veh?.plate,
        notes: r.notes,
      };
    });

    for (const sReq of mappedScheduledRequests) {
      const existingIdx = list.findIndex(
        (r) =>
          r.id === sReq.id ||
          (r as any).scheduledTripId === sReq.id ||
          r.tripId === sReq.id
      );

      const resolvedStatus = sReq.status;
      const isSeeking =
        resolvedStatus === "seeking_driver" || resolvedStatus === "requested";

      if (existingIdx >= 0) {
        list[existingIdx] = {
          ...list[existingIdx],
          ...sReq,
          status: resolvedStatus,
          assignedDriverId: isSeeking
            ? undefined
            : sReq.assignedDriverId ?? list[existingIdx].assignedDriverId,
          assignedDriverName: isSeeking
            ? undefined
            : sReq.assignedDriverName ?? list[existingIdx].assignedDriverName,
          assignedDriverPhone: isSeeking
            ? undefined
            : sReq.assignedDriverPhone ?? list[existingIdx].assignedDriverPhone,
          assignedVehicleId: isSeeking
            ? undefined
            : sReq.assignedVehicleId ?? list[existingIdx].assignedVehicleId,
          assignedVehiclePlate: isSeeking
            ? undefined
            : sReq.assignedVehiclePlate ?? list[existingIdx].assignedVehiclePlate,
        };
      } else {
        list.push({
          ...sReq,
          status: resolvedStatus,
        });
      }
    }

    const getCreatedTimestamp = (req: B2BServiceRequest): number => {
      const c = req.createdAt as any;
      if (typeof c === "number" && c > 0) return c;
      if (typeof c?.toMillis === "function") return c.toMillis();
      if (typeof c?.seconds === "number") return c.seconds * 1000;
      if (typeof c === "string") {
        const parsed = Date.parse(c);
        if (!isNaN(parsed)) return parsed;
      }
      return Date.parse(String(req.scheduledAt || "")) || 0;
    };

    list.sort((a, b) => getCreatedTimestamp(b) - getCreatedTimestamp(a));

    return list;
  }, [rawRequests, mappedScheduledRequests, vehiclesMap]);

  // Mantener sincronizada la solicitud abierta en el modal de monitoreo en vivo
  const liveSelectedRequest = useMemo(() => {
    if (!selectedRequest) return null;
    return (
      requests.find(
        (r) =>
          r.id === selectedRequest.id ||
          r.tripId === selectedRequest.id ||
          (r as any).scheduledTripId === selectedRequest.id
      ) || selectedRequest
    );
  }, [requests, selectedRequest]);

  // Telemetría GPS en tiempo real desde Firebase Realtime Database (RTDB)
  const [driverTelemetry, setDriverTelemetry] = useState<{
    lat?: number;
    lng?: number;
    driverName?: string;
    speed?: number;
    heading?: number;
    updatedAt?: number;
    status?: string;
  } | null>(null);

  useEffect(() => {
    const driverId = liveSelectedRequest?.assignedDriverId;
    if (!driverId) {
      setDriverTelemetry(null);
      return;
    }

    let lastSig: string | null = null;
    const driverLocationRef = rtdbRef(rtdb, `conductores_activos/${driverId}`);
    const unsubscribeRtdb = onRtdbValue(
      driverLocationRef,
      (snapshot) => {
        const val = snapshot.val();
        if (val && typeof val === "object") {
          setDriverTelemetry({
            lat: typeof val.lat === "number" ? val.lat : val.latitude,
            lng: typeof val.lng === "number" ? val.lng : val.longitude,
            driverName: val.driverName || val.name,
            speed: typeof val.speed === "number" ? val.speed : undefined,
            heading:
              typeof val.bearing === "number"
                ? val.bearing
                : typeof val.heading === "number"
                ? val.heading
                : undefined,
            updatedAt: val.updatedAt || val.timestamp || Date.now(),
            status: val.status,
          });
          const nextSig = `${val.status || ""}:${val.currentRideId || ""}:${val.lastStatusUpdate || ""}`;
          if (lastSig !== null && lastSig !== nextSig) {
            void fetchCompanyTripsAndScheduled();
          }
          lastSig = nextSig;
        } else {
          setDriverTelemetry(null);
        }
      },
      (err) => {
        console.warn("[PortalB2B RTDB] Error en telemetría de conductor:", err);
      }
    );

    return () => unsubscribeRtdb();
  }, [liveSelectedRequest?.assignedDriverId]);

  const activeAssignedDriverIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const r of requests) {
      if (
        r.assignedDriverId &&
        r.status !== "completed" &&
        r.status !== "cancelled"
      ) {
        ids.add(r.assignedDriverId);
      }
    }
    return Array.from(ids).sort().join(",");
  }, [requests]);

  // Escucha cambios en conductores_activos/{driverId} (regla RTDB 9731da6: auth != null)
  // para refrescar la tabla corporativa al instante cuando el conductor cambia de estado.
  useEffect(() => {
    if (!user || !company?.id || !activeAssignedDriverIdsKey) return;
    const driverIds = activeAssignedDriverIdsKey.split(",").filter(Boolean);
    const lastSigs = new Map<string, string>();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void fetchCompanyTripsAndScheduled();
      }, 250);
    };

    const unsubscribers = driverIds.map((driverId) =>
      onRtdbValue(
        rtdbRef(rtdb, `conductores_activos/${driverId}`),
        (snapshot) => {
          const val = snapshot.val();
          const nextSig =
            val && typeof val === "object"
              ? `${val.status || ""}:${val.currentRideId || ""}:${val.lastStatusUpdate || ""}`
              : "__empty__";
          const prevSig = lastSigs.get(driverId);
          lastSigs.set(driverId, nextSig);
          if (prevSig !== undefined && prevSig !== nextSig) {
            scheduleRefresh();
          }
        },
        (err) => {
          console.warn(`[PortalB2B RTDB] Listener conductor ${driverId}:`, err);
        }
      )
    );

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [user?.uid, company?.id, activeAssignedDriverIdsKey]);

  const filteredRequests = useMemo(() => {
    const now = Date.now();
    const cutoff =
      periodFilter === "week"
        ? 7 * 24 * 60 * 60 * 1000
        : periodFilter === "month"
        ? 30 * 24 * 60 * 60 * 1000
        : Infinity;
    const q = searchTerm.trim().toLowerCase();

    return requests.filter((r) => {
      if (cutoff !== Infinity) {
        const ts =
          (r.createdAt as any)?.toMillis?.() ||
          ((r.createdAt as any)?.seconds
            ? (r.createdAt as any).seconds * 1000
            : Date.parse(String(r.scheduledAt || "")) || now);
        if (now - ts > cutoff) return false;
      }
      if (statusFilter !== "all" && r.status !== statusFilter) {
        return false;
      }
      if (q) {
        const matchesSearch =
          (r.folio || "").toLowerCase().includes(q) ||
          (r.costCenterName || "").toLowerCase().includes(q) ||
          (r.travellerName || "").toLowerCase().includes(q) ||
          (r.origin?.address || "").toLowerCase().includes(q) ||
          (r.destination?.address || "").toLowerCase().includes(q) ||
          (r.assignedDriverName || "").toLowerCase().includes(q) ||
          (r.assignedVehiclePlate || "").toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      return true;
    });
  }, [requests, periodFilter, statusFilter, searchTerm]);

  const kpis = useMemo(() => {
    const activeStatuses = [
      "requested",
      "seeking_driver",
      "confirmed",
      "assigned",
      "enRoute",
      "driverArrived",
      "inService",
      "arrived",
    ];
    const inProgress = filteredRequests.filter((r) =>
      activeStatuses.includes(r.status)
    ).length;

    const completed = filteredRequests.filter(
      (r) => r.status === "completed" || r.status === "invoiced"
    ).length;

    const billable = filteredRequests.filter(
      (r) => r.status !== "cancelled" && r.status !== "rejected"
    );

    const totalSpend = billable.reduce(
      (acc, r) =>
        acc + Number(r.finalAmount ?? r.tariffApplied?.calculatedAmount ?? 0),
      0
    );

    const totalKm = billable.reduce(
      (acc, r) => acc + Number(r.estimatedDistanceKm || 0),
      0
    );

    return {
      inProgress,
      completed,
      totalSpend,
      totalKm: Number(totalKm.toFixed(1)),
    };
  }, [filteredRequests]);

  const getRequestBadge = (req: {
    id: string;
    tripId?: string;
    scheduledTripId?: string;
    status: B2BRequestStatus;
    interruptionReason?: string;
    notes?: string;
  }) => {
    const base = STATUS_LABELS[req.status] || STATUS_LABELS.requested;
    if (req.status !== "seeking_driver") return base;
    const isReassigning =
      Boolean(req.interruptionReason) ||
      Boolean(req.notes);
    return isReassigning
      ? { ...base, label: "Reasignando Conductor" }
      : { ...base, label: "Buscando Conductor" };
  };

  const isSelectedPoolWaiting = Boolean(
    liveSelectedRequest &&
      !liveSelectedRequest.assignedDriverId &&
      !(liveSelectedRequest as any)?.tripId &&
      (liveSelectedRequest.status === "requested" ||
        (liveSelectedRequest.status === "seeking_driver" &&
          !(liveSelectedRequest as any)?.interruptionReason &&
          !(liveSelectedRequest as any)?.notes))
  );

  useEffect(() => {
    const targetTripId =
      liveSelectedRequest?.tripId ||
      (liveSelectedRequest as any)?.scheduledTripId ||
      liveSelectedRequest?.id;

    if (!targetTripId || !user || isSelectedPoolWaiting) {
      setTripEvents([]);
      setTripIncidents([]);
      return;
    }
    const fetchEventsAndIncidents = () => {
      listTripEventsCallable({ tripId: targetTripId, limit: 25 })
        .then((res) => setTripEvents(res.data?.events || []))
        .catch(() => {});

      listTripIncidentsCallable({ tripId: targetTripId, limit: 20 })
        .then((res) => setTripIncidents(res.data?.incidents || []))
        .catch(() => {});
    };

    fetchEventsAndIncidents();
    const timer = setInterval(fetchEventsAndIncidents, 4000);
    return () => clearInterval(timer);
  }, [
    liveSelectedRequest?.id,
    liveSelectedRequest?.tripId,
    (liveSelectedRequest as any)?.scheduledTripId,
    isSelectedPoolWaiting,
    user,
  ]);

  const handleSaveCostCenterCeiling = async (
    cc: CostCenter,
    newLimit: number | null
  ) => {
    if (!company?.id || !isCompanyAdmin) return;
    setSavingLimitId(cc.id);
    try {
      // CF-46: company_admin solo puede mover budgetLimit vía updateCostCentreCallable (entero > 0 o null)
      const normalizedLimit =
        newLimit === null ? null : Math.max(1, Math.round(newLimit));
      await updateCostCentreCallable({
        costCentreId: cc.id,
        budgetLimit: normalizedLimit,
      });
      toast.success(
        normalizedLimit === null
          ? "Se eliminó el límite de presupuesto (Sin límite)."
          : `Límite de presupuesto actualizado a $${normalizedLimit.toFixed(2)} USD.`
      );
      await reloadAdminData();
    } catch (err: any) {
      console.error("Error actualizando techo de consumo:", err);
      toast.error(
        formatFriendlyError(
          err,
          "No pudimos actualizar el límite de presupuesto en este momento."
        )
      );
    } finally {
      setSavingLimitId(null);
    }
  };

  const handleRequestNewCostCentre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposedCCName.trim()) {
      toast.error("Por favor ingresa el nombre del nuevo departamento.");
      return;
    }
    setRequestingCC(true);
    try {
      const budgetNum =
        proposedCCBudget.trim() === ""
          ? undefined
          : Math.max(1, Math.round(Number(proposedCCBudget)));
      await requestCostCentreCallable({
        proposedName: proposedCCName.trim(),
        proposedBudgetLimit: budgetNum,
      });
      setProposedCCName("");
      setProposedCCBudget("");
      setShowRequestCCModal(false);
      toast.success("Tu solicitud de nuevo departamento fue enviada para aprobación.");
      await reloadAdminData();
    } catch (err: any) {
      toast.error(
        formatFriendlyError(
          err,
          "No pudimos enviar la solicitud del departamento en este momento."
        )
      );
    } finally {
      setRequestingCC(false);
    }
  };

  const handleCreateTraveller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTravName.trim()) {
      toast.error("Por favor ingresa el nombre completo del pasajero.");
      return;
    }
    setCreatingTraveller(true);
    try {
      await createTravellerCallable({
        name: newTravName.trim(),
        phone: newTravPhone.trim() || undefined,
        documentNumber: newTravDoc.trim() || undefined,
        email: newTravEmail.trim() || undefined,
      });
      toast.success("Pasajero corporativo agregado correctamente al directorio.");
      setNewTravName("");
      setNewTravPhone("+503 ");
      setNewTravDoc("");
      setNewTravEmail("");
      await reloadAdminData();
    } catch (err: any) {
      toast.error(
        formatFriendlyError(
          err,
          "No pudimos registrar al pasajero. Verifica los datos e intenta de nuevo."
        )
      );
    } finally {
      setCreatingTraveller(false);
    }
  };

  const handleToggleTravellerActive = async (trav: TravellerRow) => {
    try {
      await updateTravellerCallable({
        travellerId: trav.travellerId,
        active: !trav.active,
      });
      toast.success(
        !trav.active
          ? "El pasajero ha sido reactivado en el directorio."
          : "El pasajero ha sido marcado como inactivo."
      );
      await reloadAdminData();
    } catch (err: any) {
      toast.error(
        formatFriendlyError(err, "No pudimos actualizar el estado del pasajero.")
      );
    }
  };

  // CF-39 & CF-44: Handlers de Colaboradores Corporativos
  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteEmail.includes("@")) {
      toast.error("Por favor ingresa un correo electrónico válido.");
      return;
    }
    if (!company?.id) {
      toast.error("No pudimos identificar tu empresa. Recarga la página e intenta de nuevo.");
      return;
    }
    setInvitingUser(true);
    try {
      const roleId = await resolveCompanyRoleId(inviteRole);
      const normalizedEmail = inviteEmail.trim().toLowerCase();
      const res = await createCompanyUserCallable({
        email: normalizedEmail,
        roleId,
        firstName: inviteFirstName.trim() || undefined,
        lastName: inviteLastName.trim() || undefined,
        companyId: company.id,
      });

      const newUser: CompanyUserRow = {
        uid: res.data?.uid || `user-${Date.now()}`,
        email: normalizedEmail,
        firstName: inviteFirstName.trim() || undefined,
        lastName: inviteLastName.trim() || undefined,
        companyRole: inviteRole,
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      setCompanyUsers((prev) => {
        const updated = [
          newUser,
          ...prev.filter((u) => u.email.toLowerCase() !== normalizedEmail),
        ];
        try {
          localStorage.setItem(
            `lilo_company_users_${company.id}`,
            JSON.stringify(updated)
          );
        } catch {}
        return updated;
      });

      toast.success(
        `Invitación enviada a ${normalizedEmail}. Recibirá un correo para crear su contraseña.`
      );
      setInviteEmail("");
      setInviteFirstName("");
      setInviteLastName("");
      setInviteRole("operador");
      setShowInviteUserModal(false);
    } catch (err: any) {
      console.error("[handleInviteUser] Error:", err);
      toast.error(
        formatFriendlyError(
          err,
          "No pudimos enviar la invitación al colaborador. Verifica su correo e intenta de nuevo."
        )
      );
    } finally {
      setInvitingUser(false);
    }
  };

  const handleToggleUserActive = async (targetUser: CompanyUserRow) => {
    if (!company?.id) return;
    setUpdatingUserId(targetUser.uid);
    try {
      const newStatus = !targetUser.isActive;
      await updateCompanyUserCallable({
        userId: targetUser.uid,
        isActive: newStatus,
      });
      setCompanyUsers((prev) => {
        const updated = prev.map((u) =>
          u.uid === targetUser.uid ? { ...u, isActive: newStatus } : u
        );
        try {
          localStorage.setItem(
            `lilo_company_users_${company.id}`,
            JSON.stringify(updated)
          );
        } catch {}
        return updated;
      });
      toast.success(
        newStatus
          ? "La cuenta del colaborador fue reactivada."
          : "La cuenta del colaborador fue desactivada."
      );
    } catch (err: any) {
      toast.error(
        formatFriendlyError(err, "No pudimos cambiar el estado del colaborador.")
      );
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleChangeUserRole = async (
    targetUser: CompanyUserRow,
    newRole: "company_admin" | "operador"
  ) => {
    if (!company?.id || targetUser.companyRole === newRole) return;
    setUpdatingUserId(targetUser.uid);
    try {
      const roleId = await resolveCompanyRoleId(newRole);
      await updateCompanyUserCallable({
        userId: targetUser.uid,
        roleId,
      });
      setCompanyUsers((prev) => {
        const updated = prev.map((u) =>
          u.uid === targetUser.uid ? { ...u, companyRole: newRole } : u
        );
        try {
          localStorage.setItem(
            `lilo_company_users_${company.id}`,
            JSON.stringify(updated)
          );
        } catch {}
        return updated;
      });
      toast.success(
        `El permiso del colaborador cambió a ${
          newRole === "company_admin" ? "Administrador de Empresa" : "Operador"
        }.`
      );
    } catch (err: any) {
      toast.error(
        formatFriendlyError(err, "No pudimos actualizar el permiso del colaborador.")
      );
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleReportIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetTripId =
      liveSelectedRequest?.tripId ||
      (liveSelectedRequest as any)?.scheduledTripId;
    if (!targetTripId) {
      toast.error(
        "Este traslado aún se está procesando. Intenta reportar el inconveniente en unos segundos."
      );
      return;
    }
    if (!incidentDesc.trim()) {
      toast.error("Por favor escribe una breve descripción de lo ocurrido.");
      return;
    }
    setReportingIncident(true);
    try {
      await reportTripIncidentCallable({
        tripId: targetTripId,
        type: incidentType,
        severity: incidentSeverity,
        description: incidentDesc.trim(),
      });
      toast.success("Tu reporte fue enviado al equipo de operaciones de Lilo.");
      setIncidentDesc("");
      setShowIncidentForm(false);
      const incRes = await listTripIncidentsCallable({
        tripId: targetTripId,
        limit: 20,
      });
      setTripIncidents(incRes.data?.incidents || []);
    } catch (err: any) {
      toast.error(
        formatFriendlyError(err, "No pudimos enviar tu reporte en este momento.")
      );
    } finally {
      setReportingIncident(false);
    }
  };

  const handleCancelRequest = async (reqId: string) => {
    if (!window.confirm("¿Deseas cancelar esta solicitud de traslado?")) return;
    try {
      const target = requests.find((r) => r.id === reqId);
      const schedId = (target as any)?.scheduledTripId || target?.tripId;
      const isDispatched = Boolean(target?.tripId && target.tripId !== schedId);

      if (isDispatched || target?.isImmediate) {
        const liveTripId = target?.tripId || schedId || reqId;
        await cancelCompanyReservationCallable({ tripId: liveTripId });
      } else if (schedId) {
        await cancelScheduledTripCallable({ scheduledTripId: schedId });
      }
      toast.success("Tu traslado fue cancelado y el saldo ha sido liberado.");
      setSelectedRequest(null);
      await reloadAdminData();
    } catch (err: any) {
      console.error("Error cancelando solicitud:", err);
      toast.error(
        formatFriendlyError(err, "No fue posible cancelar el traslado en este momento.")
      );
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F2F6FA]">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-9 h-9 border-3 border-[#5D87FF] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-[#5A6A85] font-medium">
            Cargando portal corporativo...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F2F6FA]">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-2 border-[#5D87FF] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-[#5A6A85] font-medium">
            Redirigiendo a inicio de sesión...
          </p>
        </div>
      </div>
    );
  }

  const handleMandatoryPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPasswordInput.length < 8) {
      toast.error("La contraseña corporativa debe tener al menos 8 caracteres.");
      return;
    }
    if (newPasswordInput !== confirmPasswordInput) {
      toast.error("Las contraseñas no coinciden.");
      return;
    }
    setUpdatingPassword(true);
    try {
      await completeMandatoryPasswordChange(newPasswordInput);
      toast.success("Contraseña configurada exitosamente. Inicia sesión con tu nueva clave.");
      setNewPasswordInput("");
      setConfirmPasswordInput("");
      router.push("/login");
    } catch (err: any) {
      toast.error(
        formatFriendlyError(
          err,
          "No pudimos actualizar tu contraseña en este momento. Intenta nuevamente."
        )
      );
    } finally {
      setUpdatingPassword(false);
    }
  };

  if (mustChangePassword) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-[#F2F6FA] p-4 font-sans">
        <div className="w-full max-w-[460px] modern-card p-8 bg-white space-y-5">
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-[#ECF2FF] text-[#5D87FF] flex items-center justify-center mb-3">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-[#2A3547]">
              Configura tu Contraseña Corporativa
            </h1>
            <p className="text-xs text-[#5A6A85] mt-1">
              Has iniciado sesión con una contraseña temporal asignada a{" "}
              <strong>{company?.tradeName || user.email}</strong>. Por seguridad,
              define tu contraseña definitiva para acceder al Portal B2B.
            </p>
          </div>

          <form onSubmit={handleMandatoryPasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#2A3547] mb-1.5">
                Nueva Contraseña Corporativa (mín. 8 caracteres) *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#7C8FAC] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  name="new-password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  placeholder="Mínimo 8 caracteres"
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 modern-input text-sm text-[#2A3547]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#2A3547] mb-1.5">
                Confirmar Nueva Contraseña *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#7C8FAC] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  name="confirm-password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  placeholder="Repite tu nueva contraseña"
                  value={confirmPasswordInput}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 modern-input text-sm text-[#2A3547]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={updatingPassword}
              className="w-full py-2.5 modern-btn-primary flex items-center justify-center space-x-2 text-sm shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {updatingPassword
                  ? "Guardando contraseña..."
                  : "Guardar Contraseña y Continuar al Portal"}
              </span>
            </button>
          </form>

          <div className="pt-2 border-t border-[#E5EAEF] text-center">
            <button
              type="button"
              onClick={() => signOut()}
              className="text-xs text-[#7C8FAC] hover:text-[#FA896B] font-medium cursor-pointer"
            >
              Cerrar sesión ({user.email})
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F2F6FA] text-[#2A3547] font-sans">
      {/* Top Header */}
      <header className="bg-white border-b border-[#E5EAEF] sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[70px] flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Image
              src="/images/logos/Logo.png"
              alt="Lilo Logo"
              width={140}
              height={50}
              priority
              className="object-contain"
            />
            <div className="hidden sm:block h-6 w-px bg-[#E5EAEF]" />
            <span className="hidden sm:inline-block text-xs font-semibold uppercase tracking-wider text-[#5D87FF] bg-[#ECF2FF] px-2.5 py-1 rounded-[5px]">
              Portal B2B · El Salvador
            </span>
          </div>

          <div className="flex items-center space-x-3">
            {/* Selector Bilingüe ES / EN */}
            <button
              type="button"
              onClick={toggleLang}
              className="text-xs border border-[#DFE5EF] rounded-[6px] px-2.5 py-1.5 bg-white text-[#5D87FF] font-bold flex items-center space-x-1 hover:bg-slate-50 cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{isEn ? "EN 🇺🇸 / ES" : "ES 🇸🇻 / EN"}</span>
            </button>

            {/* Selector de Rol Corporativo (3 roles acordados: Admin, Operador y Analista) */}
            <select
              value={companyRole}
              onChange={(e) =>
                setCompanyRole(e.target.value as "company_admin" | "operator" | "analyst")
              }
              className="text-xs border border-[#DFE5EF] rounded-[6px] px-2.5 py-1.5 bg-[#ECF2FF] text-[#5D87FF] font-bold"
              title="Rol Portal Corporativo"
            >
              <option value="company_admin">
                {isEn ? "Role: Admin" : "Rol: Administrador"}
              </option>
              <option value="operator">
                {isEn ? "Role: Operator (Issue Services)" : "Rol: Operador (Emitir Servicios)"}
              </option>
              <option value="analyst">
                {isEn ? "Role: Analyst (Accounts Payable)" : "Rol: Analista (Cuentas por Pagar)"}
              </option>
            </select>

            <div className="text-right hidden sm:block">
              <span className="text-sm font-semibold text-[#2A3547] block leading-tight">
                {company?.tradeName || "Cliente Corporativo"}
              </span>
              <span className="text-xs text-[#7C8FAC]">{user.email}</span>
            </div>

            <div className="w-10 h-10 rounded-full bg-[#ECF2FF] text-[#5D87FF] font-bold flex items-center justify-center text-sm border border-[#DFE5EF]">
              {(company?.tradeName || user.email || "B")[0].toUpperCase()}
            </div>

            <button
              onClick={() => signOut()}
              className="p-2 text-[#7C8FAC] hover:text-[#FA896B] hover:bg-[#FDEDE8] rounded-[7px] transition ml-1"
              title="Cerrar Sesión"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-6">
        {/* Banner Principal con Acción Directa a Solicitar Traslado (H2.4-FE) */}
        <div className="bg-gradient-to-r from-[#5D87FF] to-[#4570EA] rounded-[7px] p-6 sm:p-7 text-white shadow-[0_0_2px_0_rgba(145,158,171,0.3),0_12px_24px_-4px_rgba(145,158,171,0.12)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <span className="px-2 py-0.5 bg-white/20 rounded-[4px] text-[11px] font-semibold uppercase tracking-wider">
                Cuenta Corporativa El Salvador
              </span>
              {company?.status === "active" && (
                <span className="px-2 py-0.5 bg-[#13DEB9]/30 text-white border border-[#13DEB9]/40 rounded-[4px] text-[11px] font-semibold">
                  Activa
                </span>
              )}
              <span className="px-2 py-0.5 bg-white/20 rounded-[4px] text-[11px] font-semibold">
                {companyRole === "company_admin"
                  ? "Vista: Administrador Financiero"
                  : companyRole === "operator"
                  ? "Vista: Operador (Emisión de Servicios)"
                  : "Vista: Analista (Cuentas por Pagar)"}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {company ? company.tradeName : "Bienvenido a Lilo B2B"}
            </h1>
            <p className="text-white/80 text-xs sm:text-sm mt-1">
              {company?.legalName ||
                "Dashboard corporativo, solicitud de traslados y monitoreo en tiempo real"}
            </p>
          </div>

          <button
            onClick={() => router.push("/solicitudes/nueva")}
            className="px-4 py-2.5 bg-white text-[#5D87FF] hover:bg-slate-50 font-semibold rounded-[7px] text-xs sm:text-sm transition shadow-sm flex items-center space-x-2 shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Solicitar Traslado Corporativo</span>
          </button>
        </div>

        {/* KPIs en Tiempo Real (H2.3-FE / LO-4.2) */}
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 ${
            isCompanyAdmin ? "lg:grid-cols-4" : "lg:grid-cols-3"
          } gap-4`}
        >
          <div className="modern-card p-5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-[#5A6A85] uppercase tracking-wider block">
                Solicitudes en Curso
              </span>
              <span className="text-2xl font-extrabold text-[#FFAE1F] mt-1 block">
                {kpis.inProgress}
              </span>
              <span className="text-xs text-[#7C8FAC]">Monitoreo en vivo</span>
            </div>
            <div className="w-11 h-11 rounded-full bg-[#FEF5E5] text-[#FFAE1F] flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="modern-card p-5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-[#5A6A85] uppercase tracking-wider block">
                Traslados Completados
              </span>
              <span className="text-2xl font-extrabold text-[#13DEB9] mt-1 block">
                {kpis.completed}
              </span>
              <span className="text-xs text-[#7C8FAC]">
                De {filteredRequests.length} registrados
              </span>
            </div>
            <div className="w-11 h-11 rounded-full bg-[#E6FFFA] text-[#13DEB9] flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          {isCompanyAdmin && (
            <div className="modern-card p-5 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-[#5A6A85] uppercase tracking-wider block">
                  Gasto Acumulado (USD)
                </span>
                <span className="text-2xl font-extrabold text-[#5D87FF] mt-1 block">
                  ${kpis.totalSpend.toFixed(2)}
                </span>
                <span className="text-xs text-[#7C8FAC]">
                  Saldo cuenta: ${(company?.balance || 0).toFixed(2)}
                </span>
              </div>
              <div className="w-11 h-11 rounded-full bg-[#ECF2FF] text-[#5D87FF] flex items-center justify-center">
                <Wallet className="w-5 h-5" />
              </div>
            </div>
          )}

          <div className="modern-card p-5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-[#5A6A85] uppercase tracking-wider block">
                Kilómetros Recorridos
              </span>
              <span className="text-2xl font-extrabold text-[#2A3547] mt-1 block">
                {kpis.totalKm} km
              </span>
              <span className="text-xs text-[#7C8FAC]">
                Tarifa oficial El Salvador
              </span>
            </div>
            <div className="w-11 h-11 rounded-full bg-[#E8F7FF] text-[#49BEFF] flex items-center justify-center">
              <Navigation className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Centros de Costo y Techo de Consumo (Solo Administrador de Empresa) */}
        {isCompanyAdmin && costCenters.length > 0 && (
          <div className="modern-card p-6">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E5EAEF]">
              <div>
                <h2 className="text-base font-bold text-[#2A3547]">
                  Centros de Costo y Techo de Consumo
                </h2>
                <p className="text-xs text-[#7C8FAC]">
                  Configura el límite presupuestario mensual por departamento o déjalo en blanco para operar SIN LÍMITE
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-[#5D87FF] bg-[#ECF2FF] px-2.5 py-1 rounded">
                  Cadencia: {company?.billingPeriod || "monthly"}
                </span>
                <button
                  type="button"
                  onClick={() => setShowRequestCCModal(true)}
                  className="text-xs font-semibold text-white bg-[#5D87FF] hover:bg-[#4570EA] px-3 py-1 rounded cursor-pointer transition-colors"
                >
                  + Solicitar Centro
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {costCenters.map((cc) => {
                const limitVal = cc.budgetLimit ?? cc.monthlyBudget ?? null;
                const isUnlimited = limitVal === null || limitVal === undefined;
                const used = Number(cc.spent || 0) + Number(cc.reserved || 0);
                const draftVal =
                  editingLimitMap[cc.id] ??
                  (isUnlimited ? "" : String(limitVal));

                return (
                  <div
                    key={cc.id}
                    className="p-4 rounded-[8px] border border-[#E5EAEF] bg-[#F8FAFC] space-y-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#2A3547]">
                        {cc.code ? `${cc.code} · ` : ""}
                        {cc.name}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                          isUnlimited
                            ? "bg-[#E6FFFA] text-[#0D9488]"
                            : "bg-[#ECF2FF] text-[#5D87FF]"
                        }`}
                      >
                        {isUnlimited
                          ? "SIN LÍMITE"
                          : `Techo: $${Number(limitVal).toFixed(2)}`}
                      </span>
                    </div>

                    <div className="text-[#5A6A85] flex justify-between">
                      <span>Consumido + Reservado:</span>
                      <span className="font-bold text-[#2A3547]">
                        ${used.toFixed(2)} USD
                      </span>
                    </div>

                    <div className="flex items-center space-x-1.5 pt-1">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="Vacío = SIN LÍMITE"
                        value={draftVal}
                        onChange={(e) =>
                          setEditingLimitMap((prev) => ({
                            ...prev,
                            [cc.id]: e.target.value,
                          }))
                        }
                        className="w-full border border-[#DFE5EF] rounded px-2 py-1.5 bg-white text-xs"
                      />
                      <button
                        type="button"
                        disabled={savingLimitId === cc.id}
                        onClick={() => {
                          const raw = draftVal.trim();
                          const parsed =
                            raw === "" ? null : Math.max(0, Number(raw));
                          handleSaveCostCenterCeiling(cc, parsed);
                        }}
                        className="px-2.5 py-1.5 bg-[#5D87FF] text-white rounded font-semibold shrink-0 cursor-pointer"
                      >
                        Guardar
                      </button>
                      {!isUnlimited && (
                        <button
                          type="button"
                          disabled={savingLimitId === cc.id}
                          onClick={() => {
                            setEditingLimitMap((prev) => ({
                              ...prev,
                              [cc.id]: "",
                            }));
                            handleSaveCostCenterCeiling(cc, null);
                          }}
                          className="px-2 py-1.5 bg-[#E6FFFA] text-[#0D9488] rounded font-semibold shrink-0 cursor-pointer"
                          title="Dejar SIN LÍMITE"
                        >
                          ∞
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* CF-84: Solicitudes de centros de costo */}
            {costCentreRequests.length > 0 && (
              <div className="mt-5 pt-4 border-t border-[#E5EAEF]">
                <h3 className="text-xs font-bold text-[#5A6A85] uppercase tracking-wider mb-2">
                  Solicitudes de Extensión Presupuestaria (CF-84)
                </h3>
                <div className="space-y-2">
                  {costCentreRequests.map((req) => (
                    <div
                      key={req.requestId}
                      className="flex items-center justify-between p-2.5 bg-white border border-[#E5EAEF] rounded text-xs"
                    >
                      <div>
                        <span className="font-bold text-[#2A3547]">{req.proposedName}</span>
                        <span className="text-[#7C8FAC] ml-2">
                          {req.proposedBudgetLimit ? `Techo propuesto: $${req.proposedBudgetLimit}` : "Sin techo"} · {new Date(req.requestedAt).toLocaleDateString()}
                        </span>
                        {req.status === "rejected" && req.rejectionReason && (
                          <p className="text-[11px] text-red-600 mt-0.5">Motivo de rechazo: {req.rejectionReason}</p>
                        )}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase ${
                          req.status === "approved"
                            ? "bg-emerald-100 text-emerald-800"
                            : req.status === "rejected"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {req.status === "pending" ? "Pendiente Aprobación" : req.status === "approved" ? "Aprobado" : "Rechazado"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tarifas Corporativas (CF-45) y Directorio de Viajeros (CF-47) — Solo Admin */}
        {isCompanyAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tarifas por Categoría (listCompanyRates — CF-45) */}
            <div className="modern-card p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-[#E5EAEF] pb-3">
                <div>
                  <h2 className="text-base font-bold text-[#2A3547]">
                    Tarifas Vigentes por Categoría (CF-45)
                  </h2>
                  <p className="text-xs text-[#7C8FAC]">
                    Tarifa negociada por contrato o precio base del país
                  </p>
                </div>
                {periodSummary && (
                  <span className="text-[11px] font-semibold bg-[#E6FFFA] text-[#0D9488] px-2.5 py-1 rounded">
                    Facturable Periodo: ${Number(periodSummary.billableTotal || 0).toFixed(2)} USD
                  </span>
                )}
              </div>

              {companyRates.length === 0 ? (
                <p className="text-xs text-[#7C8FAC]">
                  Las tarifas por categoría se resuelven automáticamente desde el motor B2B al cotizar.
                </p>
              ) : (
                <div className="space-y-2">
                  {companyRates.map((r) => (
                    <div
                      key={r.categoryId}
                      className="flex items-center justify-between p-3 rounded-[7px] bg-[#F8FAFC] border border-[#E5EAEF] text-xs"
                    >
                      <div>
                        <span className="font-bold text-[#2A3547] uppercase block">
                          {r.categoryName || r.categoryId}
                        </span>
                        <span className="text-[11px] text-[#7C8FAC]">
                          ID: {r.categoryId}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-extrabold text-[#5D87FF] text-sm block">
                          ${Number(r.fareRate).toFixed(2)} USD/km
                        </span>
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.hasNegotiatedRate
                              ? "bg-[#ECF2FF] text-[#5D87FF]"
                              : "bg-[#FEF5E5] text-[#D97706]"
                          }`}
                        >
                          {r.hasNegotiatedRate ? "Tarifa negociada" : "Precio de país"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Directorio de Viajeros Corporativos (CF-47) */}
            <div className="modern-card p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-[#E5EAEF] pb-3">
                <div>
                  <h2 className="text-base font-bold text-[#2A3547]">
                    Directorio de Viajeros Corporativos (CF-47)
                  </h2>
                  <p className="text-xs text-[#7C8FAC]">
                    Alta y retiro de viajeros autorizados para reservas B2B
                  </p>
                </div>
                <span className="text-xs font-bold text-[#5D87FF] bg-[#ECF2FF] px-2.5 py-1 rounded">
                  {travellersList.filter((t) => t.active).length} activos
                </span>
              </div>

              <form
                onSubmit={handleCreateTraveller}
                className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs"
              >
                <input
                  type="text"
                  placeholder="Nombre completo *"
                  value={newTravName}
                  onChange={(e) => setNewTravName(e.target.value)}
                  className="border border-[#DFE5EF] rounded px-2.5 py-1.5 bg-white"
                  required
                />
                <input
                  type="text"
                  placeholder="Teléfono (+503 7000-0000)"
                  value={newTravPhone}
                  onChange={(e) => setNewTravPhone(e.target.value)}
                  className="border border-[#DFE5EF] rounded px-2.5 py-1.5 bg-white"
                />
                <div className="flex space-x-1.5">
                  <input
                    type="text"
                    placeholder="DUI opcional"
                    value={newTravDoc}
                    onChange={(e) => setNewTravDoc(e.target.value)}
                    className="w-full border border-[#DFE5EF] rounded px-2.5 py-1.5 bg-white"
                  />
                  <button
                    type="submit"
                    disabled={creatingTraveller}
                    className="px-3 py-1.5 bg-[#5D87FF] text-white font-bold rounded shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    + Alta
                  </button>
                </div>
              </form>

              <div className="max-h-44 overflow-y-auto divide-y divide-[#E5EAEF] text-xs">
                {travellersList.length === 0 ? (
                  <p className="text-xs text-[#7C8FAC] py-2">
                    No hay viajeros registrados aún. Agrega el primero arriba.
                  </p>
                ) : (
                  travellersList.map((tr) => (
                    <div
                      key={tr.travellerId}
                      className="py-2 flex items-center justify-between"
                    >
                      <div>
                        <span className="font-semibold text-[#2A3547]">
                          {tr.name}
                        </span>
                        <span className="text-[#7C8FAC] ml-2">
                          {tr.phone || "Sin teléfono"}
                          {tr.documentNumber ? ` · DUI ${tr.documentNumber}` : ""}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleTravellerActive(tr)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                          tr.active
                            ? "bg-[#E6FFFA] text-[#0D9488]"
                            : "bg-[#FDEDE8] text-[#FA896B]"
                        }`}
                      >
                        {tr.active ? "Activo (Retirar)" : "Inactivo (Reactivar)"}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Gestión de Usuarios y Roles Corporativos (CF-39 / CF-44) */}
            <div className="modern-card p-6 lg:col-span-2 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5EAEF] pb-3">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-lg bg-[#ECF2FF] flex items-center justify-center text-[#5D87FF]">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[#2A3547] flex items-center gap-2">
                      <span>Equipo Corporativo y Gestión de Roles (CF-39 / CF-44)</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-[#ECF2FF] text-[#5D87FF] px-2 py-0.5 rounded-full">
                        Empresa
                      </span>
                    </h2>
                    <p className="text-xs text-[#7C8FAC]">
                      Administra los colaboradores con acceso al portal de tu empresa ({company?.tradeName || company?.name}).
                      Las invitaciones envían un enlace de activación seguro a <span className="font-mono text-[#5D87FF]">/establecer-clave</span>.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="text-xs font-semibold text-[#7C8FAC]">
                    {companyUsers.filter((u) => u.isActive).length} activos / {companyUsers.length} total
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowInviteUserModal(true)}
                    className="px-3.5 py-2 bg-[#5D87FF] hover:bg-[#4570EA] text-white rounded-[6px] text-xs font-semibold flex items-center space-x-1.5 cursor-pointer shadow-sm transition"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Invitar Empleado</span>
                  </button>
                </div>
              </div>

              {/* Lista de Colaboradores */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E5EAEF] text-[#7C8FAC] font-semibold">
                      <th className="py-2.5 px-3">Colaborador</th>
                      <th className="py-2.5 px-3">Correo Electrónico</th>
                      <th className="py-2.5 px-3">Rol Corporativo</th>
                      <th className="py-2.5 px-3">Estado</th>
                      <th className="py-2.5 px-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5EAEF]">
                    {companyUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-[#7C8FAC]">
                          No hay colaboradores registrados. Haz clic en "Invitar Empleado" para agregar miembros al equipo.
                        </td>
                      </tr>
                    ) : (
                      companyUsers.map((u) => {
                        const isSelf = u.email.toLowerCase() === user?.email?.toLowerCase();
                        const isUpdating = updatingUserId === u.uid;
                        return (
                          <tr key={u.uid} className="hover:bg-[#F8FAFD] transition">
                            <td className="py-3 px-3 font-semibold text-[#2A3547]">
                              {u.firstName || u.lastName
                                ? `${u.firstName || ""} ${u.lastName || ""}`.trim()
                                : "Colaborador"}
                              {isSelf && (
                                <span className="ml-2 text-[10px] font-bold bg-[#ECF2FF] text-[#5D87FF] px-1.5 py-0.5 rounded">
                                  Tú
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-[#5A6A85] font-mono">
                              {u.email}
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                  u.companyRole === "company_admin"
                                    ? "bg-[#EDE9FE] text-[#6D28D9]"
                                    : "bg-[#E0F2FE] text-[#0369A1]"
                                }`}
                              >
                                <Shield className="w-3 h-3" />
                                {u.companyRole === "company_admin"
                                  ? "Administrador de Empresa"
                                  : "Operador de Traslados"}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                                  u.isActive
                                    ? "bg-[#E6FFFA] text-[#0D9488]"
                                    : "bg-[#FDEDE8] text-[#FA896B]"
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    u.isActive ? "bg-[#0D9488]" : "bg-[#FA896B]"
                                  }`}
                                />
                                {u.isActive ? "Activo" : "Inactivo"}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end space-x-1.5">
                                {!isSelf && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={isUpdating}
                                      onClick={() =>
                                        handleChangeUserRole(
                                          u,
                                          u.companyRole === "company_admin"
                                            ? "operador"
                                            : "company_admin"
                                        )
                                      }
                                      className="px-2 py-1 text-[11px] font-semibold border border-[#DFE5EF] hover:bg-[#F2F6FA] text-[#2A3547] rounded cursor-pointer transition disabled:opacity-50"
                                      title="Cambiar rol entre Operador y Administrador"
                                    >
                                      Cambiar a {u.companyRole === "company_admin" ? "Operador" : "Admin"}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isUpdating}
                                      onClick={() => handleToggleUserActive(u)}
                                      className={`px-2 py-1 text-[11px] font-bold rounded cursor-pointer transition disabled:opacity-50 ${
                                        u.isActive
                                          ? "bg-[#FDEDE8] text-[#FA896B] hover:bg-[#FCDAD2]"
                                          : "bg-[#E6FFFA] text-[#0D9488] hover:bg-[#CCFBEF]"
                                      }`}
                                    >
                                      {u.isActive ? "Desactivar" : "Reactivar"}
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Historial Centralizado y Monitoreo en Tiempo Real (H2.3-FE & H2.5-FE) */}
        <div className="modern-card p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-5 pb-3 border-b border-[#E5EAEF]">
            <div>
              <h2 className="text-base font-bold text-[#2A3547]">
                Solicitudes y Monitoreo en Tiempo Real (H2.4 / H2.5)
              </h2>
              <p className="text-xs text-[#7C8FAC]">
                Seguimiento en vivo conectado a Firebase Realtime Database (Solicitada → Asignada → En Camino → En Punto → En Curso → Completado)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Buscar por folio, origen, destino o conductor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="text-xs border border-[#DFE5EF] rounded-[6px] px-3 py-2 bg-white text-[#2A3547] min-w-[240px]"
              />

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs border border-[#DFE5EF] rounded-[6px] px-3 py-2 bg-white text-[#2A3547]"
              >
                <option value="all">Todos los estados</option>
                <option value="requested">Solicitada</option>
                <option value="seeking_driver">Buscando Conductor</option>
                <option value="assigned">Conductor Asignado</option>
                <option value="enRoute">En Camino al Origen</option>
                <option value="driverArrived">Conductor en Punto</option>
                <option value="inService">En Curso</option>
                <option value="completed">Completado</option>
                <option value="cancelled">Cancelado</option>
              </select>

              <select
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value as any)}
                className="text-xs border border-[#DFE5EF] rounded-[6px] px-3 py-2 bg-white text-[#2A3547]"
              >
                <option value="week">Últimos 7 días</option>
                <option value="month">Últimos 30 días</option>
                <option value="all">Todo el historial</option>
              </select>

              <button
                onClick={() => router.push("/solicitudes/nueva")}
                className="px-3.5 py-2 bg-[#5D87FF] text-white hover:bg-[#4570EA] rounded-[6px] text-xs font-semibold flex items-center space-x-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nueva Solicitud</span>
              </button>
            </div>
          </div>

          {loadingRequests ? (
            <div className="py-10 text-center text-xs text-[#7C8FAC]">
              Sincronizando solicitudes en tiempo real...
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-semibold text-[#5A6A85]">
                No tienes solicitudes de traslado en este periodo
              </p>
              <p className="text-xs text-[#7C8FAC] mt-1 mb-4">
                Solicita un vehículo SUV, Pick-up Doble Cabina o Microbús con tarifa corporativa garantizada.
              </p>
              <button
                onClick={() => router.push("/solicitudes/nueva")}
                className="px-4 py-2 bg-[#5D87FF] text-white rounded-[6px] text-xs font-semibold"
              >
                Solicitar Primer Traslado
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E5EAEF] text-[#5A6A85] uppercase">
                    <th className="py-3 px-3 font-semibold">Folio / Modalidad</th>
                    <th className="py-3 px-3 font-semibold">Centro de Costo</th>
                    <th className="py-3 px-3 font-semibold">Ruta & Paradas</th>
                    <th className="py-3 px-3 font-semibold">Vehículo & Pasajeros</th>
                    <th className="py-3 px-3 font-semibold">Conductor Asignado</th>
                    {isCompanyAdmin && (
                      <th className="py-3 px-3 font-semibold text-right">
                        Tarifa USD
                      </th>
                    )}
                    <th className="py-3 px-3 font-semibold text-center">Estado en Vivo</th>
                    <th className="py-3 px-3 font-semibold text-right">Monitoreo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5EAEF]">
                  {filteredRequests.map((req) => {
                    const badge = getRequestBadge(req as any);
                    return (
                      <tr
                        key={req.id}
                        className="hover:bg-[#F8FAFC] transition"
                      >
                        <td className="py-3.5 px-3">
                          <span className="font-bold text-[#2A3547] block">
                            {req.folio}
                          </span>
                          <span className="text-[11px] text-[#7C8FAC]">
                            {req.isImmediate ? "Inmediato" : "Programado"} ·{" "}
                            {req.roundTrip ? "Ida y Vuelta" : "Solo Ida"}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 font-medium text-[#2A3547]">
                          {req.costCenterName || "General"}
                          {req.travellerName && (
                            <span className="block text-[10px] text-[#5D87FF]">
                              Viajero: {req.travellerName}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 max-w-[260px]">
                          <div className="truncate font-medium text-[#2A3547]">
                            <strong>Origen:</strong> {req.origin?.address}
                          </div>
                          {req.stops && req.stops.length > 0 && (
                            <div className="text-[11px] text-[#5D87FF] font-semibold">
                              + {req.stops.length} parada(s) intermedia(s)
                            </div>
                          )}
                          <div className="truncate text-[#7C8FAC]">
                            <strong>Destino:</strong> {req.destination?.address}
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-[#ECF2FF] text-[#5D87FF] font-bold uppercase text-[10px]">
                            {(req.vehicleCategory || "suv").toUpperCase()} · {req.passengersCount} pax
                          </span>
                          {req.hasCargo && (
                            <span className="block text-[10px] text-[#FFAE1F] font-semibold mt-0.5">
                              Con Carga / Equipaje
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-3">
                          {req.assignedDriverName ? (
                            <div>
                              <span className="font-semibold text-[#2A3547] block">
                                {req.assignedDriverName}
                              </span>
                              <span className="text-[11px] text-[#7C8FAC]">
                                {req.assignedVehiclePlate}
                                {req.assignedDriverPhone
                                  ? ` · ${req.assignedDriverPhone}`
                                  : ""}
                              </span>
                            </div>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded border border-[#FFAE1F]/50 text-[#D97706] text-[11px] font-semibold">
                              {req.status === "seeking_driver"
                                ? "Buscando conductor..."
                                : "Sin asignar"}
                            </span>
                          )}
                        </td>
                        {isCompanyAdmin && (
                          <td className="py-3.5 px-3 text-right">
                            <span className="font-bold text-[#2A3547] block">
                              $
                              {Number(
                                req.finalAmount ??
                                  req.tariffApplied?.calculatedAmount ??
                                  0
                              ).toFixed(2)}
                            </span>
                            <span className="text-[10px] text-[#7C8FAC]">
                              {req.estimatedDistanceKm} km
                            </span>
                          </td>
                        )}
                        <td className="py-3.5 px-3 text-center">
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-[5px] text-[11px] font-bold ${badge.bg} ${badge.text}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <button
                            onClick={() => setSelectedRequest(req)}
                            className="inline-flex items-center space-x-1 px-3 py-1.5 border border-[#5D87FF] text-[#5D87FF] hover:bg-[#ECF2FF] rounded-[6px] font-semibold cursor-pointer transition"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Monitorear</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Expediente Fiscal de la Empresa */}
        {company && (
          <div className="modern-card p-6 sm:p-7">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-[#E5EAEF]">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-[#5D87FF]" />
                <h2 className="text-base font-bold text-[#2A3547]">
                  Expediente Fiscal y Condición Comercial ({company.nit})
                </h2>
              </div>
              <span className="text-xs text-[#7C8FAC]">
                Condición:{" "}
                <strong className="text-[#2A3547]">
                  {company.paymentCondition}
                </strong>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
              <div>
                <span className="text-[#7C8FAC] uppercase font-semibold block">
                  Razón Social
                </span>
                <span className="font-bold text-[#2A3547] mt-0.5 block">
                  {company.legalName}
                </span>
              </div>
              <div>
                <span className="text-[#7C8FAC] uppercase font-semibold block">
                  Contacto Principal
                </span>
                <span className="font-bold text-[#2A3547] mt-0.5 block">
                  {company.contactPerson || company.contactName} ·{" "}
                  {company.contactPhone || company.phone}
                </span>
              </div>
              <div>
                <span className="text-[#7C8FAC] uppercase font-semibold block">
                  Dirección Fiscal
                </span>
                <span className="font-bold text-[#2A3547] mt-0.5 block">
                  {company.address}
                </span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Drawer Lateral de Monitoreo en Tiempo Real (Idéntico al Dashboard Administrativo · H2.5-FE) */}
      {liveSelectedRequest && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex justify-end"
          onClick={() => setSelectedRequest(null)}
        >
          <div
            className="bg-white w-full max-w-[520px] h-full p-6 shadow-2xl space-y-5 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[#E5EAEF] pb-3">
              <div>
                <h3 className="text-xl font-bold text-[#2A3547]">
                  {liveSelectedRequest.folio}
                </h3>
                <p className="text-xs text-[#7C8FAC]">
                  {company?.tradeName || liveSelectedRequest.companyName} · CC:{" "}
                  {liveSelectedRequest.costCenterName || "General"}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                {(() => {
                  const badge = getRequestBadge(liveSelectedRequest as any);
                  return (
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-[5px] text-[11px] font-bold ${badge.bg} ${badge.text}`}
                    >
                      {badge.label}
                    </span>
                  );
                })()}
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="text-xs text-[#7C8FAC] hover:text-[#2A3547] font-bold px-2 py-1"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Mapa de Monitoreo en Vivo (Google Maps API + RTDB) */}
            <div>
              <span className="text-xs font-bold text-[#2A3547] block mb-2">
                Monitoreo en Vivo de Ruta y Unidad (Google Maps API)
              </span>
              <GoogleTripTrackingMap
                origin={liveSelectedRequest.origin}
                destination={liveSelectedRequest.destination}
                stops={liveSelectedRequest.stops}
                driverLocation={driverTelemetry}
                driverName={liveSelectedRequest.assignedDriverName}
                vehiclePlate={liveSelectedRequest.assignedVehiclePlate}
                height="220px"
              />
            </div>

            {/* Línea de Tiempo de Estados en Vivo (Sincronizada con Realtime Database) */}
            <div>
              <span className="text-xs font-bold text-[#2A3547] block mb-2">
                Línea de Tiempo en Vivo (Sincronizada con Realtime Database)
              </span>
              <div className="bg-[#F8FAFC] p-4 rounded-[8px] border border-[#E5EAEF] space-y-2.5">
                {LIFECYCLE_STEPS.map((st, idx) => {
                  const activeStepIdx = getLifecycleStepIndex(
                    liveSelectedRequest.status
                  );
                  const isCompletedStep =
                    liveSelectedRequest.status === "completed" ||
                    liveSelectedRequest.status === "invoiced" ||
                    idx < activeStepIdx;
                  const isCurrentStep =
                    liveSelectedRequest.status !== "completed" &&
                    liveSelectedRequest.status !== "invoiced" &&
                    idx === activeStepIdx;
                  return (
                    <div key={st.status}>
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                            isCompletedStep || isCurrentStep
                              ? "bg-[#5D87FF] text-white"
                              : "bg-[#94A3B8] text-white"
                          }`}
                        >
                          {isCompletedStep ? "✓" : idx + 1}
                        </div>
                        <span
                          className={`text-xs ${
                            isCompletedStep || isCurrentStep
                              ? "font-bold text-[#2A3547]"
                              : "text-[#7C8FAC]"
                          }`}
                        >
                          {st.label}
                        </span>
                      </div>
                      {idx < LIFECYCLE_STEPS.length - 1 && (
                        <div className="ml-3 h-3 w-px bg-[#CBD5E1] my-0.5" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {liveSelectedRequest.status === "seeking_driver" &&
              (liveSelectedRequest.notes ||
                (liveSelectedRequest as any).interruptionReason) && (
                <div className="p-3 rounded-[7px] bg-[#FEF5E5] border border-[#FFAE1F]/50 text-xs text-[#92400E]">
                  <strong className="block mb-0.5">
                    Incidencia en ruta reportada (CF-87 · Reasignando unidad):
                  </strong>
                  <span>
                    {(liveSelectedRequest as any).interruptionReason ||
                      liveSelectedRequest.notes}
                  </span>
                </div>
              )}

            {/* Información de Conductor y Ruta */}
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-[7px] bg-[#ECF2FF] flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#5D87FF] block">
                    Conductor y Unidad Asignada
                  </span>
                  <span className="font-bold text-[#2A3547] text-sm">
                    {liveSelectedRequest.assignedDriverName ||
                      "Pendiente de asignación por despacho"}
                  </span>
                  {liveSelectedRequest.assignedVehiclePlate && (
                    <span className="block text-[#5A6A85]">
                      Placa: {liveSelectedRequest.assignedVehiclePlate}
                      {liveSelectedRequest.assignedDriverPhone
                        ? ` · Tel: ${liveSelectedRequest.assignedDriverPhone}`
                        : ""}
                    </span>
                  )}
                </div>
                <Car className="w-6 h-6 text-[#5D87FF]" />
              </div>

              {/* Telemetría GPS en Vivo desde Firebase Realtime Database (RTDB) */}
              {driverTelemetry?.lat && driverTelemetry?.lng ? (
                <div className="p-3 rounded-[8px] bg-[#E6FFFA] border border-[#13DEB9]/30 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#13DEB9] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#0D9488]"></span>
                      </span>
                      <span className="text-[11px] font-bold text-[#0D9488] uppercase tracking-wide">
                        GPS en Vivo (Firebase Realtime Database)
                      </span>
                    </div>
                    <span className="text-[10px] text-[#0D9488] font-semibold">
                      {driverTelemetry.status
                        ? `Estado: ${driverTelemetry.status}`
                        : "Transmitiendo"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[#2A3547] pt-1">
                    <span>
                      Coords:{" "}
                      <strong>
                        {driverTelemetry.lat.toFixed(5)},{" "}
                        {driverTelemetry.lng.toFixed(5)}
                      </strong>
                      {driverTelemetry.speed !== undefined &&
                        ` · Vel: ${driverTelemetry.speed} km/h`}
                    </span>
                    <a
                      href={`https://www.google.com/maps?q=${driverTelemetry.lat},${driverTelemetry.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-[#5D87FF] hover:underline flex items-center space-x-1"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Abrir en Maps</span>
                    </a>
                  </div>
                </div>
              ) : liveSelectedRequest.assignedDriverId ? (
                <div className="p-2.5 rounded-[7px] bg-[#F8FAFC] border border-[#E5EAEF] text-[11px] text-[#7C8FAC] flex items-center justify-between">
                  <span>Conectado a Firebase RTDB (monitoreando conductor...)</span>
                  <Clock className="w-3.5 h-3.5 animate-spin text-[#7C8FAC]" />
                </div>
              ) : null}

              <div className="pt-2 border-t border-[#E5EAEF] space-y-2.5">
                <div>
                  <span className="text-[10px] uppercase text-[#7C8FAC] font-bold block">
                    ORIGEN
                  </span>
                  <span className="font-bold text-[#2A3547]">
                    {liveSelectedRequest.origin?.address}
                  </span>
                </div>

                {liveSelectedRequest.stops &&
                  liveSelectedRequest.stops.length > 0 && (
                    <div>
                      <span className="text-[10px] uppercase text-[#5D87FF] font-bold block">
                        PARADAS INTERMEDIAS ({liveSelectedRequest.stops.length})
                      </span>
                      {liveSelectedRequest.stops.map((s, i) => (
                        <span key={i} className="block text-[#2A3547]">
                          {i + 1}. {s.address}
                        </span>
                      ))}
                    </div>
                  )}

                <div>
                  <span className="text-[10px] uppercase text-[#7C8FAC] font-bold block">
                    DESTINO ({liveSelectedRequest.roundTrip ? "IDA Y VUELTA" : "SOLO IDA"})
                  </span>
                  <span className="font-bold text-[#2A3547]">
                    {liveSelectedRequest.destination?.address}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <span className="text-[10px] uppercase text-[#7C8FAC] font-bold block">
                      PASAJEROS ({liveSelectedRequest.passengersCount})
                    </span>
                    <span className="font-bold text-[#2A3547]">
                      {(liveSelectedRequest.passengerNames || []).join(", ") ||
                        liveSelectedRequest.travellerName ||
                        liveSelectedRequest.requestedByName ||
                        "Coordinador Corporativo"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-[#7C8FAC] font-bold block">
                      CARGA / EQUIPAJE
                    </span>
                    <span className="font-bold text-[#2A3547]">
                      {liveSelectedRequest.hasCargo
                        ? liveSelectedRequest.cargoDescription || "Sí incluye carga"
                        : "Sin carga especial"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-[8px] bg-[#E6FFFA] border border-[#13DEB9]/40">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#0D9488] text-xs">
                    Tarifa Oficial Aplicada: $
                    {Number(
                      liveSelectedRequest.finalAmount ??
                        liveSelectedRequest.tariffApplied?.calculatedAmount ??
                        0
                    ).toFixed(2)}{" "}
                    USD
                  </span>
                </div>
                <span className="text-[11px] text-[#0F766E] block mt-0.5">
                  Distancia facturable: {liveSelectedRequest.estimatedDistanceKm} km · Tarifa/km: $
                  {Number(liveSelectedRequest.tariffApplied?.ratePerKm || 0.67).toFixed(2)} · Mínimo: $
                  {Number(liveSelectedRequest.tariffApplied?.minFare || 13.56).toFixed(2)}
                </span>
              </div>

              {/* Bitácora de Eventos (CF-61) e Incidencias (CF-62 / CF-63) */}
              <div className="pt-3 border-t border-[#E5EAEF] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#2A3547]">
                    Incidencias del Traslado ({tripIncidents.length}) y Bitácora (CF-61 / CF-63)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowIncidentForm((v) => !v)}
                    className="text-[11px] font-bold text-[#FA896B] bg-[#FDEDE8] px-2.5 py-1 rounded cursor-pointer"
                  >
                    {showIncidentForm ? "Ocultar formulario" : "+ Reportar Incidencia"}
                  </button>
                </div>

                {showIncidentForm && (
                  <form
                    onSubmit={handleReportIncident}
                    className="p-3 bg-[#FFF8F6] border border-[#FA896B]/40 rounded-[7px] space-y-2"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-[#5A6A85] mb-1">
                          Tipo (CF-62)
                        </label>
                        <select
                          value={incidentType}
                          onChange={(e) =>
                            setIncidentType(e.target.value as IncidentType)
                          }
                          className="w-full border border-[#DFE5EF] rounded px-2 py-1 bg-white text-xs"
                        >
                          <option value="driver_no_show">Conductor no llegó</option>
                          <option value="passenger_no_show">Pasajero no llegó</option>
                          <option value="route_deviation">Desvío de ruta</option>
                          <option value="breakdown">Falla mecánica</option>
                          <option value="accident">Accidente</option>
                          <option value="safety">Seguridad</option>
                          <option value="payment">Facturación / Cobro</option>
                          <option value="other">Otro</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-[#5A6A85] mb-1">
                          Severidad
                        </label>
                        <select
                          value={incidentSeverity}
                          onChange={(e) =>
                            setIncidentSeverity(
                              e.target.value as IncidentSeverity
                            )
                          }
                          className="w-full border border-[#DFE5EF] rounded px-2 py-1 bg-white text-xs"
                        >
                          <option value="low">Baja</option>
                          <option value="medium">Media</option>
                          <option value="high">Alta</option>
                          <option value="critical">Crítica</option>
                        </select>
                      </div>
                    </div>
                    <textarea
                      rows={2}
                      placeholder="Describe lo ocurrido (nota: reportar no cancela el viaje ni libera el techo — D-09)..."
                      value={incidentDesc}
                      onChange={(e) => setIncidentDesc(e.target.value)}
                      className="w-full border border-[#DFE5EF] rounded px-2.5 py-1.5 bg-white text-xs"
                      required
                    />
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={reportingIncident}
                        className="px-3 py-1 bg-[#FA896B] text-white font-bold rounded text-xs cursor-pointer disabled:opacity-50"
                      >
                        {reportingIncident
                          ? "Enviando..."
                          : "Registrar Incidencia"}
                      </button>
                    </div>
                  </form>
                )}

                {tripIncidents.length > 0 && (
                  <div className="space-y-1.5">
                    {tripIncidents.map((inc) => (
                      <div
                        key={inc.incidentId}
                        className="p-2.5 rounded bg-[#F8FAFC] border border-[#E5EAEF] text-[11px]"
                      >
                        <div className="flex items-center justify-between font-bold text-[#2A3547]">
                          <span>
                            {inc.type.toUpperCase()} · Severidad: {inc.severity}
                          </span>
                          <span className="text-[#5D87FF]">{inc.status}</span>
                        </div>
                        <p className="text-[#5A6A85] mt-0.5">{inc.description}</p>
                        {inc.resolutionNote && (
                          <p className="text-[#0D9488] font-semibold mt-0.5">
                            Resolución ({inc.resolutionCode}): {inc.resolutionNote}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {tripEvents.length > 0 && (
                  <div className="p-3 rounded-[7px] bg-[#F8FAFC] border border-[#E5EAEF] space-y-1 max-h-36 overflow-y-auto">
                    <span className="text-[10px] font-bold uppercase text-[#7C8FAC] block">
                      BITÁCORA DE AUDITORÍA DEL SERVIDOR (CF-61 · {tripEvents.length})
                    </span>
                    {tripEvents.map((ev) => (
                      <div
                        key={ev.eventId}
                        className="text-[11px] text-[#5A6A85] flex justify-between"
                      >
                        <span>
                          • <strong>{ev.eventType}</strong>:{" "}
                          {ev.fromStatus ? `${ev.fromStatus} → ` : ""}
                          {ev.toStatus || ""} ({ev.actorType || "system"})
                        </span>
                        <span className="text-[10px] text-[#7C8FAC]">
                          {ev.at ? new Date(ev.at).toLocaleTimeString() : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-[#E5EAEF]">
              {(liveSelectedRequest.status === "requested" ||
                (liveSelectedRequest.status === "seeking_driver" &&
                  !(liveSelectedRequest as any).startedAt &&
                  !(liveSelectedRequest as any).interruptionReason)) && (
                <button
                  onClick={() => handleCancelRequest(liveSelectedRequest.id)}
                  disabled={companyRole !== "operator" && companyRole !== "company_admin"}
                  title={
                    companyRole !== "operator" && companyRole !== "company_admin"
                      ? "La cancelación corporativa está restringida a usuarios con rol Operador o Administrador de Empresa"
                      : undefined
                  }
                  className={`px-3.5 py-2 rounded-[6px] text-xs font-bold flex items-center space-x-1 ${
                    companyRole !== "operator" && companyRole !== "company_admin"
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-[#FDEDE8] text-[#FA896B] cursor-pointer"
                  }`}
                >
                  <XCircle className="w-4 h-4" />
                  <span>Cancelar Solicitud</span>
                </button>
              )}
              <button
                onClick={() => setSelectedRequest(null)}
                className="px-4 py-2 bg-[#5D87FF] text-white rounded-[6px] text-xs font-bold cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Solicitar Nuevo Centro de Costo (CF-84) */}
      {showRequestCCModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5EAEF] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#2A3547]">
                  Solicitar Centro de Costo (CF-84)
                </h3>
                <p className="text-xs text-[#7C8FAC]">
                  Envía una solicitud a la plataforma de Lilo para habilitar una nueva partida presupuestaria
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRequestCCModal(false)}
                className="text-[#7C8FAC] hover:text-[#2A3547] text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRequestNewCostCentre} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-[#2A3547] block mb-1">
                  Nombre Propuesto del Centro *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Operaciones Puerto Acajutla"
                  value={proposedCCName}
                  onChange={(e) => setProposedCCName(e.target.value)}
                  className="w-full border border-[#DFE5EF] rounded px-3 py-2 bg-white text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-[#2A3547] block mb-1">
                  Techo Presupuestario Propuesto (USD)
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  placeholder="Opcional. Vacío = SIN TECHO"
                  value={proposedCCBudget}
                  onChange={(e) => setProposedCCBudget(e.target.value)}
                  className="w-full border border-[#DFE5EF] rounded px-3 py-2 bg-white text-xs"
                />
                <span className="text-[10px] text-[#7C8FAC] block mt-0.5">
                  Hereda la cadencia de cobro de la empresa ({company?.billingPeriod || "monthly"})
                </span>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-[#E5EAEF]">
                <button
                  type="button"
                  onClick={() => setShowRequestCCModal(false)}
                  className="px-3.5 py-2 border border-[#DFE5EF] rounded text-xs font-semibold text-[#5A6A85]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={requestingCC}
                  className="px-4 py-2 bg-[#5D87FF] text-white rounded text-xs font-bold disabled:opacity-50"
                >
                  {requestingCC ? "Enviando..." : "Enviar Solicitud"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Invitar Colaborador / Empleado Corporativo (CF-39) */}
      {showInviteUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-[#E5EAEF] max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5EAEF] pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-[#ECF2FF] flex items-center justify-center text-[#5D87FF]">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#2A3547]">
                    Invitar Empleado al Portal B2B
                  </h3>
                  <p className="text-xs text-[#7C8FAC]">
                    {company?.tradeName || company?.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowInviteUserModal(false)}
                className="text-[#7C8FAC] hover:text-[#2A3547] text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleInviteUser} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-[#2A3547] block mb-1">
                  Correo Electrónico Corporativo *
                </label>
                <input
                  type="email"
                  required
                  placeholder="ejemplo@empresa.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full border border-[#DFE5EF] rounded px-3 py-2 bg-white text-xs font-mono"
                />
                <span className="text-[10px] text-[#7C8FAC] block mt-0.5">
                  El colaborador recibirá la invitación oficial en este correo.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-[#2A3547] block mb-1">
                    Nombre
                  </label>
                  <input
                    type="text"
                    placeholder="Carlos"
                    value={inviteFirstName}
                    onChange={(e) => setInviteFirstName(e.target.value)}
                    className="w-full border border-[#DFE5EF] rounded px-3 py-2 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#2A3547] block mb-1">
                    Apellido
                  </label>
                  <input
                    type="text"
                    placeholder="Mendoza"
                    value={inviteLastName}
                    onChange={(e) => setInviteLastName(e.target.value)}
                    className="w-full border border-[#DFE5EF] rounded px-3 py-2 bg-white text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-[#2A3547] block mb-1">
                  Rol Corporativo B2B *
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) =>
                    setInviteRole(e.target.value as "operador" | "company_admin")
                  }
                  className="w-full border border-[#DFE5EF] rounded px-3 py-2 bg-white text-xs"
                >
                  <option value="operador">
                    Operador de Traslados (Cotizaciones, reservas y monitoreo)
                  </option>
                  <option value="company_admin">
                    Administrador de Empresa (Facturación, centros de costo y equipo)
                  </option>
                </select>
              </div>

              <div className="bg-[#F8FAFD] border border-[#DFE5EF] rounded-lg p-3 text-[11px] text-[#5A6A85] space-y-1">
                <p className="font-semibold text-[#2A3547] flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#5D87FF]" />
                  <span>Seguridad de Acceso Lilo B2B (D-22 / CF-39)</span>
                </p>
                <p>
                  No se generan contraseñas temporales. El empleado recibirá un enlace de un solo uso para establecer su contraseña en{" "}
                  <span className="font-mono text-[#5D87FF]">/establecer-clave</span>.
                </p>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-[#E5EAEF]">
                <button
                  type="button"
                  onClick={() => setShowInviteUserModal(false)}
                  className="px-3.5 py-2 border border-[#DFE5EF] rounded text-xs font-semibold text-[#5A6A85]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={invitingUser}
                  className="px-4 py-2 bg-[#5D87FF] hover:bg-[#4570EA] text-white rounded text-xs font-bold disabled:opacity-50 flex items-center space-x-1.5 cursor-pointer"
                >
                  {invitingUser ? (
                    <span>Enviando invitación...</span>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Enviar Invitación Oficial</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
