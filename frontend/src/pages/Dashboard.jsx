
import { useEffect, useState } from "react";
import { Users, Router, Activity, Package } from "lucide-react";
import api from "../services/api";

function Dashboard() {
    const [subscriberCount, setSubscriberCount] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSubscribers = async () => {
            try {
                const response = await api.get("/subscribers");

                setSubscriberCount(response.data.data.length);
            } catch (error) {
                console.error("Dashboard API error:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchSubscribers();
    }, []);

    const stats = [
        {
            title: "Total Subscribers",
            value: loading ? "..." : subscriberCount,
            icon: Users
        },
        {
            title: "NAS Devices",
            value: "Coming soon",
            icon: Router
        },
        {
            title: "Active Sessions",
            value: "Coming soon",
            icon: Activity
        },
        {
            title: "Internet Plans",
            value: "Coming soon",
            icon: Package
        }
    ];

    return (
        <div>
            <div className="page-heading">
                <div>
                    <h1>Dashboard</h1>
                    <p>Overview of your RADIUS management system.</p>
                </div>
            </div>

            <div className="stats-grid">
                {stats.map((stat) => {
                    const Icon = stat.icon;

                    return (
                        <div className="stat-card" key={stat.title}>
                            <div className="stat-icon">
                                <Icon size={22} />
                            </div>

                            <p>{stat.title}</p>
                            <h2>{stat.value}</h2>
                        </div>
                    );
                })}
            </div>

            <div className="welcome-card">
                <h2>RADIUS Management System</h2>
                <p>
                    Manage subscribers, network devices,
                    internet plans and authentication.
                </p>
            </div>
        </div>
    );
}

export default Dashboard;
