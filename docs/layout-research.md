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
- Global D3, ForceAtlas2 and ngraph layouts normalize components by population and typical radius, compressing long radial tails. Communities mode uses its own compact local simulations and preserves the final geometry without radial compression.
- Communities are split into connected parts using the full induced graph. Internal springs are sparsified only after this split, so a weak internal bridge cannot be lost through an external path.
- Community-level springs aggregate all cross-group edges with log-compressed weights. Local circles include actual member extents, count-dependent clearance and padding. A final collision-only pass is followed by uniform center expansion if any circle intersection remains.
- The largest connected set of communities sits on the left. Smaller disconnected sets are shelf-packed beside it in a screen-shaped (1.6:1) block, replacing an earlier circle packing that left them as a sparse ring around the main network. Packing translates each set without changing its internal pairwise distances. The other engines retain component boxes.
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

`scripts/layout-quality.ts` is the feedback loop for tuning. On the full archive (12,077 musicians) the current layout scores a fitted zoom of 0.109 (was 0.080), neighbourhood precision 0.618 (was 0.609) and zero marker overlaps; on the 10-concert view precision rose from 0.42 to 0.50. Fewer simulation ticks, stronger or weaker local charge and gravity, more retained springs per musician and community-level force changes were measured and rejected: each traded precision for compactness or had no measurable effect. Timing depends on the runtime and hardware; simulations use bounded iterations, not a convergence guarantee.

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
