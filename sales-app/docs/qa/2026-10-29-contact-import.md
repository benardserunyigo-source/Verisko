# Admin contact import and shared calls

Admin: Contacts → Import contact list. Excel/CSV preview identifies new, matching and skipped rows; phone duplicates within a file are skipped. Template includes optional email. Choose Operations or Team Lead as the first caller; both office roles can see the shared imported contacts. Existing matches keep the original contact ID, owner, stage, history and commission status. Imported contacts retain the existing no-commission rule.

Contacts → Show → Imported call list. Tap Call, then Follow-up to add text and a next date; Voice notes uses the existing private recording/playback service. Admin also sees Email when a valid address is saved; this opens the mail app and does not send or sync email automatically. Email sent/reply notes are recorded manually on the same contact. Admin can edit contact details without impersonating its creator.

Server rejects non-Admin creation of imported contacts. Office roles retain existing shared-record access; unrelated Sales and Installer accounts cannot see imported contacts owned by Operations. Reading a file and reviewing its preview are bound to the original signed-in Admin session. Import recalculates matches before applying.

Verification: 738 tests passed, including real-handler Admin import → Operations/Team Lead read and text updates → one voice upload/retry → all three roles read the same four history entries. Sales/Installer denial and no new job/cash verified. Actual 390px app: uploaded a fictional CSV with three rows, preview skipped one duplicate, created two contacts, Admin saved an email update, Team Lead saw it and saved a call update. Evidence stays in output/audits/contact-import-20261029. No real contacts/messages/money modified. Physical Android microphone acceptance remains separate.

Release verification pending.
