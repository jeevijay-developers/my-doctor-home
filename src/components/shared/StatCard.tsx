import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  gradient: string;
}

const StatCard = ({ label, value, icon: Icon, gradient }: StatCardProps) => (
  <Card className="border-0 shadow-none overflow-hidden">
    <CardContent className={`p-5 bg-gradient-to-br ${gradient} text-white relative`}>
      <div className="absolute top-3 right-3 opacity-20">
        <Icon className="h-12 w-12" />
      </div>
      <div className="relative z-10">
        <div className="text-sm font-medium text-white/80">{label}</div>
        <div className="font-heading font-extrabold text-2xl mt-1">{value}</div>
      </div>
    </CardContent>
  </Card>
);

export default StatCard;
