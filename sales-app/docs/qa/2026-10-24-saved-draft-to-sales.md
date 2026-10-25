# Saved draft option to Sales offer

Owner requested reusing a saved draft to set a30-day Sales price, without typing it twice. Owner explicitly confirmed preserving deposit/monthly/ownership terms.

Operations/Admin can open a saved job in Draft payment options, select an option and tap Review for Sales. The Sales prices page also offers job/option selectors. It loads only the last acknowledged saved draft, shows exact terms and saved margin, and requires Use for30days. A notice explains that this is a package offer for all Sales staff and renews the whole list, retaining other package amounts. New unsaved edits are not used.

The server loads the existing private draft handler using the same credentials, so source job/client/count identity guards apply. Publishing accepts only job ID, saved version and option ID. It derives all amounts server-side, recalculates margin against both saved costs and current private package costs, checks the selected target/minimum26%, and uses the existing price-list CAS guard. Source job/version/target/cost approval snapshot stays private. Changing the source later does not silently change a published offer. Manual renewal preserves offer terms; changing their total alone is rejected.

Sales sees exact cash,12-month,24-month or rental terms, with first12months and retained Verisko ownership explicit for rental. No internal costs, margin, client/source ID or provenance are projected. Offers expire under the existing30-day rule. Legacy standard quotes cannot silently replace these different terms: standard quote release is blocked for a published saved-option package until matching quote terms are supported. This task publishes the Sales offer only, not a client agreement. Existing accepted quotes stay locked; sent verified snapshots now stay fixed in browser calculations too, until explicitly renewed.

613 tests pass. New coverage:4options×4counts, server-derived amounts despite tampered browser fields, unchanged other packages/source records, permission/privacy, missing/stale/changed-client/under-target/current-cost guards, exact50% saved suggestion publication, immutable offer terms on renewal, workspace projection, renderer ownership and sent quote snapshot preservation.

Phone isolated UI/handlers at4431: edited a monthly amount without saving, followed Review for Sales and correctly got saved2m+260k×12. Published then Sales matched5.12m total/deposit/monthly/12-month ownership. Replaced with saved rental: same setup/monthly and explicit ongoing rent/Verisko ownership. Other prices unchanged. After simulated30days, amounts hidden with Prices need updating.320/390px checked without overflow; no browser errors. Fictional data only; no actual Android or authenticated production write claimed.

Evidence: output/audits/saved-draft-to-sales-20261024/ includes server.mjs,phone-readback.json,source-check.json,review-phone.png,sales-phone.png. Exact release verification appended below.
