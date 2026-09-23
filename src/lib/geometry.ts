import { SCREEN_MARGIN } from "../constants";

export type Size = { w: number; h: number };
export type Point = { x: number; y: number };
export type ScreenSize = { width: number; height: number };

/**
 * Measures a hidden element and converts its CSS size into physical pixels
 * using the monitor scale factor.
 */
export function measureElement(id: string, scaleFactor = 1): Size {
  const rect = document.getElementById(id)?.getBoundingClientRect();
  if (!rect) return { w: 0, h: 0 };
  return {
    w: Math.trunc(rect.width * scaleFactor),
    h: Math.trunc(rect.height * scaleFactor),
  };
}

/** Bottom-right anchor of the screen, shifted by the configured margin. */
export function bottomRightPoint(screen: ScreenSize, size: Size): Point {
  return {
    x: screen.width - size.w - SCREEN_MARGIN,
    y: screen.height - size.h - SCREEN_MARGIN,
  };
}
