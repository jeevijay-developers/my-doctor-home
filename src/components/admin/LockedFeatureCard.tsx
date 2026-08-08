import { Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ContactSupportDialog from "./ContactSupportDialog";

interface Props {
  featureName: string;
  description: string;
}

export default function LockedFeatureCard({ featureName, description }: Props) {
  return (
    <Card className="border-dashed border-2 border-border">
      <CardContent className="py-16 flex flex-col items-center text-center gap-3 max-w-md mx-auto">
        <div className="h-14 w-14 rounded-full bg-royal/10 flex items-center justify-center text-royal">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="font-heading font-bold text-xl text-primary">{featureName}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        <ContactSupportDialog
          defaultSubject="Upgrade to Premium"
          trigger={
            <Button className="bg-royal hover:bg-royal/90 mt-2">Request Upgrade</Button>
          }
        />
      </CardContent>
    </Card>
  );
}
