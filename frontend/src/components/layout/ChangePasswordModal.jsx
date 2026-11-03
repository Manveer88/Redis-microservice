import { useState } from "react";
import Modal from "../common/Modal";
import useToast from "../../hooks/useToast";
import { changePassword } from "../../services/authService";
import { getErrorMessage } from "../../utils/errors";

function ChangePasswordModal({ onClose }) {
    const toast = useToast();
    const [form, setForm] = useState({ current_password: "", new_password: "", confirm: "" });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        if (form.new_password.length < 8) {
            setError("New password must be at least 8 characters.");
            return;
        }

        if (form.new_password !== form.confirm) {
            setError("New passwords do not match.");
            return;
        }

        setBusy(true);

        try {
            await changePassword({
                current_password: form.current_password,
                new_password: form.new_password
            });
            toast.success("Password changed. Other sessions have been signed out.");
            onClose();
        } catch (err) {
            setError(getErrorMessage(err, "Unable to change password"));
            setBusy(false);
        }
    };

    return (
        <Modal title="Change password" onClose={onClose} size="sm">
            <form className="form-grid" onSubmit={handleSubmit}>
                <label className="field">
                    <span>Current password</span>
                    <input
                        type="password"
                        name="current_password"
                        value={form.current_password}
                        onChange={handleChange}
                        autoComplete="current-password"
                        required
                    />
                </label>
                <label className="field">
                    <span>New password</span>
                    <input
                        type="password"
                        name="new_password"
                        value={form.new_password}
                        onChange={handleChange}
                        autoComplete="new-password"
                        minLength={8}
                        required
                    />
                </label>
                <label className="field">
                    <span>Confirm new password</span>
                    <input
                        type="password"
                        name="confirm"
                        value={form.confirm}
                        onChange={handleChange}
                        autoComplete="new-password"
                        required
                    />
                </label>

                {error && <div className="form-error">{error}</div>}

                <div className="modal-actions">
                    <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
                        Cancel
                    </button>
                    <button type="submit" className="primary-button" disabled={busy}>
                        {busy ? "Saving..." : "Change password"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

export default ChangePasswordModal;
