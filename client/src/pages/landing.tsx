import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ShieldCheck, BarChart3, Radio } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function Landing() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <header className="border-b bg-card/50 backdrop-blur-sm fixed w-full z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold font-display">VA</div>
            <span className="font-display font-bold text-xl tracking-tight">VotoAudit</span>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
               <Link href="/dashboard">
                 <Button>Go to Dashboard</Button>
               </Link>
            ) : (
               <Link href="/api/login">
                 <Button>Sign In</Button>
               </Link>
            )}
          </div>
        </div>
      </header>

      <main className="pt-24 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/5 text-primary text-sm font-medium mb-6">
              <ShieldCheck className="w-4 h-4" />
              <span>Secure Election Intelligence Platform</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-display font-bold text-foreground mb-6 leading-tight">
              Audit-Ready Polling <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">With Real-Time Proof</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
              Conduct electoral surveys with confidence. Capture GPS, audio evidence, and device fingerprints for every single interview.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/api/login">
                <Button size="lg" className="w-full sm:w-auto px-8 h-12 text-lg">
                  Start Free Trial
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="w-full sm:w-auto px-8 h-12 text-lg">
                View Demo
              </Button>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-8 mt-20">
            {[
              {
                icon: Radio,
                title: "Audio Audit",
                description: "Mandatory audio recording for every interview ensures data integrity and allows for post-survey verification."
              },
              {
                icon: CheckCircle2,
                title: "GPS Verification",
                description: "Precise location tracking locks interviews to specific geofences, preventing fraud and ensuring coverage."
              },
              {
                icon: BarChart3,
                title: "Real-time Analytics",
                description: "Watch results stream in live. Detect anomalies instantly with our AI-powered fraud detection engine."
              }
            ].map((feature, i) => (
              <div key={i} className="bg-card p-8 rounded-2xl border shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-primary/5 flex items-center justify-center text-primary mb-6">
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>

          {/* Social Proof / Trust */}
          <div className="mt-32 border-t pt-16 text-center">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-8">Trusted by Research Institutes</p>
            <div className="flex flex-wrap justify-center gap-12 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
               {/* Placeholders for logos */}
               <div className="h-8 w-32 bg-foreground/10 rounded animate-pulse" />
               <div className="h-8 w-32 bg-foreground/10 rounded animate-pulse" />
               <div className="h-8 w-32 bg-foreground/10 rounded animate-pulse" />
               <div className="h-8 w-32 bg-foreground/10 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
