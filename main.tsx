// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import React from "react";
import { createRoot } from "react-dom/client";
import CaseWorkspace from "./ui/CaseWorkspace";
import "./app/globals.css";
import "./app/monitor.css";
import "./app/light.css";
createRoot(document.getElementById("root")!).render(<React.StrictMode><CaseWorkspace /></React.StrictMode>);
