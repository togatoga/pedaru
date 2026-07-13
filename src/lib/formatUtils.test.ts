import { describe, expect, it } from "vitest";
import { formatDate, formatFileSize, formatIsoDate } from "./formatUtils";

describe("formatUtils", () => {
  describe("formatFileSize", () => {
    it('should return "Unknown" for missing values', () => {
      expect(formatFileSize(null)).toBe("Unknown");
      expect(formatFileSize(undefined)).toBe("Unknown");
    });

    it("should format bytes", () => {
      expect(formatFileSize(0)).toBe("0 B");
      expect(formatFileSize(512)).toBe("512 B");
      expect(formatFileSize(1023)).toBe("1023 B");
    });

    it("should format kilobytes", () => {
      expect(formatFileSize(1024)).toBe("1.00 KB");
      expect(formatFileSize(1536)).toBe("1.50 KB");
    });

    it("should format megabytes", () => {
      expect(formatFileSize(1024 * 1024)).toBe("1.00 MB");
      expect(formatFileSize(5.5 * 1024 * 1024)).toBe("5.50 MB");
    });

    it("should format gigabytes", () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe("1.00 GB");
      expect(formatFileSize(2.25 * 1024 * 1024 * 1024)).toBe("2.25 GB");
    });
  });

  describe("formatDate", () => {
    it("should format a Unix timestamp in seconds as date and time", () => {
      expect(formatDate(1703123456)).toMatch(
        /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/,
      );
    });
  });

  describe("formatIsoDate", () => {
    it('should return "-" for missing values', () => {
      expect(formatIsoDate(undefined)).toBe("-");
      expect(formatIsoDate("")).toBe("-");
    });

    it("should format an ISO string as date and time", () => {
      expect(formatIsoDate("2023-12-21T10:30:00Z")).toMatch(
        /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/,
      );
    });

    it("should format the same instant identically to formatDate", () => {
      const timestamp = 1703123456;
      expect(formatIsoDate(new Date(timestamp * 1000).toISOString())).toBe(
        formatDate(timestamp),
      );
    });
  });
});
