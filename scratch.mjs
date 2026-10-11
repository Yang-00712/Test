#!/usr/bin/env node
// 刮刮樂公式試算（命令列版）。
// 來源：https://www.threads.com/@paulchu0258/post/DeV5aAamdix
// 用法：node scratch.mjs 034391-055 --rate 30 [--step 0.033] [--count 30] [--max 99] [--min 0] [--split 222|111111] [--ticket 名稱或期別] [--price 100|200|300|500|1000|2000] [--auto]
// --auto：加成 = 中獎率 ÷ 10，組數 = 中獎率 × 一本張數（原作者的規則）。
// --ticket 會從同目錄的 tickets.json（台彩公告的本期整體中獎率）帶入中獎率。
// 加總 100 以上：加總 × (中獎率 + step × k)；加總小於 100：加總 × (1 + 中獎率 × k)。
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";

const round6 = (value) => Math.round(value * 1e6) / 1e6;
const pad2 = (n) => String(n).padStart(2, "0");
const pad3 = (n) => String(n).padStart(3, "0");
const plain = (value) => String(round6(value));

const SPLITS = { 222: [2, 2, 2], 111111: [1, 1, 1, 1, 1, 1] };

/** 把彩券編號前六碼依拆法拆開相加。接受 034391、034391-055、034391055。 */
export function parseSerial(raw, split = "222") {
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 6 || !SPLITS[split]) {
    return null;
  }
  const book = digits.slice(0, 6);
  const index = digits.length >= 9 ? Number(digits.slice(6, 9)) : null;
  const parts = [];
  let at = 0;
  for (const len of SPLITS[split]) {
    parts.push(book.slice(at, at + len));
    at += len;
  }
  const d = parts.reduce((sum, part) => sum + Number(part), 0);
  return { book, index, parts, d };
}

/** 依 D 決定底數與每組加成，產生 k = 1..count 的候選票號。 */
export function candidates({
  d,
  rate,
  step = 0.033,
  count = 30,
  max = 99,
  min = 0,
}) {
  const second = d < 100;
  const base = second ? 1 : rate;
  const stepUsed = second ? rate : step;
  const rows = [];
  for (let k = 1; k <= count; k += 1) {
    const multiplier = round6(base + stepUsed * k);
    const value = round6(d * multiplier);
    const low = Math.floor(value);
    const high = Math.ceil(value);
    const picks = [...new Set([low, high])].filter((n) => n >= min && n <= max);
    rows.push({ k, multiplier, value, picks });
  }
  return { second, base, stepUsed, rows };
}

/** 用名稱或期別在 tickets.json 裡找一款彩券；同名多期取最新。 */
export function findTicket(query) {
  const file = new URL("./tickets.json", import.meta.url);
  const { tickets } = JSON.parse(readFileSync(file, "utf8"));
  const q = String(query).trim();
  const matches = tickets.filter(
    (t) => t.vol === q || t.name === q || t.name.includes(q),
  );
  return matches[0] ?? null;
}

/** 列出官方獎金結構：各獎項張數、機率、期望值。 */
function printStructure(t) {
  if (!t.tiers || !t.issued) {
    console.log("（這款公告沒有各獎項張數）");
    return;
  }
  const fmt = (n) => Number(n).toLocaleString("en-US");
  let winners = 0;
  let profitWinners = 0;
  let payout = 0;
  for (const [prize, count] of t.tiers) {
    winners += count;
    payout += prize * count;
    if (prize > t.price) {
      profitWinners += count;
    }
  }
  console.log(
    `發行 ${fmt(t.issued)} 張，中獎 ${fmt(winners)} 張（${((winners / t.issued) * 100).toFixed(2)}%），刮到比票價多：${((profitWinners / t.issued) * 100).toFixed(2)}%，每張期望值 NT$${(payout / t.issued).toFixed(1)}（回本率 ${((payout / t.issued / t.price) * 100).toFixed(1)}%）`,
  );
  for (const [prize, count, label] of t.tiers) {
    console.log(
      `  ${(label ?? `NT$${fmt(prize)}`).padEnd(14)} ${fmt(count).padStart(10)} 張   1 : ${fmt(Math.round(t.issued / count))}`,
    );
  }
  console.log("");
}

// 各面額歷年（2014–2026，台彩公告）中獎率的款數、最低、中位、最高。
const PRICE_PRESETS = {
  100: { n: 202, min: 22.12, median: 33.0, max: 100.0 },
  200: { n: 343, min: 24.03, median: 32.0, max: 50.35 },
  300: { n: 56, min: 31.0, median: 36.0, max: 40.15 },
  500: { n: 81, min: 31.43, median: 41.0, max: 100.0 },
  1000: { n: 29, min: 43.97, median: 70.0, max: 70.79 },
  2000: { n: 14, min: 69.33, median: 69.33, max: 82.55 },
};

function usage(message) {
  if (message) {
    console.error(message);
  }
  console.error(
    "用法：node scratch.mjs <彩券編號> --rate <中獎率%> [--step 0.033] [--count 30] [--max 99]",
  );
  console.error("範例：node scratch.mjs 034391-055 --rate 30");
  process.exit(1);
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      rate: { type: "string", short: "r" },
      step: { type: "string", short: "s", default: "0.033" },
      count: { type: "string", short: "n", default: "30" },
      max: { type: "string", short: "m", default: "99" },
      min: { type: "string", default: "0" },
      split: { type: "string", default: "222" },
      ticket: { type: "string", short: "t" },
      price: { type: "string", short: "p" },
      auto: { type: "boolean", short: "a", default: false },
    },
  });
  const serial = positionals[0];
  if (!serial) {
    usage("缺少彩券編號。");
  }
  const ticket = parseSerial(serial, values.split);
  if (!ticket) {
    usage("彩券編號至少要有 6 位數字，--split 只能是 222 或 111111。");
  }
  let rateText = values.rate;
  if (values.price && rateText === undefined && !values.ticket) {
    const preset = PRICE_PRESETS[values.price];
    if (!preset) {
      usage("--price 只能是 100、200、300、500、1000 或 2000。");
    }
    rateText = String(preset.median);
    console.log(
      `面額 $${values.price}：歷年 ${preset.n} 款，中獎率 ${preset.min}% 到 ${preset.max}%，先用中位數 ${preset.median}%`,
    );
  }
  if (values.ticket) {
    const found = findTicket(values.ticket);
    if (!found) {
      usage(`tickets.json 裡找不到「${values.ticket}」。`);
    }
    rateText = String(found.rate);
    console.log(
      `款式 ${found.vol} ${found.name}（$${found.price}）：台彩公告中獎率 ${found.rate.toFixed(2)}%`,
    );
    printStructure(found);
  }
  if (rateText === undefined) {
    usage("缺少 --rate（彩券背面印的中獎率，百分比），或用 --ticket 選款式。");
  }
  const rate = Number(rateText) / 100;
  const max = Math.max(0, Math.floor(Number(values.max)));
  const step = values.auto
    ? Math.round(rate * 100) / 1000
    : Number(values.step);
  const count = values.auto
    ? Math.max(1, Math.round(rate * (max + 1)))
    : Math.max(1, Math.floor(Number(values.count)));
  if (values.auto) {
    console.log(
      `自動：加成 ${step} = 中獎率 ${Math.round(rate * 10000) / 100}% ÷ 10，組數 ${count} = 中獎率 × 一本 ${max + 1} 張`,
    );
  }
  const min = Math.max(0, Math.min(max, Math.floor(Number(values.min))));
  if (![rate, step, count, max, min].every(Number.isFinite)) {
    usage("--rate、--step、--count、--max、--min 都要是數字。");
  }

  const { second, base, stepUsed, rows } = candidates({
    d: ticket.d,
    rate,
    step,
    count,
    max,
    min,
  });
  const featured = rows[Math.min(second ? 1 : 3, count) - 1];
  const all = [...new Set(rows.flatMap((row) => row.picks))].sort(
    (x, y) => x - y,
  );
  const inRange = rows.filter((row) => row.picks.length > 0).length;

  console.log(
    `彩券編號 ${ticket.book}${ticket.index === null ? "" : `-${pad3(ticket.index)}`}`,
  );
  console.log(
    `前六碼拆成 ${values.split.split("").join("+")}：${ticket.parts.join("、")}`,
  );
  console.log(`相加 → ${ticket.parts.join(" + ")} = ${ticket.d}`);
  console.log(
    second
      ? `D = ${ticket.d} 小於 100，用公式二：D × (1 + p × k)，p = ${plain(rate)}`
      : `D = ${ticket.d} 有 100 以上，用公式一：D × (p + s × k)，p = ${plain(rate)}，s = ${plain(step)}`,
  );
  console.log(
    `k = ${featured.k}：${ticket.d} × (${plain(base)} + ${plain(stepUsed)} × ${featured.k}) = ${ticket.d} × ${plain(featured.multiplier)} = ${featured.value.toFixed(3)} → 選 ${featured.picks.map(pad2).join(" 或 ") || "（不在可選範圍）"}`,
  );
  if (min > 0) {
    console.log(`${pad2(min)} 號以前當作已賣掉，不列入。`);
  }
  console.log("");
  console.log("  k   底數+加成   D × (底數+加成)   候選票號");
  for (const row of rows) {
    const picks =
      row.picks.length > 0
        ? row.picks.map(pad2).join(" / ")
        : `不在 ${pad2(min)}–${pad2(max)}`;
    console.log(
      `${String(row.k).padStart(3)}   ${plain(row.multiplier).padEnd(8)}  ${row.value.toFixed(3).padStart(13)}   ${picks}`,
    );
  }
  console.log("");
  console.log(
    `候選票號（k = 1…${count}，共 ${all.length} 個）：${all.map(pad2).join(" ") || "無"}`,
  );
  console.log(
    `落在 ${pad2(min)}–${pad2(max)} 範圍內的 k：${inRange} 個，不在範圍：${count - inRange} 個`,
  );
  if (ticket.index !== null) {
    console.log(
      `這張票的本內票號是 ${pad3(ticket.index)}，${all.includes(ticket.index) ? "在候選名單內" : "不在候選名單內"}`,
    );
  }
  console.log("");
  console.log(
    "提醒：這是刮友圈流傳的民間算法，不是台灣彩券官方公式，沒有任何預測效力。",
  );
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  main();
}
