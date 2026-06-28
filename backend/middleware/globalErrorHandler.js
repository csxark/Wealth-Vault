import { AppError } from "../utils/AppError.js";

/**
 * Global Error Handler Middleware
 * Intercepts all errors passed to next() and formats them consistently
 */
const globalErrorHandler = (err, req, res, next) => {
    let error = err;

    // If it's not an instance of our AppError, convert it
    if (!(error instanceof AppError)) {
        const statusCode = error.statusCode || 500;
        const message = error.message || "Internal Server Error";
        error = new AppError(statusCode, message, [], err.stack);
    }

    const response = {
        success: false,
        message: error.message,
        errors: error.errors || [],
        ...(process.env.NODE_ENV === "development" ? { stack: error.stack } : {}),
    };

    return res.status(error.statusCode).json(response);
};

export { globalErrorHandler };
