import { useState } from "react";
import Modal from "../common/Modal";
import useApi from "../../hooks/useApi";
import useToast from "../../hooks/useToast";
import { getPlans } from "../../services/planService";
import { createSubscriber, updateSubscriber } from "../../services/subscriberService";
import { getErrorMessage } from "../../utils/errors";
import { formatCurrency } from "../../utils/format";

function SubscriberFormModal({ subscriber, onClose, onSaved }) {
    const toast = useToast();
    const editing = Boolean(subscriber);
    const [form, setForm] = useState({
        name: subscriber?.name || "",
        username: subscriber?.username || "",
        email: subscriber?.email || "",
        mobile: subscriber?.mobile || "",
        plan_id: subscriber?.plan_id ? String(subscriber.plan_id) : ""
    });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const plansState = useApi(() => getPlans({ status: "active", limit: 100 }), []);
    const plans = plansState.data || [];
    const currentPlanMissing = subscriber?.plan_id && !plans.some((p) => String(p.id) === String(subscriber.plan_id));

    const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");

        const clean = (value) => {
            const trimmed = value.trim();
            return trimmed ? trimmed : editing ? null : undefined;
        };

        const payload = {
            name: form.name.trim(),
            email: clean(form.email),
            mobile: clean(form.mobile),
            plan_id: form.plan_id ? Number(form.plan_id) : editing ? null : undefined
        };

        if (!editing) {
            payload.username = form.username.trim();
        }

        try {
            const body = editing
                ? await updateSubscriber(subscriber.id, payload)
                : await createSubscriber(payload);
            toast.success(body?.message || (editing ? "Subscriber updated" : "Subscriber created"));
            onSaved?.(body?.data);
            onClose();
        } catch (err) {
            setError(getErrorMessage(err, "Unable to save subscriber"));
            setBusy(false);
        }
    };

    return (
        <Modal
            title={editing ? "Edit subscriber" : "New subscriber"}
            subtitle={editing ? `@${subscriber.username}` : "New subscribers start as inactive until a subscription is paid."}
            onClose={onClose}
        >
            <form className="form-grid two-columns" onSubmit={handleSubmit}>
                <label className="field">
                    <span>Full name *</span>
                    <input name="name" value={form.name} onChange={handleChange} maxLength={100} required />
                </label>

                <label className="field">
                    <span>Username {editing ? "(cannot be changed)" : "*"}</span>
                    <input
                        name="username"
                        value={form.username}
                        onChange={handleChange}
                        disabled={editing}
                        maxLength={64}
                        pattern="[A-Za-z0-9._@\-]+"
                        title="Letters, numbers, dot, dash, underscore or @"
                        required={!editing}
                    />
                </label>

                <label className="field">
                    <span>Email</span>
                    <input type="email" name="email" value={form.email} onChange={handleChange} maxLength={150} />
                </label>

                <label className="field">
                    <span>Mobile</span>
                    <input type="tel" name="mobile" value={form.mobile} onChange={handleChange} maxLength={20} />
                </label>

                <label className="field full">
                    <span>Plan</span>
                    <select name="plan_id" value={form.plan_id} onChange={handleChange}>
                        <option value="">No plan</option>
                        {currentPlanMissing && (
                            <option value={String(subscriber.plan_id)}>
                                {subscriber.plan_name || `Plan #${subscriber.plan_id}`} (inactive)
                            </option>
                        )}
                        {plans.map((plan) => (
                            <option key={plan.id} value={String(plan.id)}>
                                {plan.name} · {plan.download_speed}/{plan.upload_speed} Mbps · {formatCurrency(plan.price)}
                            </option>
                        ))}
                    </select>
                    {plansState.error && <small className="field-error">{plansState.error}</small>}
                </label>

                {error && <div className="form-error full">{error}</div>}

                <div className="modal-actions full">
                    <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
                        Cancel
                    </button>
                    <button type="submit" className="primary-button" disabled={busy}>
                        {busy ? "Saving..." : editing ? "Save changes" : "Create subscriber"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

export default SubscriberFormModal;
