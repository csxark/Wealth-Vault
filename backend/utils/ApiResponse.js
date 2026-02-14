class ApiResponse {
    constructor(statusCode, data, message = "Success") {
        this.statusCode = statusCode;
        this.data = data;
        this.message = message;
        this.success = statusCode < 400;
    }

    send(res) {
        return res.status(this.statusCode).json(this);
    }
}

export { ApiResponse };
