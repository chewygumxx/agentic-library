from pathlib import Path
from textwrap import wrap

ROOT = Path(__file__).parent
OUT = ROOT / "CLASSIFICATION.md"

def category(name: str) -> str:
    n = name.lower()
    if any(x in n for x in ("security", "hipaa", "phi", "bounty", "safety", "hardening", "guard", "compliance")):
        return "security-and-compliance"
    if any(x in n for x in ("pattern", "architecture", "hexagonal", "clean-architecture", "standards", "coding", "design-system")):
        return "software-engineering"
    if any(x in n for x in ("test", "eval", "benchmark", "regression", "verification", "qa", "quality", "tdd")):
        return "testing-and-quality"
    if any(x in n for x in ("agent", "autonomous", "orches", "loop", "harness", "council", "workflow", "dispatch", "runtime", "introspection", "memory", "context", "prompt")):
        return "agent-systems"
    if any(x in n for x in ("frontend", "react", "vue", "angular", "ios", "android", "flutter", "swift", "kotlin", "compose", "ui", "motion", "video", "blender", "manim", "remotion")):
        return "application-and-media"
    if any(x in n for x in ("database", "postgres", "mysql", "redis", "prisma", "clickhouse", "migration", "data", "scraper", "throughput", "recsys")):
        return "data-and-storage"
    if any(x in n for x in ("network", "docker", "kubernetes", "homelab", "wireguard", "bgp", "deployment", "terminal", "github", "git", "ops", "cloud", "uncloud")):
        return "infrastructure-and-operations"
    if any(x in n for x in ("brand", "marketing", "market", "investor", "lead", "social", "seo", "content", "article", "copy", "story", "voice")):
        return "content-and-commercial"
    if any(x in n for x in ("finance", "billing", "payment", "procurement", "logistics", "carrier", "inventory", "customer", "energy", "trade", "production")):
        return "business-domain"
    return "general-productivity"

ABSTRACTS = {
    "gateguard": "A large delivery and quality gate that coordinates preflight checks, evidence collection, and release blocking across a repository.",
    "agent-payment-x402": "A protocol-oriented guide for building agents that discover, authorize, and pay for HTTP resources through x402-style payment flows.",
    "tinystruct-patterns": "A broad reference for the TinyStruct framework, covering project structure, routing, persistence, data handling, system usage, and testing.",
    "windows-desktop-e2e": "An end-to-end testing playbook for Windows desktop applications, including environment setup, UI interaction, synchronization, and evidence capture.",
    "generating-python-installer": "A detailed recipe for producing distributable Python installers, with packaging metadata, platform behavior, generated files, and validation steps.",
    "quality-nonconformance": "A process for recording, analyzing, containing, and closing quality nonconformances with ownership, evidence, and corrective action.",
    "energy-procurement": "A domain workflow for planning energy procurement, comparing supply options, managing risk, and documenting commercial decisions.",
    "customs-trade-compliance": "A trade-compliance reference for classification, documentation, customs controls, and exception handling in cross-border operations.",
    "production-scheduling": "A production-planning guide for converting demand and constraints into feasible schedules, with sequencing, capacity, and exception management.",
    "laravel-security": "A Laravel security checklist and implementation guide covering authentication, authorization, input handling, secrets, sessions, and deployment risks.",
    "quarkus-tdd": "A test-driven development workflow for Quarkus services, spanning test design, dependency injection, persistence, HTTP boundaries, and fast feedback.",
    "data-scraper-agent": "A structured agent workflow for extracting data from web sources, handling pagination and failures, normalizing results, and preserving provenance.",
    "autonomous-loops": "A design guide for bounded autonomous agent loops, including observation, planning, action, stopping conditions, recovery, and operator control.",
    "typescript-patterns": "A substantial TypeScript engineering reference covering type modeling, module boundaries, async behavior, error handling, and maintainable API design.",
    "carrier-relationship-management": "A logistics operations playbook for managing carrier relationships, service performance, escalations, and recurring improvement actions.",
    "tdd-workflow": "A repository-wide TDD workflow that turns requirements into focused tests, incremental implementation, and explicit verification checkpoints.",
    "issue-review": "A systematic process for reviewing issue reports, reproducing claims, assessing scope and severity, and recording actionable dispositions.",
    "osint-investigation": "A structured open-source intelligence workflow for collecting, corroborating, analyzing, and citing publicly available information.",
    "frontend-slides": "A detailed system for building presentation slides with frontend technologies, covering layout, animation, visual hierarchy, export, and validation.",
    "returns-reverse-logistics": "A reverse-logistics playbook for triaging returns, selecting disposition paths, controlling cost, and feeding failure patterns back into operations.",
    "inventory-demand-planning": "A demand and inventory planning workflow covering forecasts, supply constraints, replenishment decisions, and exception-based review.",
}

skills = sorted(p.parent.name for p in ROOT.glob("*/SKILL.md"))
lines = ["# `.dmz` skill classification", "", "Generated from the surviving `.dmz/*/SKILL.md` inventory on 2026-11-17.", "", "## Classification policy", "", "Each skill receives one primary retrieval category based on its dominant", "subject. This is a routing label, not a quality score. Vendor-specific", "catalogs and API-onboarding material were moved to the user trash before", "this inventory was generated. Large means `SKILL.md` is at least 20 KiB;", "abstracts below are intentionally short and operational.", "", "## Inventory", ""]
for name in skills:
    path = ROOT / name / "SKILL.md"
    size = path.stat().st_size
    lines.append(f"- `{name}` :: {category(name)} :: {size:,} B")
    if size >= 20_000:
        abstract = ABSTRACTS.get(name, "Abstract pending a closer reading of this monolith.")
        wrapped = wrap(abstract, width=68, subsequent_indent="  ")
        lines.append(f"  Abstract: {wrapped[0]}")
        lines.extend(wrapped[1:])
lines += ["", "## Category key", "", "- `agent-systems`: agent behavior, orchestration, memory, prompts,", "  harnesses, and runtime control.", "- `application-and-media`: application frameworks, UI, mobile, visual,", "  animation, and media production.", "- `business-domain`: operational workflows tied to a business function or", "  regulated industry.", "- `content-and-commercial`: writing, marketing, research, brand, growth,", "  and commercial communication.", "- `data-and-storage`: data extraction, databases, persistence, analytics,", "  and data-intensive systems.", "- `general-productivity`: skills that do not fit a narrower category.", "- `infrastructure-and-operations`: deployment, systems, networking, cloud,", "  terminals, and repository operations.", "- `security-and-compliance`: defensive security, privacy, safety, and", "  compliance controls.", "- `software-engineering`: architecture, coding conventions, framework", "  patterns, and design structure.", "- `testing-and-quality`: tests, evaluation, benchmarks, regression,", "  verification, and quality gates.", "", "## Deliberately trashed", "", "The following top-level families were moved with `gtrash put` and are", "absent from the inventory: `dbs*`, `lark-*`, `exa-search`, `fal-ai-media`,", "`mailtrap-email-integration`, `nutrient-document-processing`, and `videodb`.", "The trash operation is recoverable through the system trash until it is", "pruned.", ""]
OUT.write_text("\n".join(lines), encoding="utf-8")
