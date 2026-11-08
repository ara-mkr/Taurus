// Everything OXBOT can do, each only through approve() (owner, November 1, 2026). Importing this file registers them.
import './direct.ts';
import './composio.ts';
import './food.ts';
import '../home.ts';
import '../mac.ts';
import '../browser.ts';
import '../mcp.ts';
export { allSpecs, approve, decline, get, log, pending, propose, runningNow, spoken } from './approvals.ts';
export { findTools, readTool } from './composio.ts';
