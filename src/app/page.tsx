"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { ref as rtdbRef, onValue as onRtdbValue } from "firebase/database";
import { cancelCompanyReservationCallable, db, rtdb } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { B2BRequestStatus, B2BServiceRequest, CostCenter } from "@/types/b2b";
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
    label: "Reasignando Conductor",
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

const LIFECYCLE_STEPS: Array<{ status: B2BRequestStatus; label: string }> = [
  { status: "requested", label: "Solicitada" },
  { status: "seeking_driver", label: "Búsqueda / Reasignación" },
  { status: "assigned", label: "Conductor Asignado" },
  { status: "enRoute", label: "En Camino al Origen" },
  { status: "driverArrived", label: "Conductor en Punto" },
  { status: "inService", label: "En Curso" },
  { status: "completed", label: "Completado" },
];

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

  const [requests, setRequests] = useState<B2BServiceRequest[]>([]);
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

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

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

        list.sort((a, b) => {
          const tA =
            (a.createdAt as any)?.toMillis?.() ||
            ((a.createdAt as any)?.seconds
              ? (a.createdAt as any).seconds * 1000
              : Date.parse(String(a.scheduledAt || "")) || 0);
          const tB =
            (b.createdAt as any)?.toMillis?.() ||
            ((b.createdAt as any)?.seconds
              ? (b.createdAt as any).seconds * 1000
              : Date.parse(String(b.scheduledAt || "")) || 0);
          return tB - tA;
        });

        setRequests(list);
        setLoadingRequests(false);
      },
      (err) => {
        console.warn("[PortalB2B] Error subscribing to b2bRequests:", err?.message || err);
        setLoadingRequests(false);
      }
    );

    return () => unsubscribe();
  }, [user, company?.id, loading]);

  // Mantener sincronizada la solicitud abierta en el modal de monitoreo en vivo
  const liveSelectedRequest = useMemo(() => {
    if (!selectedRequest) return null;
    return (
      requests.find((r) => r.id === selectedRequest.id) || selectedRequest
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
            heading: typeof val.heading === "number" ? val.heading : undefined,
            updatedAt: val.updatedAt || val.timestamp || Date.now(),
            status: val.status,
          });
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

  const filteredRequests = useMemo(() => {
    const now = Date.now();
    const cutoff =
      periodFilter === "week"
        ? 7 * 24 * 60 * 60 * 1000
        : periodFilter === "month"
        ? 30 * 24 * 60 * 60 * 1000
        : Infinity;

    return requests.filter((r) => {
      if (cutoff === Infinity) return true;
      const ts =
        (r.createdAt as any)?.toMillis?.() ||
        ((r.createdAt as any)?.seconds
          ? (r.createdAt as any).seconds * 1000
          : Date.parse(String(r.scheduledAt || "")) || now);
      return now - ts <= cutoff;
    });
  }, [requests, periodFilter]);

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

  const handleSaveCostCenterCeiling = async (
    cc: CostCenter,
    newLimit: number | null
  ) => {
    if (!company?.id || !isCompanyAdmin) return;
    const targetCountryId = String(company.countryId || "sv").toLowerCase();
    setSavingLimitId(cc.id);
    try {
      await updateDoc(
        doc(
          db,
          "countries",
          targetCountryId,
          "b2bCompanies",
          company.id,
          "costCenters",
          cc.id
        ),
        {
          budgetLimit: newLimit,
          monthlyBudget: newLimit,
          updatedAt: serverTimestamp(),
        }
      );
      try {
        await addDoc(
          collection(
            db,
            "countries",
            targetCountryId,
            "b2bCompanies",
            company.id,
            "limitRequests"
          ),
          {
            companyId: company.id,
            costCentreId: cc.id,
            currentBudgetLimit: cc.budgetLimit ?? null,
            requestedBudgetLimit: newLimit,
            reason:
              newLimit === null
                ? "Eliminación de techo (SIN LÍMITE) por company_admin"
                : "Ajuste de techo de consumo por company_admin",
            requestedBy: user?.uid || "companyAdmin",
            requestedByEmail: user?.email || "",
            status: "applied",
            requestedAt: serverTimestamp(),
          }
        );
      } catch {
        // El cliente empresa escribe su propio techo directo en costCenters (CF-23)
      }
      toast.success(
        newLimit === null
          ? "Techo eliminado (Sin límite)"
          : `Techo actualizado a $${newLimit.toFixed(2)} USD`
      );
    } catch (err) {
      console.error("Error actualizando techo de consumo:", err);
      toast.error("No se pudo actualizar el techo de consumo.");
    } finally {
      setSavingLimitId(null);
    }
  };

  const handleCancelRequest = async (reqId: string) => {
    if (!window.confirm("¿Deseas cancelar esta solicitud de traslado?")) return;
    try {
      const target = requests.find((r) => r.id === reqId);
      if (target?.tripId) {
        try {
          await cancelCompanyReservationCallable({ tripId: target.tripId });
        } catch (callableErr) {
          console.warn(
            "[PortalB2B] cancelCompanyReservationCallable fallback:",
            callableErr
          );
        }
      }
      await updateDoc(doc(db, "b2bRequests", reqId), {
        status: "cancelled",
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Error cancelando solicitud:", err);
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

  if (!user) return null;

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
        "No se pudo actualizar la contraseña: " + (err?.message || "")
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

            {/* Selector de Rol Corporativo LO-4.2 (company_admin vs analyst) */}
            <select
              value={companyRole}
              onChange={(e) =>
                setCompanyRole(e.target.value as "company_admin" | "analyst")
              }
              className="text-xs border border-[#DFE5EF] rounded-[6px] px-2.5 py-1.5 bg-[#ECF2FF] text-[#5D87FF] font-bold"
              title="Rol Portal Corporativo (LO-4.2)"
            >
              <option value="company_admin">
                {isEn ? "Role: Company Admin" : "Rol: Admin Empresa"}
              </option>
              <option value="analyst">
                {isEn ? "Role: Analyst (No Amounts)" : "Rol: Analista (Sin Montos)"}
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
                {isCompanyAdmin
                  ? "Vista: Administrador Financiero"
                  : "Vista: Analista Operativo (Solo Despacho)"}
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
              <span className="text-xs font-semibold text-[#5D87FF] bg-[#ECF2FF] px-2.5 py-1 rounded">
                Cadencia: {company?.billingPeriod || "monthly"}
              </span>
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
          </div>
        )}

        {/* Historial Centralizado y Monitoreo en Tiempo Real (H2.3-FE & H2.5-FE) */}
        <div className="modern-card p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-[#E5EAEF]">
            <div>
              <h2 className="text-base font-bold text-[#2A3547]">
                Solicitudes y Monitoreo de Traslados en Tiempo Real
              </h2>
              <p className="text-xs text-[#7C8FAC]">
                Haz clic en cualquier traslado para ver la línea de tiempo en vivo, conductor y unidad asignada
              </p>
            </div>

            <div className="flex items-center space-x-2">
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
                    <th className="py-3 px-3 font-semibold">Folio</th>
                    <th className="py-3 px-3 font-semibold">Centro de Costo</th>
                    <th className="py-3 px-3 font-semibold">Ruta (Origen → Destino)</th>
                    <th className="py-3 px-3 font-semibold">Unidad / Pax</th>
                    <th className="py-3 px-3 font-semibold">Conductor Asignado</th>
                    {isCompanyAdmin && (
                      <th className="py-3 px-3 font-semibold text-right">
                        Tarifa USD
                      </th>
                    )}
                    <th className="py-3 px-3 font-semibold text-center">Estado en Vivo</th>
                    <th className="py-3 px-3 font-semibold text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5EAEF]">
                  {filteredRequests.map((req) => {
                    const badge =
                      STATUS_LABELS[req.status] || STATUS_LABELS.requested;
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
                            {req.roundTrip ? "Ida y Vuelta" : "Solo Ida"} ·{" "}
                            {req.estimatedDistanceKm} km
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
                            De: {req.origin?.address}
                          </div>
                          {req.stops && req.stops.length > 0 && (
                            <div className="text-[11px] text-[#5D87FF] font-semibold">
                              + {req.stops.length} parada(s) intermedia(s)
                            </div>
                          )}
                          <div className="truncate text-[#7C8FAC]">
                            A: {req.destination?.address}
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-[#ECF2FF] text-[#5D87FF] font-bold uppercase text-[10px]">
                            {req.vehicleCategory} · {req.passengersCount} pax
                          </span>
                          {req.hasCargo && (
                            <span className="block text-[10px] text-[#FFAE1F] font-semibold mt-0.5">
                              Incluye Carga
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
                                Placa: {req.assignedVehiclePlate}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[#FFAE1F] font-medium">
                              Asignando unidad...
                            </span>
                          )}
                        </td>
                        {isCompanyAdmin && (
                          <td className="py-3.5 px-3 text-right font-bold text-[#2A3547]">
                            $
                            {Number(
                              req.finalAmount ??
                                req.tariffApplied?.calculatedAmount ??
                                0
                            ).toFixed(2)}
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
                            className="inline-flex items-center space-x-1 text-[#5D87FF] hover:underline font-semibold cursor-pointer"
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

      {/* Modal de Monitoreo en Tiempo Real (H2.5-FE) */}
      {liveSelectedRequest && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-[10px] max-w-lg w-full p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-[#E5EAEF] pb-3">
              <div>
                <span className="text-[11px] font-bold uppercase text-[#5D87FF]">
                  Monitoreo en Tiempo Real
                </span>
                <h3 className="text-lg font-bold text-[#2A3547]">
                  {liveSelectedRequest.folio}
                </h3>
                <p className="text-xs text-[#7C8FAC]">
                  Centro de Costo: {liveSelectedRequest.costCenterName || "General"}
                </p>
              </div>
              <button
                onClick={() => setSelectedRequest(null)}
                className="text-xs text-[#7C8FAC] hover:text-[#2A3547] font-semibold"
              >
                Cerrar ✕
              </button>
            </div>

            {/* Línea de Tiempo de Estados en Vivo */}
            <div className="bg-[#F8FAFC] p-4 rounded-[8px] border border-[#E5EAEF] space-y-2.5">
              <span className="text-xs font-bold text-[#2A3547] block mb-2">
                Progreso del Servicio en Vivo
              </span>
              {LIFECYCLE_STEPS.map((st, idx) => {
                const currentIdx = LIFECYCLE_STEPS.findIndex(
                  (s) => s.status === liveSelectedRequest.status
                );
                const isDone =
                  liveSelectedRequest.status === "completed" ||
                  liveSelectedRequest.status === "invoiced" ||
                  (currentIdx >= 0 && idx <= currentIdx);
                return (
                  <div key={st.status} className="flex items-center space-x-2.5">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        isDone
                          ? "bg-[#13DEB9] text-white"
                          : "bg-[#E5EAEF] text-[#7C8FAC]"
                      }`}
                    >
                      {isDone ? "✓" : idx + 1}
                    </div>
                    <span
                      className={`text-xs ${
                        isDone
                          ? "font-bold text-[#2A3547]"
                          : "text-[#7C8FAC]"
                      }`}
                    >
                      {st.label}
                    </span>
                  </div>
                );
              })}
            </div>

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
                      Placa: {liveSelectedRequest.assignedVehiclePlate} · Tel:{" "}
                      {liveSelectedRequest.assignedDriverPhone}
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
                  <span>Conectado a Firebase RTDB (esperando fix GPS de conductor...)</span>
                  <Clock className="w-3.5 h-3.5 animate-spin text-[#7C8FAC]" />
                </div>
              ) : null}

              <div>
                <span className="text-[#7C8FAC] font-semibold block">
                  Origen:
                </span>
                <span className="font-bold text-[#2A3547]">
                  {liveSelectedRequest.origin?.address}
                </span>
              </div>

              {liveSelectedRequest.stops &&
                liveSelectedRequest.stops.length > 0 && (
                  <div>
                    <span className="text-[#5D87FF] font-semibold block">
                      Paradas Intermedias ({liveSelectedRequest.stops.length}):
                    </span>
                    {liveSelectedRequest.stops.map((s, i) => (
                      <span key={i} className="block text-[#2A3547]">
                        {i + 1}. {s.address}
                      </span>
                    ))}
                  </div>
                )}

              <div>
                <span className="text-[#7C8FAC] font-semibold block">
                  Destino ({liveSelectedRequest.roundTrip ? "Ida y Vuelta" : "Solo Ida"}):
                </span>
                <span className="font-bold text-[#2A3547]">
                  {liveSelectedRequest.destination?.address}
                </span>
              </div>

              {isCompanyAdmin && (
                <div className="pt-2 border-t border-[#E5EAEF] flex items-center justify-between">
                  <span className="text-[#5A6A85] font-semibold">
                    Tarifa Oficial Aplicada ({liveSelectedRequest.estimatedDistanceKm} km):
                  </span>
                  <span className="text-base font-extrabold text-[#5D87FF]">
                    $
                    {Number(
                      liveSelectedRequest.finalAmount ??
                        liveSelectedRequest.tariffApplied?.calculatedAmount ??
                        0
                    ).toFixed(2)}{" "}
                    USD
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-[#E5EAEF]">
              {(liveSelectedRequest.status === "requested" ||
                liveSelectedRequest.status === "seeking_driver") && (
                <button
                  onClick={() => handleCancelRequest(liveSelectedRequest.id)}
                  className="px-3.5 py-2 bg-[#FDEDE8] text-[#FA896B] rounded-[6px] text-xs font-bold flex items-center space-x-1"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Cancelar Solicitud</span>
                </button>
              )}
              <button
                onClick={() => setSelectedRequest(null)}
                className="px-4 py-2 bg-[#5D87FF] text-white rounded-[6px] text-xs font-bold"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
