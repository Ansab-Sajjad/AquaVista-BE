import { connectTestDB, disconnectTestDB, clearCollections } from "./helpers/db";
import { User } from "../models/User.model";
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from "../services/token.service";
import { denylist } from "../services/token-denylist.service";

beforeAll(async () => {
  process.env.JWT_SECRET = "test-jwt-secret";
  process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret";
  process.env.JWT_EXPIRES_IN = "15m";
  process.env.JWT_REFRESH_EXPIRES_IN = "7d";
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

afterEach(async () => {
  await clearCollections();
});

describe("Token Service", () => {
  it("generateAccessToken creates a valid JWT with user id and role", () => {
    const user = new User({
      name: "Test User",
      email: "test@example.com",
      role: "project_user",
      status: "active",
      authProvider: "local",
    });

    const token = generateAccessToken(user);
    expect(token).toBeTruthy();

    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as { id: string; role: string };
    expect(decoded.id).toBe(user._id.toString());
    expect(decoded.role).toBe("project_user");
  });

  it("generateRefreshToken creates a token with type=refresh", () => {
    const user = new User({
      name: "Test User",
      email: "test@example.com",
      role: "admin",
      status: "active",
      authProvider: "local",
    });

    const token = generateRefreshToken(user);
    expect(token).toBeTruthy();

    const decoded = verifyRefreshToken(token);
    expect(decoded.id).toBe(user._id.toString());
    expect(decoded.role).toBe("admin");
  });

  it("verifyRefreshToken throws on invalid token", () => {
    expect(() => verifyRefreshToken("invalid-token")).toThrow();
  });
});

describe("Token Denylist (MongoDB-backed)", () => {
  it("adds and detects a revoked token", async () => {
    const token = "test-revoke-token-123";
    const expiresAt = new Date(Date.now() + 60_000);

    await denylist.add(token, expiresAt);
    const isRevoked = await denylist.has(token);
    expect(isRevoked).toBe(true);
  });

  it("returns false for a non-revoked token", async () => {
    const isRevoked = await denylist.has("non-existent-token");
    expect(isRevoked).toBe(false);
  });

  it("returns false and cleans up an expired token", async () => {
    const token = "expired-token-456";
    const expiresAt = new Date(Date.now() - 60_000);

    await denylist.add(token, expiresAt);
    const isRevoked = await denylist.has(token);
    expect(isRevoked).toBe(false);
  });
});

describe("User Model", () => {
  it("hashes password on save", async () => {
    const user = new User({
      name: "Hash Test",
      email: "hash@example.com",
      password: "testpassword123",
      role: "project_user",
      status: "active",
      authProvider: "local",
    });

    await user.save();
    expect(user.password).not.toBe("testpassword123");
    expect(user.password).toBeTruthy();
  });

  it("comparePassword returns true for correct password", async () => {
    const user = new User({
      name: "Compare Test",
      email: "compare@example.com",
      password: "mypassword123",
      role: "project_user",
      status: "active",
      authProvider: "local",
    });

    await user.save();
    const isMatch = await user.comparePassword("mypassword123");
    expect(isMatch).toBe(true);
  });

  it("comparePassword returns false for incorrect password", async () => {
    const user = new User({
      name: "Compare Test",
      email: "compare2@example.com",
      password: "mypassword123",
      role: "project_user",
      status: "active",
      authProvider: "local",
    });

    await user.save();
    const isMatch = await user.comparePassword("wrongpassword");
    expect(isMatch).toBe(false);
  });

  it("comparePassword returns false when no password is set (OAuth user)", async () => {
    const user = new User({
      name: "OAuth User",
      email: "oauth@example.com",
      role: "project_user",
      status: "active",
      authProvider: "github",
    });

    await user.save();
    const isMatch = await user.comparePassword("anything");
    expect(isMatch).toBe(false);
  });

  it("does not hash password when password is not modified", async () => {
    const user = new User({
      name: "No Mod Test",
      email: "nomod@example.com",
      password: "initialpassword123",
      role: "project_user",
      status: "active",
      authProvider: "local",
    });

    await user.save();
    const originalHash = user.password;

    user.name = "Updated Name";
    await user.save();
    expect(user.password).toBe(originalHash);
  });
});
