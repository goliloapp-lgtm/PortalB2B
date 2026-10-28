"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { sendPasswordResetEmail } from "firebase/auth";
import {
  auth,
  requestPasswordResetCodeCallable,
  verifyPasswordResetCodeAndUpdatePasswordCallable,
} from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
  Lock,
  Mail,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  KeyRound,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import toast from "react-hot-toast";

const DEMO_EMAIL = "empresa.demo@lilo.com";
const DEMO_PASS = "LiloB2B2026!";

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Estado para recuperación de contraseña ("¿Olvidaste tu contraseña?")
  const [forgotMode, setForgotMode] = useState<
    "none" | "request" | "verify"
  >("none");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Por favor completa todos los campos");
      return;
    }

    try {
      setLoading(true);
      await signIn(email, password);
      toast.success("Bienvenido al Portal Corporativo Lilo B2B");
      router.push("/");
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
        toast.error("Credenciales incorrectas");
      } else if (err.code === "auth/user-not-found") {
        toast.error("Usuario no registrado en Firebase Auth");
      } else {
        toast.error("Error al iniciar sesión: " + (err.message || ""));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFillDemo = () => {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASS);
    toast.success("Credenciales de prueba cargadas", { icon: "🔑" });
  };

  const handleRequestResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmail = resetEmail.trim().toLowerCase();
    if (!targetEmail) {
      toast.error("Ingresa tu correo electrónico corporativo");
      return;
    }
    setResetLoading(true);
    try {
      await requestPasswordResetCodeCallable({
        email: targetEmail,
        locale: "es",
      });
      toast.success(
        "Te hemos enviado un código de 6 dígitos a tu correo corporativo."
      );
      setForgotMode("verify");
    } catch (err: any) {
      console.warn(
        "[LoginPage] requestPasswordResetCodeCallable error, trying Firebase sendPasswordResetEmail:",
        err
      );
      try {
        await sendPasswordResetEmail(auth, targetEmail);
        toast.success(
          "Se envió un enlace de restablecimiento de contraseña a tu correo."
        );
        setForgotMode("none");
      } catch (fbErr: any) {
        toast.error(
          "No se pudo enviar el código: " + (fbErr?.message || err?.message || "")
        );
      }
    } finally {
      setResetLoading(false);
    }
  };

  const handleVerifyResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmail = resetEmail.trim().toLowerCase();
    if (!resetCode.trim() || resetCode.trim().length < 6) {
      toast.error("Ingresa el código de verificación de 6 dígitos");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }

    setResetLoading(true);
    try {
      await verifyPasswordResetCodeAndUpdatePasswordCallable({
        email: targetEmail,
        code: resetCode.trim(),
        newPassword,
      });
      toast.success(
        "Contraseña actualizada exitosamente. Iniciando sesión..."
      );
      setEmail(targetEmail);
      setPassword(newPassword);
      await signIn(targetEmail, newPassword);
      router.push("/");
    } catch (err: any) {
      toast.error(
        "Código inválido o expirado: " + (err?.message || "Verifica el código")
      );
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-[#F2F6FA] p-4 font-sans">
      <div className="w-full max-w-[440px] modern-card p-8 bg-white relative">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="mb-4">
            <Image
              src="/images/logos/Logo.png"
              alt="Lilo Logo"
              width={160}
              height={60}
              priority
              className="object-contain"
            />
          </div>
          <h1 className="text-xl font-bold text-[#2A3547]">
            Portal Corporativo B2B
          </h1>
          <p className="text-xs text-[#5A6A85] mt-1">
            Gestión de viajes empresariales · El Salvador
          </p>
        </div>

        {/* Vista: Recuperación de Contraseña ("¿Olvidaste tu contraseña?") */}
        {forgotMode !== "none" ? (
          <div className="space-y-4">
            <div className="p-3.5 bg-[#ECF2FF] border border-[#DFE5EF] rounded-[7px] text-xs text-[#2A3547]">
              <p className="font-bold text-[#5D87FF] mb-1">
                {forgotMode === "request"
                  ? "Recuperar Contraseña Corporativa"
                  : "Verificar Código y Nueva Contraseña"}
              </p>
              <p className="text-[#5A6A85]">
                {forgotMode === "request"
                  ? "Ingresa el correo electrónico registrado para tu empresa. Te enviaremos un código de seguridad de 6 dígitos válido por 15 minutos."
                  : `Ingresa el código de 6 dígitos enviado a ${resetEmail} y define tu nueva contraseña corporativa.`}
              </p>
            </div>

            {forgotMode === "request" ? (
              <form onSubmit={handleRequestResetCode} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#2A3547] mb-1.5">
                    Correo Electrónico Corporativo
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#7C8FAC] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      name="email"
                      autoComplete="username"
                      required
                      placeholder="corporativo@empresa.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 modern-input text-sm text-[#2A3547] placeholder-[#7C8FAC]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full py-2.5 modern-btn-primary flex items-center justify-center space-x-2 text-sm shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {resetLoading ? (
                    <span>Enviando código...</span>
                  ) : (
                    <>
                      <span>Enviar Código de Recuperación</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="flex items-center justify-between pt-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setForgotMode("none")}
                    className="text-[#5A6A85] hover:text-[#2A3547] flex items-center space-x-1 font-medium cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Volver al inicio de sesión</span>
                  </button>
                  {resetEmail.trim() && (
                    <button
                      type="button"
                      onClick={() => setForgotMode("verify")}
                      className="text-[#5D87FF] hover:underline font-medium cursor-pointer"
                    >
                      Ya tengo un código
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyResetCode} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[#2A3547] mb-1">
                    Código de Verificación (6 dígitos)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    placeholder="123456"
                    value={resetCode}
                    onChange={(e) =>
                      setResetCode(e.target.value.replace(/\D/g, ""))
                    }
                    className="w-full px-3 py-2.5 modern-input text-center tracking-[0.35em] font-mono text-base font-bold text-[#2A3547]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#2A3547] mb-1">
                    Nueva Contraseña Corporativa (mín. 8 caracteres)
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
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 modern-input text-sm text-[#2A3547]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#2A3547] mb-1">
                    Confirmar Nueva Contraseña
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
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 modern-input text-sm text-[#2A3547]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full py-2.5 modern-btn-primary flex items-center justify-center space-x-2 text-sm shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {resetLoading ? (
                    <span>Actualizando contraseña...</span>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Actualizar Contraseña e Ingresar</span>
                    </>
                  )}
                </button>

                <div className="flex items-center justify-between pt-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setForgotMode("request")}
                    className="text-[#5A6A85] hover:text-[#2A3547] flex items-center space-x-1 font-medium cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Reenviar código</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForgotMode("none")}
                    className="text-[#5D87FF] hover:underline font-medium cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          /* Formulario de Inicio de Sesión */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#2A3547] mb-1.5">
                Correo Electrónico
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#7C8FAC] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  required
                  placeholder="ejemplo@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 modern-input text-sm text-[#2A3547] placeholder-[#7C8FAC]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#2A3547] mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#7C8FAC] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 modern-input text-sm text-[#2A3547] placeholder-[#7C8FAC]"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-[#5A6A85] pt-1">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  defaultChecked
                  className="rounded border-[#E5EAEF] text-[#5D87FF] focus:ring-[#5D87FF]"
                />
                <span>Recordar este equipo</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setResetEmail(email);
                  setForgotMode("request");
                }}
                className="text-[#5D87FF] hover:underline font-medium cursor-pointer"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-3 py-2.5 modern-btn-primary flex items-center justify-center space-x-2 text-sm shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <span>Verificando credenciales...</span>
              ) : (
                <>
                  <span>Iniciar Sesión</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* Tarjeta de Acceso Rápido / Credenciales Demo */}
        <div className="mt-6 p-4 bg-[#ECF2FF] border border-[#DFE5EF] rounded-[7px]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-1.5">
              <KeyRound className="w-4 h-4 text-[#5D87FF]" />
              <span className="text-xs font-bold text-[#5D87FF]">
                Credenciales de Prueba Activas
              </span>
            </div>
            <button
              type="button"
              onClick={handleFillDemo}
              className="px-2 py-1 bg-white hover:bg-slate-50 text-[#5D87FF] text-[11px] font-semibold rounded-[4px] border border-[#DFE5EF] transition flex items-center space-x-1 shadow-2xs"
            >
              <Sparkles className="w-3 h-3 text-[#FFAE1F]" />
              <span>Autocompletar</span>
            </button>
          </div>

          <div className="space-y-1 text-[11px] text-[#2A3547] bg-white/70 p-2.5 rounded-[5px] border border-[#E5EAEF]">
            <p>
              <strong className="text-[#5A6A85]">Email:</strong>{" "}
              <code className="bg-[#EAEFF4] px-1 py-0.5 rounded font-mono text-[#2A3547]">
                {DEMO_EMAIL}
              </code>
            </p>
            <p>
              <strong className="text-[#5A6A85]">Pass:</strong>{" "}
              <code className="bg-[#EAEFF4] px-1 py-0.5 rounded font-mono text-[#2A3547]">
                {DEMO_PASS}
              </code>
            </p>
            <p className="text-[10px] text-[#7C8FAC] pt-1 border-t border-[#E5EAEF] mt-1">
              Empresa vinculada: <strong>Industrias El Ángel S.A. de C.V.</strong> (Saldo: $485.50 USD)
            </p>
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-5 pt-3 border-t border-[#E5EAEF] flex items-center justify-center space-x-1.5 text-xs text-[#7C8FAC]">
          <ShieldCheck className="w-4 h-4 text-[#13DEB9]" />
          <span>Acceso seguro cifrado SSL · Lilo App LLC</span>
        </div>
      </div>
    </div>
  );
}
