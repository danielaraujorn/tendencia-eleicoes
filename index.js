require('dotenv').config();
const puppeteer = require('puppeteer');

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { TwitterApi } = require('twitter-api-v2');

const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_KEY_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

const columns = {
  'JAIR BOLSONARO': 'Bolsonaro',
  LULA: 'Lula',
  difference: 'Diferença',
  percentVoteCount: 'Apuração',
};

const getSheet = async () => {
  const doc = new GoogleSpreadsheet(process.env.SHEET_ID);
  await doc.useServiceAccountAuth({
    client_email: process.env.SHEETS_CLIENT_EMAIL,
    private_key: process.env.SHEETS_PRIVATE_KEY,
  });
  await doc.loadInfo();
  console.log(doc.title);
  // @todo verificar se não é o de teste
  return doc.sheetsById[process.env.SHEET_WORKSHEET_ID];
};

const stringToNumber = (value) => Number(value.replace(',', '.').replace('%', ''));
const numberToPercent = (value) => `${value.toFixed(2).replace('.', ',')}%`;

const getData = async () => {
  const data = await (await fetch(process.env.ELECTION_RESULTS_URL)).json();

  // @todo mudar o atributo pvap (verificar se realmente é a apuração)
  // um dos seguintes: pst psa pea pvnom pvn pvv
  const { cand: candidates, pvv: percentVoteCount } = data;
  const percents = candidates.reduce(
    (acc, { pvap: percent = '0', nm: name }) => ({
      ...acc,
      [name]: stringToNumber(percent),
    }),
    {
      percentVoteCount: stringToNumber(percentVoteCount),
    },
  );
  const difference = percents['JAIR BOLSONARO'] - percents.LULA;

  return { ...percents, difference };
};

const formatObject = (numberObjects) => Object.entries(numberObjects).reduce(
  (acc, [key, value]) => ({
    ...acc,
    [columns[key]]: numberToPercent(value),
  }),
  {},
);

const initBrowser = async () => {
  const width = 1800;
  const height = 1040;
  const browser = await puppeteer.launch({
    args: [`--window-size=${width},${height}`],
    defaultViewport: { width, height },
  });

  return browser;
};

const initPage = async (browser) => {
  const page = await browser.newPage();
  await page.goto(process.env.SHEET_PUBLIC_URL);
  await page.waitForSelector('canvas', { visible: true });
  return page;
};

const getText = (data) => {
  const formattedData = formatObject(data);
  if (data.LULA === data['JAIR BOLSONARO']) {
    return `A ELEIÇÃO ESTÁ EMPATADA\n${
      formattedData[columns.percentVoteCount]
    } de apuração`;
  }
  if (data.LULA > data['JAIR BOLSONARO']) {
    return `Lula está na frente com ${
      formattedData[columns.LULA]
    } e com uma diferença de ${
      formattedData[columns.difference]
    }\n${
      formattedData[columns.percentVoteCount]
    } de apuração`;
  }
  if (data['JAIR BOLSONARO'] > data.LULA) {
    return `Bolsonaro está na frente com ${
      formattedData[columns['JAIR BOLSONARO']]
    } e com uma diferença de ${
      formattedData[columns.difference]
    }\n${
      formattedData[columns.percentVoteCount]
    } de apuração`;
  }
  return '';
};

const postImage = async (data) => {
  const text = getText(data);
  const mediaId = await twitterClient.v1.uploadMedia(
    './screenshot.png',
  );
  await twitterClient.v1.tweet(text, {
    media_ids: [mediaId],
  });
  console.log('tweet postado');
};
const DELAY = 1000 * 5;

const takeScreenshot = (page, data) => {
  setTimeout(async () => {
    const element = await page.$('canvas');
    await element.screenshot({
      path: './screenshot.png',
    });
    setTimeout(() => {
      postImage(data);
    }, DELAY);
    console.log('screenshot');
  }, DELAY);
};

const getLastPercentVoteCount = async (sheet) => {
  const rows = await sheet.getRows();
  if (rows.length === 0) return -1;
  const lastRow = rows[rows.length - 1];
  return stringToNumber(lastRow[columns.percentVoteCount]);
};

let globalPercentVoteCount = -1;

const DEFAULT_INTERVAL_TIME = 1000 * 30;
const DEFAULT_SLEEP_TIME = 1000 * 60 * 6;
let intervalId;
let lifeSignalIntervalId;

const protectInterval = (callback, time) => new Promise((resolve, reject) => {
  intervalId = setInterval(async () => {
    try {
      await callback();
      resolve();
    } catch {
      reject();
    }
  }, time);
});

const intervalFunction = (sheet, browser, page) => async () => {
  const data = await getData();
  const { percentVoteCount } = data;

  if (globalPercentVoteCount < percentVoteCount) {
    console.log('\natualizando tabela');
    globalPercentVoteCount = percentVoteCount;
    const formattedData = formatObject(data);
    await sheet.addRow(formattedData);
    if (percentVoteCount > 0) {
      takeScreenshot(page, data);
    }
    clearInterval(intervalId);
    await protectInterval(
      intervalFunction(sheet, browser, page),
      DEFAULT_SLEEP_TIME,
    );
  } else {
    console.log('.');

    clearInterval(intervalId);
    await protectInterval(
      intervalFunction(sheet, browser, page),
      DEFAULT_INTERVAL_TIME,
    );
  }
  if (percentVoteCount >= 98) {
    await browser.close();
    clearInterval(intervalId);
    clearInterval(lifeSignalIntervalId);
  }
};

const main = async () => {
  try {
    const browser = await initBrowser();
    const page = await initPage(browser);
    const sheet = await getSheet();
    const lastPercentVoteCount = await getLastPercentVoteCount(sheet);
    globalPercentVoteCount = lastPercentVoteCount;

    console.log('começando...\n');

    lifeSignalIntervalId = setInterval(() => {
      twitterClient.v1.sendDm({ recipient_id: 2224444156, text: `Estou vivo às ${new Date()}` });
    }, 1000 * 60 * 5);

    await intervalFunction(sheet, browser, page);

    await protectInterval(intervalFunction(sheet, browser, page), DEFAULT_INTERVAL_TIME);
  } catch (e) {
    await twitterClient.v1.sendDm({
      recipient_id: process.env.LIFE_SIGNAL_RECIPIENT_ID,
      text: 'DEU RUIM!!!!',
    });
    throw new Error();
  }
};

main();
