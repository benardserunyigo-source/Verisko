# Simple navigation

The four main sections stay in the same order on phones and computers. Sales calls them Home, Contacts, My work and My pay. Other staff use Home, Contacts, Jobs and More. Related pages appear as sub-buttons above the page. Home keeps the existing field-shift banner, including Sales check-in.

- Sales: Home (save contact, due work, earned pay); Contacts (all own contacts with one-tap send); My work (sent contact progress and My shift); My pay (pay and collapsed pay rules, Help & prices). Help videos and public camera package prices remain available. Older routes remain supported but are not duplicate primary entry points.
- Team Lead: Sales pages plus Installations for site supervision. No office finance or settings.
- Operations: all staff pages plus Job records, Payments and Applications. No Admin settings.
- Admin: Operations pages plus Team & settings.
- Installer: Home, Jobs (assigned Installations, including own pay and balance), More (Help). Contacts is hidden. No sales tracking, customer leads or office finance.

`navigation.js` provides the display allowlist and guards page navigation. Existing server permissions and scoped data responses still enforce record access. Role preview uses the same navigation with fictional data; preview writes and tracking remain disabled.

Sales Home uses a short contact-first layout with earned pay, returned reasons and due follow-ups. Operations Home keeps the team work counts and installation reviews. Training stays available in an expandable section. Operations' salesperson summary uses a table on larger screens and individual cards on phones; tapping a name keeps the same contact filter behaviour. Package inclusions expand separately so prices and instalments are easier to reach. Home dates and preview examples use Uganda time.
