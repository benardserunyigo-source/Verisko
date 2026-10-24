# Simple navigation

The four main sections stay in the same order on phones and computers. Sales calls them Home, Contacts, My work and My pay. Other staff use Home, Contacts, Jobs and More. Related pages appear as sub-buttons above the page. Home keeps the existing field-shift banner, including Sales check-in.

- Sales: Home (save contact, due work, earned pay); Contacts (all own contacts with one-tap send); My work (sent contact progress and My shift); My pay (pay and collapsed pay rules, Help & prices). Help videos and public camera package prices remain available. Older routes remain supported but are not duplicate primary entry points.
- Team Lead: Home starts with New requests, With me and next visits. Contacts opens Visit requests first, with Saved contacts and Other clients still available. Installations remain available for assigned site supervision. No office finance or settings.
- Operations: the same request-first Home and Contacts layout, plus existing Job records, Payments and Applications. Other work keeps installations, materials and the active-work dashboard accessible. No Admin settings.
- Admin: Operations pages plus Team & settings.
- Installer: Home, Jobs (assigned Installations, including own pay and balance), More (Help). Contacts is hidden. No sales tracking, customer leads or office finance.

`navigation.js` provides the display allowlist and guards page navigation. Existing server permissions and scoped data responses still enforce record access. Role preview uses the same navigation with fictional data; preview writes and tracking remain disabled.

Sales Home uses a short contact-first layout with earned pay, returned reasons and due follow-ups. Operations and Team Lead Home put visit requests first; other operational work and installation reviews are expandable. Training stays available in an expandable section. Operations' salesperson summary uses a table on larger screens and individual cards on phones; tapping a name keeps the same contact filter behaviour. Package inclusions expand separately so prices and instalments are easier to reach. Home dates and preview examples use Uganda time.

Visit requests (v133): New requests / With me / All count filters; one visible next action per request. Take contact → Confirm visit or Send back to Sales with a reason. Later quote/payment, assignment, voice notes and full history stay under More details. Existing commands and server access rules are unchanged.

## Job summaries (v137)

Operations and Admin open **Jobs → Job summaries** first. Search and open a saved job for progress, client receipts, installer balance and next steps. Details expand below; action buttons reuse the same linked installation/materials/job records. Sales, Team Lead and Installer navigation is unchanged and does not expose this finance summary.


## Draft payment comparison (v140)

Operations and Admin: More → Draft payment options. Four-camera sample only; cash,12monthly payments,24monthly payments and ongoing rental. A compact comparison table plus plain-language cards show upfront, monthly and total amounts. Rental total is explicitly first12months and equipment stays withVerisko. No selection/save/send action, no private budget or client data, and no connection to current pricing/quote/PDF/client-link functions. Sales/TeamLead/Installer navigation excludes this review page. Sample prices are not confidential; the role guard is for workflow separation, not a claim that public static assets are private. Profit remains unconfirmed until costs and terms are checked.
