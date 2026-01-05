import { describe, expect, it } from "vitest";
import {
  clampZoom,
  resetZoom,
  ZOOM_CONFIG,
  zoomIn,
  zoomOut,
} from "./zoomConfig";

describe("zoomConfig", () => {
  describe("ZOOM_CONFIG", () => {
    it("should have correct default values", () => {
      expect(ZOOM_CONFIG.min).toBe(0.25);
      expect(ZOOM_CONFIG.max).toBe(4.0);
      expect(ZOOM_CONFIG.step).toBe(0.25);
      expect(ZOOM_CONFIG.default).toBe(1.0);
    });
  });

  describe("clampZoom", () => {
    it("should return value unchanged when within range", () => {
      expect(clampZoom(1.0)).toBe(1.0);
      expect(clampZoom(2.5)).toBe(2.5);
      expect(clampZoom(0.5)).toBe(0.5);
    });

    it("should clamp to minimum when value is too low", () => {
      expect(clampZoom(0.1)).toBe(ZOOM_CONFIG.min);
      expect(clampZoom(0)).toBe(ZOOM_CONFIG.min);
      expect(clampZoom(-1)).toBe(ZOOM_CONFIG.min);
    });

    it("should clamp to maximum when value is too high", () => {
      expect(clampZoom(5.0)).toBe(ZOOM_CONFIG.max);
      expect(clampZoom(10)).toBe(ZOOM_CONFIG.max);
      expect(clampZoom(100)).toBe(ZOOM_CONFIG.max);
    });

    it("should handle boundary values correctly", () => {
      expect(clampZoom(ZOOM_CONFIG.min)).toBe(ZOOM_CONFIG.min);
      expect(clampZoom(ZOOM_CONFIG.max)).toBe(ZOOM_CONFIG.max);
    });
  });

  describe("zoomIn", () => {
    it("should increase zoom by step amount", () => {
      expect(zoomIn(1.0)).toBe(1.25);
      expect(zoomIn(1.5)).toBe(1.75);
      expect(zoomIn(2.0)).toBe(2.25);
    });

    it("should not exceed maximum zoom", () => {
      expect(zoomIn(3.75)).toBe(4.0);
      expect(zoomIn(4.0)).toBe(4.0);
      expect(zoomIn(3.9)).toBe(4.0);
    });

    it("should work from minimum zoom", () => {
      expect(zoomIn(0.25)).toBe(0.5);
    });
  });

  describe("zoomOut", () => {
    it("should decrease zoom by step amount", () => {
      expect(zoomOut(1.0)).toBe(0.75);
      expect(zoomOut(1.5)).toBe(1.25);
      expect(zoomOut(2.0)).toBe(1.75);
    });

    it("should not go below minimum zoom", () => {
      expect(zoomOut(0.5)).toBe(0.25);
      expect(zoomOut(0.25)).toBe(0.25);
      expect(zoomOut(0.3)).toBe(0.25);
    });

    it("should work from maximum zoom", () => {
      expect(zoomOut(4.0)).toBe(3.75);
    });
  });

  describe("resetZoom", () => {
    it("should return default zoom value", () => {
      expect(resetZoom()).toBe(1.0);
    });
  });

  describe("zoom sequence tests", () => {
    it("should handle multiple zoom ins correctly", () => {
      let zoom = 1.0;
      zoom = zoomIn(zoom); // 1.25
      zoom = zoomIn(zoom); // 1.5
      zoom = zoomIn(zoom); // 1.75
      expect(zoom).toBe(1.75);
    });

    it("should handle multiple zoom outs correctly", () => {
      let zoom = 2.0;
      zoom = zoomOut(zoom); // 1.75
      zoom = zoomOut(zoom); // 1.5
      zoom = zoomOut(zoom); // 1.25
      expect(zoom).toBe(1.25);
    });

    it("should handle zoom in then out to return to original", () => {
      let zoom = 1.0;
      zoom = zoomIn(zoom); // 1.25
      zoom = zoomOut(zoom); // 1.0
      expect(zoom).toBe(1.0);
    });
  });
});
