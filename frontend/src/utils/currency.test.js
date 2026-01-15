import { describe, test, expect, beforeEach, vi } from "vitest";
import { convertCurrency } from "./currency.js";

// Mock global fetch
global.fetch = vi.fn();

describe("convertCurrency utility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("should successfully convert currency", async () => {
    const mockRate = 0.85;
    const mockResponse = {
      rates: {
        EUR: mockRate,
      },
    };

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const amount = 100;
    const from = "USD";
    const to = "EUR";

    const result = await convertCurrency(amount, from, to);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      `https://api.frankfurter.app/latest?amount=${amount}&from=${from}&to=${to}`
    );
    expect(result).toBe(mockRate);
  });

  test("should throw error when API response is not ok", async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    });

    await expect(convertCurrency(100, "USD", "EUR")).rejects.toThrow(
      "API rate limit exceeded. Please try again later."
    );
  });

  test("should throw error on network failure", async () => {
    const networkError = new Error("Network error");
    fetch.mockRejectedValueOnce(networkError);

    await expect(convertCurrency(100, "USD", "EUR")).rejects.toThrow(
      "Network error"
    );
  });

  test("should retry on network failure and succeed", async () => {
    const mockRate = 0.85;
    const mockResponse = {
      rates: {
        EUR: mockRate,
      },
    };

    // First call fails, second succeeds
    fetch
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

    const result = await convertCurrency(100, "USD", "EUR");

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toBe(mockRate);
  });
});
