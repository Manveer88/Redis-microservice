
const errorHandler = (err, req, res, next) => {
    console.error(err);

    const statusCode = err.statusCode || (
        err.code === "ER_DUP_ENTRY" ? 409 : 500
    );

    const message = err.code === "ER_DUP_ENTRY"
        ? "Username or email already exists"
        : statusCode === 500
            ? "Internal server error"
            : err.message;

    res.status(statusCode).json({
        success: false,
        message
    });
};

module.exports = errorHandler;
