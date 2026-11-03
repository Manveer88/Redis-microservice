
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Sidebar from "./components/layout/Sidebar";
import Header from "./components/layout/Header";

import Dashboard from "./pages/Dashboard";
import Subscribers from "./pages/Subscribers";
import NotFound from "./pages/NotFound";
import Plans from "./pages/Plans";
import "./App.css";

function App() {
    return (
        <BrowserRouter>
            <div className="app-layout">
                <Sidebar />

                <main className="main-content">
                    <Header />

                    <div className="page-content">
                        <Routes>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="/subscribers" element={<Subscribers />} />
                            <Route path="/plans" element={<Plans />} />
                            <Route path="*" element={<NotFound />} />
                        </Routes>
                    </div>
                </main>
            </div>
        </BrowserRouter>
    );
}

export default App;
