# Simple navigation

Home, Contacts, Jobs and More stay in the same order on phones and computers. Related pages appear as sub-buttons above the page. Home keeps the existing field-shift banner, including Sales check-in.

- Sales: Home (Today, Dashboard, Field shifts); Contacts (Saved leads, Ready customers, Package prices); Jobs (Site visits); More (Support videos).
- Team Lead: Sales pages plus Installations for site supervision. No office finance or settings.
- Operations: all staff pages plus Job records, Payments and Applications. No Admin settings.
- Admin: Operations pages plus Team & settings.
- Installer: Home, Jobs (assigned Installations, including own pay and balance), More (Help). Contacts is hidden. No sales tracking, customer leads or office finance.

`navigation.js` provides the display allowlist and guards page navigation. Existing server permissions and scoped data responses still enforce record access. Role preview uses the same navigation with fictional data; preview writes and tracking remain disabled.
