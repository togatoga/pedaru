/**
 * Utility functions for bookshelf item handling
 *
 * These functions ensure correct handling of items from different sources
 * (cloud vs local) which may have the same ID values since they come from
 * separate database tables.
 */

import type { BookshelfItem, SourceType } from "@/types";

/**
 * Creates a unique key for a bookshelf item.
 * This is necessary because cloud and local items come from separate database
 * tables and can have the same ID values.
 *
 * @param item - The bookshelf item
 * @returns A unique key combining sourceType and id
 */
export function getItemKey(item: BookshelfItem): string {
  return `${item.sourceType}-${item.id}`;
}

/**
 * Checks if an item matches the given id and sourceType.
 * Use this instead of just comparing IDs to avoid matching items from
 * different sources that happen to have the same ID.
 *
 * @param item - The item to check
 * @param id - The ID to match
 * @param sourceType - The source type to match
 * @returns true if both id and sourceType match
 */
export function itemMatches(
  item: BookshelfItem,
  id: number,
  sourceType: SourceType,
): boolean {
  return item.id === id && item.sourceType === sourceType;
}

/**
 * Filters items by source type.
 *
 * @param items - The items to filter
 * @param sourceFilter - The source filter ("local", "cloud", or null for all)
 * @returns Filtered items
 */
export function filterBySource(
  items: BookshelfItem[],
  sourceFilter: "local" | "cloud" | null,
): BookshelfItem[] {
  if (sourceFilter === "local") {
    return items.filter((item) => item.sourceType === "local");
  }
  if (sourceFilter === "cloud") {
    return items.filter((item) => item.sourceType === "google_drive");
  }
  return items;
}

/**
 * Checks if all items have unique keys.
 * This is useful for testing to ensure no key collisions.
 *
 * @param items - The items to check
 * @returns true if all items have unique keys
 */
export function hasUniqueKeys(items: BookshelfItem[]): boolean {
  const keys = items.map(getItemKey);
  const uniqueKeys = new Set(keys);
  return keys.length === uniqueKeys.size;
}

/**
 * Gets the expected sourceType string for a given isCloud flag.
 *
 * @param isCloud - Whether the item is from cloud (Google Drive)
 * @returns The sourceType string
 */
export function getSourceTypeFromIsCloud(isCloud: boolean): SourceType {
  return isCloud ? "google_drive" : "local";
}
