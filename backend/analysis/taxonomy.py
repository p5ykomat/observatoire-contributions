from pathlib import Path

import yaml

RULES = yaml.safe_load(
    (Path(__file__).parents[2] / "config/contribution_taxonomy.yaml").read_text(encoding="utf-8")
)


def classify(project: str, family: str, namespace: dict) -> str:
    name = namespace.get("canonical", namespace.get("name", ""))
    if name.lower().endswith(RULES["community_suffix"]):
        return "COMMUNITY"
    specific = RULES["projects"].get(project, {})
    if name in specific:
        return specific[name]
    if name in RULES["maintenance"]:
        return "MAINTENANCE"
    return RULES["families"].get(family, {}).get(name, RULES["default"])
