const http = require('http');
const https = require('https');
const { URL } = require('url');

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8000/api';
const targetVus = parseInt(process.env.VUS || '100', 10);
const durationSec = parseInt(process.env.DURATION || '10', 10);
const testPassword = process.env.TEST_USER_PASSWORD || 'SecretPassword123!';
const testMode = process.env.TEST_MODE || 'login'; // 'login' or 'mixed'

const parsedUrl = new URL(baseUrl);
const isHttps = parsedUrl.protocol === 'https:';
const transport = isHttps ? https : http;

const agent = new transport.Agent({
  keepAlive: true,
  maxSockets: 20000,
  maxFreeSockets: 2000,
  timeout: 30000,
});

console.log('============================================================');
console.log('CAREER PORTAL ENTERPRISE CONCURRENCY LOAD TEST');
console.log('============================================================');
console.log(`Target URL        : ${baseUrl}`);
console.log(`Target Scenario   : ${testMode.toUpperCase()}`);
console.log(`Concurrent VUs    : ${targetVus}`);
console.log(`Test Duration     : ${durationSec} seconds`);
console.log('------------------------------------------------------------\n');

const stats = {
  totalRequests: 0,
  status2xx: 0,
  status4xx: 0,
  status429: 0,
  status5xx: 0,
  timeouts: 0,
  networkErrors: 0,
  latencies: [],
};

let stopTesting = false;

function makeRequest(path, method, payload) {
  return new Promise((resolve) => {
    const startTime = process.hrtime.bigint();
    const bodyStr = payload ? JSON.stringify(payload) : null;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: `${parsedUrl.pathname.replace(/\/$/, '')}${path}`,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Connection': 'keep-alive',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
      agent: agent,
      timeout: 15000,
    };

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const endTime = process.hrtime.bigint();
        const latencyMs = Number(endTime - startTime) / 1e6;

        stats.totalRequests++;
        stats.latencies.push(latencyMs);

        if (res.statusCode >= 200 && res.statusCode < 300) {
          stats.status2xx++;
        } else if (res.statusCode === 429) {
          stats.status429++;
        } else if (res.statusCode >= 400 && res.statusCode < 500) {
          stats.status4xx++;
        } else if (res.statusCode >= 500) {
          stats.status5xx++;
        }

        resolve({ statusCode: res.statusCode, latencyMs, data });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      stats.totalRequests++;
      stats.timeouts++;
      resolve({ statusCode: 504, latencyMs: 15000, data: 'Timeout' });
    });

    req.on('error', (err) => {
      stats.totalRequests++;
      stats.networkErrors++;
      resolve({ statusCode: 0, latencyMs: 0, data: err.message });
    });

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

let globalCandidateCounter = 1;

async function runVirtualUser(workerId) {
  while (!stopTesting) {
    if (testMode === 'mixed' && Math.random() < 0.3) {
      // 30% Public job portal browsing
      await makeRequest('/public/jobs', 'GET');
    } else {
      // Pick unique candidate account
      const candidateId = ((globalCandidateCounter++) % 10000) + 1;
      const email = `loadtest_candidate_${candidateId}@niss.pro`;

      await makeRequest('/candidate/auth/login', 'POST', {
        email: email,
        password: testPassword,
      });
    }
  }
}

function calculatePercentiles(latencies) {
  if (latencies.length === 0) return { p50: 0, p90: 0, p95: 0, p99: 0, max: 0, avg: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const getPercentile = (p) => sorted[Math.floor((p / 100) * sorted.length)] || sorted[sorted.length - 1];
  const sum = sorted.reduce((acc, val) => acc + val, 0);

  return {
    p50: getPercentile(50).toFixed(2),
    p90: getPercentile(90).toFixed(2),
    p95: getPercentile(95).toFixed(2),
    p99: getPercentile(99).toFixed(2),
    max: sorted[sorted.length - 1].toFixed(2),
    avg: (sum / sorted.length).toFixed(2),
  };
}

async function main() {
  const startTime = Date.now();
  console.log(`[+] Launching ${targetVus} Virtual Users...`);

  const vus = [];
  for (let i = 0; i < targetVus; i++) {
    vus.push(runVirtualUser(i));
  }

  setTimeout(() => {
    stopTesting = true;
  }, durationSec * 1000);

  await Promise.all(vus);
  const elapsedSec = (Date.now() - startTime) / 1000;

  const lat = calculatePercentiles(stats.latencies);
  const rps = (stats.totalRequests / elapsedSec).toFixed(2);

  console.log('\n============================================================');
  console.log('LOAD TEST RESULTS SUMMARY');
  console.log('============================================================');
  console.log(`Total Requests Sent : ${stats.totalRequests}`);
  console.log(`Elapsed Time        : ${elapsedSec.toFixed(2)} s`);
  console.log(`Throughput (RPS)    : ${rps} req/sec`);
  console.log('------------------------------------------------------------');
  console.log(`HTTP 2xx (Success)  : ${stats.status2xx}`);
  console.log(`HTTP 4xx (Client)   : ${stats.status4xx}`);
  console.log(`HTTP 429 (RateLimit): ${stats.status429}`);
  console.log(`HTTP 5xx (ServerErr): ${stats.status5xx}`);
  console.log(`Timeouts            : ${stats.timeouts}`);
  console.log(`Network Errors      : ${stats.networkErrors}`);
  console.log('------------------------------------------------------------');
  console.log(`Average Latency     : ${lat.avg} ms`);
  console.log(`p50 Latency         : ${lat.p50} ms`);
  console.log(`p90 Latency         : ${lat.p90} ms`);
  console.log(`p95 Latency         : ${lat.p95} ms`);
  console.log(`p99 Latency         : ${lat.p99} ms`);
  console.log(`Max Latency         : ${lat.max} ms`);
  console.log('============================================================\n');
}

main().catch(console.error);
