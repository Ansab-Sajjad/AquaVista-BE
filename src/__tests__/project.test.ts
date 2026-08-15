import { connectTestDB, disconnectTestDB, clearCollections } from "./helpers/db";
import { User } from "../models/User.model";
import { Project } from "../models/Project.model";

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

afterEach(async () => {
  await clearCollections();
});

describe("Project Model", () => {
  it("creates a project with required fields", async () => {
    const admin = await User.create({
      name: "Admin User",
      email: "admin@example.com",
      role: "admin",
      status: "active",
      authProvider: "local",
    });

    const project = await Project.create({
      name: "Test Project",
      municipality: "Test City",
      createdBy: admin._id,
      members: [{ user: admin._id }],
    });

    expect(project._id).toBeTruthy();
    expect(project.name).toBe("Test Project");
    expect(project.municipality).toBe("Test City");
    expect(project.members).toHaveLength(1);
    expect(project.members[0].user.toString()).toBe(admin._id.toString());
  });

  it("requires name and municipality", async () => {
    const project = new Project({});
    await expect(project.save()).rejects.toThrow();
  });

  it("adds members to a project", async () => {
    const admin = await User.create({
      name: "Admin User",
      email: "admin2@example.com",
      role: "admin",
      status: "active",
      authProvider: "local",
    });

    const member = await User.create({
      name: "Member User",
      email: "member@example.com",
      role: "project_user",
      status: "active",
      authProvider: "local",
    });

    const project = await Project.create({
      name: "Team Project",
      municipality: "Team City",
      createdBy: admin._id,
      members: [
        { user: admin._id },
        { user: member._id },
      ],
    });

    expect(project.members).toHaveLength(2);
  });
});

describe("User Model — Auth Provider", () => {
  it("creates a local user with authProvider=local", async () => {
    const user = await User.create({
      name: "Local User",
      email: "local@example.com",
      password: "password123",
      role: "project_user",
      status: "active",
      authProvider: "local",
    });

    expect(user.authProvider).toBe("local");
    expect(user.password).toBeTruthy();
  });

  it("creates a GitHub OAuth user without password", async () => {
    const user = await User.create({
      name: "GitHub User",
      email: "github@example.com",
      role: "project_user",
      status: "active",
      authProvider: "github",
    });

    expect(user.authProvider).toBe("github");
    expect(user.password).toBeUndefined();
  });

  it("creates a Google OAuth user without password", async () => {
    const user = await User.create({
      name: "Google User",
      email: "google@example.com",
      role: "project_user",
      status: "active",
      authProvider: "google",
    });

    expect(user.authProvider).toBe("google");
    expect(user.password).toBeUndefined();
  });

  it("defaults to pending status for new local registrations", async () => {
    const user = await User.create({
      name: "Pending User",
      email: "pending@example.com",
      role: "project_user",
      authProvider: "local",
    });

    expect(user.status).toBe("pending");
  });
});
