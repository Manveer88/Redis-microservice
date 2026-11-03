import { useState } from "react";
import { Info } from "lucide-react";
import Modal from "../common/Modal";
import SubscriberPicker from "../common/SubscriberPicker";
import useApi from "../../hooks/useApi";
import useToast from "../../hooks/useToast";
import { getPlans } from "../../services/planService";
import { createSubscription } from "../../services/subscriptionService";
import { getErrorMessage } from "../../utils/errors";
import { formatCurrency, formatDataLimit } from "../../utils/format";

function NewSubscriptionModal({ subscriber: initialSubscriber, onClose, onCreated }) {
    const toast = useToast();
    const [subscriber, setSubscriber] = useState(initialSubscriber || null);
    const [planId, setPlanId] = useState(
        initialSubscriber?.plan_id ? String(initialSubscriber.plan_id) : ""
    );
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const plansState = useApi(() => getPlans({ status: "active", limit: 100 }), []);
    const plans = plansState.data || [];
    const plan = plans.find((p) => String(p.id) === planId);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        if (!subscriber) {
            setError("Select a subscriber.");
            return;
        }

        if (!plan) {
            setError("Select an active plan.");
            return;
        }

        setBusy(true);

        try {
            const body = await createSubscription({
                subscriber_id: Number(subscriber.id),
                plan_id: Number(plan.id)
            });
            toast.success(body?.message || "Subscription created. An invoice is being generated.");
            onCreated?.(body?.data);
            onClose();
        } catch (err) {
            setError(getErrorMessage(err, "Unable to create subscription"));
            setBusy(false);
        }
    };

    return (
        <Modal title="New subscription" onClose={onClose}>
            <form className="form-grid" onSubmit={handleSubmit}>
                <div className="field">
                    <span>Subscriber *</span>
                    <SubscriberPicker
                        value={subscriber}
                        onChange={setSubscriber}
                        disabled={Boolean(initialSubscriber)}
                    />
                    {subscriber?.status === "suspended" && (
                        <small className="field-error">This subscriber is suspended and cannot subscribe.</small>
                    )}
                </div>

                <label className="field">
                    <span>Plan *</span>
                    <select value={planId} onChange={(e) => setPlanId(e.target.value)} required>
                        <option value="">{plansState.loading && !plansState.loaded ? "Loading plans..." : "Select a plan"}</option>
                        {plans.map((p) => (
                            <option key={p.id} value={String(p.id)}>
                                {p.name} · {formatCurrency(p.price)}
                            </option>
                        ))}
                    </select>
                    {plansState.error && <small className="field-error">{plansState.error}</small>}
                </label>

                {plan && (
                    <div className="plan-summary">
                        <div>
                            <span>Price</span>
                            <strong>{formatCurrency(plan.price)}</strong>
                        </div>
                        <div>
                            <span>Validity</span>
                            <strong>{plan.validity_days} days</strong>
                        </div>
                        <div>
                            <span>Speed</span>
                            <strong>{plan.download_speed}/{plan.upload_speed} Mbps</strong>
                        </div>
                        <div>
                            <span>Data</span>
                            <strong>{formatDataLimit(plan.data_limit_gb)}</strong>
                        </div>
                    </div>
                )}

                <div className="info-note">
                    <Info size={16} />
                    <span>
                        The subscription is created as <strong>pending</strong> and an invoice is issued
                        automatically. It activates on its own as soon as the invoice is fully paid.
                    </span>
                </div>

                {error && <div className="form-error">{error}</div>}

                <div className="modal-actions">
                    <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
                        Cancel
                    </button>
                    <button type="submit" className="primary-button" disabled={busy}>
                        {busy ? "Creating..." : "Create subscription"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

export default NewSubscriptionModal;
