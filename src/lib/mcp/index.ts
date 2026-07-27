import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyProfile from "./tools/get_my_profile";
import listAppointments from "./tools/list_appointments";
import listPatients from "./tools/list_patients";
import getDashboardStats from "./tools/get_dashboard_stats";
import listReviews from "./tools/list_reviews";

// Direct Supabase issuer (never the .lovable.cloud proxy). Built from the project ref,
// which Vite inlines at build time, so this stays import-safe.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
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
