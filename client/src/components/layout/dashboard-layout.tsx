import { useAuth } from "@/hooks/use-auth";
import { useCurrentMember, useOrganizations } from "@/hooks/use-organizations";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  FileText, 
  Users, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  Plus,
  ShieldAlert,
  Shield,
  Eye,
  ChevronsUpDown,
  Building2,
  Check
} from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { 
  hasPermission, 
  isInterviewerRole, 
  isViewerRole,
  canViewTeam,
  canViewSettings,
  canViewAuditLogs,
  canViewFullAnalytics,
  type UserRole, 
  type Permission 
} from "@shared/rbac";

interface DashboardLayoutProps {
  children: React.ReactNode;
  orgId?: string;
}

export function DashboardLayout({ children, orgId }: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { data: currentMember } = useCurrentMember(orgId ? parseInt(orgId) : 0);
  const { data: organizations } = useOrganizations();
  
  const currentOrg = organizations?.find(org => org.id === parseInt(orgId || '0'));
  
  const handleOrgChange = (newOrgId: number) => {
    setLocation(`/org/${newOrgId}/dashboard`);
  };

  const userRole = (currentMember?.role as UserRole) || 'viewer';

  const navigation = useMemo(() => {
    if (!orgId) return [];
    
    // ================================================================
    // ENTREVISTADOR - Only sees assigned surveys
    // ================================================================
    if (isInterviewerRole(userRole)) {
      return [
        { name: 'Minhas Pesquisas', href: `/org/${orgId}/surveys`, icon: FileText },
      ];
    }
    
    // ================================================================
    // VISUALIZADOR (Client) - Only sees aggregated dashboards
    // ================================================================
    if (isViewerRole(userRole)) {
      return [
        { name: 'Portal', href: `/org/${orgId}/portal`, icon: Eye },
      ];
    }
    
    // ================================================================
    // COORDENADOR - View surveys, analytics, maps (NO team, NO settings, NO audit)
    // ================================================================
    if (userRole === 'coordinator') {
      return [
        { name: 'Visão Geral', href: `/org/${orgId}/dashboard`, icon: LayoutDashboard },
        { name: 'Pesquisas', href: `/org/${orgId}/surveys`, icon: FileText },
      ];
    }
    
    // ================================================================
    // OWNER & ADMIN - Full navigation access
    // ================================================================
    const items = [
      { name: 'Visão Geral', href: `/org/${orgId}/dashboard`, icon: LayoutDashboard },
      { name: 'Pesquisas', href: `/org/${orgId}/surveys`, icon: FileText },
    ];
    
    // Auditoria - only for admin/owner
    if (canViewAuditLogs(userRole)) {
      items.push({ name: 'Auditoria', href: `/org/${orgId}/audit`, icon: ShieldAlert });
    }
    
    // Equipe - only for admin/owner
    if (canViewTeam(userRole)) {
      items.push({ name: 'Equipe', href: `/org/${orgId}/team`, icon: Users });
    }
    
    // Configurações - only for admin/owner
    if (canViewSettings(userRole)) {
      items.push({ name: 'Configurações', href: `/org/${orgId}/settings`, icon: Settings });
    }
    
    return items;
  }, [orgId, userRole]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <div className="md:hidden flex items-center justify-between p-4 border-b bg-card">
        <div className="flex items-center gap-2">
           <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold font-display">
             V
           </div>
           <span className="font-display font-bold text-lg">Veracity</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <X /> : <Menu />}
        </Button>
      </div>

      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r shadow-lg transform transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:shadow-none",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-full flex flex-col p-4">
          <div className="hidden md:flex items-center gap-2 px-2 mb-4 mt-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold font-display shadow-md shadow-primary/20">
              V
            </div>
            <span className="font-display font-bold text-xl tracking-tight">Veracity</span>
          </div>

          {organizations && organizations.length > 0 && (
            <div className="mb-6 px-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="w-full justify-between gap-2 h-auto py-2"
                    data-testid="button-org-selector"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm font-medium">
                        {currentOrg?.name || 'Selecionar organização'}
                      </span>
                    </div>
                    <ChevronsUpDown className="w-4 h-4 shrink-0 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {organizations.map((org) => (
                    <DropdownMenuItem 
                      key={org.id}
                      className="cursor-pointer"
                      onClick={() => handleOrgChange(org.id)}
                      data-testid={`menu-item-org-${org.id}`}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="truncate flex-1">{org.name}</span>
                        {org.id === parseInt(orgId || '0') && (
                          <Check className="w-4 h-4 text-primary" />
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          <div className="space-y-1 flex-1">
            {navigation.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.name} href={item.href}>
                  <div className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer group",
                    isActive 
                      ? "bg-primary/10 text-primary shadow-sm" 
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}>
                    <item.icon className={cn("w-5 h-5", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                    {item.name}
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="border-t pt-4 mt-4">
            <div className="flex items-center gap-3 px-2 mb-4">
              <Avatar className="h-9 w-9 border-2 border-background shadow-sm">
                <AvatarImage src={user.profileImageUrl || undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {user.firstName?.[0]}{user.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-medium truncate">{user.firstName} {user.lastName}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                    <Settings className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem className="cursor-pointer" onClick={() => logout()}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto h-[calc(100vh-64px)] md:h-screen">
        <div className="max-w-7xl mx-auto p-4 md:p-8">
          {children}
        </div>
      </main>

      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </div>
  );
}
