/**
 * API Usage Analysis Script
 * Exports and analyzes Spotify/Last.fm usage data from Firestore
 * 
 * Usage: node dbscripts/analyze-api-usage.js
 * 
 * Outputs:
 * - Raw JSON exports for each collection
 * - analysis-summary.json with computed metrics
 * - Console summary of key findings
 */

import admin from 'firebase-admin';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase Admin
const serviceAccountPath = join(__dirname, '..', 'service-account.json');

let serviceAccount;
try {
  const serviceAccountData = readFileSync(serviceAccountPath, 'utf8');
  serviceAccount = JSON.parse(serviceAccountData);
} catch (error) {
  console.error('Error reading service account file:', error.message);
  console.error('Make sure service-account.json exists in the project root.');
  process.exit(1);
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('✓ Firebase Admin initialized successfully\n');
} catch (error) {
  console.error('Error initializing Firebase Admin:', error.message);
  process.exit(1);
}

const db = admin.firestore();

// Output directory for analysis results
const outputDir = join(__dirname, 'usage-analysis');

async function exportCollection(collectionName) {
  console.log(`Exporting ${collectionName}...`);
  const snapshot = await db.collection(collectionName).get();
  const data = [];
  snapshot.forEach(doc => {
    const docData = doc.data();
    // Convert Firestore Timestamps to ISO strings for JSON serialization
    if (docData.timestamp && docData.timestamp.toDate) {
      docData.timestamp = docData.timestamp.toDate().toISOString();
    }
    if (docData.createdAt && docData.createdAt.toDate) {
      docData.createdAt = docData.createdAt.toDate().toISOString();
    }
    if (docData.lastUpdated && docData.lastUpdated.toDate) {
      docData.lastUpdated = docData.lastUpdated.toDate().toISOString();
    }
    data.push({ id: doc.id, ...docData });
  });
  console.log(`  Found ${data.length} documents`);
  return data;
}

function analyzeServiceUsage(allData, service) {
  const usage = allData[`${service}Usage`] || [];
  const hourly = allData[`${service}UsageHourly`] || [];
  const daily = allData[`${service}UsageDaily`] || [];

  if (usage.length === 0 && hourly.length === 0 && daily.length === 0) {
    return { noData: true };
  }

  // Method frequency
  const methodCounts = {};
  usage.forEach(record => {
    const method = record.method || 'unknown';
    methodCounts[method] = (methodCounts[method] || 0) + 1;
  });

  // User distribution (total calls per user)
  const userCounts = {};
  usage.forEach(record => {
    const user = record.identifier || 'unknown';
    userCounts[user] = (userCounts[user] || 0) + 1;
  });

  // Hourly data analysis
  const hourlyByUser = {};
  hourly.forEach(h => {
    const user = h.identifier || 'unknown';
    if (!hourlyByUser[user]) {
      hourlyByUser[user] = [];
    }
    hourlyByUser[user].push({
      hour: h.hour,
      count: h.count || 0,
      date: new Date(h.hour * 60 * 60 * 1000).toISOString()
    });
  });

  // Find peak hourly rates per user
  const userPeakHourly = {};
  Object.entries(hourlyByUser).forEach(([user, hours]) => {
    const peak = hours.reduce((max, h) => h.count > max.count ? h : max, { count: 0 });
    userPeakHourly[user] = peak;
  });

  // Top 20 hourly peaks overall
  const hourlyPeaks = hourly
    .filter(h => h.count > 0)
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, 20)
    .map(h => ({
      identifier: h.identifier,
      hour: h.hour,
      date: new Date(h.hour * 60 * 60 * 1000).toISOString(),
      count: h.count
    }));

  // Daily totals (aggregate across all users)
  const dailyTotals = {};
  daily.forEach(d => {
    const date = new Date(d.day * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    dailyTotals[date] = (dailyTotals[date] || 0) + (d.count || 0);
  });

  // Per-user daily max (highest single day for each user)
  const userDailyMax = {};
  daily.forEach(d => {
    const user = d.identifier || 'unknown';
    userDailyMax[user] = Math.max(userDailyMax[user] || 0, d.count || 0);
  });

  // Per-user daily data for trend analysis
  const userDailyData = {};
  daily.forEach(d => {
    const user = d.identifier || 'unknown';
    const date = new Date(d.day * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    if (!userDailyData[user]) {
      userDailyData[user] = {};
    }
    userDailyData[user][date] = d.count || 0;
  });

  // Calculate percentiles for hourly usage
  const allHourlyCounts = hourly.map(h => h.count || 0).filter(c => c > 0).sort((a, b) => a - b);
  const p50 = allHourlyCounts[Math.floor(allHourlyCounts.length * 0.5)] || 0;
  const p90 = allHourlyCounts[Math.floor(allHourlyCounts.length * 0.9)] || 0;
  const p95 = allHourlyCounts[Math.floor(allHourlyCounts.length * 0.95)] || 0;
  const p99 = allHourlyCounts[Math.floor(allHourlyCounts.length * 0.99)] || 0;

  // Date range
  const allDays = daily.map(d => d.day).filter(d => d);
  const minDay = Math.min(...allDays);
  const maxDay = Math.max(...allDays);
  const dateRange = {
    from: new Date(minDay * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date(maxDay * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    days: maxDay - minDay + 1
  };

  return {
    totalRecords: usage.length,
    uniqueUsers: Object.keys(userCounts).length,
    dateRange,
    percentiles: {
      p50_hourly: p50,
      p90_hourly: p90,
      p95_hourly: p95,
      p99_hourly: p99
    },
    methods: Object.entries(methodCounts)
      .sort((a, b) => b[1] - a[1]),
    topUsersByTotal: Object.entries(userCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10),
    topUsersByPeakHourly: Object.entries(userPeakHourly)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([user, peak]) => ({ user, peakCount: peak.count, peakDate: peak.date })),
    topUsersByDailyMax: Object.entries(userDailyMax)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10),
    hourlyPeaks,
    dailyTotals,
    peakHourlyRate: hourlyPeaks[0]?.count || 0,
    avgDailyTotal: Object.values(dailyTotals).length > 0
      ? Math.round(Object.values(dailyTotals).reduce((a, b) => a + b, 0) / Object.values(dailyTotals).length)
      : 0,
    userDailyData
  };
}

function printServiceSummary(name, data) {
  if (data.noData) {
    console.log(`--- ${name} ---`);
    console.log('No data found.\n');
    return;
  }

  console.log(`--- ${name} ---`);
  console.log(`Date range: ${data.dateRange.from} to ${data.dateRange.to} (${data.dateRange.days} days)`);
  console.log(`Total records: ${data.totalRecords.toLocaleString()}`);
  console.log(`Unique users: ${data.uniqueUsers}`);
  console.log(`Peak hourly rate: ${data.peakHourlyRate} calls`);
  console.log(`Avg daily total (all users): ${data.avgDailyTotal} calls`);
  
  console.log(`\nHourly percentiles (calls per hour):`);
  console.log(`  50th: ${data.percentiles.p50_hourly}`);
  console.log(`  90th: ${data.percentiles.p90_hourly}`);
  console.log(`  95th: ${data.percentiles.p95_hourly}`);
  console.log(`  99th: ${data.percentiles.p99_hourly}`);

  console.log(`\nTop 10 methods:`);
  data.methods.slice(0, 10).forEach(([method, count], i) => {
    const pct = ((count / data.totalRecords) * 100).toFixed(1);
    console.log(`  ${i + 1}. ${method}: ${count.toLocaleString()} (${pct}%)`);
  });

  console.log(`\nTop 5 users by total calls:`);
  data.topUsersByTotal.slice(0, 5).forEach(([user, count], i) => {
    console.log(`  ${i + 1}. ${user}: ${count.toLocaleString()}`);
  });

  console.log(`\nTop 5 users by peak hourly rate:`);
  data.topUsersByPeakHourly.slice(0, 5).forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.user}: ${item.peakCount} calls/hour (${item.peakDate})`);
  });

  console.log(`\nTop 5 users by highest single-day usage:`);
  data.topUsersByDailyMax.slice(0, 5).forEach(([user, count], i) => {
    console.log(`  ${i + 1}. ${user}: ${count.toLocaleString()} calls`);
  });

  console.log('');
}

async function analyzeUsage() {
  // Create output directory
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  console.log('=== Exporting Collections ===\n');

  // Export all collections
  const collections = [
    'spotifyUsage', 'spotifyUsageHourly', 'spotifyUsageDaily',
    'lastfmUsage', 'lastfmUsageHourly', 'lastfmUsageDaily'
  ];

  const allData = {};
  for (const col of collections) {
    try {
      allData[col] = await exportCollection(col);
      // Save raw data
      writeFileSync(
        join(outputDir, `${col}.json`),
        JSON.stringify(allData[col], null, 2)
      );
    } catch (error) {
      console.error(`  Error exporting ${col}:`, error.message);
      allData[col] = [];
    }
  }

  console.log('\n=== Analyzing Data ===\n');

  // Perform analysis
  const analysis = {
    exportedAt: new Date().toISOString(),
    spotify: analyzeServiceUsage(allData, 'spotify'),
    lastfm: analyzeServiceUsage(allData, 'lastfm')
  };

  // Save analysis summary
  writeFileSync(
    join(outputDir, 'analysis-summary.json'),
    JSON.stringify(analysis, null, 2)
  );

  // Print summary
  console.log('========== ANALYSIS SUMMARY ==========\n');
  printServiceSummary('Spotify', analysis.spotify);
  printServiceSummary('Last.fm', analysis.lastfm);

  // Rate limit recommendations
  console.log('========== RATE LIMIT RECOMMENDATIONS ==========\n');
  
  if (!analysis.spotify.noData) {
    const sp = analysis.spotify;
    console.log('Spotify:');
    console.log(`  Current peak: ${sp.peakHourlyRate} calls/hour`);
    console.log(`  95th percentile: ${sp.percentiles.p95_hourly} calls/hour`);
    console.log(`  Suggested limit: ${Math.ceil(sp.percentiles.p95_hourly * 1.5)} calls/hour (1.5x p95)`);
    console.log(`  Conservative limit: ${Math.ceil(sp.percentiles.p99_hourly * 1.2)} calls/hour (1.2x p99)`);
  }

  if (!analysis.lastfm.noData) {
    const lf = analysis.lastfm;
    console.log('\nLast.fm:');
    console.log(`  Current peak: ${lf.peakHourlyRate} calls/hour`);
    console.log(`  95th percentile: ${lf.percentiles.p95_hourly} calls/hour`);
    console.log(`  Suggested limit: ${Math.ceil(lf.percentiles.p95_hourly * 1.5)} calls/hour (1.5x p95)`);
    console.log(`  Conservative limit: ${Math.ceil(lf.percentiles.p99_hourly * 1.2)} calls/hour (1.2x p99)`);
  }

  console.log(`\n✓ Full data exported to: ${outputDir}`);
  console.log('  - Raw JSON files for each collection');
  console.log('  - analysis-summary.json with all computed metrics');
}

// Run analysis
analyzeUsage()
  .then(() => {
    console.log('\n✅ Analysis completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Analysis failed:', error);
    process.exit(1);
  });
