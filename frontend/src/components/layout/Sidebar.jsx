
import { NavLink } from "react-router-dom";
import {
    LayoutDashboard,
    Users,
    Router,
    Package,
    Activity,
    Settings
} from "lucide-react";

const menuItems = [
    { name: "Dashboard", path: "/", icon: LayoutDashboard },
    { name: "Subscribers", path: "/subscribers", icon: Users },
    { name: "NAS Devices", path: "/nas", icon: Router },
    { name: "Plans", path: "/plans", icon: Package },
    { name: "Sessions", path: "/sessions", icon: Activity },
    { name: "Settings", path: "/settings", icon: Settings }
];

function Sidebar() {
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
                {menuItems.map((item) => {
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
                })}
            </nav>

            <div className="sidebar-footer">
                <div className="status-dot"></div>
                RADIUS System
                <span>Development</span>
            </div>
        </aside>
    );
}

export default Sidebar;
