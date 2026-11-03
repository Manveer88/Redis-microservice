import { useState } from "react";
import { Plus, Pencil, KeyRound, Search } from "lucide-react";
import useApi from "../hooks/useApi";
import useAuth from "../hooks/useAuth";
import useToast from "../hooks/useToast";
import useDebounce from "../hooks/useDebounce";
import useEventRefresh from "../hooks/useEventRefresh";
import { getUsers, createUser, updateUser, updateUserStatus, resetUserPassword } from "../services/userService";
import Modal from "../components/common/Modal";
import ConfirmModal from "../components/common/ConfirmModal";
import Pagination from "../components/common/Pagination";
import StatusBadge from "../components/common/StatusBadge";
import TableState from "../components/common/TableState";
import { PAGE_SIZE } from "../config/constants";
import { ROLES, ROLE_LABELS, roleLabel } from "../utils/permissions";
import { getErrorMessage } from "../utils/errors";
import { formatDate, formatDateTime, formatNumber } from "../utils/format";

function UserFormModal({ account, onClose, onSaved }) {
    const toast = useToast();
    const editing = Boolean(account);
    const [form, setForm] = useState({
        name: account?.name || "",
        email: account?.email || "",
        role: account?.role || "operator",
        password: ""
    });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        if (!editing && form.password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }

        setBusy(true);

        const payload = { name: form.name.trim(), email: form.email.trim(), role: form.role };

        try {
            const body = editing
                ? await updateUser(account.id, payload)
                : await createUser({ ...payload, password: form.password });
            toast.success(body?.message || (editing ? "User updated" : "User created"));
            onSaved();
            onClose();
        } catch (err) {
            setError(getErrorMessage(err, "Unable to save user"));
            setBusy(false);
        }
    };

    return (
        <Modal title={editing ? "Edit user" : "New user"} onClose={onClose} size="sm">
            <form className="form-grid" onSubmit={handleSubmit}>
                <label className="field">
                    <span>Name *</span>
                    <input name="name" value={form.name} onChange={handleChange} maxLength={100} required />
                </label>
                <label className="field">
                    <span>Email *</span>
                    <input type="email" name="email" value={form.email} onChange={handleChange} maxLength={150} required />
                </label>
                <label className="field">
                    <span>Role *</span>
                    <select name="role" value={form.role} onChange={handleChange}>
                        {ROLES.ALL.map((role) => (
                            <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                        ))}
                    </select>
                </label>
                {!editing && (
                    <label className="field">
                        <span>Password * (min 8 characters)</span>
                        <input
                            type="password"
                            name="password"
                            value={form.password}
                            onChange={handleChange}
                            minLength={8}
                            autoComplete="new-password"
                            required
                        />
                    </label>
                )}

                {error && <div className="form-error">{error}</div>}

                <div className="modal-actions">
                    <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
                        Cancel
                    </button>
                    <button type="submit" className="primary-button" disabled={busy}>
                        {busy ? "Saving..." : editing ? "Save changes" : "Create user"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

function ResetPasswordModal({ account, onClose }) {
    const toast = useToast();
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }

        if (password !== confirm) {
            setError("Passwords do not match.");
            return;
        }

        setBusy(true);

        try {
            const body = await resetUserPassword(account.id, password);
            toast.success(body?.message || `Password reset for ${account.name}. Their sessions were signed out.`);
            onClose();
        } catch (err) {
            setError(getErrorMessage(err, "Unable to reset password"));
            setBusy(false);
        }
    };

    return (
        <Modal title="Reset password" subtitle={`${account.name} · ${account.email}`} onClose={onClose} size="sm">
            <form className="form-grid" onSubmit={handleSubmit}>
                <label className="field">
                    <span>New password</span>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} autoComplete="new-password" required />
                </label>
                <label className="field">
                    <span>Confirm password</span>
                    <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
                </label>
                <p className="muted small">All of this user's active sessions will be revoked.</p>

                {error && <div className="form-error">{error}</div>}

                <div className="modal-actions">
                    <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
                        Cancel
                    </button>
                    <button type="submit" className="primary-button" disabled={busy}>
                        {busy ? "Saving..." : "Reset password"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

function Users() {
    const { user } = useAuth();
    const toast = useToast();
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [role, setRole] = useState("");
    const [status, setStatus] = useState("");
    const [editing, setEditing] = useState(null);
    const [resetting, setResetting] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const debouncedSearch = useDebounce(search.trim());

    const { data, meta, loading, loaded, error, reload } = useApi(
        () =>
            getUsers({
                page,
                limit: PAGE_SIZE,
                search: debouncedSearch || undefined,
                role: role || undefined,
                status: status || undefined
            }),
        [page, debouncedSearch, role, status]
    );

    useEventRefresh("admin.*", reload);

    const rows = data || [];

    const toggleStatus = (account) => {
        const next = account.status === "active" ? "inactive" : "active";

        const apply = async () => {
            const body = await updateUserStatus(account.id, next);
            toast.success(body?.message || `${account.name} is now ${next}`);
            reload();
        };

        if (next === "inactive") {
            setConfirm({
                title: "Deactivate user",
                message: <p>Deactivate <strong>{account.name}</strong>? They will be signed out immediately.</p>,
                confirmLabel: "Deactivate",
                danger: true,
                onConfirm: apply
            });
            return;
        }

        apply().catch((err) => toast.error(getErrorMessage(err, "Unable to update status")));
    };

    const change = (setter) => (e) => {
        setter(e.target.value);
        setPage(1);
    };

    return (
        <div>
            <div className="page-heading">
                <div>
                    <h1>Users</h1>
                    <p>Administrator accounts and roles.</p>
                </div>
                <button className="primary-button" onClick={() => setEditing({})}>
                    <Plus size={16} /> New user
                </button>
            </div>

            <div className="table-card">
                <div className="table-toolbar">
                    <h3>Administrators ({formatNumber(meta?.total ?? rows.length)})</h3>
                    <div className="toolbar-filters">
                        <div className="search-box">
                            <Search size={17} />
                            <input type="text" placeholder="Search name or email..." value={search} onChange={change(setSearch)} />
                        </div>
                        <select className="filter-select" value={role} onChange={change(setRole)}>
                            <option value="">All roles</option>
                            {ROLES.ALL.map((r) => (
                                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                            ))}
                        </select>
                        <select className="filter-select" value={status} onChange={change(setStatus)}>
                            <option value="">All statuses</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </div>
                </div>

                <div className={`table-responsive ${loading && loaded ? "refreshing" : ""}`}>
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Last login</th>
                                <th>Created</th>
                                <th className="actions-col">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <TableState
                                colSpan={7}
                                loading={loading && !loaded}
                                error={error}
                                empty={!error && loaded && rows.length === 0}
                                emptyText="No users found."
                                onRetry={reload}
                            />
                            {!error && rows.map((account) => {
                                const self = String(account.id) === String(user?.id);

                                return (
                                    <tr key={account.id}>
                                        <td className="cell-main">
                                            {account.name}
                                            {self && <span className="you-tag">You</span>}
                                        </td>
                                        <td>{account.email}</td>
                                        <td><span className={`role-tag ${account.role}`}>{roleLabel(account.role)}</span></td>
                                        <td><StatusBadge status={account.status} /></td>
                                        <td>{formatDateTime(account.last_login_at)}</td>
                                        <td>{formatDate(account.created_at)}</td>
                                        <td className="actions-col">
                                            <div className="table-actions">
                                                <button className="action-button" title="Edit" onClick={() => setEditing(account)}>
                                                    <Pencil size={14} />
                                                </button>
                                                <button className="action-button" title="Reset password" onClick={() => setResetting(account)}>
                                                    <KeyRound size={14} />
                                                </button>
                                                <button
                                                    className={`action-button text ${account.status === "active" ? "danger" : "success"}`}
                                                    onClick={() => toggleStatus(account)}
                                                    disabled={self}
                                                    title={self ? "You cannot deactivate yourself" : ""}
                                                >
                                                    {account.status === "active" ? "Deactivate" : "Activate"}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <Pagination meta={meta} page={page} onChange={setPage} label="users" />
            </div>

            {editing && (
                <UserFormModal account={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={reload} />
            )}
            {resetting && <ResetPasswordModal account={resetting} onClose={() => setResetting(null)} />}
            {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
        </div>
    );
}

export default Users;
