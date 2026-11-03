import { useEffect, useState } from "react";
import {
  getPlans,
  createPlan,
  updatePlan,
  updatePlanStatus,
  deletePlan,
} from "../services/planService";

const initialForm = {
  name: "",
  download_speed: "",
  upload_speed: "",
  data_limit_gb: "",
  validity_days: 30,
  price: "",
};

function Plans() {
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadPlans = async () => {
    try {
      setLoading(true);
      const data = await getPlans();
      setPlans(data);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load plans");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const payload = {
        ...form,
        download_speed: Number(form.download_speed),
        upload_speed: Number(form.upload_speed),
        data_limit_gb: Number(form.data_limit_gb),
        validity_days: Number(form.validity_days),
        price: Number(form.price),
      };

      if (editingId) {
        await updatePlan(editingId, payload);
      } else {
        await createPlan(payload);
      }

      setForm(initialForm);
      setEditingId(null);
      setShowForm(false);
      await loadPlans();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save plan");
    }
  };

  const handleEdit = (plan) => {
    setEditingId(plan.id);
    setForm({
      name: plan.name,
      download_speed: plan.download_speed,
      upload_speed: plan.upload_speed,
      data_limit_gb: plan.data_limit_gb,
      validity_days: plan.validity_days,
      price: plan.price,
    });
    setShowForm(true);
  };

  const handleStatus = async (plan) => {
    try {
      const status = plan.status === "active" ? "inactive" : "active";
      await updatePlanStatus(plan.id, status);
      await loadPlans();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to update status");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this plan?")) {
      return;
    }

    try {
      await deletePlan(id);
      await loadPlans();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to delete plan");
    }
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setShowForm(false);
  };

  return (
    <div className="plans-page">
      <div className="page-header">
        <div>
          <h1>Internet Plans</h1>
          <p>Manage your internet packages and pricing.</p>
        </div>

        <button onClick={() => {
          resetForm();
          setShowForm(true);
        }}>
          + Add Plan
        </button>
      </div>

      {error && <p className="error-message">{error}</p>}

      {showForm && (
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
            placeholder="Data limit (GB)"
            value={form.data_limit_gb}
            onChange={handleChange}
            min="0"
            required
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
            <button type="submit">
              {editingId ? "Update Plan" : "Create Plan"}
            </button>

            <button type="button" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p>Loading plans...</p>
      ) : (
        <div className="plans-grid">
          {plans.map((plan) => (
            <div className="plan-card" key={plan.id}>
              <div className="plan-card-header">
                <h3>{plan.name}</h3>
                <span className={`status ${plan.status}`}>
                  {plan.status}
                </span>
              </div>

              <h2>₹{Number(plan.price).toFixed(2)}</h2>
              <p>Download: {plan.download_speed} Mbps</p>
              <p>Upload: {plan.upload_speed} Mbps</p>
              <p>Data: {plan.data_limit_gb} GB</p>
              <p>Validity: {plan.validity_days} days</p>

              <div className="plan-actions">
                <button onClick={() => handleEdit(plan)}>
                  Edit
                </button>

                <button onClick={() => handleStatus(plan)}>
                  {plan.status === "active" ? "Deactivate" : "Activate"}
                </button>

                <button onClick={() => handleDelete(plan.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && plans.length === 0 && <p>No plans found.</p>}
    </div>
  );
}

export default Plans;