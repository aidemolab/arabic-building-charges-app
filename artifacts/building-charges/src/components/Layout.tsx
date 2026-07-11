import { useGetMe, useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import {
  LayoutDashboard, Building2, Home, Users, CreditCard,
  Upload, ClipboardList, LogOut, Menu, X
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/charges", label: "الرسوم والمدفوعات", icon: CreditCard },
  { href: "/buildings", label: "المباني", icon: Building2 },
  { href: "/units", label: "الوحدات", icon: Home },
  { href: "/persons", label: "الملاك والمستأجرون", icon: Users },
  { href: "/import", label: "استيراد Excel", icon: Upload },
  { href: "/audit", label: "سجل التدقيق", icon: ClipboardList },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { data: user } = useGetMe();
  const logoutMutation = useLogout();
  const queryClient = useQueryClient();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        window.location.href = "/login";
      },
    });
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 rounded-lg p-1.5">
            <Building2 className="h-5 w-5 text-sidebar-foreground" />
          </div>
          <div>
            <p className="font-bold text-sidebar-foreground text-sm">نظام رسوم المبنى</p>
            <p className="text-xs text-sidebar-foreground/70">إدارة الرسوم والمدفوعات</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-white/20 text-sidebar-foreground"
                  : "text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center justify-between px-3 py-2 mb-1">
          <span className="text-xs text-sidebar-foreground/70">{user?.username}</span>
          <span className="text-xs bg-white/20 text-sidebar-foreground px-1.5 py-0.5 rounded">
            {user?.role === "admin" ? "مدير" : "مستخدم"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4 ml-2" />
          تسجيل الخروج
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background" dir="rtl">
      <aside className="hidden md:flex w-60 flex-col bg-sidebar text-sidebar-foreground shrink-0">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-64 bg-sidebar text-sidebar-foreground z-10">
            <button
              className="absolute top-3 left-3 text-sidebar-foreground/70 hover:text-sidebar-foreground"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground">
          <button onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-bold text-sm">نظام رسوم المبنى</span>
          <Building2 className="h-5 w-5" />
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
