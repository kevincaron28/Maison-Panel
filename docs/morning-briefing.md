# Morning bulletin

The home screen opens a French morning card with English spoken audio once per device and Toronto date, at 07:00. If the page was asleep, it catches up when visible before 11:00. An open dialog defers the bulletin. The home button opens it manually at any time. Closing stops speech. Speech prefers an en-CA voice, then another installed English voice.

Enable “Voix automatique à 7 h” inside the card on the tablet; it speaks a short test. This is a per-device preference. Browser speech may require another gesture after reload/restart. The page must stay open and the tablet awake; this feature cannot wake Android or start a closed browser. Actual Yestel/ Fully speaker output and an overnight run require device verification.

Weather comes from the panel's Open-Meteo cache, requires today's daily forecast and a retrieval less than six hours old. Markets use the public Worker endpoint `/api/morning-markets`, fixed SPY/QQQ/DIA/IWM symbols, Yahoo Finance daily chart data, and the two latest available sessions strictly before today. These are ETF price changes, not index levels or a news explanation. Each session date and source is displayed. Missing data stays explicitly unavailable; prior-day bulletins are not relabeled as today's. The upstream endpoint is unofficial and may rate-limit; no subscription/key is required.

Economic events use the existing selected official Canada/US list in `js/economic-events.js`, currently through 2026-12-31. This is not exhaustive. The card links each event to its source and explicitly warns when coverage expires. Renew that list to continue coverage in 2027.

The briefing offers two per-device styles: Horizon (light, three columns) and Focus (dark, large weather card beside markets and economics). Switch using the buttons inside the card. Temperature is the daily forecast maximum/minimum, not the current reading. Both styles retain English audio.
