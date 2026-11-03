import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";

function AppLayout() {
    return (
        <div className="app-layout">
            <Sidebar />

            <main className="main-content">
                <Header />

                <div className="page-content">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}

export default AppLayout;
