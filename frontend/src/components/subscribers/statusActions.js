export const getStatusActions = (subscriber) => {
    if (!subscriber) {
        return [];
    }

    if (subscriber.status === "suspended") {
        return [{ key: "unsuspend", label: "Unsuspend", tone: "success" }];
    }

    const actions = [];

    if (subscriber.status === "active") {
        actions.push({
            key: "deactivate",
            label: "Deactivate",
            status: "inactive",
            confirm: "The subscriber will be marked inactive and lose access until reactivated."
        });
    } else {
        actions.push({ key: "activate", label: "Activate", status: "active", tone: "success" });
    }

    actions.push({
        key: "suspend",
        label: "Suspend",
        status: "suspended",
        danger: true,
        confirm: "Suspended subscribers cannot subscribe or pay, and stay suspended until unsuspended."
    });

    return actions;
};

export const resolveTargetStatus = (action, subscriber) => {
    if (action.key !== "unsuspend") {
        return action.status;
    }

    const expires = subscriber.expires_at ? new Date(subscriber.expires_at).getTime() : 0;

    return expires > Date.now() ? "active" : "inactive";
};
