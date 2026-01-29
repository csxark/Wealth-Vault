// Unit test for the users table schema using Jest
import { users } from "../db/schema.js";

describe("Users Table Schema", () => {
  test("should have expected columns", () => {
    const columns = Object.keys(users.shape);
    expect(columns).toEqual(
      expect.arrayContaining([
        "id",
        "email",
        "password",
        "name",
        "created_at",
        "updated_at",
      ]),
    );
  });
});
