
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bell, UserCircle, KeyRound, LogOut, ChevronDown } from "lucide-react";
import useAuth from "../../hooks/useAuth";
import useApi from "../../hooks/useApi";
import useEventRefresh from "../../hooks/useEventRefresh";
import { getUnreadCount } from "../../services/notificationService";
import { roleLabel } from "../../utils/permissions";
import ChangePasswordModal from "./ChangePasswordModal";

const TITLES = [
    ["/subscribers/", "Subscriber details", "Profile, subscriptions, invoices and usage."],
    ["/subscribers", "Subscribers", "Manage your network subscribers."],
    ["/plans", "Plans", "Internet packages and pricing."],
    ["/subscriptions", "Subscriptions", "Plan purchases and renewals."],
    ["/billing", "Billing", "Invoices and payments."],
    ["/usage", "Usage", "Subscriber data consumption."],
    ["/reports", "Reports", "Revenue, expiry and usage insights."],
    ["/notifications", "Notifications", "System activity alerts."],
    ["/users", "Users", "Administrator accounts."],
    ["/audit", "Audit Log", "Every change made by administrators."]
];

const getGreeting = () => {
    const hour = new Date().getHours();

    if (hour < 12) {
        return "Good morning";
    }

    return hour < 17 ? "Good afternoon" : "Good evening";
};

function Header() {
    const { user, logout } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [greeting] = useState(getGreeting);

    const { data, reload } = useApi(() => getUnreadCount(), []);
    useEventRefresh(["notification.created", "notifications.changed"], reload, { delay: 300 });

    const unread = Number(data?.count) || 0;
    const match = TITLES.find(([path]) => location.pathname.startsWith(path));
    const firstName = (user?.name || "").split(" ")[0];

    const handleLogout = async () => {
        setMenuOpen(false);
        await logout();
        navigate("/login", { replace: true });
    };

    return (
        <header className="header">
            <div>
                {match ? (
                    <>
                        <h2>{match[1]}</h2>
                        <p>{match[2]}</p>
                    </>
                ) : (
                    <>
                        <h2>{greeting}{firstName ? `, ${firstName}` : ""}!</h2>
                        <p>Manage your ISP network from here.</p>
                    </>
                )}
            </div>

            <div className="header-actions">
                <Link to="/notifications" className="icon-button bell-button" aria-label="Notifications">
                    <Bell size={19} />
                    {unread > 0 && (
                        <span className="badge-count">{unread > 99 ? "99+" : unread}</span>
                    )}
                </Link>

                <div className="profile-menu">
                    <button
                        type="button"
                        className="admin-profile"
                        onClick={() => setMenuOpen((open) => !open)}
                    >
                        <UserCircle size={30} />
                        <div>
                            <strong>{user?.name || "Administrator"}</strong>
                            <span>{roleLabel(user?.role)}</span>
                        </div>
                        <ChevronDown size={15} />
                    </button>

                    {menuOpen && (
                        <>
                            <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
                            <div className="dropdown">
                                <div className="dropdown-head">
                                    <strong>{user?.name}</strong>
                                    <span>{user?.email}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMenuOpen(false);
                                        setShowPassword(true);
                                    }}
                                >
                                    <KeyRound size={16} /> Change password
                                </button>
                                <button type="button" className="danger" onClick={handleLogout}>
                                    <LogOut size={16} /> Logout
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {showPassword && <ChangePasswordModal onClose={() => setShowPassword(false)} />}
        </header>
    );
}

export default Header;
