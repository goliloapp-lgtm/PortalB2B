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

export type CompanyPortalRole = "company_admin" | "analyst";

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

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
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
        // 1. Refrescar ID token para obtener custom claims sincronizados (companyId, companyRole, countryIds)
        await currentUser.getIdToken(true);
        let tokenResult = await currentUser.getIdTokenResult();

        // 2. Leer users/{uid} (siempre permitido por isOwner(uid) en firestore.rules)
        const userDocSnap = await getDoc(doc(db, "users", currentUser.uid));
        const userData = userDocSnap.exists() ? userDocSnap.data() : undefined;

        const userMustChange = Boolean(userData?.mustChangePassword);
        setMustChangePassword(userMustChange);

        const resolvedRole: CompanyPortalRole =
          userData?.companyRole === "analyst" ||
          userData?.companyRole === "analista" ||
          tokenResult.claims.companyRole === "analyst" ||
          tokenResult.claims.companyRole === "analista"
            ? "analyst"
            : "company_admin";
        setCompanyRole(resolvedRole);

        const targetCountryId =
          typeof userData?.countryId === "string" &&
          userData.countryId.trim() !== ""
            ? userData.countryId.trim().toLowerCase()
            : "sv";

        const docCompanyId =
          typeof userData?.companyId === "string" &&
          userData.companyId.trim() !== ""
            ? userData.companyId.trim()
            : "";
        const claimCompanyId =
          typeof tokenResult.claims.companyId === "string" &&
          tokenResult.claims.companyId.trim() !== ""
            ? tokenResult.claims.companyId.trim()
            : "";

        const targetCompanyId = docCompanyId || claimCompanyId;

        // Si users/{uid} ya tiene companyId pero el claim aún no estaba en el token, forzar un segundo refresh
        if (docCompanyId && claimCompanyId !== docCompanyId) {
          await currentUser.getIdToken(true);
          tokenResult = await currentUser.getIdTokenResult();
        }

        if (targetCompanyId) {
          unsubscribeCompany = onSnapshot(
            doc(
              db,
              "countries",
              targetCountryId,
              "b2bCompanies",
              targetCompanyId
            ),
            (docSnap) => {
              if (docSnap.exists()) {
                const compData = docSnap.data();
                setCompany({ id: docSnap.id, ...compData } as B2BCompany);
                if (
                  userData?.mustChangePassword === undefined &&
                  compData?.mustChangePassword
                ) {
                  setMustChangePassword(true);
                }
              }
              setLoading(false);
            },
            (err) => {
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

