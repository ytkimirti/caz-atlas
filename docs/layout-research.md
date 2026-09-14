# Graph layout research

Investigated 14 September 2026 against the checked-in concert graph.

## Recommendation

Use **Topluluklar** (Communities) as the default. Detect groups of frequent collaborators with Louvain, run D3 inside each group, and pack groups into separate areas. Keep **ForceAtlas2**, **D3**, and **ngraph** available for comparison. There is no universal best force engine for this dataset: global springs still tend to put a densely connected network in one central mass.

Communities are computed from the full filtered concert graph using log-compressed edge weights, deterministic traversal and resolution 1.5. They are layout aids, not verified bands, genres or social categories. Node colors still represent instruments. Positions of separate groups are determined by packing, so distance between groups does not measure relationship strength. Cross-group edges and shortest paths remain available.

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

- All computation runs in a terminable Web Worker. Switching engine, spacing or filters cancels obsolete work; selection and hover changes do not restart it.
- Previous positions stay visible while a replacement layout computes. A failed worker shows archive positions and a visible recovery message.
- `engine` and `spacing` persist in the URL. Unknown values fall back to validated defaults.
- Components are normalized by population and typical radius. Very long radial tails are logarithmically compressed before collision relaxation so outliers have less influence on fit.
- Disconnected components and isolated musicians are packed into separate boxes. Communities mode uses the same packing for detected groups.
- The three spacing choices change repulsion, collision clearance and box padding, rather than just multiplying every coordinate. Fitting can still offset part of the apparent spacing change.
- Canvas coordinates keep the same scale on both axes, including mobile. At wide zoom, markers may shrink to 0.75 pixels instead of the previous 2-pixel minimum; the 7-pixel minimum hit target remains. Collision clearance also grows more strongly with concert count. Both changes matter for overlap reduction.

## Validation and limitations

Tests cover deterministic finite positions, input immutability, empty and isolated graphs, weak bridges, increasing spacing, URL validation, all engines on the full archive, cancellation, failure recovery, search, paths, filters and mobile controls.

The read-only benchmark reproduces the original worker and measures the same 1512 × 982 fit viewport, including the original horizontal stretch. Its central region is the middle 40% of each viewport dimension. This metric measures the specific crowded-center complaint; it does not measure community correctness or total layout quality. It also reports intersecting marker pairs and the fullest 100 × 100 pixel bin so local crowding remains visible.

In the default 1,427-person view, the original layout placed 848 musicians in the central region; Communities placed 364. Both had zero intersecting marker pairs. The fullest bin increased from 60 to 85: the improvement is separation into groups, not uniformly lower density everywhere.

| View                           | Original central nodes | Communities central nodes | Original overlapping marker pairs | Communities overlapping marker pairs |
| ------------------------------ | ---------------------: | ------------------------: | --------------------------------: | -----------------------------------: |
| Default, 1,427 musicians       |                    848 |                       364 |                                 0 |                                    0 |
| Full archive, 14,714 musicians |                  8,287 |                     4,140 |                             1,801 |                                    0 |

The overlap comparison includes the new marker sizing and collision clearance, not just engine selection. It excludes emphasized markers and labels and does not promise zero overlap at every viewport size or zoom level.

In one local Chrome run, default views became ready in about 2.5–3 seconds and full-archive views in about 13–18 seconds, including data loading. These are observations from this machine, not performance guarantees. Bun and browser timings differed substantially, especially for ForceAtlas2. All algorithms use bounded iterations rather than claiming full convergence.

The full archive still requires zoom or filters to inspect dense groups. Changing filters can change community membership and reposition groups. Labels are not part of the physics collision radius; the existing renderer limits ordinary labels and prioritizes selected paths.

```sh
bun test tests/unit
bun run build
ATLAS_TEST_URL=http://localhost:18894 bun run test:ui
ATLAS_TEST_URL=http://localhost:18894 bun run test:layouts
bun run benchmark:layouts
bun run benchmark:layouts --all --engine=communities
```

The benchmarks read local JSON only. UI checks reject non-local target hosts. No data collection, ingestion or external writes are needed.
