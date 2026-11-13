// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
// Wall time advances while the browser suspends its monotonic timer.
export function alignedNow(wallNow: number, serverOffset = 0) {
  return wallNow + serverOffset;
}
export function serverOffset(
  serverIso: string,
  requestWall: number,
  responseWall: number,
) {
  return (
    Date.parse(serverIso) +
    Math.max(0, responseWall - requestWall) / 2 -
    responseWall
  );
}
