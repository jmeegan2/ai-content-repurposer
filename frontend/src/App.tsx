import { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Toaster } from "sonner";
import { useSession, useAuthEvent } from "./lib/auth";
import { LandingPage } from "./pages/LandingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./components/LoginPage";
import { SignupPage } from "./components/SignupPage";
import { PricingPage } from "./components/PricingPage";
import { ResetPasswordPage } from "./components/ResetPasswordPage";

function PasswordRecoveryRedirect() {
  const authEvent = useAuthEvent();
  const navigate = useNavigate();
  useEffect(() => {
    if (authEvent === "PASSWORD_RECOVERY") navigate("/reset-password");
  }, [authEvent, navigate]);
  return null;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const session = useSession();
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const session = useSession();
  if (session) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <Toaster position="bottom-right" theme="dark" richColors />
      <PasswordRecoveryRedirect />
      <Routes>
        <Route
          path="/"
          element={
            <PublicOnlyRoute>
              <LandingPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/signup"
          element={
            <PublicOnlyRoute>
              <SignupPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pricing"
          element={
            <ProtectedRoute>
              <PricingPage />
            </ProtectedRoute>
          }
        />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
