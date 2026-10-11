# Layout research and decision — 11 October 2026

## Decision

Use **A / Nuit calme** as the default, as selected by the user. Welcome text:
**Bienvenue, famille Caron.** The light theme remains an optional device preference.
The main entry point now uses the real redesigned layout, rather than the sample-data concept.

This is the strongest fit among the compared approaches for the stated use: a calm 10-inch wall
display prioritizing clock/weather, agenda and music. It is a design judgment, not proof of a
universally best layout. Readability at the actual mounting distance and behavior in Fully still
need a household trial. No research source establishes a single optimal screen for all homes.

## What was compared

| Approach | What it contributes | Fit for this panel |
|---|---|---|
| Home Assistant Sections | Named groups, predictable positioning, responsive layout, optional footer and conditional sections | Keep the fixed clock/weather/agenda groups and music footer. Prefer this native approach if the project later becomes mostly HA device controls. |
| Mushroom | A cohesive set of simple entity-oriented cards | Good reference for consistent controls; an entity grid would consume space without serving the current agenda/weather priorities. |
| Bubble Card | Minimal controls with detail in pop-ups | Keep secondary markets/fishing/camera content in Explorer, while frequently used content stays visible. |
| Dense control grid / floorplan | Many devices or spatial relationships on one screen | Not selected: there are currently no HA entities to control, and the user explicitly wants minimal clutter. |

The comparison draws on the official maintainers' descriptions, not a claim that these products
have been installed or benchmarked on this tablet.

## Refinements applied

- Default theme A; household welcome instead of an individual name.
- Clock formatted as HH:MM for a compact, large readout.
- Five forecast points, three hours apart, visible together instead of a twelve-column strip.
- Plain-language weather condition and feels-like temperature in the summary.
- Weather advisories beside the current conditions, outside the scrollable forecast.
- Seven-day details remain behind a labeled button; optional information remains in Explorer.
- Controls retain 48px minimum targets and visible keyboard focus. The page preserves its two
  columns at tablet sizes, with a single-column fallback on narrow screens.
- No new card framework, remote fonts, animations or camera streams were added to the loading path.

## Remaining design limitation

The private Google Calendar iframe is visually denser and brighter than the concept agenda. Its
contents cannot be restyled by this site. A custom, authenticated agenda with the next few events
is the next meaningful improvement; do not make the calendar public for aesthetic consistency.
Likewise, a clock-first home screen should be reconsidered if this becomes a control panel where
lights, scenes or door status are the primary daily tasks.

## Sources, checked 11 October 2026

- [Home Assistant dashboard design rationale](https://www.home-assistant.io/blog/2024/03/04/dashboard-chapter-1/): the 2024 article explains grouping and spatial memory; its old experimental-status wording is not used as current product guidance.
- [Current Sections documentation](https://www.home-assistant.io/dashboards/sections/): responsive sections, conditional visibility and footer behavior.
- [Mushroom, maintainer repository](https://github.com/piitaya/lovelace-mushroom): entity-card design reference.
- [Bubble Card, maintainer repository](https://github.com/Clooos/Bubble-Card): minimalist controls and pop-up design reference.

The application is still a standalone static dashboard, not an installed Home Assistant dashboard.
