// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readdirSync, rmSync } from "node:fs";
rmSync("work/test-build",{recursive:true,force:true});
const c=spawnSync(process.execPath,["node_modules/typescript/bin/tsc","-p","tests/tsconfig.json"],{stdio:"inherit"});if(c.status)process.exit(c.status);
mkdirSync("work/test-build",{recursive:true});writeFileSync("work/test-build/package.json",'{"type":"commonjs"}');
const files=readdirSync("work/test-build/tests").filter(x=>x.endsWith(".test.js")).map(x=>"work/test-build/tests/"+x);const r=spawnSync(process.execPath,["--test",...files],{stdio:"inherit"});process.exit(r.status??1);
