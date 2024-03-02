const express = require('express');
const { Cluster } = require('puppeteer-cluster');

const app = express();
app.use(express.json());

const puppeteerOptions = {
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-setuid-sandbox',
    '--no-first-run',
    '--no-zygote',
    '--deterministic-fetch',
    '--disable-features=IsolateOrigins',
    '--disable-site-isolation-trials',
  ],
  // executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  executablePath: '/usr/bin/google-chrome-stable',
};

const clusterConfig = {
  concurrency: Cluster.CONCURRENCY_CONTEXT,
  maxConcurrency: 2,
  puppeteerOptions,
};

const launchCluster = async () => {
  const cluster = await Cluster.launch(clusterConfig);

  await cluster.task(async ({ page, data: { url, headers } }) => {
    const startTime = Date.now();

    if (headers) {
      for (const [name, value] of Object.entries(headers)) {
        await page.setExtraHTTPHeaders({ [name]: value });
      }
    }

    const response = await page.goto(url, { timeout: 30000 });
    const status_code = response.status();
    const finalUrl = page.url();
    const pageBody = await page.content();
    const endTime = Date.now();
    const loadTime = endTime - startTime;
    const url_string = finalUrl !== url ? `'${url}' -> '${finalUrl}'` : `'${url}'`;
    console.log(`[DEBUG] Fetched ${url_string} status: ${status_code} (${loadTime / 1000}s)`);

    return { response_body: pageBody, status_code: status_code, headers: response.headers() };
  });

  return cluster;
};

const handlePostRequest = (cluster) => async (req, res) => {
  const { url, headers } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required.' });
  }

  try {
    const result = await cluster.execute({ url, headers });
    res.status(200).json(result);
  } catch (err) {
    console.debug(`[DEBUG] Could not get '${url}' Error: ${err}`);
    res.status(500).json({ error: 'An error occurred while processing the URL.' + err });
  }
};

const startServer = (port, cluster) => {
  app.post('/', handlePostRequest(cluster));

  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
};

const gracefulShutdown = (cluster) => {
  process.on('SIGINT', async () => {
    await cluster.idle();
    await cluster.close();
    process.exit();
  });
};

(async () => {
  const cluster = await launchCluster();
  startServer(3000, cluster);
  gracefulShutdown(cluster);
})();
