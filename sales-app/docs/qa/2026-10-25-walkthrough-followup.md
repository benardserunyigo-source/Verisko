# Walkthrough fixes · 25 October 2026

Scope: owner-supplied call notes and explicit confirmation to match the public application to current Sales pay.

- Production had no site environment variable for the approved private pricing budget. Restored the exact local version/cost input at production only. No FX, budget or current published Sales-list update. Netlify’s plan refused Functions-only scope; its standard private environment setting was used. The value remains out of Git, public assets and logs. Deployment required before runtime adoption.
- Operations/Admin can create/open the same contact’s quote after the completed visit, including Draft records, or choose when several exist. The client is prefilled. Team Lead and Sales pricing privileges unchanged.
- Operations can add optional simple-to-complex price guides in 10k increments. Base/upper bounds validated; all four packages retain 30-day expiry and 26% base-cost guard. The complex value is a guide subject to the survey and actual-extra-cost quote guard, not a guaranteed ceiling. Exact saved payment offers reject a range. Existing agreements untouched.
- Public application matches approved 15k per completed visit, 50k at three distinct completed clients, 100k first approved payment, due Monday. Unapproved 70k/30k alternative removed by explicit owner confirmation; no historical staff/pay records changed. Video prompts ask current activity, experience and fit. Supplier quote help explains copying a Drive/Alibaba link. Existing currency preserved; unpriced China items default USD.

## Evidence

648 tests passed before final version bump; final suite recorded below after final changes. Isolated real-UI/handler server at4446: completed visit→prefilled client→save one Draft→Open quote, costs loaded for all four options, range5.28m–6m saved and Sales response/render verified without costs. Phone390px no overflow, errors or warnings; Back/filter behavior preserved when reopening. All persisted changes were in fictional memory stores. No client quote, live price, stock, privileges or pay records changed. Pending: final320px check and exact release verification.

The uploaded conversation’s market-rate mentions were not sufficiently precise to replace the approved4,300USD purchase rate. Future AI pricing remains parked. Existing installer decision/cable-change approvals and recorded visit timestamps remain unchanged. No physical Android acceptance claimed.

## Final release

v157 source160106a11867c392e92d18704862877de98035eb, deploy6ade61504921a4abe00fbdb8 ready.648tests pass.23exact assets plus known application pretty-link-only rewrite match,10unsigned private APIsJSON401.320/390px layout, live view-only range controls and live public approved-pay copy checked. Production private env matches approved source value, but protected production costing requires owner login to verify: available browser session is signedout. No real accounts/client/financial/stock writes.
