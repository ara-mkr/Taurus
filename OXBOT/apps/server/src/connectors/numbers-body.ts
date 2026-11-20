import { createReadStream, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { api } from '../store.ts';
import type { Body } from '../types.ts';
import { appFields, DAY, money, startOfToday, type Def } from './kit.ts';

// Numbers, money and health connectors added October 31, 2026 (owner's yes, docs/decision-log.md).
// All read-only: no payments, transfers or edits. Built from each provider's documented API and tested only
// against mocked responses (apps/server/test/connectors.test.ts); none has been tried with a real account yet.

/* eslint-disable @typescript-eslint/no-explicit-any -- provider payloads are untyped JSON */
const change = (now: number, before: number) => before ? `${now >= before ? '+' : ''}${(((now - before) / before) * 100).toFixed(1)}%` : undefined;
const count = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n));

// Apple Health has no web API: the iPhone exports export.xml (Health → profile → Export All Health Data).
// The file can be hundreds of megabytes, so it is read as a stream once per change and the result kept.
let healthCache: { file: string; mtime: number; body: Omit<Body, 'sources'> } | null = null;
async function readHealthExport(file: string): Promise<Omit<Body, 'sources'>> {
  const mtime = statSync(file).mtimeMs;
  if (healthCache?.file === file && healthCache.mtime === mtime) return healthCache.body;
  const latest: Record<string, { at: number; value: number }> = {};
  const steps = new Map<string, number>();
  const sleep: { start: number; end: number }[] = [];
  const attr = (line: string, name: string) => line.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
  const when = (text?: string) => text ? Date.parse(text.replace(' ', 'T').replace(/ ([+-]\d{2})(\d{2})$/, '$1:$2')) : NaN;
  const lines = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.includes('<Record ')) continue;
    const type = attr(line, 'type');
    if (!type) continue;
    const start = when(attr(line, 'startDate')), end = when(attr(line, 'endDate'));
    if (type === 'HKCategoryTypeIdentifierSleepAnalysis') { if (/Asleep/.test(attr(line, 'value') ?? '')) sleep.push({ start, end }); continue; }
    const value = Number(attr(line, 'value'));
    if (!Number.isFinite(value)) continue;
    if (type === 'HKQuantityTypeIdentifierStepCount') { const day = attr(line, 'startDate')!.slice(0, 10); steps.set(day, (steps.get(day) ?? 0) + value); continue; }
    if (type === 'HKQuantityTypeIdentifierBodyMass') { const kg = attr(line, 'unit') === 'lb' ? value * 0.45359237 : value; if (!(latest[type]?.at > start)) latest[type] = { at: start, value: kg }; continue; }
    if (!(latest[type]?.at > start)) latest[type] = { at: start, value };
  }
  // Last night: every asleep stretch that ended within 14 hours before the latest one ended.
  const lastEnd = Math.max(0, ...sleep.map(s => s.end));
  const night = sleep.filter(s => s.end > lastEnd - 14 * 3_600_000);
  const lastDay = [...steps.keys()].sort().at(-1);
  const body = {
    restingHr: latest.HKQuantityTypeIdentifierRestingHeartRate && Math.round(latest.HKQuantityTypeIdentifierRestingHeartRate.value),
    hrv: latest.HKQuantityTypeIdentifierHeartRateVariabilitySDNN && Math.round(latest.HKQuantityTypeIdentifierHeartRateVariabilitySDNN.value),
    sleepMinutes: night.length ? Math.round(night.reduce((sum, s) => sum + (s.end - s.start), 0) / 60_000) : undefined,
    steps: lastDay ? Math.round(steps.get(lastDay)!) : undefined,
    weightKg: latest.HKQuantityTypeIdentifierBodyMass && Math.round(latest.HKQuantityTypeIdentifierBodyMass.value * 10) / 10,
  };
  healthCache = { file, mtime, body };
  return body;
}

export const numbersBodyDefs: Def[] = [
  {
    id: 'airtable', name: 'Airtable', group: 'Numbers', mockOnly: true,
    reads: 'One table you choose, as rows of Metric, Value and Change, like the Sheets connector.',
    fields: [
      { key: 'AIRTABLE_TOKEN', label: 'Personal access token (data.records:read)', secret: true },
      { key: 'AIRTABLE_BASE', label: 'Base ID (starts with app)' },
      { key: 'AIRTABLE_TABLE', label: 'Table name or ID' },
      { key: 'AIRTABLE_VIEW', label: 'View', optional: true },
    ],
    setup: 'Airtable → Builder hub → Personal access tokens → Create. Scope data.records:read only, access to one base. Give the table fields named Metric, Value and Change.', setupUrl: 'https://airtable.com/create/tokens',
    async pull({ field }) {
      const view = field('AIRTABLE_VIEW') ? `&view=${encodeURIComponent(field('AIRTABLE_VIEW')!)}` : '';
      const data = await api<any>(`https://api.airtable.com/v0/${encodeURIComponent(field('AIRTABLE_BASE')!)}/${encodeURIComponent(field('AIRTABLE_TABLE')!)}?maxRecords=12${view}`, { token: field('AIRTABLE_TOKEN') });
      const pick = (fields: Record<string, unknown>, name: string) => { const key = Object.keys(fields).find(k => k.toLowerCase() === name); return key === undefined ? undefined : String(fields[key]); };
      return {
        numbers: (data.records ?? []).map((r: any) => ({ label: pick(r.fields, 'metric'), value: pick(r.fields, 'value'), change: pick(r.fields, 'change'), source: 'Airtable' }))
          .filter((m: any) => m.label && m.value),
      };
    },
  },
  {
    id: 'google-analytics', name: 'Google Analytics', group: 'Numbers', mockOnly: true,
    reads: 'Active users and sessions over the last seven days against the seven before, for one GA4 property.',
    oauth: { app: 'google', scopes: ['https://www.googleapis.com/auth/analytics.readonly'] },
    fields: [...appFields('google'), { key: 'GA4_PROPERTY_ID', label: 'GA4 property ID (numbers only)' }],
    setup: 'Same Google OAuth client as Gmail. Enable the Google Analytics Data API. The property ID is under Admin → Property details.', setupUrl: 'https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com',
    async pull({ token, field }) {
      // runReport is a POST that only reads a report.
      const data = await api<any>(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(field('GA4_PROPERTY_ID')!)}:runReport`, {
        method: 'POST', token: await token(), headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday', name: 'now' }, { startDate: '14daysAgo', endDate: '8daysAgo', name: 'before' }], metrics: [{ name: 'activeUsers' }, { name: 'sessions' }] }),
      });
      const row = (name: string) => (data.rows ?? []).find((r: any) => r.dimensionValues?.[0]?.value === name)?.metricValues?.map((m: any) => Number(m.value)) ?? [0, 0];
      const [now, before] = [row('now'), row('before')];
      return {
        numbers: [
          { label: 'Active users, 7 days', value: count(now[0]), change: change(now[0], before[0]), source: 'Google Analytics' },
          { label: 'Sessions, 7 days', value: count(now[1]), change: change(now[1], before[1]), source: 'Google Analytics' },
        ],
      };
    },
  },
  {
    id: 'shopify', name: 'Shopify', group: 'Money', mockOnly: true,
    reads: 'Orders today and sales over the last seven days for your store.',
    fields: [{ key: 'SHOPIFY_STORE', label: 'Store address', placeholder: 'your-store.myshopify.com' }, { key: 'SHOPIFY_TOKEN', label: 'Admin API access token (read_orders only)', secret: true }],
    setup: 'Shopify admin → Settings → Apps and sales channels → Develop apps → Create an app. Admin API scopes: read_orders only. Install it and copy the Admin API access token.', setupUrl: 'https://help.shopify.com/en/manual/apps/app-types/custom-apps',
    async pull({ field }) {
      const store = field('SHOPIFY_STORE')!.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (!/^[a-z0-9-]+\.myshopify\.com$/i.test(store)) throw new Error('Shopify: use the your-store.myshopify.com address');
      const since = new Date(Date.now() - 7 * DAY).toISOString();
      // Shopify's Admin API is GraphQL; this is a query, never a mutation.
      const query = `{ orders(first: 250, query: "created_at:>='${since}'") { nodes { createdAt totalPriceSet { shopMoney { amount currencyCode } } } } }`;
      const data = await api<any>(`https://${store}/admin/api/2025-10/graphql.json`, { method: 'POST', headers: { 'X-Shopify-Access-Token': field('SHOPIFY_TOKEN')!, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
      if (data.errors?.length) throw new Error(`Shopify: ${data.errors[0].message}`);
      const orders = data.data.orders.nodes as any[];
      const currency = orders[0]?.totalPriceSet.shopMoney.currencyCode ?? 'USD';
      const total = orders.reduce((sum, o) => sum + Number(o.totalPriceSet.shopMoney.amount), 0);
      return {
        numbers: [
          { label: 'Orders today', value: String(orders.filter(o => Date.parse(o.createdAt) >= startOfToday()).length), source: 'Shopify' },
          { label: 'Sales, 7 days', value: money(total, currency) + (orders.length === 250 ? '+' : ''), source: 'Shopify' },
        ],
      };
    },
  },
  {
    id: 'xero', name: 'Xero', group: 'Money', mockOnly: true,
    reads: 'Income and net profit this month from the profit and loss report.',
    oauth: { app: 'xero', scopes: ['offline_access', 'accounting.reports.read', 'accounting.settings.read'] }, fields: appFields('xero'),
    setup: 'Xero developer portal → New app → Web app. Add the redirect URL. Taurus asks only for read scopes on reports and settings.', setupUrl: 'https://developer.xero.com/app/manage',
    async pull({ token }) {
      const t = await token();
      const tenants = await api<any[]>('https://api.xero.com/connections', { token: t });
      if (!tenants[0]) return { numbers: [] };
      const report = await api<any>('https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?periods=1&timeframe=MONTH', { token: t, headers: { 'xero-tenant-id': tenants[0].tenantId } });
      const rows = (report.Reports?.[0]?.Rows ?? []).flatMap((r: any) => r.Rows ?? [r]);
      const amount = (label: RegExp) => { const cells = rows.find((r: any) => label.test(r.Cells?.[0]?.Value ?? ''))?.Cells; return cells ? Number(cells[1]?.Value) : undefined; };
      const income = amount(/^total (trading )?income$/i), profit = amount(/^net profit$/i);
      return {
        numbers: [
          income !== undefined && { label: 'Income, this month', value: money(income), source: 'Xero' },
          profit !== undefined && { label: 'Net profit, this month', value: money(profit), source: 'Xero' },
        ].filter(Boolean) as { label: string; value: string; source: string }[],
      };
    },
  },
  {
    id: 'mercury', name: 'Mercury', group: 'Money', mockOnly: true,
    reads: 'Available balance across your Mercury accounts. Reading only: Taurus can’t move money.',
    fields: [{ key: 'MERCURY_TOKEN', label: 'API token, Read Only', secret: true }],
    setup: 'Mercury → Settings → Tokens → Add API token. Choose "Read Only".', setupUrl: 'https://app.mercury.com/settings/tokens',
    async pull({ field }) {
      const data = await api<any>('https://api.mercury.com/api/v1/accounts', { token: field('MERCURY_TOKEN') });
      const open = (data.accounts ?? []).filter((a: any) => a.status !== 'archived');
      return { numbers: [{ label: 'Cash in Mercury', value: money(open.reduce((sum: number, a: any) => sum + Number(a.availableBalance ?? 0), 0)), source: 'Mercury' }] };
    },
  },
  {
    id: 'apple-health', name: 'Apple Health (export file)', group: 'Body', mockOnly: true,
    reads: 'Resting heart rate, HRV, last night’s sleep, steps and weight from the export file on this Mac. Nothing leaves the Mac.',
    fields: [{ key: 'APPLE_HEALTH_EXPORT', label: 'Path to export.xml (or the folder it’s in)', placeholder: '~/Downloads/apple_health_export/export.xml' }],
    setup: 'On iPhone: Health → your picture → Export All Health Data. AirDrop the zip to this Mac, unzip it, and paste the path to export.xml. Export again whenever you want fresher numbers.', setupUrl: 'https://support.apple.com/guide/iphone/share-your-health-data-iph5ede58c3d/ios',
    async pull({ field }) {
      let file = field('APPLE_HEALTH_EXPORT')!.replace(/^~(?=\/)/, process.env.HOME ?? '~');
      if (existsSync(file) && statSync(file).isDirectory()) file = [join(file, 'export.xml'), join(file, 'apple_health_export/export.xml')].find(existsSync) ?? join(file, 'export.xml');
      if (!existsSync(file)) throw new Error(`Apple Health: no file at ${file}`);
      return { body: await readHealthExport(file) };
    },
  },
  {
    id: 'withings', name: 'Withings', group: 'Body', mockOnly: true,
    reads: 'Your latest weight and last night’s sleep and resting heart rate from a Withings scale or sleep mat.',
    oauth: { app: 'withings', scopes: ['user.metrics', 'user.activity'] }, fields: appFields('withings'),
    setup: 'Withings developer dashboard → Create an application (Public API integration). Add the redirect URL. Taurus asks only for user.metrics and user.activity.', setupUrl: 'https://developer.withings.com/dashboard/',
    async pull({ token }) {
      const t = await token();
      const since = Math.floor((Date.now() - 30 * DAY) / 1000);
      const [measures, sleep] = await Promise.all([
        api<any>(`https://wbsapi.withings.net/measure?action=getmeas&meastypes=1&category=1&startdate=${since}`, { token: t }),
        api<any>(`https://wbsapi.withings.net/v2/sleep?action=getsummary&lastupdate=${Math.floor((Date.now() - 3 * DAY) / 1000)}&data_fields=total_sleep_time,hr_min`, { token: t }),
      ]);
      if (measures.status !== 0) throw new Error(`Withings: status ${measures.status}`);
      const weight = (measures.body?.measuregrps ?? []).sort((a: any, b: any) => b.date - a.date)[0]?.measures?.find((m: any) => m.type === 1);
      const night = (sleep.body?.series ?? []).sort((a: any, b: any) => b.enddate - a.enddate)[0]?.data;
      return {
        body: {
          weightKg: weight ? Math.round(weight.value * 10 ** weight.unit * 10) / 10 : undefined,
          sleepMinutes: night?.total_sleep_time ? Math.round(night.total_sleep_time / 60) : undefined,
          restingHr: night?.hr_min,
        },
      };
    },
  },
];
