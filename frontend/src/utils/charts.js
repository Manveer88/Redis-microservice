import { formatCurrency, formatMonth } from "./format";

const lastMonths = (count) => {
    const now = new Date();
    const months = [];

    for (let i = count - 1; i >= 0; i -= 1) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
    }

    return months;
};

export const buildRevenueSeries = (rows, months) => {
    const byMonth = new Map((rows || []).map((row) => [String(row.month).slice(0, 7), row]));

    return lastMonths(months).map((month) => {
        const row = byMonth.get(month);

        return {
            key: month,
            label: formatMonth(month),
            value: Number(row?.amount) || 0,
            title: `${formatMonth(month)}: ${formatCurrency(row?.amount)} (${row?.payments || 0} payments)`
        };
    });
};
