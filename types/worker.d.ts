// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
declare module '*?worker' {
  const WorkerFactory: { new (options?: WorkerOptions): Worker };
  export default WorkerFactory;
}
