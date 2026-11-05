"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { verifyPasswordResetCode, confirmPasswordReset } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  Lock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Building2,
} from "lucide-react";

function EstablecerClaveContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oobCode = searchParams.get("oobCode") || "";

  const [email, setEmail] = useState<string>("");
  const [verifying, setVerifying] = useState<boolean>(true);
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (!oobCode) {
      setError(
        "El enlace no contiene un código de activación válido (oobCode). Solicite un nuevo enlace desde la pantalla de inicio de sesión."
      );
      setVerifying(false);
      return;
    }

    let active = true;
    verifyPasswordResetCode(auth, oobCode)
      .then((resolvedEmail) => {
        if (active) {
          setEmail(resolvedEmail);
          setVerifying(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(
            "El enlace para establecer contraseña ha expirado o ya fue utilizado."
          );
          setVerifying(false);
        }
      });

    return () => {
      active = false;
    };
  }, [oobCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 2200);
    } catch (err: any) {
      setError(
        err?.message ||
          "No fue posible establecer la contraseña. Intente nuevamente."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#FF6B35] to-[#F7B32B] flex items-center justify-center shadow-lg">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Establecer Contraseña Corporativa
            </h1>
            <p className="text-xs text-slate-400">
              Portal de Empresas B2B · Lilo El Salvador
            </p>
          </div>
        </div>

        {verifying ? (
          <div className="py-10 text-center text-slate-400 text-sm">
            Verificando enlace de seguridad...
          </div>
        ) : success ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <p className="text-sm font-semibold text-emerald-300">
              Contraseña establecida correctamente
            </p>
            <p className="text-xs text-slate-400">
              Redirigiendo al inicio de sesión corporativo...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {email && (
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-3 text-xs text-slate-300">
                Cuenta corporativa:{" "}
                <span className="font-semibold text-white">{email}</span>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start gap-2.5 text-xs text-red-300">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Nueva Contraseña (mín. 8 caracteres)
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={!oobCode || submitting}
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF6B35]"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Confirmar Contraseña
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={!oobCode || submitting}
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF6B35]"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!oobCode || submitting}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#F7B32B] text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-50 transition"
            >
              {submitting ? "Guardando..." : "Activar Contraseña e Ingresar"}
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="text-xs text-slate-400 hover:text-white transition"
              >
                Volver a Iniciar Sesión
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function EstablecerClavePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0B0F19] text-slate-400 flex items-center justify-center text-sm">
          Cargando...
        </div>
      }
    >
      <EstablecerClaveContent />
    </Suspense>
  );
}
