import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useGettingStarted } from "@/hooks/useGettingStarted";
import { useProfile } from "@/hooks/useProfile";

// Shown until every step is done — shared between the Dashboard and Settings.
const GettingStartedCard = () => {
  const { checklist, completedSteps, ready } = useGettingStarted();
  const { isStaff } = useProfile();
  // The checklist is the clinic owner's setup list (profile, website, blog). Staff and doctor
  // logins would be sent to pages they cannot open, so they never see it.
  if (isStaff || !ready || completedSteps >= checklist.length) return null;

  return (
    <Card className="border-0 rounded-2xl shadow-sm bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Getting Started</CardTitle>
          <span className="text-xs font-semibold text-royal">{completedSteps}/{checklist.length}</span>
        </div>
        <Progress value={(completedSteps / checklist.length) * 100} className="h-2 mt-2 bg-secondary [&>div]:bg-royal" />
      </CardHeader>
      <CardContent className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {checklist.map((item) => (
          <Link key={item.label} to={item.href} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/60 transition-colors group">
            {item.done ? (
              <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground/30 flex-shrink-0 group-hover:text-royal" />
            )}
            <span className={`text-sm ${item.done ? "text-muted-foreground line-through" : "text-foreground font-medium"}`}>{item.label}</span>
            {!item.done && <ArrowRight className="h-3 w-3 text-muted-foreground/40 ml-auto" />}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
};

export default GettingStartedCard;
