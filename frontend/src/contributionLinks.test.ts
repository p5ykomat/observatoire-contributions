import { expect, it } from "vitest";
import {
  contributionLinks,
  contributionsURL,
} from "./analysis/contributionLinks";
import { emptySession, type Project } from "./types";

const project = (domain: string, id = domain): Project => ({
  id,
  domain,
  label: domain,
  family: "wikipedia",
});

it("links to full public histories and encodes usernames as a path segment", () => {
  for (const domain of [
    "fr.wikipedia.org",
    "commons.wikimedia.org",
    "www.wikidata.org",
    "br.wiktionary.org",
  ]) {
    expect(contributionsURL(project(domain), "Jean Benoît /?#")).toBe(
      `https://${domain}/wiki/Special:Contributions/Jean_Beno%C3%AEt_%2F%3F%23`,
    );
  }
});

it("rejects untrusted domains from imported archives", () => {
  for (const domain of [
    "example.com",
    "fr.wikipedia.org.evil.org",
    "https://fr.wikipedia.org",
    "fr.wikipedia.org:443",
    "evil@fr.wikipedia.org",
    "fr.wikipedia.org/path",
    "fr.wikipedia.org\n",
  ]) {
    expect(contributionsURL(project(domain), "Alice")).toBeNull();
  }
});

it("keeps origin and known contribution projects beyond the chosen period, once per project", () => {
  const session = emptySession();
  session.params.origins = ["frwiki"];
  session.catalog = [
    project("fr.wikipedia.org", "frwiki"),
    project("www.wikidata.org", "wikidatawiki"),
    project("commons.wikimedia.org", "commonswiki"),
  ];
  const edit = {
    username: "Alice",
    project: "wikidatawiki",
    revision: 1,
    timestamp: "2020-01-01T00:00:00Z",
    namespace: 0,
    title: "Q1",
    category: "STRUCTURED_DATA" as const,
    automation: "normal" as const,
    tags: [],
    provider: "mediawiki",
  };
  session.edits = [
    edit,
    { ...edit, revision: 2 },
    { ...edit, username: "Bob", project: "commonswiki" },
  ];
  expect(
    contributionLinks(session, "Alice").map(({ project }) => project.id),
  ).toEqual(["frwiki", "wikidatawiki"]);
});
