#!/usr/bin/env node
// 刮刮樂公式試算（命令列版）。
// 來源：https://www.threads.com/@paulchu0258/post/DeV5aAamdix
// 用法：node scratch.mjs 034391-055 --rate 30 [--step 0.033] [--count 30] [--max 99] [--min 0] [--split 222|33|123|111111]
// 加總 100 以上：加總 × (中獎率 + step × k)；加總小於 100：加總 × (1 + 中獎率 × k)。
import { parseArgs } from "node:util";

const round6 = (value) => Math.round(value * 1e6) / 1e6;
const pad2 = (n) => String(n).padStart(2, "0");
const pad3 = (n) => String(n).padStart(3, "0");
const plain = (value) => String(round6(value));

const SPLITS = {
  222: [2, 2, 2],
  33: [3, 3],
  123: [1, 2, 3],
  111111: [1, 1, 1, 1, 1, 1],
};

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
    },
  });
  const serial = positionals[0];
  if (!serial) {
    usage("缺少彩券編號。");
  }
  const ticket = parseSerial(serial, values.split);
  if (!ticket) {
    usage("彩券編號至少要有 6 位數字，--split 只能是 222、33、123 或 111111。");
  }
  if (values.rate === undefined) {
    usage("缺少 --rate（彩券背面印的中獎率，百分比）。");
  }
  const rate = Number(values.rate) / 100;
  const step = Number(values.step);
  const count = Math.max(1, Math.floor(Number(values.count)));
  const max = Math.max(0, Math.floor(Number(values.max)));
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
