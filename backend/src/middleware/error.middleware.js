
const errorHandler = (err, req, res, next) => {
    console.error(err);

    const statusCode = err.statusCode || (
        ["ER_DUP_ENTRY", "ER_ROW_IS_REFERENCED_2"].includes(err.code) ? 409 : 500
    );

    const message = err.code === "ER_DUP_ENTRY"
        ? "Username or email already exists"
        : err.code === "ER_ROW_IS_REFERENCED_2"
            ? "Record is in use and cannot be deleted"
            : statusCode === 500
            ? "Internal server error"
            : err.message;

    res.status(statusCode).json({
        success: false,
        message
    });
};

module.exports = errorHandler;
