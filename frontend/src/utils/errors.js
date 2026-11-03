export const getErrorMessage = (error, fallback = "Something went wrong") => {
    if (!error) {
        return fallback;
    }

    if (!error.response) {
        if (error.code === "ECONNABORTED") {
            return "The request timed out. Please try again.";
        }

        return error.message === "Network Error"
            ? "Unable to reach the server. Check your connection."
            : error.message || fallback;
    }

    const status = error.response.status;
    const message = error.response.data?.message;

    if (status === 429) {
        return message || "Too many requests. Please wait a moment and try again.";
    }

    if (status === 403 && !message) {
        return "You do not have permission to perform this action.";
    }

    return message || fallback;
};

export const getBlobErrorMessage = async (error, fallback) => {
    const data = error?.response?.data;

    if (data instanceof Blob) {
        try {
            const parsed = JSON.parse(await data.text());
            return parsed.message || fallback;
        } catch {
            return fallback;
        }
    }

    return getErrorMessage(error, fallback);
};
