v1.0.5 of the Qwen36 27B Long Context app shipped — **77 t/s sustained at the full 262K context** on the Olares One.
Single GGUF swap to havenoammo's Unsloth Dynamic Q3_K_XL on the am17an MTP branch. UD keeps the MTP head + attention high-precision while only the FFN goes to 3-bit, so drafter acceptance climbs to 74–80% (was 64%).
For long-context work this beats every Qwen 3.6 27B config I've tested on a 24 GB consumer GPU.
For chat/coding the Turbo Fast app is still faster (88 t/s @ 88K). Pick depending on what you need.
Market source: `https://orales-one-market.aamsellem.workers.dev`
