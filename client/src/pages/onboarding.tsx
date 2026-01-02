import { useCreateOrganization } from "@/hooks/use-organizations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertOrganizationSchema } from "@shared/schema";
import { z } from "zod";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

export default function Onboarding() {
  const { mutate: createOrg, isPending } = useCreateOrganization();
  const [, setLocation] = useLocation();

  const form = useForm<z.infer<typeof insertOrganizationSchema>>({
    resolver: zodResolver(insertOrganizationSchema),
    defaultValues: {
      name: "",
      slug: "",
      plan: "basic"
    }
  });

  const onSubmit = (data: z.infer<typeof insertOrganizationSchema>) => {
    // Generate a simple slug from name if not provided (though Zod handles validation)
    if (!data.slug) {
      data.slug = data.name.toLowerCase().replace(/\s+/g, '-');
    }
    
    createOrg(data, {
      onSuccess: (org) => {
        setLocation(`/org/${org.id}/dashboard`);
      }
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
      <Card className="max-w-md w-full shadow-lg border-primary/10">
        <CardHeader>
          <CardTitle className="text-2xl font-display text-primary">Create Organization</CardTitle>
          <CardDescription>
            Set up your workspace to start creating surveys.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Organization Name</label>
              <Input 
                placeholder="Acme Research Institute" 
                {...form.register("name")}
                className="h-11"
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Workspace Slug</label>
              <div className="flex items-center">
                <span className="bg-muted px-3 py-3 border border-r-0 rounded-l-md text-muted-foreground text-sm">votoaudit.com/</span>
                <Input 
                  placeholder="acme-research" 
                  {...form.register("slug")}
                  className="rounded-l-none h-11"
                />
              </div>
              {form.formState.errors.slug && (
                <p className="text-xs text-destructive">{form.formState.errors.slug.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full h-11 mt-4" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating Workspace...
                </>
              ) : (
                "Create Workspace"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
