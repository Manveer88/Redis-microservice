
import { NavLink } from "react-router-dom";
import {
    LayoutDashboard,
    Users,
    Package,
    Repeat,
    Receipt,
    Gauge,
    BarChart3,
    Bell,
    UserCog,
    ScrollText
} from "lucide-react";
import useAuth from "../../hooks/useAuth";
import useRealtime from "../../hooks/useRealtime";
import { ROLES, hasRole } from "../../utils/permissions";

const menuItems = [
    { name: "Dashboard", path: "/", icon: LayoutDashboard },
    { name: "Subscribers", path: "/subscribers", icon: Users },
    { name: "Plans", path: "/plans", icon: Package },
    { name: "Subscriptions", path: "/subscriptions", icon: Repeat },
    { name: "Billing", path: "/billing", icon: Receipt },
    { name: "Usage", path: "/usage", icon: Gauge },
    { name: "Reports", path: "/reports", icon: BarChart3 },
    { name: "Notifications", path: "/notifications", icon: Bell }
];

const adminItems = [
    { name: "Users", path: "/users", icon: UserCog, roles: ROLES.SUPER },
    { name: "Audit Log", path: "/audit", icon: ScrollText, roles: ROLES.SUPER }
];

const renderLink = (item) => {
    const Icon = item.icon;

    return (
        <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) =>
                `sidebar-link ${isActive ? "active" : ""}`
            }
        >
            <Icon size={19} />
            <span>{item.name}</span>
        </NavLink>
    );
};

function Sidebar() {
    const { user } = useAuth();
    const { status } = useRealtime();
    const visibleAdminItems = adminItems.filter((item) => hasRole(user, item.roles));
    const live = status === "live";

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <div className="logo-icon">R</div>
                <div>
                    <h2>RadiusPro</h2>
                    <span>Management System</span>
                </div>
            </div>

            <p className="menu-label">MAIN MENU</p>

            <nav>
                {menuItems.map(renderLink)}
            </nav>

            {visibleAdminItems.length > 0 && (
                <>
                    <p className="menu-label administration">ADMINISTRATION</p>
                    <nav>
                        {visibleAdminItems.map(renderLink)}
                    </nav>
                </>
            )}

            <div className="sidebar-footer">
                <div className={`status-dot ${live ? "" : "offline"}`}></div>
                {live ? "Live" : "Offline"}
                <span>{live ? "Receiving realtime updates" : "Realtime updates paused"}</span>
            </div>
        </aside>
    );
}

export default Sidebar;
