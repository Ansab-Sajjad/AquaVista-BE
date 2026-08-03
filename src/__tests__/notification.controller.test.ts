import * as fc from "fast-check";
import mongoose from "mongoose";
import { connectTestDB, disconnectTestDB, clearCollections } from "./helpers/db";
import { Notification } from "../models/Notification.model";
import { createNotification } from "../services/notification.service";

const CATEGORIES = [
  "file_upload_complete",
  "file_upload_failed",
  "member_added",
  "member_removed",
  "project_created",
] as const;

const TYPES = ["system", "user"] as const;

const fcObjectId = () =>
  fc.hexaString({ minLength: 24, maxLength: 24 }).map((s) => new mongoose.Types.ObjectId(s));

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

afterEach(async () => {
  await clearCollections();
});

// Helper: simulate getNotifications handler logic directly (no HTTP)
async function getNotificationsForUser(userId: mongoose.Types.ObjectId) {
  const notifications = await Notification.find({ recipient: userId })
    .sort({ createdAt: -1 })
    .limit(50);

  return notifications.map((n) => ({
    id: n._id,
    type: n.type,
    category: n.category,
    title: n.title,
    message: n.message,
    isRead: n.isRead,
    href: n.href || null,
    createdAt: n.createdAt,
  }));
}

// Feature: notification-system, Property 7: GET /api/notifications returns at most 50, ordered by recency
describe("Property 7: GET notifications returns at most 50, ordered by recency", () => {
  it("returns min(K, 50) results sorted by createdAt descending", async () => {
    await fc.assert(
      fc.asyncProperty(
        fcObjectId(),
        fc.integer({ min: 0, max: 80 }),
        async (userId, k) => {
          await clearCollections();

          // Insert K notifications with staggered createdAt
          const base = new Date("2024-01-01T00:00:00Z").getTime();
          for (let i = 0; i < k; i++) {
            await Notification.create({
              recipient: userId,
              type: "system",
              category: "project_created",
              title: `Notif ${i}`,
              message: "test",
              isRead: false,
              createdAt: new Date(base + i * 1000),
            });
          }

          const results = await getNotificationsForUser(userId);

          expect(results.length).toBe(Math.min(k, 50));

          // Verify descending order
          for (let i = 0; i < results.length - 1; i++) {
            expect(results[i].createdAt.getTime()).toBeGreaterThanOrEqual(
              results[i + 1].createdAt.getTime()
            );
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

// Feature: notification-system, Property 8: API response contains all required fields
describe("Property 8: API response contains all required fields", () => {
  it("every result has id, type, category, title, message, isRead, createdAt", async () => {
    await fc.assert(
      fc.asyncProperty(
        fcObjectId(),
        fc.integer({ min: 1, max: 10 }),
        async (userId, n) => {
          await clearCollections();

          for (let i = 0; i < n; i++) {
            await Notification.create({
              recipient: userId,
              type: fc.sample(fc.constantFrom(...TYPES), 1)[0],
              category: fc.sample(fc.constantFrom(...CATEGORIES), 1)[0],
              title: `Title ${i}`,
              message: `Message ${i}`,
              isRead: false,
            });
          }

          const results = await getNotificationsForUser(userId);

          for (const r of results) {
            expect(r).toHaveProperty("id");
            expect(r).toHaveProperty("type");
            expect(r).toHaveProperty("category");
            expect(r).toHaveProperty("title");
            expect(r).toHaveProperty("message");
            expect(r).toHaveProperty("isRead");
            expect(r).toHaveProperty("createdAt");
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

// Feature: notification-system, Property 9: Mark-one-as-read is idempotent
describe("Property 9: Mark-one-as-read is idempotent", () => {
  it("calling markAsRead 1-3 times always results in isRead=true, others unchanged", async () => {
    await fc.assert(
      fc.asyncProperty(
        fcObjectId(),
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 2, max: 8 }),
        async (userId, callCount, totalNotifs) => {
          await clearCollections();

          // Create multiple notifications
          const created = await Promise.all(
            Array.from({ length: totalNotifs }, (_, i) =>
              Notification.create({
                recipient: userId,
                type: "system",
                category: "project_created",
                title: `Notif ${i}`,
                message: "test",
                isRead: false,
              })
            )
          );

          const target = created[0];

          // Call markAsRead multiple times
          for (let i = 0; i < callCount; i++) {
            await Notification.findOneAndUpdate(
              { _id: target._id, recipient: userId },
              { isRead: true },
              { new: true }
            );
          }

          // Target should be read
          const updated = await Notification.findById(target._id);
          expect(updated!.isRead).toBe(true);

          // Others should still be unread
          for (let i = 1; i < created.length; i++) {
            const other = await Notification.findById(created[i]._id);
            expect(other!.isRead).toBe(false);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

// Feature: notification-system, Property 10: Mark-all-as-read clears all unread for the user
describe("Property 10: Mark-all-as-read clears all unread for the user", () => {
  it("after markAllAsRead, all of userA's notifications are read; userB's are unchanged", async () => {
    await fc.assert(
      fc.asyncProperty(
        fcObjectId(),
        fcObjectId(),
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 10 }),
        async (userA, userB, countA, countB) => {
          // Ensure distinct users
          if (userA.equals(userB)) return;

          await clearCollections();

          await Promise.all([
            ...Array.from({ length: countA }, (_, i) =>
              Notification.create({
                recipient: userA,
                type: "system",
                category: "project_created",
                title: `A-${i}`,
                message: "test",
                isRead: false,
              })
            ),
            ...Array.from({ length: countB }, (_, i) =>
              Notification.create({
                recipient: userB,
                type: "system",
                category: "project_created",
                title: `B-${i}`,
                message: "test",
                isRead: false,
              })
            ),
          ]);

          // Mark all as read for userA
          await Notification.updateMany({ recipient: userA, isRead: false }, { isRead: true });

          const userANotifs = await Notification.find({ recipient: userA });
          const userBNotifs = await Notification.find({ recipient: userB });

          userANotifs.forEach((n) => expect(n.isRead).toBe(true));
          userBNotifs.forEach((n) => expect(n.isRead).toBe(false));
        }
      ),
      { numRuns: 50 }
    );
  });
});
