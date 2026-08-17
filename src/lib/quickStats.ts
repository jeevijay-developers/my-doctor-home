import {
  Users,
  Award,
  ThumbsUp,
  Headset,
  Heart,
  Activity,
  Star,
  ShieldCheck,
  Clock,
  Stethoscope,
  Building,
  Smile,
  Zap,
  CheckCircle,
  LucideIcon,
} from "lucide-react";

export type QuickStatItem = {
  id: string;
  label: string;
  value: string;
  icon: string;
  active: boolean;
};

export const AVAILABLE_STAT_ICONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "Users", label: "Users / Patients", icon: Users },
  { value: "Award", label: "Award / Experience", icon: Award },
  { value: "ThumbsUp", label: "Thumbs Up / Rating", icon: ThumbsUp },
  { value: "Headset", label: "Headset / Support", icon: Headset },
  { value: "Heart", label: "Heart / Care", icon: Heart },
  { value: "Activity", label: "Activity / Health", icon: Activity },
  { value: "Star", label: "Star / Review", icon: Star },
  { value: "ShieldCheck", label: "Shield / Guarantee", icon: ShieldCheck },
  { value: "Clock", label: "Clock / Timing", icon: Clock },
  { value: "Stethoscope", label: "Stethoscope / Doctor", icon: Stethoscope },
  { value: "Building", label: "Building / Clinic", icon: Building },
  { value: "Smile", label: "Smile / Satisfaction", icon: Smile },
  { value: "Zap", label: "Zap / Fast Care", icon: Zap },
  { value: "CheckCircle", label: "Check Circle / Verified", icon: CheckCircle },
];

export const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  AVAILABLE_STAT_ICONS.map((i) => [i.value, i.icon])
);

export const DEFAULT_QUICK_STATS: QuickStatItem[] = [
  { id: "patients", label: "Patients Treated", value: "5,000+", icon: "Users", active: true },
  { id: "experience", label: "Years Experience", value: "", icon: "Award", active: true },
  { id: "success", label: "Success Rate", value: "98%", icon: "ThumbsUp", active: true },
  { id: "booking", label: "Online Booking", value: "24/7", icon: "Headset", active: true },
];

export function getStatIconComponent(iconName: string): LucideIcon {
  return ICON_MAP[iconName] || Users;
}

export function resolveStatValue(stat: QuickStatItem, profile?: any): string {
  if (stat.value && stat.value.trim() !== "") {
    return stat.value.trim();
  }
  if (stat.id === "experience") {
    const exp = profile?.experience_years ?? 0;
    return `${exp}+`;
  }
  return stat.value || "";
}
