# Sales field shifts

Staff agree to location sharing, tap Check in, tick three short reminders, then choose Start my shift. The reminders are: smile and greet the client; do not talk over the client; listen more than you talk. Watch Support videos opens Support without starting the shift. Cancel also starts nothing.

Check-in needs a fresh GPS fix within 150 metres. The server stores that location with the check-in event. During an active shift, the Android app shares location in the background; the browser requires an open, visible page. Pause stops live tracking. Resume requests a fresh fix and starts a new active interval.

Check-out stops continuous tracking first, then takes one finish GPS fix. The server keeps it on the check-out event, separate from the route. Missing or poor GPS does not prevent check-out: the end event records that the finish location was unavailable. Staff and Operations can see both event locations. Shift hours exclude breaks. Those are recorded shift hours, not independent proof of work.

After a confirmed check-out, the message says: “Thank you so much for your shift. Your hours have been recorded.” When offline, it says the check-out is saved on the phone and waiting to sync. Browser storage queues only stop controls, not coordinates; a finish fix remains in memory until sent. Reloading before sync can therefore leave the browser finish location unavailable. Android queues finish coordinates in its encrypted private store.

Automated checks cover start/pause/resume/end, off-shift location rejection, role and record access, accurate GPS validation, archived finish locations, elapsed hours without pauses, offline stops, expired shifts, native bridge ownership and honest confirmation messages. UI verification uses fictional staff and synthetic GPS. Android 0.2.0 adds native finish capture; the actual staff-phone locked-screen and notification trial remains a separate field check.
