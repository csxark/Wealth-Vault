describe("API Integration: Health Check", () => {
// Jest setup for integration tests with Supertest
import request from "supertest";
import app from "../server.js";

describe("API Integration: Health Check", () => {
  it("should return 200 OK for /api/health", async () => {
    const res = await request(app).get("/api/health");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("status", "ok");
  });
});
