# Blog Editorial Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present technical/academic competence and practical/business competence through a balanced bilingual blog hub.

**Architecture:** Keep signed BlogPost data unchanged. Resolve presentation metadata from a separate validated catalog, then render neutral section hubs and context-specific article pages using existing Astro/Tailwind patterns.

**Tech Stack:** Existing Astro, TypeScript, Tailwind; Node test runner. No added dependencies.

**Spec:** docs/superpowers/specs/2026-11-07-blog-editorial-hub-design.md

## Global Constraints
- Keep every existing article URL and approval digest valid.
- Do not change company/blog/*.json, src/i18n, deploy/configuration or MissionControl source.
- Do not publish the Transformer draft, create commits or push.
- Use native links and no new production dependencies.
- Preserve original workspace and the two pre-existing draft files.

### Task 1: Cohesive catalog, presentation and routes

**Files:** create company/blog-editorial.json, src/lib/blog-editorial.ts, tests/blog-editorial-navigation.test.mjs, src/components/BlogCard.astro, src/components/BlogSectionNav.astro, src/pages/blog/sections/[section].astro, src/pages/en/blog/sections/[section].astro; modify src/components/BlogPage.astro and scripts/editorial/README.md.

**Interfaces:** editorial metadata is separate from BlogPost. Export typed section definitions, labels, metadata lookup with neutral fallback, section URLs, reading time and related-article selection. BlogPage consumes existing props plus optional sectionId or archive flag. Existing index/article routes keep working unchanged.

- [ ] Add behavioral tests proving signed posts are never mutated, unknown posts stay neutral, drafts remain excluded, classifications validate, related items stay within the section and IT/EN URLs align.
- [ ] Implement the catalog and pure helpers. Include explicit entries for existing posts plus the pending ROI and Transformer slugs, but never expose draft content.
- [ ] Implement three equal navigation choices, grouped hub, separate archive and section pages. Use honest compact empty states and noindex empty section pages.
- [ ] Add article breadcrumb, metadata, table of contents, readable content and contextual closing links. Preserve source citations and structured data.
- [ ] Document catalog maintenance and the publisher’s unchanged one-article scope.
- [ ] Run targeted tests and build, fix actual failures, then self-review changed files. Do not commit.

### Task 2: Independent verification and handoff

**Files:** same implementation read-only during review; temporary evidence outside repository.

- [ ] Review spec compliance and approval/draft boundaries independently.
- [ ] Run complete appropriate tests and production build from isolated input.
- [ ] Inspect generated IT/EN hub, section pages, archive and article layouts at desktop/mobile widths, including actual anchor targets and empty sections.
- [ ] Copy only reviewed changed files into the attached managed worktree; preserve original checkout and drafts.
- [ ] Record outcome and limitations in MissionControl; leave concrete code for user review without committing or deploying.
