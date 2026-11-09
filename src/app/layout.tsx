import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { Toaster } from "react-hot-toast";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-plus-jakarta",
});

export const metadata: Metadata = {
  title: "Portal Corporativo B2B | Lilo El Salvador",
  description: "Gestión de traslados corporativos y control de saldos B2B",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${plusJakartaSans.variable} font-sans h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#F2F6FA] text-[#2A3547]">
        <LanguageProvider>
          <AuthProvider>
            <Toaster
              position="top-center"
              toastOptions={{
                duration: 4500,
                style: {
                  borderRadius: "10px",
                  border: "1px solid #E5EAEF",
                  color: "#2A3547",
                  fontSize: "13px",
                  fontWeight: 600,
                  padding: "12px 16px",
                  maxWidth: "520px",
                  boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.12)",
                },
              }}
            />
            {children}
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
