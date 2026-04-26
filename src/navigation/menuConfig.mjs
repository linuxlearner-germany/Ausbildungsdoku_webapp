const MENU_ITEMS = [
  { key: "dashboard", label: "Dashboard", to: "/dashboard", roles: ["trainee", "trainer", "admin"], group: "core" },
  { key: "reports", label: "Berichte", to: "/berichte", roles: ["trainee"], group: "work" },
  { key: "grades", label: "Noten", to: "/noten", roles: ["trainee"], group: "work" },
  { key: "approvals", label: "Freigaben", to: "/freigaben", roles: ["trainee", "trainer"], group: "work" },
  { key: "exports", label: "Export", to: "/export", roles: ["trainee"], group: "work" },
  { key: "archive", label: "Archiv", to: "/archiv", roles: ["trainee", "trainer"], group: "work" },
  { key: "admin-create-user", label: "Benutzer anlegen", to: "/admin/users/new", roles: ["admin"], group: "admin" },
  { key: "admin-users", label: "Benutzerverwaltung", to: "/admin/users", roles: ["admin"], group: "admin" },
  { key: "admin-assignments", label: "Zuordnungen", to: "/admin/assignments", roles: ["admin"], group: "admin" },
  { key: "admin-audit-log", label: "Audit-Log", to: "/admin/audit-log", roles: ["admin"], group: "admin" },
  { key: "profile", label: "Profil", to: "/profil", roles: ["trainee", "trainer", "admin"], group: "account" }
];

export function getMenuItemsForRole(role) {
  return MENU_ITEMS.filter((item) => item.roles.includes(role));
}

export function getMenuItem(key) {
  return MENU_ITEMS.find((item) => item.key === key) || null;
}

export function canAccessMenuItem(role, key) {
  const item = getMenuItem(key);
  return Boolean(item && item.roles.includes(role));
}

export function getDefaultRouteForRole(role) {
  if (role === "admin") return "/dashboard";
  if (role === "trainer") return "/dashboard";
  return "/dashboard";
}

export function getAdminSectionLinks() {
  return MENU_ITEMS.filter((item) => item.group === "admin");
}
