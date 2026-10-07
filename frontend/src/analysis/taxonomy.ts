import type { Category, Session } from "../types";
export function classify(
  s: Session,
  project: string,
  namespace: number,
): Category {
  const rules = s.taxonomy,
    info = s.namespaces[project]?.[String(namespace)],
    wiki = s.catalog.find((p) => p.id === project);
  if (!rules || !info || !wiki) return "OTHER";
  const name = info.canonical ?? info.name ?? "";
  if (name.toLowerCase().endsWith(rules.community_suffix)) return "COMMUNITY";
  return (
    rules.projects[project]?.[name] ??
    (rules.maintenance.includes(name)
      ? "MAINTENANCE"
      : (rules.families[wiki.family]?.[name] ?? rules.default))
  );
}
