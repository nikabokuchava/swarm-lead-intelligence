"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Briefcase, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Leads", href: "/leads", icon: Users },
  { name: "Jobs", href: "/jobs", icon: Briefcase },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-card text-card-foreground">
      <div className="flex h-14 items-center border-b px-6">
        <span className="text-lg font-bold">Lead Scraper</span>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-4">
        <div className="flex items-center justify-between">
            <div className="flex flex-col">
                <span className="text-sm font-medium">Admin</span>
                <span className="text-xs text-muted-foreground">admin@example.com</span>
            </div>
            <Button variant="ghost" size="icon" title="Logout">
                <LogOut className="h-4 w-4" />
            </Button>
        </div>
      </div>
    </div>
  );
}
