# Draft payment options — 24 October 2026

The owner approved a draft-only comparison while preserving current customer pricing. Operations and Admin open More → Draft payment options. No new API, data writes, customer links or commercial commitments. Public static draft values contain no private budget or client data.

The same four-camera simple example includes an 8CH recorder and 200m cable. Planned 5MP cameras still need an exact quote; hard drive, UPS and add-ons are excluded. Earlier proposal amounts: cash UGX 4.7m; 12 months UGX 2m + 260k × 12 = 5.12m; 24 months UGX 2m + 150k × 24 = 5.6m; rental UGX 2m proposed nonrefundable setup + 260k/month. Rental's first 12 months total is 5.12m only; equipment stays with Verisko. Costs, support, fees, losses and funding remain estimates. The 26% before-tax margin is not certified. Other package sizes are not extrapolated.

All 559 tests passed. New checks reconcile totals and 10k rounding, deny other roles, preserve the customer catalogue, and verify rental wording and read-only behavior. Phone browser checks at 390 × 844 and 320 × 844 found no document overflow. The table and four cards are readable; review notes expand. No console errors. Sales still shows UGX 5.28m / 6.74m / 8.18m / 11.64m with the existing payment schedules.

Evidence: output/audits/draft-payment-options-20261024/compare-390.png, compare-320.png and sales-unchanged.txt. Local source server: 4415. Phone wrappers on 4416 are QA only. Previews use fictional data, not authenticated production sessions or real Android acceptance. No real records changed. Release verified below.


Release verified: v140 source `9a70846b13d3907b7aaedabd16f7477797688a06`, Netlify deploy `6add468269edfa6bda393a05` ready. Eight asset hashes match, including unchanged current pricing/catalogue/PDF/client-plan code; HTML loads v140. Seven private APIs return 401 without authentication. Live Operations preview opened More → Draft payment options and showed all four correct totals, with no console errors. Evidence: `output/audits/draft-payment-options-20261024/release-readback.json` and `live-compare-phone.png`. No real client, financial or account records changed. Public fictional preview and automated role gates do not establish authenticated production or handset acceptance. Final evidence commit is documentation only and remains local to avoid another deployment.
