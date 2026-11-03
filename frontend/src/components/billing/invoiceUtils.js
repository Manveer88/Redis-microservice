export const getOutstanding = (invoice) => {
    if (!invoice) {
        return 0;
    }

    if (invoice.outstanding !== undefined && invoice.outstanding !== null) {
        return Math.max(0, Number(invoice.outstanding));
    }

    return Math.max(0, Math.round((Number(invoice.amount) - Number(invoice.amount_paid || 0)) * 100) / 100);
};

export const canPayInvoice = (invoice) =>
    Boolean(invoice) && ["unpaid", "partial"].includes(invoice.status) && getOutstanding(invoice) > 0;

export const canVoidInvoice = (invoice) =>
    Boolean(invoice) && invoice.status !== "void" && Number(invoice.amount_paid || 0) === 0;
