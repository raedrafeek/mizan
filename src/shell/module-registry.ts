import type { ComponentType } from "react";

/**
 * Life OS module contract. The shell (nav, dashboard grid, alert tray) renders
 * whatever registered modules contribute — it owns nothing module-specific.
 * A future tasks/health module registers itself here with zero shell edits.
 */
export interface ModuleNavItem {
  label: string;
  href: string;
}

export interface ModuleDashboardCard {
  id: string;
  /** grid placement weight — lower renders first */
  order: number;
  component: ComponentType;
}

export interface ModuleDefinition {
  id: string; // "finance", "tasks", ...
  name: string;
  navItems: ModuleNavItem[];
  dashboardCards: ModuleDashboardCard[];
  /** alert kinds this module can emit, for the (future) alert tray */
  alertKinds: string[];
}

const modules: ModuleDefinition[] = [];

export function registerModule(def: ModuleDefinition) {
  if (!modules.some((m) => m.id === def.id)) modules.push(def);
}

export function getModules(): ModuleDefinition[] {
  return modules;
}

export function getDashboardCards(): ModuleDashboardCard[] {
  return modules
    .flatMap((m) => m.dashboardCards)
    .sort((a, b) => a.order - b.order);
}

export function getNavItems(): ModuleNavItem[] {
  return modules.flatMap((m) => m.navItems);
}
