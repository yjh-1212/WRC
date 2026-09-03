# Enterprise SaaS Product Builder — Complete Skill Bundle

This bundle was originally assembled from the user-provided Skill archives and has now been extended with the two AMap archives supplied on 2026-09-02 plus a local `amap-design-skill`.

## Core principle

`enterprise-saas-product-builder` is only an orchestrator. It routes work to separate specialist Skills and does not copy, compress, or reimplement their professional methods.

## Requested stack

- product-design
- user-story-mapping
- information-architecture
- product-design-and-ux
- dashboard-design-system
- dashboard-product-design-standard
- interface-design
- ui-ux-pro-max
- frontend-design
- all official `gsap-*` Skills found in the supplied GSAP archive
- playwright-skill
- amap-design-skill (local map/GIS visual design specialist)
- amap-jsapi-skill (AMap official JSAPI v2.0 Skill)
- amap-map-agent-skills (bundle router; current supplied upstream package contains Google Maps migration only)

## Direct dependencies also preserved

Two requested Skills explicitly reference sibling Skills in their original upstream `SKILL.md`. To avoid broken local routing, these were also preserved as **independent sibling Skill directories**:

- ux
- ux-audit
- design-prototype
- product-discovery
- product-methodology
- web-accessibility
- spec-driven-development

They have not been merged into the orchestrator.

## Installation

Copy the contents of the `skills/` directory into the Skill root used by your coding agent.

Examples of possible roots depend on the agent/tool you use, such as a project-local or user-level Skill directory. Keep every Skill as its own sibling directory so cross-skill links such as `../ux/SKILL.md` continue to resolve.

## Playwright runtime

The complete Playwright Skill source is included, but `node_modules` and browser binaries are not included in the upstream source ZIP.

After copying the Skill locally, install its runtime dependencies from the `playwright-skill` directory according to its own upstream instructions.

## Integrity

See:

- `SOURCES.json` — exact archive and source path used for each Skill
- `MANIFEST_SHA256.txt` — SHA256 for every file in this assembled bundle
- `THIRD_PARTY_LICENSES/` — upstream license/notice files found in the supplied repositories

Generated: 2026-08-31T06:38:05.735009+00:00

## 2026-09-02 AMap + navigation update

- Added `amap-design-skill` for map visual hierarchy, logistics corridors, zoom-level disclosure, map interaction, and performance.
- Added the complete supplied `amap-jsapi-skill` with its references.
- Added `amap-map-agent-skills` as an accurate router around the supplied upstream package. The current package contains only the Google Maps migration Skill, so it is not advertised as a generic POI/routing Agent bundle.
- Strengthened `information-architecture`, `dashboard-product-design-standard`, and the orchestrator so independent second-level business functions use visible secondary navigation + independent routes instead of being flattened into one page of Tabs.
