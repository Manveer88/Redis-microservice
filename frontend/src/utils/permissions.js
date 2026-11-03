export const ROLES = {
    ALL: ["super_admin", "admin", "operator", "viewer"],
    STAFF: ["super_admin", "admin", "operator"],
    MANAGERS: ["super_admin", "admin"],
    SUPER: ["super_admin"]
};

export const ROLE_LABELS = {
    super_admin: "Super Admin",
    admin: "Admin",
    operator: "Operator",
    viewer: "Viewer"
};

const ACTIONS = {
    "plans.write": ROLES.MANAGERS,
    "subscribers.write": ROLES.STAFF,
    "subscribers.status": ROLES.STAFF,
    "subscribers.delete": ROLES.MANAGERS,
    "subscriptions.create": ROLES.STAFF,
    "subscriptions.cancel": ROLES.STAFF,
    "payments.record": ROLES.STAFF,
    "invoices.void": ROLES.MANAGERS,
    "usage.import": ROLES.STAFF,
    "reports.export": ROLES.MANAGERS,
    "users.manage": ROLES.SUPER,
    "audit.view": ROLES.SUPER
};

export const can = (user, action) => {
    if (!user?.role) {
        return false;
    }

    const allowed = ACTIONS[action] || (Array.isArray(action) ? action : null);

    return Boolean(allowed && allowed.includes(user.role));
};

export const hasRole = (user, roles) => Boolean(user?.role && roles.includes(user.role));

export const roleLabel = (role) => ROLE_LABELS[role] || role || "-";
