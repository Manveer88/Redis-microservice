
import { Bell, Search, UserCircle } from "lucide-react";

function Header() {
    return (
        <header className="header">
            <div>
                <h2>Welcome back!</h2>
                <p>Manage your RADIUS network from here.</p>
            </div>

            <div className="header-actions">
                <button className="icon-button">
                    <Search size={19} />
                </button>

                <button className="icon-button">
                    <Bell size={19} />
                </button>

                <div className="admin-profile">
                    <UserCircle size={30} />
                    <div>
                        <strong>Administrator</strong>
                        <span>Super Admin</span>
                    </div>
                </div>
            </div>
        </header>
    );
}

export default Header;
