import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

// Local OAuth consent placeholder. External provider consent is not
// configured in this build — users sign in directly instead.
export default function OAuthConsent() {
  return (
    <AuthLayout icon={ShieldCheck} title="Authorize access">
      <p className="text-sm text-muted-foreground mb-6">
        External sign-in is not available in this build. Please continue with
        your ZEUS account instead.
      </p>
      <Link to="/login">
        <Button className="w-full h-12 font-medium">Go to login</Button>
      </Link>
    </AuthLayout>
  );
}
