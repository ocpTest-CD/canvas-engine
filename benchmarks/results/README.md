# 0.3.0 measurements

- quality-1793630840964.json: final acceptance run, runtime TS/TSX/CSS hash and benchmark script hash recorded; isolated from browser regression. Use this record for documentation.
- quality-1793630682134.json: isolated runtime-equivalent run before adding scriptHash and excluding module README from sourceHash. Retained for traceability.
- quality-1793630571943.json: ran concurrently with browser tests. Retained, not used as acceptance performance evidence.
- quality-1793630417244.json: first hardware run, before final bridge/cache/cleanup hardening. Not the final source revision.

Results contain synthetic workloads, not a production TVC or hour-scale soak. GPU and scope are recorded per result; do not merge them with historical SwiftShader values from ../latest.json.
