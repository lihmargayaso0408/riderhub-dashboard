# SPX Bridge

Chrome extension that pulls the Driver LM Performance Report from
https://spx.shopee.ph/#/driverLMPerformanceReport/list into the dashboard.

## Install
1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** and choose this `spx-bridge/` folder.
3. Log in to SPX in Chrome (same browser profile).

## Use
Dashboard → Upload manifest → pick hub and date → **Data pull**.
The extension opens/reuses the SPX report tab, captures the report's list API call,
replays it with pagination using your SPX session, maps columns to the dashboard CSV
headers, and loads the result into the upload dialog. Review, then **Add to dashboard**.
If no API call is captured it falls back to scraping the visible table.

## Debugging
In the SPX tab console run `spxBridgeDump()` to download captured responses
(`spx-bridge-captures.json`) — use it to tune the column aliases in `spx-main.js`.

## Caveats
Written without access to a live SPX session: column aliases, the date-range override,
and hub filtering are best-effort and may need tuning on first run.
