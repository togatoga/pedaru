import { describe, expect, it } from "vitest";
import type { BookshelfItem } from "@/types";
import {
  filterBySource,
  getItemKey,
  getSourceTypeFromIsCloud,
  hasUniqueKeys,
  itemMatches,
} from "./bookshelfUtils";

// Helper to create mock bookshelf items
function createMockItem(
  id: number,
  sourceType: "google_drive" | "local",
  overrides: Partial<BookshelfItem> = {},
): BookshelfItem {
  return {
    id,
    sourceType,
    fileName: `test-${sourceType}-${id}.pdf`,
    downloadStatus: sourceType === "local" ? "completed" : "pending",
    downloadProgress: sourceType === "local" ? 100 : 0,
    createdAt: Date.now(),
    isFavorite: false,
    ...overrides,
  };
}

describe("bookshelfUtils", () => {
  describe("getItemKey", () => {
    it("should create unique keys for items with same id but different sourceType", () => {
      const cloudItem = createMockItem(1, "google_drive");
      const localItem = createMockItem(1, "local");

      const cloudKey = getItemKey(cloudItem);
      const localKey = getItemKey(localItem);

      expect(cloudKey).toBe("google_drive-1");
      expect(localKey).toBe("local-1");
      expect(cloudKey).not.toBe(localKey);
    });

    it("should create same key for same item", () => {
      const item = createMockItem(5, "local");

      expect(getItemKey(item)).toBe("local-5");
      expect(getItemKey(item)).toBe(getItemKey(item));
    });
  });

  describe("itemMatches", () => {
    it("should return true when both id and sourceType match", () => {
      const item = createMockItem(1, "google_drive");

      expect(itemMatches(item, 1, "google_drive")).toBe(true);
    });

    it("should return false when id matches but sourceType does not", () => {
      const cloudItem = createMockItem(1, "google_drive");
      const localItem = createMockItem(1, "local");

      // Cloud item should not match local sourceType
      expect(itemMatches(cloudItem, 1, "local")).toBe(false);
      // Local item should not match cloud sourceType
      expect(itemMatches(localItem, 1, "google_drive")).toBe(false);
    });

    it("should return false when sourceType matches but id does not", () => {
      const item = createMockItem(1, "local");

      expect(itemMatches(item, 2, "local")).toBe(false);
    });

    it("should return false when neither matches", () => {
      const item = createMockItem(1, "google_drive");

      expect(itemMatches(item, 2, "local")).toBe(false);
    });
  });

  describe("filterBySource", () => {
    const mixedItems = [
      createMockItem(1, "google_drive"),
      createMockItem(2, "google_drive"),
      createMockItem(1, "local"), // Same ID as cloud item 1
      createMockItem(2, "local"), // Same ID as cloud item 2
      createMockItem(3, "local"),
    ];

    it("should return only local items when sourceFilter is 'local'", () => {
      const filtered = filterBySource(mixedItems, "local");

      expect(filtered).toHaveLength(3);
      expect(filtered.every((item) => item.sourceType === "local")).toBe(true);
    });

    it("should return only cloud items when sourceFilter is 'cloud'", () => {
      const filtered = filterBySource(mixedItems, "cloud");

      expect(filtered).toHaveLength(2);
      expect(filtered.every((item) => item.sourceType === "google_drive")).toBe(
        true,
      );
    });

    it("should return all items when sourceFilter is null", () => {
      const filtered = filterBySource(mixedItems, null);

      expect(filtered).toHaveLength(5);
      expect(filtered).toEqual(mixedItems);
    });

    it("should handle empty array", () => {
      expect(filterBySource([], "local")).toEqual([]);
      expect(filterBySource([], "cloud")).toEqual([]);
      expect(filterBySource([], null)).toEqual([]);
    });

    it("should handle array with only one type", () => {
      const onlyLocal = [
        createMockItem(1, "local"),
        createMockItem(2, "local"),
      ];

      expect(filterBySource(onlyLocal, "local")).toHaveLength(2);
      expect(filterBySource(onlyLocal, "cloud")).toHaveLength(0);
    });
  });

  describe("hasUniqueKeys", () => {
    it("should return true when all items have unique keys", () => {
      const items = [
        createMockItem(1, "google_drive"),
        createMockItem(2, "google_drive"),
        createMockItem(1, "local"), // Same ID but different sourceType = unique key
        createMockItem(2, "local"),
      ];

      expect(hasUniqueKeys(items)).toBe(true);
    });

    it("should return false when items have duplicate keys", () => {
      const items = [
        createMockItem(1, "local"),
        createMockItem(1, "local"), // Duplicate!
      ];

      expect(hasUniqueKeys(items)).toBe(false);
    });

    it("should return true for empty array", () => {
      expect(hasUniqueKeys([])).toBe(true);
    });

    it("should return true for single item", () => {
      expect(hasUniqueKeys([createMockItem(1, "local")])).toBe(true);
    });
  });

  describe("getSourceTypeFromIsCloud", () => {
    it("should return 'google_drive' for isCloud=true", () => {
      expect(getSourceTypeFromIsCloud(true)).toBe("google_drive");
    });

    it("should return 'local' for isCloud=false", () => {
      expect(getSourceTypeFromIsCloud(false)).toBe("local");
    });
  });

  describe("ID collision scenarios", () => {
    it("should correctly identify items when cloud and local have same ID", () => {
      // This test documents the bug that was fixed:
      // Cloud and local items can have the same ID because they come from
      // different database tables with separate auto-increment sequences.
      const cloudItem = createMockItem(1, "google_drive", {
        fileName: "cloud-file.pdf",
      });
      const localItem = createMockItem(1, "local", {
        fileName: "local-file.pdf",
      });

      // Both have ID 1
      expect(cloudItem.id).toBe(localItem.id);

      // But they should have different keys
      expect(getItemKey(cloudItem)).not.toBe(getItemKey(localItem));

      // And itemMatches should correctly distinguish them
      expect(itemMatches(cloudItem, 1, "google_drive")).toBe(true);
      expect(itemMatches(cloudItem, 1, "local")).toBe(false);
      expect(itemMatches(localItem, 1, "local")).toBe(true);
      expect(itemMatches(localItem, 1, "google_drive")).toBe(false);
    });

    it("should filter correctly with items that have same IDs", () => {
      // Simulate real scenario where we have overlapping IDs
      const items = [
        createMockItem(1, "google_drive", { fileName: "cloud-1.pdf" }),
        createMockItem(2, "google_drive", { fileName: "cloud-2.pdf" }),
        createMockItem(1, "local", { fileName: "local-1.pdf" }), // Same ID as cloud-1
        createMockItem(2, "local", { fileName: "local-2.pdf" }), // Same ID as cloud-2
      ];

      // Filtering should work correctly
      const cloudOnly = filterBySource(items, "cloud");
      const localOnly = filterBySource(items, "local");

      expect(cloudOnly).toHaveLength(2);
      expect(cloudOnly.map((i) => i.fileName)).toEqual([
        "cloud-1.pdf",
        "cloud-2.pdf",
      ]);

      expect(localOnly).toHaveLength(2);
      expect(localOnly.map((i) => i.fileName)).toEqual([
        "local-1.pdf",
        "local-2.pdf",
      ]);
    });
  });
});
