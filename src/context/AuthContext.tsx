"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  User,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  updatePassword,
} from "firebase/auth";
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db, functions, getMyCompanyCallable } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";
import { B2BCompany } from "@/types/b2b";

export type CompanyPortalRole = "company_admin" | "operator" | "analyst";

interface AuthContextType {
  user: User | null;
  company: B2BCompany | null;
  companyRole: CompanyPortalRole;
  setCompanyRole: (role: CompanyPortalRole) => void;
  mustChangePassword: boolean;
  completeMandatoryPasswordChange: (newPassword: string) => Promise<void>;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  company: null,
  companyRole: "company_admin",
  setCompanyRole: () => {},
  mustChangePassword: false,
  completeMandatoryPasswordChange: async () => {},
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [company, setCompany] = useState<B2BCompany | null>(null);
  const [companyRole, setCompanyRole] =
    useState<CompanyPortalRole>("company_admin");
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeCompany: (() => void) | null = null;

    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 2500);

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      clearTimeout(safetyTimer);
      if (unsubscribeCompany) {
        unsubscribeCompany();
        unsubscribeCompany = null;
      }
      setUser(currentUser);

      if (!currentUser) {
        setCompany(null);
        setMustChangePassword(false);
        setLoading(false);
        return;
      }

      try {
        const withTimeout = <T,>(p: Promise<T>, ms = 2500): Promise<T> =>
          Promise.race([
            p,
            new Promise<T>((_, reject) =>
              setTimeout(() => reject(new Error("Timeout")), ms)
            ),
          ]);

        // 1. Obtener ID token y claims (rápido sin forzar red a menos que no existan)
        let tokenResult = await withTimeout(currentUser.getIdTokenResult()).catch(() => null);
        if (!tokenResult?.claims?.companyId) {
          await withTimeout(currentUser.getIdToken(true)).catch(() => {});
          tokenResult = await withTimeout(currentUser.getIdTokenResult()).catch(() => null);
        }

        // 2. Leer users/{uid}
        let userData: Record<string, any> | undefined;
        try {
          const userDocSnap = await withTimeout(getDoc(doc(db, "users", currentUser.uid)), 2000);
          userData = userDocSnap.exists() ? userDocSnap.data() : undefined;
        } catch {
          // fallback silencioso
        }

        setMustChangePassword(false);

        const rawRole = (
          tokenResult?.claims?.companyRole ||
          userData?.companyRole ||
          ""
        )
          .toString()
          .toLowerCase();
        let resolvedRole: CompanyPortalRole = "company_admin";
        if (rawRole === "operator" || rawRole === "operador") {
          resolvedRole = "operator";
        } else if (rawRole === "analyst" || rawRole === "analista") {
          resolvedRole = "analyst";
        }
        setCompanyRole(resolvedRole);

        // CF-100 — el país NO se toma del perfil. `users/{uid}.countryId` es un dato
        // derivado de la empresa y escribible: armar con él la ruta dejaba la empresa
        // sin encontrar cuando se desalineaba (caso medido: `"ve"` con la empresa en
        // `sv`) y bloqueaba la invitación de empleados. El país lo deriva el backend
        // del documento de la empresa.
        const docCompanyId =
          typeof userData?.companyId === "string" &&
          userData.companyId.trim() !== ""
            ? userData.companyId.trim()
            : "";
        const claimCompanyId =
          typeof tokenResult?.claims?.companyId === "string" &&
          tokenResult.claims.companyId.trim() !== ""
            ? tokenResult.claims.companyId.trim()
            : "";

        const targetCompanyId = claimCompanyId || docCompanyId;

        if (targetCompanyId) {
          const snapTimer = setTimeout(() => {
            setLoading(false);
          }, 1500);

          const resolved = await withTimeout(
            getMyCompanyCallable(),
            8000
          ).catch((err: unknown) => {
            console.warn(
              "[Portal Auth] getMyCompany falló:",
              err instanceof Error ? err.message : err
            );
            return null;
          });

          const profile = resolved?.data;
          const resolvedCountryId =
            typeof profile?.countryId === "string" &&
            profile.countryId.trim() !== ""
              ? profile.countryId.trim()
              : "";

          // Resiliencia de despliegue: si las functions todavía no tienen
          // `getMyCompany`, el portal conserva el camino anterior en vez de quedarse
          // sin empresa. Es el ÚNICO lugar que sigue usando el país del perfil, y sólo
          // cuando el backend no respondió: queda en el log.
          const claimCountryIds = Array.isArray(tokenResult?.claims?.countryIds)
            ? (tokenResult!.claims.countryIds as string[])
            : [];
          const fallbackCountryId =
            claimCountryIds.length > 0 && typeof claimCountryIds[0] === "string"
              ? claimCountryIds[0].trim().toLowerCase()
              : typeof userData?.countryId === "string" &&
                  userData.countryId.trim() !== ""
                ? userData.countryId.trim().toLowerCase()
                : "sv";
          const subscriptionCountryId =
            resolvedCountryId !== "" ? resolvedCountryId : fallbackCountryId;
          if (resolvedCountryId === "") {
            console.warn(
              "[Portal Auth] getMyCompany no devolvió país; se conserva el camino anterior (país del perfil)."
            );
          }

          // La empresa ya se puede mostrar sin esperar la suscripción: el perfil sale
          // de la respuesta del backend, no de la ruta adivinada.
          if (profile) {
          setCompany({
            id: profile.companyId,
            ...profile,
            tradeName:
              profile.tradeName ||
              profile.name ||
              profile.legalName ||
              "Empresa Corporativa",
            // El perfil no trae dinero: `balance` lo pone la suscripción, si llega.
            balance: 0,
            // `B2BCompany` del portal exige campos que el backend no publica (el
            // perfil es una lista blanca): el casteo es explícito y lo que falta lo
            // completa la suscripción cuando el documento es legible.
          } as unknown as B2BCompany);
          }

          unsubscribeCompany = onSnapshot(
            doc(
              db,
              "countries",
              subscriptionCountryId,
              "b2bCompanies",
              targetCompanyId
            ),
            (docSnap) => {
              clearTimeout(snapTimer);
              if (docSnap.exists()) {
                const compData = docSnap.data();
                setCompany({
                  id: docSnap.id,
                  ...compData,
                  tradeName:
                    compData.tradeName ||
                    compData.name ||
                    compData.legalName ||
                    "Empresa Corporativa",
                  balance:
                    typeof compData.balance === "number" ? compData.balance : 0,
                } as B2BCompany);
              }
              setLoading(false);
            },
            (err) => {
              clearTimeout(snapTimer);
              console.warn(
                `[Portal Auth] No se pudo suscribir a countries/${subscriptionCountryId}/b2bCompanies/${targetCompanyId}:`,
                err?.message || err
              );
              setLoading(false);
            }
          );
          return;
        }
      } catch (err) {
        console.error("[Portal Auth] Error fetching company data:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(safetyTimer);
      unsubscribeAuth();
      if (unsubscribeCompany) unsubscribeCompany();
    };
  }, []);

  const signIn = async (email: string, pass: string) => {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
    await cred.user.getIdToken(true);
  };

  const completeMandatoryPasswordChange = async (newPassword: string) => {
    if (!auth.currentUser) {
      throw new Error("No hay sesión activa.");
    }
    // CF-39 / MIGRACION §6-ter: Invocación exclusiva de changeProvisionalPassword callable
    const changeProvisionalPasswordFn = httpsCallable<
      { newPassword: string },
      { uid: string; mustChangePassword: boolean }
    >(functions, "changeProvisionalPassword");
    
    await changeProvisionalPasswordFn({ newPassword });

    // En Firebase Auth, cuando Admin SDK cambia la contraseña en el servidor, revoca los tokens
    // de sesión anteriores por seguridad. Si getIdToken falla por user-token-expired, cerramos sesión limpiamente.
    try {
      await auth.currentUser.getIdToken(true);
      setMustChangePassword(false);
    } catch {
      try {
        await fbSignOut(auth);
      } catch {
        // Ignorar error al cerrar sesión
      }
      setMustChangePassword(false);
    }
  };

  const signOut = async () => {
    await fbSignOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        company,
        companyRole,
        setCompanyRole,
        mustChangePassword,
        completeMandatoryPasswordChange,
        loading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

