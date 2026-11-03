
import { BrowserRouter, Routes, Route } from "react-router-dom";

import AuthProvider from "./context/AuthContext";
import RealtimeProvider from "./context/RealtimeContext";
import ToastProvider from "./components/ToastProvider";
import ProtectedRoute from "./components/routing/ProtectedRoute";
import AppLayout from "./components/layout/AppLayout";
import PageLoader from "./components/common/PageLoader";
import useAuth from "./hooks/useAuth";
import { ROLES } from "./utils/permissions";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Subscribers from "./pages/Subscribers";
import SubscriberDetail from "./pages/SubscriberDetail";
import Plans from "./pages/Plans";
import Subscriptions from "./pages/Subscriptions";
import Billing from "./pages/Billing";
import Usage from "./pages/Usage";
import Reports from "./pages/Reports";
import Notifications from "./pages/Notifications";
import Users from "./pages/Users";
import AuditLog from "./pages/AuditLog";
import NotFound from "./pages/NotFound";
import "./App.css";
import "./styles/app.css";

function AppRoutes() {
    const { initializing } = useAuth();

    if (initializing) {
        return <PageLoader text="Restoring your session..." />;
    }

    return (
        <Routes>
            <Route path="/login" element={<Login />} />

            <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/subscribers" element={<Subscribers />} />
                    <Route path="/subscribers/:id" element={<SubscriberDetail />} />
                    <Route path="/plans" element={<Plans />} />
                    <Route path="/subscriptions" element={<Subscriptions />} />
                    <Route path="/billing" element={<Billing />} />
                    <Route path="/usage" element={<Usage />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/notifications" element={<Notifications />} />
                    <Route
                        path="/users"
                        element={<ProtectedRoute roles={ROLES.SUPER}><Users /></ProtectedRoute>}
                    />
                    <Route
                        path="/audit"
                        element={<ProtectedRoute roles={ROLES.SUPER}><AuditLog /></ProtectedRoute>}
                    />
                    <Route path="*" element={<NotFound />} />
                </Route>
            </Route>
        </Routes>
    );
}

function App() {
    return (
        <BrowserRouter>
            <ToastProvider>
                <AuthProvider>
                    <RealtimeProvider>
                        <AppRoutes />
                    </RealtimeProvider>
                </AuthProvider>
            </ToastProvider>
        </BrowserRouter>
    );
}

export default App;
