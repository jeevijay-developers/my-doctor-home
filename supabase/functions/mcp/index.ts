// Manually maintained — do NOT let @lovable.dev/mcp-js regenerate this file.
// On Windows, the plugin's Vite sync (node_modules/@lovable.dev/mcp-js/dist/stacks/supabase/vite.js)
// passes the absolute mcpEntry path through esbuild's bare-specifier externalizer, which only
// recognizes POSIX-style leading "/" as a local path. A Windows path like "E:\...\index.ts" gets
// treated as a bare specifier and rewritten to "npm:E:\...\index.ts", which is not a valid Deno
// import and breaks the deployed function. This file mirrors src/lib/mcp/index.ts by hand with
// Deno-safe npm: specifiers until that upstream bug is fixed.
import { auth, defineMcp } from "npm:@lovable.dev/mcp-js@0.24.0";
import getMyProfile from "./tools/get_my_profile.ts";
import listAppointments from "./tools/list_appointments.ts";
import listPatients from "./tools/list_patients.ts";
import getDashboardStats from "./tools/get_dashboard_stats.ts";
import listReviews from "./tools/list_reviews.ts";
import { createSupabaseHandler } from "npm:@lovable.dev/mcp-js@0.24.0/stacks/supabase";

const projectRef = Deno.env.get("SUPABASE_PROJECT_ID") ?? "project-ref-unset";

const mcp = defineMcp({
  name: "doctylia-mcp",
  title: "Doctylia",
  version: "0.1.0",
  instructions:
    "Doctylia MCP server for signed-in doctors. Read your profile, appointments, patients, reviews, and dashboard stats. All tools act as the authenticated doctor and respect row-level security.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getMyProfile, getDashboardStats, listAppointments, listPatients, listReviews],
});

Deno.serve(createSupabaseHandler(mcp, { functionName: "mcp" }));
