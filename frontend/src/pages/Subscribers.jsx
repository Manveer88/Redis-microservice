
import { useEffect, useState } from "react";
import { Search, RefreshCw } from "lucide-react";
import api from "../services/api";

function Subscribers() {
    const [subscribers, setSubscribers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");

    const fetchSubscribers = async () => {
        try {
            setLoading(true);
            setError("");

            const response = await api.get("/subscribers");

            setSubscribers(response.data.data);
        } catch (err) {
            setError(
                err.response?.data?.message ||
                "Unable to fetch subscribers. Check backend connection."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSubscribers();
    }, []);

    const filteredSubscribers = subscribers.filter((user) => {
        const value = search.toLowerCase();

        return (
            user.name?.toLowerCase().includes(value) ||
            user.username?.toLowerCase().includes(value) ||
            user.email?.toLowerCase().includes(value)
        );
    });

    return (
        <div>
            <div className="page-heading">
                <div>
                    <h1>Subscribers</h1>
                    <p>Manage your network subscribers.</p>
                </div>

                <button
                    className="primary-button"
                    onClick={fetchSubscribers}
                >
                    <RefreshCw size={16} />
                    Refresh
                </button>
            </div>

            <div className="table-card">
                <div className="table-toolbar">
                    <h3>All Subscribers ({subscribers.length})</h3>

                    <div className="search-box">
                        <Search size={17} />

                        <input
                            type="text"
                            placeholder="Search subscribers..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                {loading ? (
                    <p className="table-message">
                        Loading subscribers...
                    </p>
                ) : error ? (
                    <p className="error-message">{error}</p>
                ) : (
                    <div className="table-responsive">
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Username</th>
                                    <th>Email</th>
                                    <th>Plan</th>
                                    <th>Download</th>
                                    <th>Upload</th>
                                    <th>Status</th>
                                </tr>
                            </thead>

                            <tbody>
                                {filteredSubscribers.length > 0 ? (
                                    filteredSubscribers.map((user) => (
                                        <tr key={user.id}>
                                            <td>{user.name}</td>
                                            <td>{user.username}</td>
                                            <td>{user.email || "-"}</td>
                                            <td>{user.plan_name || "-"}</td>
                                            <td>
                                                {user.download_speed
                                                    ? `${user.download_speed} Mbps`
                                                    : "-"}
                                            </td>
                                            <td>
                                                {user.upload_speed
                                                    ? `${user.upload_speed} Mbps`
                                                    : "-"}
                                            </td>
                                            <td>
                                                <span className={`status-badge ${user.status}`}>
                                                    {user.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="7" className="empty-state">
                                            No subscribers found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Subscribers;
