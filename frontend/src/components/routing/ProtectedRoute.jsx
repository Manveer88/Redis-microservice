import { Navigate, Outlet, useLocation, Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import useAuth from "../../hooks/useAuth";
import { hasRole } from "../../utils/permissions";

function ProtectedRoute({ roles, children }) {
    const { user } = useAuth();
    const location = useLocation();

    if (!user) {
        return <Navigate to="/login" replace state={{ from: location }} />;
    }

    if (roles && !hasRole(user, roles)) {
        return (
            <div className="not-found">
                <ShieldAlert size={56} color="#b91c1c" />
                <h2>Access denied</h2>
                <p>Your role does not have permission to view this page.</p>
                <Link to="/">Back to Dashboard</Link>
            </div>
        );
    }

    return children ?? <Outlet />;
}

export default ProtectedRoute;
