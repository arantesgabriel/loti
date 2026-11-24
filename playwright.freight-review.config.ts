import { defineConfig } from "@playwright/test";
export default defineConfig({testDir:"./tests/freight-review",workers:1,fullyParallel:false,timeout:240000,expect:{timeout:20000},reporter:"list",outputDir:"artifacts/freight-review",use:{baseURL:"http://localhost:3147",trace:"retain-on-failure",screenshot:"only-on-failure"}});
