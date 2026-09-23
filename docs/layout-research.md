# Graph layout research

Investigated 14 September 2026 against the checked-in concert graph.

## Recommendation

Use **Topluluklar** (Communities) as the default. Detect groups of frequent collaborators with Louvain, run D3 inside each group, then position communities with weighted springs between groups and size-aware collision spacing. Keep **ForceAtlas2**, **D3**, and **ngraph** available for comparison. There is no universal best force engine for this dataset: global springs still tend to put a densely connected network in one central mass.

Communities are computed from the selected date window under the venue and concert-count filters using log-compressed edge weights, deterministic traversal and a selectable resolution: 0.8 (broad), 1.5 (balanced), or 3 (detailed). Changing dates or the playback cursor recomputes membership and positions using only collaborations in the displayed period. Communities are layout aids, not verified bands, genres or social categories. Node colors still represent instruments. Cross-community collaboration weights influence positioning. Group size and collision spacing also affect distance, so it is not a quantitative relationship-strength scale. Disconnected networks are packed separately with no inferred relationship. Cross-group edges and shortest paths remain available.

## Candidates and sources

| Choice                                                                                        | Relevant capability                                                                       | Use here                                                                                                          |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [D3 force](https://d3js.org/d3-force/many-body)                                               | Configurable repulsion with Barnes-Hut approximation                                      | Retain as a tuned baseline; remove the repulsion cutoff and use degree-aware default spring strength.             |
| [ForceAtlas2](https://graphology.github.io/standard-library/layout-forceatlas2.html)          | LinLog attraction, degree-related repulsion, edge-weight influence and Barnes-Hut support | Alternative global layout, with LinLog enabled and moderated edge weights.                                        |
| [ngraph.forcelayout](https://github.com/anvaka/ngraph.forcelayout)                            | Spring, repulsion and drag simulation with quadtree acceleration                          | A distinct spring-based alternative; bounded iteration count, deterministic initial positions, explicit disposal. |
| [Louvain communities](https://graphology.github.io/standard-library/communities-louvain.html) | Weighted community detection; configurable resolution and deterministic traversal         | Default grouping stage, followed by D3 and packing.                                                               |

[D3 collision forces](https://d3js.org/d3-force/collide) provide a shared final relaxation pass. Collision avoidance in layout coordinates cannot guarantee readable markers or labels after fitting 14,714 people into a small viewport.

General rigid-body engines would add body/contact machinery without addressing community separation. The selected libraries work directly with graph links and fit the existing Canvas and Web Worker architecture.

## What caused the crowded center

The original worker used a constant link strength of 0.22 and link distance of 45, repulsion of -65 with a 500-unit cutoff, and two origin-directed forces of strength 0.012. Everyone was pulled toward the same point. Many retained springs could still terminate at the same hub. Rendering fewer edges did not remove those springs from the layout.

The old strongest-three layout heuristic could also discard weak bridges between communities. The replacement retains a maximum spanning forest alongside the strongest ties, so global layouts preserve connectivity. The community view intentionally places groups separately; it does not remove those bridges from the interaction graph.

## Implementation choices

- All computation runs in a terminable Web Worker. Switching engine, spacing, grouping, dates, venue or concert threshold cancels obsolete work. Rapid manual scrubbing replaces pending calculations. Playback waits for each layout to finish before advancing, so it cannot repeatedly cancel a slow layout. Instrument highlights, selection and hover changes do not restart physics.
- Previous positions stay visible while a replacement layout computes. A failed worker preserves the displayed positions and shows an accessible recovery message with a retry action, including when mobile panels are open.
- `engine`, `spacing`, and `resolution` persist in the URL. Unknown values fall back to validated defaults.
- The D3 engine runs the same allocation-free Barnes-Hut simulation as the communities view (link distance 65, charge -180, weak gravity 0.02) instead of d3-force. Components above 400 musicians start ForceAtlas2 and ngraph from 80 ticks of that simulation; ForceAtlas2 then runs 60 iterations with Barnes-Hut theta 1.2 (Gephi's default; graphology's 0.5 was several times slower) and ngraph 100 steps. The shared final collision pass uses the grid-based `separate` with full-strength pushes and up to 400 passes instead of d3's `forceCollide`.
- Global D3, ForceAtlas2 and ngraph layouts normalize components by population and typical radius, compressing long radial tails. Communities mode uses its own compact local simulations and preserves the final geometry without radial compression.
- Communities are split into connected parts using the full induced graph. Internal springs are sparsified only after this split, so a weak internal bridge cannot be lost through an external path.
- Community-level springs aggregate all cross-group edges with log-compressed weights. Local circles include actual member extents, count-dependent clearance and padding. A final collision-only pass is followed by uniform center expansion if any circle intersection remains.
- The largest connected set of communities sits on the left. Smaller disconnected sets are shelf-packed beside it using the bounding boxes of their community circles (padded by 1.5 gaps), replacing enclosing circles that left a visible gap and empty corners. The column width is chosen by trying about 50 widths and keeping the one whose total extent best fits a 1.6:1 viewport. Packing translates each set without changing its internal pairwise distances. The other engines retain component boxes.
- When the main network has at least 12 communities, its community-level simulation runs with vertical pulls of 0, 0.02 and 0.04 and keeps the one that packs best, flattening the network toward the screen shape. Smaller networks keep their natural shape so a chain of groups cannot fold.
- Louvain fragments of one or two musicians join the neighbouring community they share the most concerts with, so duos sit beside their collaborators instead of floating as separate circles with long cross edges.
- Local community simulations run on an allocation-free Barnes-Hut implementation (`src/local-force.ts`) with the same forces as d3, followed by a grid-based collision pass. Rest length shrinks with the square root of log shared concerts, so frequent partners sit closer. The default view is precomputed at build time and shipped in `runtime.json`.
- The three spacing choices change repulsion, collision clearance and group padding, rather than just multiplying every coordinate. Fitting can still offset part of the apparent spacing change.
- Canvas coordinates keep the same scale on both axes, including mobile. At wide zoom, markers may shrink to 0.75 pixels instead of the previous 2-pixel minimum; the 7-pixel minimum hit target remains. Collision clearance also grows more strongly with concert count. Both changes matter for overlap reduction.

## Validation and limitations

Tests cover deterministic finite positions, input immutability, empty and isolated graphs, weak bridges, increasing spacing, URL validation, all engines on the full archive, cancellation, failure recovery, search, paths, filters and mobile controls.

The former 10-concert default filter contains 1,427 musicians; the app now opens unfiltered with 12,077 musicians who have concert records. Measurements on the checked-in dataset show that the detail selector changes the actual partition:

| Grouping       | Communities with multiple musicians | Largest community |
| -------------- | ----------------------------------: | ----------------: |
| Broad (0.8)    |                                  23 |               442 |
| Balanced (1.5) |                                  29 |               175 |
| Detailed (3)   |                                  63 |               131 |

The full 14,714-person archive produces 3,396 communities at the balanced setting, including 2,790 isolates. On this machine, the community calculation originally took around 2 seconds for the 10-concert view and 14–17 seconds for the full archive in Bun; it now takes about 0.3 and 2 seconds.

`scripts/layout-quality.ts` is the feedback loop for tuning. On the full archive (12,077 musicians) the current layout scores a fitted zoom of 0.109 (was 0.080), neighbourhood precision 0.618 (was 0.609) and zero marker overlaps; on the 10-concert view precision rose from 0.42 to 0.50. Fewer simulation ticks, stronger or weaker local charge and gravity, more retained springs per musician and community-level force changes were measured and rejected: each traded precision for compactness or had no measurable effect. A later revision raised the fitted zoom to 0.126 on the full archive (precision 0.618, zero overlaps) and from 0.303 to 0.354 on the 10-concert view (precision 0.505), through bounding-box packing, the vertical-pull candidates and merging one- and two-person fragments. Merging larger fragments (up to 5 or 8), a horizontal hold force, fixed vertical pulls and tighter island padding were measured and rejected: they lost precision, caused overlaps or varied between runs. Building the full archive now takes about 2.2 seconds.

Full-archive timings for the other engines in Bun, before and after seeding and the typed-array passes: D3 21.4 to 3.4 seconds, ForceAtlas2 86.6 to 8 seconds, ngraph 12.8 to 4.3 seconds. In the browser (Chrome, including page load) they fell from about 16 to 18 seconds to 4 to 6 seconds. Neighbourhood precision rose for ForceAtlas2 (0.20 to 0.32) and ngraph (0.26 to 0.39) and stayed near 0.44 for D3; fitted zoom rose for D3 and ForceAtlas2 and fell from 0.123 to 0.106 for ngraph, which now inherits D3's denser core. Fewer ngraph steps without seeding lowered its precision and was rejected.

## Rendering

With all 95,833 relationships drawn, a frame cost about 19 ms in headless Chrome while panning and the overview was a uniform gray haze. The renderer now keeps projected positions in typed arrays and endpoint indices per weight tier (one, two or three, four to nine, ten or more shared concerts). Each tier is one stroke whose opacity and width depend on zoom: zoomed out, single gigs almost vanish and frequent partnerships carry the structure; zoomed in, all ties read at similar strength. Ties longer than 180 screen pixels are drawn at a quarter of their tier's opacity, and ties shorter than one pixel are skipped. Unemphasized markers are filled in one path per instrument color, with sub-1.25-pixel markers drawn as equal-area squares. Ensemble hints look up nearby markers in a screen grid instead of scanning every musician. Average draw time is now about 7 ms (maximum about 16 to 20 ms). Hover, selection, paths, highlights, fades, 3D and live physics use the previous per-marker path.

Timing depends on the runtime and hardware; simulations use bounded iterations, not a convergence guarantee.

Regression fixtures verify distinct connected communities, preferential proximity along a planted chain, nonintersecting group circles, stable geometry when disconnected networks are packed, deterministic output at each resolution, and unmodified input relationships. Browser checks exercise all grouping levels, URL restoration, mobile controls and the complete archive. Changing grouping does not change the number of rendered relationships or the collaborator filter.

The read-only `benchmark:layouts` command still compares the original force layout with the current implementation at a 1512 × 982 viewport. Its central-density metric is not a community-quality measure: a meaningful arrangement can place well-separated groups in the middle of the screen. Circle separation and preservation of relationships are the relevant checks for this revision.

The full archive still requires zoom or filters to inspect dense groups. Changing filters can change community membership and reposition groups. Labels are not part of the physics collision radius; the existing renderer limits ordinary labels and prioritizes selected paths.

```sh
bun test tests/unit
bun run build
ATLAS_TEST_URL=http://localhost:18884 bun run test:ui
ATLAS_TEST_URL=http://localhost:18884 bun run test:layouts
ATLAS_TEST_URL=http://localhost:18884 bun run test:communities
ATLAS_TEST_URL=http://localhost:18884 bun run test:progress
ATLAS_TEST_URL=http://localhost:18884 bun run test:timeline
bun run benchmark:layouts
bun run benchmark:layouts --all --engine=communities
```

The benchmarks read local JSON only. UI checks reject non-local target hosts. No data collection, ingestion or external writes are needed.
