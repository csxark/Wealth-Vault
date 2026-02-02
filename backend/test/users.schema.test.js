

// Unit test for the users table schema using Jest
import { users } from "../db/schema.js";

describe("Users Table Schema", () => {
  test("should have id field", () => {
    expect(users).toBeDefined();
    expect(users.id).toBeDefined();
  });

  test("should have email field", () => {
    expect(users.email).toBeDefined();
  });

  test("should have password field", () => {
    expect(users.password).toBeDefined();
  });

  test("should have name field", () => {
    expect(users.name).toBeDefined();
  });

  test("should have timestamp fields", () => {
    expect(users.created_at).toBeDefined();
    expect(users.updated_at).toBeDefined();
  });
});
