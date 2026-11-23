# DRIVELLA GTS — Blueprint v2

Status: approved visual and modeling reference  
Build target: v0.11.1 / BUILD 020  
Design intent: stylized synthwave arcade supercar; deliberately not photorealistic and not a replica of a production vehicle.

## Design language

- Very low, wide, wedge-shaped mid-engine GT coupe.
- Crisp shoulder line, broad fenders, short roof and a forward-set cabin.
- Two separate polygonal side ducts with a painted body bridge between them. Do not reproduce the signature Diablo triangular side intake.
- Front: two split horizontal light blades in angular housings; broad three-zone lower intake.
- Rear: segmented tail-light blocks, central louver panel, compact wing on two pylons, four exhaust outlets.
- Bilaterally symmetrical around X = 0.
- Pink / magenta paint, deep violet shadows, dark graphite aero, cool cyan highlights.

## Master dimensions

All dimensions are concept targets, not homologation specifications.

| Dimension | Target |
|---|---:|
| Overall length | 4600 mm |
| Overall width | 1980 mm |
| Overall height | 1120 mm |
| Wheelbase | 2620 mm |
| Front overhang | 990 mm |
| Rear overhang | 990 mm |
| Wheels | 18 in, stylized five-spoke |

## Coordinate system used by the game model

- X: vehicle width; left/right mirrored around X = 0.
- Y: vertical; ground is Y = 0.
- Z: vehicle length; front is +Z, rear is -Z.
- The game mesh is scaled 1.25x from the concept dimensions for readability in the driving camera.
- Game-model target envelope: 5.75 length x 2.475 width x 1.40 height units.
- Wheelbase in game units: 3.275.
- Wheel centers: X = +/-1.015, Z = +/-1.6375, Y = 0.465.
- Axle positions are shared by body wheel arches, wheel meshes and all view references.

## Modeling rules

1. Build one continuous, symmetrical body shell from sampled cross-sections.
2. Use a consistent profile for the cabin shell, roof, glazing and pillars.
3. Cut the wheel arch silhouette into the lower body profile; do not place decorative arch pieces away from the tyre.
4. All glass, lamps, vents, seams, mirrors, wing supports and trim must intersect their host body panels; avoid floating cuboids.
5. Keep the design angular and game-like, with clean shading. Do not add realistic badges or real manufacturer emblems.
6. If future proportions change, update all four orthographic views and axle datums together.

## Distinctive features to preserve

- Split-blade front optics.
- Broad three-section front intake with two dividers.
- Forward-set dark canopy and short roof.
- Two separate side ducts with a solid painted bridge.
- Broad rear shoulders and low integrated engine louver panel.
- Segmented rear lamps, compact twin-pylon wing and four exhaust tips.

## Originality note

This is an original fictional game-car concept informed by broad retro-supercar design language. The blueprint is not a legal clearance or a guarantee that no registered design is similar. Before commercial release, compare the final production geometry and overall impression against relevant design registrations in target markets.
