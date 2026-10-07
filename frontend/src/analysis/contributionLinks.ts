import type { Project, Session } from "../types";

export function contributionsURL(
  project: Project,
  username: string,
): string | null {
  const domain = project.domain;
  if (
    !/^[a-z0-9-]+\.(wikipedia|wiktionary|wikisource|wikibooks|wikiquote|wikinews|wikiversity|wikivoyage|wikimedia)\.org$/.test(
      domain,
    ) &&
    ![
      "www.wikidata.org",
      "www.mediawiki.org",
      "www.wikifunctions.org",
    ].includes(domain)
  )
    return null;
  return `https://${domain}/wiki/Special:Contributions/${encodeURIComponent(username.replaceAll(" ", "_"))}`;
}

export function contributionLinks(session: Session, username: string) {
  const projects = new Set([
    ...session.params.origins,
    ...session.edits
      .filter((edit) => edit.username === username)
      .map((edit) => edit.project),
  ]);
  return session.catalog
    .filter((project) => projects.has(project.id))
    .flatMap((project) => {
      const href = contributionsURL(project, username);
      return href ? [{ project, href }] : [];
    });
}
