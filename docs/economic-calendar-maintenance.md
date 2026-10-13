# Economic schedule maintenance

`js/economic-events.js` is a selected schedule, not a live data feed. Markets refreshes the upcoming list every minute and removes timed releases at their scheduled instant. Untimed entries stay for that Toronto calendar day. The full TradingView calendar remains available separately.

Before the last month of coverage, open each event's official BLS, Bank of Canada or Federal Reserve source. Check future dates and release times, add the next quarter's relevant events, then update the verified-through date and source-check comment. Use Toronto local times; an unknown time stays empty. Never infer new release dates by shifting last year's dates.

Run `npm run check:calendar`, `npm test`, and `npm run package`. The check validates dates and source domains and fails at 30 days remaining. GitHub runs it weekly and on code changes; a failing scheduled run is the maintenance signal. Review the source schedule after postponements, including government closures. Dates may change after verification.

Deploy the updated assets and apply the panel's update prompt. The release hash changes with the dataset, invalidating the old offline shell. The UI explicitly flags expired coverage rather than inventing future events.
