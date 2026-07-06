import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./lib/auth.js";
import { NotificationProvider } from "./lib/notifications.js";
import { DisconnectModal } from "./components/ui/DisconnectModal.js";
import { ProtectedRoute } from "./components/auth/ProtectedRoute.js";
import { AppLayout } from "./components/layout/AppLayout.js";
import { Login } from "./pages/auth/Login.js";
import { Signup } from "./pages/auth/Signup.js";
import { OnboardingLayout } from "./pages/onboarding/OnboardingLayout.js";
import { StoreConnection } from "./pages/onboarding/StoreConnection.js";
import { WhatsAppSetup } from "./pages/onboarding/WhatsAppSetup.js";
import { AgentConfig } from "./pages/onboarding/AgentConfig.js";
import { Activation } from "./pages/onboarding/Activation.js";
import { DashboardHome } from "./pages/dashboard/DashboardHome.js";
import { Catalog } from "./pages/dashboard/Catalog.js";
import { Orders } from "./pages/dashboard/Orders.js";
import { Escalations } from "./pages/dashboard/Escalations.js";
import { Settings } from "./pages/dashboard/Settings.js";
import { Billing } from "./pages/dashboard/Billing.js";
import { Notifications } from "./pages/dashboard/Notifications.js";
import { Profile } from "./pages/dashboard/Profile.js";

export function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/onboarding" element={<OnboardingLayout />}>
                <Route index element={<Navigate to="store" replace />} />
                <Route path="store" element={<StoreConnection />} />
                <Route path="whatsapp" element={<WhatsAppSetup />} />
                <Route path="agent" element={<AgentConfig />} />
                <Route path="activate" element={<Activation />} />
              </Route>
              <Route path="/dashboard" element={<AppLayout />}>
                <Route index element={<DashboardHome />} />
                <Route path="orders" element={<Orders />} />
                <Route path="catalog" element={<Catalog />} />
                <Route path="escalations" element={<Escalations />} />
                <Route path="settings" element={<Settings />} />
                <Route path="profile" element={<Profile />} />
                <Route path="billing" element={<Billing />} />
                <Route path="notifications" element={<Notifications />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
          <DisconnectModal />
          <Toaster position="top-right" richColors />
        </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}
