#!/usr/bin/env node
// 刮刮樂公式試算（命令列版）。
// 來源：https://www.threads.com/@paulchu0258/post/DeV5aAamdix
// 用法：node scratch.mjs 034391-055 --rate 30 [--step 0.033] [--count 30] [--max 99]
import { parseArgs } from "node:util";

const round6 = (value) => Math.round(value * 1e6) / 1e6;
const pad2 = (n) => String(n).padStart(2, "0");
const pad3 = (n) => String(n).padStart(3, "0");
const plain = (value) => String(round6(value));

/** 把彩券編號拆成 A、B、C 與 D。接受 034391、034391-055、034391055。 */
export function parseSerial(raw) {
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 6) {
    return null;
  }
  const book = digits.slice(0, 6);
  const index = digits.length >= 9 ? Number(digits.slice(6, 9)) : null;
  const a = Number(book.slice(0, 2));
  const b = Number(book.slice(2, 4));
  const c = Number(book.slice(4, 6));
  return { book, index, a, b, c, d: a + b + c };
}

/** 依 D × (p + s × k) 產生 k = 1..count 的候選票號。 */
export function candidates({ d, rate, step = 0.033, count = 30, max = 99 }) {
  const rows = [];
  for (let k = 1; k <= count; k += 1) {
    const multiplier = round6(rate + step * k);
    const value = round6(d * multiplier);
    const low = Math.floor(value);
    const high = Math.ceil(value);
    const picks = [...new Set([low, high])].filter((n) => n >= 0 && n <= max);
    rows.push({ k, multiplier, value, picks });
  }
  return rows;
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
    },
  });
  const serial = positionals[0];
  if (!serial) {
    usage("缺少彩券編號。");
  }
  const ticket = parseSerial(serial);
  if (!ticket) {
    usage("彩券編號至少要有 6 位數字。");
  }
  if (values.rate === undefined) {
    usage("缺少 --rate（彩券背面印的中獎率，百分比）。");
  }
  const rate = Number(values.rate) / 100;
  const step = Number(values.step);
  const count = Math.max(1, Math.floor(Number(values.count)));
  const max = Math.max(0, Math.floor(Number(values.max)));
  if (![rate, step, count, max].every(Number.isFinite)) {
    usage("--rate、--step、--count、--max 都要是數字。");
  }

  const rows = candidates({ d: ticket.d, rate, step, count, max });
  const featured = rows[Math.min(3, count) - 1];
  const all = [...new Set(rows.flatMap((row) => row.picks))].sort(
    (x, y) => x - y,
  );
  const inRange = rows.filter((row) => row.picks.length > 0).length;

  console.log(
    `彩券編號 ${ticket.book}${ticket.index === null ? "" : `-${pad3(ticket.index)}`}`,
  );
  console.log(
    `A = ${pad2(ticket.a)}，B = ${pad2(ticket.b)}，C = ${pad2(ticket.c)}`,
  );
  console.log(
    `A + B + C = D → ${pad2(ticket.a)} + ${pad2(ticket.b)} + ${pad2(ticket.c)} = ${ticket.d}`,
  );
  console.log(`D × (p + s × k)，p = ${plain(rate)}，s = ${plain(step)}`);
  console.log(
    `k = ${featured.k}：${ticket.d} × (${plain(rate)} + ${plain(step)} × ${featured.k}) = ${ticket.d} × ${plain(featured.multiplier)} = ${featured.value.toFixed(3)} → 選 ${featured.picks.map(pad2).join(" 或 ") || "（超出票號範圍）"}`,
  );
  console.log("");
  console.log("  k   p + s×k   D × (p + s×k)   候選票號");
  for (const row of rows) {
    const picks =
      row.picks.length > 0
        ? row.picks.map(pad2).join(" / ")
        : `超出 00–${pad2(max)}`;
    console.log(
      `${String(row.k).padStart(3)}   ${plain(row.multiplier).padEnd(8)}  ${row.value.toFixed(3).padStart(13)}   ${picks}`,
    );
  }
  console.log("");
  console.log(
    `候選票號（k = 1…${count}，共 ${all.length} 個）：${all.map(pad2).join(" ") || "無"}`,
  );
  console.log(
    `落在 00–${pad2(max)} 範圍內的 k：${inRange} 個，超出範圍：${count - inRange} 個`,
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
