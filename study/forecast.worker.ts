// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { forecastDrug } from './forecast';
self.onmessage = (event: MessageEvent) => {
  const { id, request } = event.data;
  try { self.postMessage({ id, result: forecastDrug(request), error: '' }); }
  catch (error) { self.postMessage({ id, result: null, error: error instanceof Error ? error.message : 'Forecast failed.' }); }
};
