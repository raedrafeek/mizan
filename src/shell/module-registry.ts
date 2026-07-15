import type { ComponentType } from "react";

/**
 * Life OS module contract. The shell (nav rail / tab bar, dashboard, alert
 * tray) renders whatever registered modules contribute — it owns nothing
 * module-specific. A future tasks/health module registers itself here with
 * zero shell edits.
 *
 * Navigation: the shell owns Home ("/"); each module contributes
 * `destinations` that become tabs (phone) / rail items (desktop). When a
 * second module exists, the shell will scope destinations per active module —
 * until then all destinations render.
 */
export interface ModuleDestination {
  id: string;
  label: string; // "Activity"
  href: string;
  icon: ComponentType<{ size?: number }>;
  /** placement weight — lower renders first */
  order: number;
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
  destinations: ModuleDestination[];
  dashboardCards: ModuleDashboardCard[];
  /** alert kinds this module can emit, for the alert tray */
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

export function getDestinations(): ModuleDestination[] {
  return modules.flatMap((m) => m.destinations).sort((a, b) => a.order - b.order);
}
