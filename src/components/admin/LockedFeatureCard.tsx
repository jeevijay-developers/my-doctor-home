import { Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import UpgradeCheckoutDialog from "./UpgradeCheckoutDialog";

interface Props {
  featureName: string;
  description: string;
  // Why the feature is off. "override" / "custom_plan" mean it was switched off
  // for this account on purpose, so paying for a higher tier would not unlock it.
  source?: "override" | "custom_plan" | "plan";
}

export default function LockedFeatureCard({ featureName, description, source }: Props) {
  const turnedOffOnPurpose = source === "override" || source === "custom_plan";
  return (
    <Card className="border-dashed border-2 border-border">
      <CardContent className="py-16 flex flex-col items-center text-center gap-3 max-w-md mx-auto">
        <div className="h-14 w-14 rounded-full bg-royal/10 flex items-center justify-center text-royal">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="font-heading font-bold text-xl text-primary">{featureName}</h2>
        <p className="text-sm text-muted-foreground">
          {turnedOffOnPurpose ? "This feature is turned off on your current plan. Contact support if you'd like it changed." : description}
        </p>
        {!turnedOffOnPurpose && (
          <UpgradeCheckoutDialog
            targetTier="premium"
            trigger={<Button className="bg-royal hover:bg-royal/90 mt-2">Upgrade Now</Button>}
          />
        )}
      </CardContent>
    </Card>
  );
}
