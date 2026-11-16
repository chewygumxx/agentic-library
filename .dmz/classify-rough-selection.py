from collections import defaultdict
from pathlib import Path
import re

ROOT = Path(__file__).parent
SOURCE = ROOT / "rough_selection.md"
OUT = ROOT / "ROUGH-SELECTION-CLASSIFICATION.md"

entries = []
by_name = defaultdict(list)
for line in SOURCE.read_text(encoding="utf-8").splitlines():
    match = re.match(r"- \[([^]]+)\]\(([^)]+)\)", line)
    if not match:
        continue
    label, url = match.groups()
    if " — " in label:
        name, publisher = label.split(" — ", 1)
    else:
        name, publisher = label, "undetermined"
    item = {"name": name, "publisher": publisher, "url": url}
    entries.append(item)
    by_name[name].append(item)

service_terms = (
    "api", "azure", "cloudflare", "cloudbase", "connector", "context7",
    "exa", "expo", "fastapi", "firecrawl", "github", "google", "jira",
    "langchain", "langfuse", "linear", "mail", "microsoft", "mintlify",
    "momentic", "neon", "notion", "obsidian", "openai", "parallel",
    "pdf", "remotion", "runpod", "slack", "stripe", "twilio", "vercel",
    "video", "vite", "vue", "wechat", "workspace",
)

def disposition(item):
    name = item["name"].lower()
    publisher = item["publisher"].lower()
    siblings = by_name[item["name"]]
    if len(siblings) > 1 and "superpowers" in publisher:
        return "registry-spam-candidate", "Repeated skill name in a superpowers registry family; compare content before trashing."
    if len(siblings) > 1 and item["url"].rstrip("/").endswith("/design-system"):
        return "duplicate-source-candidate", "Same named skill appears at multiple registry paths; resolve canonical source before keeping both."
    if any(term in name for term in service_terms):
        return "service-docs-retain", "Likely service, API, framework, or platform documentation; retain when instructions are agent invariant."
    if publisher in {"coreyhaines31/marketingskills", "mbfinotti/partnerships-skills", "mbfinotti/revops-skills"}:
        return "commercial-workflow-review", "Commercial workflow material; inspect for useful domain method versus promotional lead-generation content."
    return "general-skill-review", "No immediate registry-spam signal; inspect the source content and retain if it is agent independent."

lines = [
    "# Rough-selection classification",
    "",
    "Generated from `.dmz/rough_selection.md` on 2026-11-17.",
    "",
    "## Decision rule",
    "",
    "A skill is a registry-spam candidate when a substantially equivalent",
    "harness-independent skill is republished across multiple registry or",
    "superpowers bundles. A skill that documents a named service, API, or",
    "framework is retained when its instructions are agent invariant and teach",
    "the service rather than advertise the publisher or require unnecessary",
    "vendor onboarding.",
    "",
    "This is a first-pass classification. `registry-spam-candidate` means the",
    "source contents still need comparison before any trash action. No remote",
    "rough-selection skill has been trashed by this pass.",
    "",
    "## Inventory",
    "",
]
for item in entries:
    status, reason = disposition(item)
    lines.extend([
        f"### `{item['name']}`",
        "",
        f"- Publisher: `{item['publisher']}`",
        f"- Source: {item['url']}",
        f"- Disposition: `{status}`",
        f"- Reason: {reason}",
        "",
    ])

lines.extend([
    "## Immediate candidate groups",
    "",
    "- `landing-page-design`: three `superpowers` publications from distinct",
    "  registry owners; compare content as a likely registry-spam family.",
    "- `design-system`: two paths in one repository plus one ECC publication;",
    "  resolve the canonical source and compare before retaining duplicates.",
    "- `frontend-design`: two distinct publishers; compare content, since the",
    "  name alone does not prove registry spam.",
    "- `turborepo`: one community publication and one Vercel publication;",
    "  retain service documentation if it is agent invariant.",
    "",
    "## Required next pass",
    "",
    "Fetch the linked source repositories or skill pages, extract each",
    "`SKILL.md`, compare candidate duplicate bodies, and record exact source",
    "revisions. Only then move confirmed registry-spam directories with",
    "`gtrash put` and append them to a path-by-path trash ledger.",
    "",
])
OUT.write_text("\n".join(lines), encoding="utf-8")
