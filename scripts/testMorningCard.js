require("colors");
const fs = require("fs/promises");
const path = require("path");

const generateMorningCard = require("../src/utils/generateMorningCard");

const FORTUNES = ["大吉", "中吉", "小吉", "沒想法", "凶", "大凶"];

const SAMPLE_RECOMMENDS = [
  "祭祀",
  "出行",
  "修造",
  "動土",
  "合帳",
  "安床",
  "移徙",
  "入殮",
  "破土",
  "安葬",
  "補垣",
  "塞穴",
];

const SAMPLE_AVOIDS = ["入宅", "作灶", "理髮", "開光", "安門"];

async function main() {
  const outDir = path.join(__dirname, "../tmp");
  await fs.mkdir(outDir, { recursive: true });

  const base = {
    dateStr: "2026.04.23 THU",
    lunarYearLabel: "丙午馬年",
    lunarDay: "三月初七",
    countdownName: "勞動節",
    countdownDays: 8,
    recommends: SAMPLE_RECOMMENDS,
    avoids: SAMPLE_AVOIDS,
    serialNo: "0423",
  };

  for (const fortuneText of FORTUNES) {
    const start = Date.now();
    const buf = await generateMorningCard({ ...base, fortuneText });
    const ms = Date.now() - start;
    const filename = `test-morning-${fortuneText}.png`;
    await fs.writeFile(path.join(outDir, filename), buf);
    console.log(
      `[OK] ${filename} (${(buf.length / 1024).toFixed(1)} KB, ${ms}ms)`.green
    );
  }

  // Edge case: no countdown
  const buf = await generateMorningCard({
    ...base,
    fortuneText: "小吉",
    countdownName: null,
    countdownDays: null,
  });
  await fs.writeFile(path.join(outDir, "test-morning-no-countdown.png"), buf);
  console.log(`[OK] test-morning-no-countdown.png`.green);
}

main().catch((err) => {
  console.log(`[ERROR] ${err.stack || err}`.red);
  process.exit(1);
});
