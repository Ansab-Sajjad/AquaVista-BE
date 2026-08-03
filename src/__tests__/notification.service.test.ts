import * as fc from "fast-check";
import mongoose from "mongoose";
import { connectTestDB, disconnectTestDB, clearCollections } from "./helpers/db";
import { Notification } from "../models/Notification.model";
import { createNotification, CreateNotificationParams } from "../services/notification.service";

const CATEGORIES = [
  "file_upload_complete",
  "file_upload_failed",
  "member_added",
  "member_removed",
  "project_created",
] as const;

const TYPES = ["system", "user"] as const;

/** Generates a random valid ObjectId */
const fcObjectId = () =>
  fc.hexaString({ minLength: 24, maxLength: 24 }).map((s) => new mongoose.Types.ObjectId(s));

/** Generates valid CreateNotificationParams */
const fcParams = (): fc.Arbitrary<CreateNotificationParams> =>
  fc.record({
    recipient: fcObjectId(),
    type: fc.constantFrom(...TYPES),
    category: fc.constantFrom(...CATEGORIES),
    title: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
    message: fc.string({ minLength: 1, maxLength: 500 }).filter((s) => s.trim().length > 0),
  });

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

afterEach(async () => {
  await clearCollections();
});

// Feature: notification-system, Property 1: New notifications default to unread
describe("Property 1: New notifications default to unread", () => {
  it("isRead is always false on a freshly created notification", async () => {
    await fc.assert(
      fc.asyncProperty(fcParams(), async (params) => {
        const notification = await createNotification(params);
        expect(notification.isRead).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: notification-system, Property 2: Notification creation round-trip
describe("Property 2: Notification creation round-trip", () => {
  it("fetching by _id returns same recipient, type, category, title, message", async () => {
    await fc.assert(
      fc.asyncProperty(fcParams(), async (params) => {
        const created = await createNotification(params);
        const fetched = await Notification.findById(created._id);

        expect(fetched).not.toBeNull();
        expect(fetched!.recipient.toString()).toBe(params.recipient.toString());
        expect(fetched!.type).toBe(params.type);
        expect(fetched!.category).toBe(params.category);
        expect(fetched!.title).toBe(params.title.trim());
        expect(fetched!.message).toBe(params.message.trim());
      }),
      { numRuns: 100 }
    );
  });
});
