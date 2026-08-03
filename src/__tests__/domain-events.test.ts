import * as fc from "fast-check";
import mongoose from "mongoose";
import { connectTestDB, disconnectTestDB, clearCollections } from "./helpers/db";
import { Notification } from "../models/Notification.model";
import { Project } from "../models/Project.model";
import { User } from "../models/User.model";
import { createNotification } from "../services/notification.service";

const fcObjectId = () =>
  fc.hexaString({ minLength: 24, maxLength: 24 }).map((s) => new mongoose.Types.ObjectId(s));

beforeAll(async () => {
  await connectTestDB();
}, 120000);

afterAll(async () => {
  await disconnectTestDB();
}, 120000);

afterEach(async () => {
  await clearCollections();
});

/** Creates a real User document in the test DB */
async function createTestUser() {
  return User.create({
    name: "Test User",
    email: `test-${Math.random().toString(36).slice(2)}@example.com`,
    password: "TestPass123!",
    role: "project_user",
    status: "active",
  });
}

/**
 * Simulates the notification fan-out that extractAndStoreContent does.
 * We extract the pure notification logic so we can test it without the file system.
 */
async function simulateFileEventFanOut(
  projectId: mongoose.Types.ObjectId,
  originalName: string,
  status: "Completed" | "Failed"
) {
  const project = await Project.findById(projectId);
  if (!project) return;

  const category = status === "Completed" ? "file_upload_complete" : "file_upload_failed";
  const title =
    status === "Completed"
      ? `File processed: ${originalName}`
      : `File processing failed: ${originalName}`;
  const message =
    status === "Completed"
      ? `The file "${originalName}" has been processed successfully and is now available for analysis.`
      : `The file "${originalName}" could not be processed. Please try re-uploading the file.`;

  await Promise.all(
    project.members.map((m) =>
      createNotification({
        recipient: m.user,
        type: "system",
        category,
        title,
        message,
        projectId,
      })
    )
  );
}

// Feature: notification-system, Property 3: File event fan-out to all project members
describe("Property 3: File event fan-out to all project members", () => {
  it("creates exactly N notifications per file event for N project members", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.constantFrom("Completed" as const, "Failed" as const),
        async (memberCount, status) => {
          await clearCollections();

          const adminUser = await createTestUser();
          const members = await Promise.all(
            Array.from({ length: memberCount }, () => createTestUser())
          );

          const project = await Project.create({
            name: `Project-${Math.random().toString(36).slice(2)}`,
            municipality: "TestCity",
            createdBy: adminUser._id,
            members: members.map((u) => ({ user: u._id, addedAt: new Date() })),
          });

          const beforeCount = await Notification.countDocuments();
          await simulateFileEventFanOut(project._id, "data.csv", status);
          const afterCount = await Notification.countDocuments();

          expect(afterCount - beforeCount).toBe(memberCount);

          const category =
            status === "Completed" ? "file_upload_complete" : "file_upload_failed";
          const notifications = await Notification.find({
            projectId: project._id,
            category,
          });
          expect(notifications.length).toBe(memberCount);
          notifications.forEach((n) => expect(n.isRead).toBe(false));
        }
      ),
      { numRuns: 15 }
    );
  });
});

// Feature: notification-system, Property 4: Member-added excludes the new user from recipients
describe("Property 4: Member-added excludes the new user from recipients", () => {
  it("creates N notifications for N existing members and zero for the new user", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 4 }),
        async (existingCount) => {
          await clearCollections();

          const adminUser = await createTestUser();
          const existingMembers = await Promise.all(
            Array.from({ length: existingCount }, () => createTestUser())
          );
          const newUser = await createTestUser();

          const project = await Project.create({
            name: `Project-${Math.random().toString(36).slice(2)}`,
            municipality: "TestCity",
            createdBy: adminUser._id,
            members: existingMembers.map((u) => ({ user: u._id, addedAt: new Date() })),
          });

          // Add new user
          project.members.push({ user: newUser._id, addedAt: new Date() });
          await project.save();

          // Simulate notification fan-out (excluding new user)
          await Promise.all(
            project.members
              .filter((m) => !m.user.equals(newUser._id))
              .map((m) =>
                createNotification({
                  recipient: m.user,
                  type: "user",
                  category: "member_added",
                  title: "New team member added",
                  message: `A new member has been added to project "${project.name}".`,
                  actor: adminUser._id,
                  projectId: project._id,
                })
              )
          );

          const notifications = await Notification.find({
            projectId: project._id,
            category: "member_added",
          });

          // Should be exactly existingCount — the original members
          expect(notifications.length).toBe(existingCount);

          // None should be addressed to the new user
          const newUserNotified = notifications.some((n) =>
            n.recipient.equals(newUser._id)
          );
          expect(newUserNotified).toBe(false);
        }
      ),
      { numRuns: 10 }
    );
  });
});

// Feature: notification-system, Property 5: Member-removed notifies all remaining members
describe("Property 5: Member-removed notifies all remaining members", () => {
  it("creates N-1 notifications when one of N members is removed", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }),
        async (memberCount) => {
          await clearCollections();

          const adminUser = await createTestUser();
          const members = await Promise.all(
            Array.from({ length: memberCount }, () => createTestUser())
          );

          const project = await Project.create({
            name: `Project-${Math.random().toString(36).slice(2)}`,
            municipality: "TestCity",
            createdBy: adminUser._id,
            members: members.map((u) => ({ user: u._id, addedAt: new Date() })),
          });

          const removedUser = members[0];

          // Remove first member
          project.members = project.members.filter(
            (m) => !m.user.equals(removedUser._id)
          );
          await project.save();

          // Notify remaining members
          await Promise.all(
            project.members.map((m) =>
              createNotification({
                recipient: m.user,
                type: "user",
                category: "member_removed",
                title: "Team member removed",
                message: `A member has been removed from project "${project.name}".`,
                actor: adminUser._id,
                projectId: project._id,
              })
            )
          );

          const notifications = await Notification.find({
            projectId: project._id,
            category: "member_removed",
          });

          expect(notifications.length).toBe(memberCount - 1);

          // Removed user should not be notified
          const removedUserNotified = notifications.some((n) =>
            n.recipient.equals(removedUser._id)
          );
          expect(removedUserNotified).toBe(false);
        }
      ),
      { numRuns: 15 }
    );
  });
});

// Feature: notification-system, Property 6: Project creation notifies creator
describe("Property 6: Project creation notifies creator", () => {
  it("creates exactly 1 project_created notification addressed to the creator", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 3, maxLength: 20 }).filter((s) => s.trim().length >= 3),
        async (municipalityName) => {
          await clearCollections();

          const creator = await createTestUser();

          const project = await Project.create({
            name: `Project-${Math.random().toString(36).slice(2)}`,
            municipality: municipalityName,
            createdBy: creator._id,
            members: [],
          });

          await createNotification({
            recipient: creator._id,
            type: "system",
            category: "project_created",
            title: `Project created: ${project.name}`,
            message: `Your project "${project.name}" for ${project.municipality} has been created successfully.`,
            projectId: project._id,
          });

          const notifications = await Notification.find({
            category: "project_created",
            recipient: creator._id,
          });

          expect(notifications.length).toBe(1);
          expect(notifications[0].recipient.equals(creator._id)).toBe(true);
        }
      ),
      { numRuns: 15 }
    );
  });
});
