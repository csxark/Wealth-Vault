describe("API Integration: Health Check", () => {
// Basic API integration tests
import request from "supertest";
import app from "../server.js";

describe("API Integration: Health Check", () => {
  it("should return 200 OK for /api/health", async () => {
    const res = await request(app).get("/api/health");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("status", "ok");
  });

  it("should return 404 for non-existent routes", async () => {
    const res = await request(app).get("/api/nonexistent");
    expect(res.statusCode).toBe(404);
  });

  it("should have correct CORS headers", async () => {
    const res = await request(app)
      .get("/api/health")
      .set("Origin", "http://localhost:5173");
    
    expect(res.headers).toHaveProperty("access-control-allow-origin");
  });
});

