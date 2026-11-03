import { useState } from "react";
import useApi from "../hooks/useApi";
import useAuth from "../hooks/useAuth";
import useToast from "../hooks/useToast";
import useEventRefresh from "../hooks/useEventRefresh";
import ConfirmModal from "../components/common/ConfirmModal";
import Pagination from "../components/common/Pagination";
import StateMessage from "../components/common/StateMessage";
import { can } from "../utils/permissions";
import { getErrorMessage } from "../utils/errors";
import { formatCurrency, formatDataLimit } from "../utils/format";
import {
  getPlans,
  createPlan,
  updatePlan,
  updatePlanStatus,
  deletePlan,
} from "../services/planService";

const PLAN_PAGE_SIZE = 12;

const initialForm = {
  name: "",
  download_speed: "",
  upload_speed: "",
  data_limit_gb: "",
  validity_days: 30,
  price: "",
};

function Plans() {
  const { user } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [deleting, setDeleting] = useState(null);

  const { data, meta, loading, loaded, error: loadError, reload } = useApi(
    () => getPlans({ page, limit: PLAN_PAGE_SIZE, status: status || undefined }),
    [page, status]
  );

  useEventRefresh("plan.*", reload);

  const plans = data || [];
  const canWrite = can(user, "plans.write");

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const dataLimit = String(form.data_limit_gb).trim();
      const payload = {
        ...form,
        name: form.name.trim(),
        download_speed: Number(form.download_speed),
        upload_speed: Number(form.upload_speed),
        data_limit_gb: dataLimit === "" || Number(dataLimit) === 0 ? null : Number(dataLimit),
        validity_days: Number(form.validity_days),
        price: Number(form.price),
      };

      if (editingId) {
        await updatePlan(editingId, payload);
        toast.success("Plan updated");
      } else {
        await createPlan(payload);
        toast.success("Plan created");
      }

      setForm(initialForm);
      setEditingId(null);
      setShowForm(false);
      reload();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to save plan"));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (plan) => {
    setEditingId(plan.id);
    setError("");
    setForm({
      name: plan.name,
      download_speed: plan.download_speed,
      upload_speed: plan.upload_speed,
      data_limit_gb: plan.data_limit_gb === null || Number(plan.data_limit_gb) === 0 ? "" : plan.data_limit_gb,
      validity_days: plan.validity_days,
      price: plan.price,
    });
    setShowForm(true);
  };

  const handleStatus = async (plan) => {
    setError("");

    try {
      const nextStatus = plan.status === "active" ? "inactive" : "active";
      await updatePlanStatus(plan.id, nextStatus);
      toast.success(`${plan.name} is now ${nextStatus}`);
      reload();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to update status"));
    }
  };

  const handleDelete = async (plan) => {
    const body = await deletePlan(plan.id);
    toast.success(body?.message || "Plan deleted");
    reload();
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setShowForm(false);
    setError("");
  };

  return (
    <div className="plans-page">
      <div className="page-header">
        <div>
          <h1>Internet Plans</h1>
          <p>Manage your internet packages and pricing.</p>
        </div>

        <div className="heading-actions">
          <select
            className="filter-select"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All plans</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          {canWrite && (
            <button className="primary-button" onClick={() => {
              resetForm();
              setShowForm(true);
            }}>
              + Add Plan
            </button>
          )}
        </div>
      </div>

      {error && <p className="error-message">{error}</p>}

      {showForm && canWrite && (
        <form onSubmit={handleSubmit} className="plan-form">
          <h2>{editingId ? "Edit Plan" : "Create Plan"}</h2>

          <input
            name="name"
            placeholder="Plan name"
            value={form.name}
            onChange={handleChange}
            required
          />

          <input
            type="number"
            name="download_speed"
            placeholder="Download speed (Mbps)"
            value={form.download_speed}
            onChange={handleChange}
            min="1"
            required
          />

          <input
            type="number"
            name="upload_speed"
            placeholder="Upload speed (Mbps)"
            value={form.upload_speed}
            onChange={handleChange}
            min="1"
            required
          />

          <input
            type="number"
            name="data_limit_gb"
            placeholder="Data limit (GB) — leave blank or 0 for Unlimited"
            value={form.data_limit_gb}
            onChange={handleChange}
            min="0"
          />

          <input
            type="number"
            name="validity_days"
            placeholder="Validity (days)"
            value={form.validity_days}
            onChange={handleChange}
            min="1"
            required
          />

          <input
            type="number"
            name="price"
            placeholder="Price (₹)"
            value={form.price}
            onChange={handleChange}
            min="0"
            step="0.01"
            required
          />

          <div className="form-actions">
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update Plan" : "Create Plan"}
            </button>

            <button type="button" className="secondary-button" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <StateMessage
        loading={loading && !loaded}
        error={loadError}
        empty={loaded && !loadError && plans.length === 0}
        emptyText="No plans found."
        onRetry={reload}
      >
        <div className="plans-grid">
          {plans.map((plan) => (
            <div className="plan-card" key={plan.id}>
              <div className="plan-card-header">
                <h3>{plan.name}</h3>
                <span className={`status ${plan.status}`}>
                  {plan.status}
                </span>
              </div>

              <h2>{formatCurrency(plan.price)}</h2>
              <p>Download: {plan.download_speed} Mbps</p>
              <p>Upload: {plan.upload_speed} Mbps</p>
              <p>Data: {formatDataLimit(plan.data_limit_gb)}</p>
              <p>Validity: {plan.validity_days} days</p>

              {canWrite && (
                <div className="plan-actions">
                  <button onClick={() => handleEdit(plan)}>
                    Edit
                  </button>

                  <button onClick={() => handleStatus(plan)}>
                    {plan.status === "active" ? "Deactivate" : "Activate"}
                  </button>

                  <button className="danger" onClick={() => setDeleting(plan)}>
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </StateMessage>

      <div className="plans-pagination">
        <Pagination meta={meta} page={page} onChange={setPage} label="plans" />
      </div>

      {deleting && (
        <ConfirmModal
          title="Delete plan"
          message={`Are you sure you want to delete "${deleting.name}"? Plans used by subscribers or subscriptions cannot be deleted.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDelete(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

export default Plans;
