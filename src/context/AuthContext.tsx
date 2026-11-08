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
import { auth, db, functions } from "@/lib/firebase";
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

        const claimCountryIds = Array.isArray(tokenResult?.claims?.countryIds)
          ? (tokenResult!.claims.countryIds as string[])
          : [];
        const targetCountryId =
          claimCountryIds.length > 0 && typeof claimCountryIds[0] === "string"
            ? claimCountryIds[0].trim().toLowerCase()
            : typeof userData?.countryId === "string" &&
                userData.countryId.trim() !== ""
              ? userData.countryId.trim().toLowerCase()
              : "sv";

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

          unsubscribeCompany = onSnapshot(
            doc(
              db,
              "countries",
              targetCountryId,
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
                `[Portal Auth] No se pudo suscribir a countries/${targetCountryId}/b2bCompanies/${targetCompanyId}:`,
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

