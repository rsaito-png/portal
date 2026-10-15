const fs = require("fs"), vm = require("vm"), path = require("path");
const root = path.join(__dirname, "..");
vm.runInThisContext(fs.readFileSync(path.join(root, "vendor/encoding.min.js"), "utf8"));
if (typeof Encoding === "undefined" && typeof globalThis.Encoding === "undefined") throw new Error("Encoding \u304C\u8AAD\u3081\u307E\u305B\u3093");
vm.runInThisContext(fs.readFileSync(path.join(root, "rydeen-billing-lib.js"), "utf8") + ";globalThis.RydBilling=RydBilling;");
const { buildBillingFiles, resolveB, bVersion, B_BASIC_R6, B_BASIC_R8, bytesLatin1: L } = globalThis.RydBilling;
let ng = 0;
const ok = (c, m) => {
  console.log((c ? "OK  " : "NG  ") + m);
  if (!c) ng++;
};
for (const [ver, rows, scopes] of [["R6", B_BASIC_R6, [""]], ["R8", B_BASIC_R8, ["new", "old"]]])
  for (const cls of ["\u2160", "\u2161", "\u2162"]) for (let cap = 1; cap <= 5; cap++) for (const sc of scopes) {
    const rs = rows.filter((r) => r[1] === cls && r[2] === cap && r[5] === 0 && !r[6] && !r[7] && (r[3] === "" || r[3] === sc)).sort((a, b) => a[9] - b[9]);
    let cur = 0, good = rs.length > 0;
    for (const r of rs) {
      if (r[9] !== cur) good = false;
      cur = r[10];
    }
    ok(good && cur === null, `\u533A\u5206\u7DB2\u7F85 ${ver} ${cls} \u5B9A\u54E1\u533A\u5206${cap} ${sc || "-"}`);
  }
const office = (b) => ({ \u4E8B\u696D\u6240\u756A\u53F7: "9999999999", \u4E8B\u696D\u6240\u540D: "\u30C6\u30B9\u30C8B", \u30B5\u30FC\u30D3\u30B9\u7A2E\u985E\u30B3\u30FC\u30C9: "46", \u5730\u57DF\u533A\u5206\u30B3\u30FC\u30C9: "20", \u5730\u57DF\u533A\u5206\u5358\u4FA1: "10.00", \u51E6\u9047\u6539\u5584\u52A0\u7B97\u7387: "", \u51E6\u9047\u6539\u5584\u30B5\u30FC\u30D3\u30B9\u30B3\u30FC\u30C9\u9805\u76EE: "", \u5229\u7528\u5B9A\u54E1\u898F\u6A21: "", \u6A19\u6E96\u63D0\u4F9B\u6642\u9593\u5E2F: "", \u65E2\u5B9A\u958B\u59CB\u6642\u523B: "10:00", \u65E2\u5B9A\u7D42\u4E86\u6642\u523B: "15:00", \u533B\u5E2B\u672A\u914D\u7F6E\u6E1B\u7B97: "\u306A\u3057", B\u578B\u8A2D\u5B9A: b });
const user = { \u5229\u7528\u8005ID: "u1", \u53D7\u7D66\u8005\u8A3C\u756A\u53F7: "0000000001", \u652F\u7D66\u6C7A\u5B9A\u5E02\u753A\u6751\u756A\u53F7: "131016", \u6C0F\u540D: "\u5C71\u7530", \u6C0F\u540D\u30AB\u30CA: "\u30E4\u30DE\u30C0", \u969C\u5BB3\u652F\u63F4\u533A\u5206: "", \u4E0A\u9650\u7BA1\u7406\u6709\u7121: "\u7121", \u4E0A\u9650\u6708\u984D: 0, \u4E0A\u9650\u984D\u7BA1\u7406\u4E8B\u696D\u6240\u756A\u53F7: "", \u6C7A\u5B9A\u30B5\u30FC\u30D3\u30B9\u30B3\u30FC\u30C9: "461000", \u5951\u7D04\u652F\u7D66\u91CF_\u65E5: "\u539F\u5247", \u5951\u7D04\u958B\u59CB\u5E74\u6708\u65E5: "", \u5951\u7D04\u7D42\u4E86\u5E74\u6708\u65E5: "", \u30B5\u30FC\u30D3\u30B9\u958B\u59CB\u5E74\u6708\u65E5: "", \u4E8B\u696D\u8005\u8A18\u5165\u6B04\u756A\u53F7: "1", \u98DF\u4E8B\u63D0\u4F9B\u4F53\u5236\u52A0\u7B97\u5BFE\u8C61: "\u5BFE\u8C61", \u9001\u8FCE\u52A0\u7B97\u533A\u5206: "I" };
const mkAgg = (ym, days, meals, go, back) => {
  const r = { \u5BFE\u8C61\u5E74\u6708: ym, \u5229\u7528\u8005ID: "u1", \u5229\u7528\u65E5\u6570: days, \u9001\u8FCE\u5F80\u56DE\u6570: go, \u9001\u8FCE\u5FA9\u56DE\u6570: back, \u98DF\u4E8B\u56DE\u6570: meals };
  for (let d = 1; d <= days; d++) {
    const k = String(d).padStart(2, "0");
    Object.assign(r, { ["\u5229\u7528_" + k]: "1", ["\u6642\u9593_" + k]: "5\u6642\u9593\u4EE5\u4E0A6\u6642\u9593\u672A\u6E80", ["\u9001\u8FCE_" + k]: "\u306A\u3057", ["\u98DF\u4E8B_" + k]: d <= meals ? "1" : "0", ["\u958B\u59CB_" + k]: "10:00", ["\u7D42\u4E86_" + k]: "15:00" });
  }
  return r;
};
{
  const b = { fee_class: "\u2160", capacity: "20", avg_wage: "15000", r8_scope: "\u5BFE\u8C61", addons: "fukushi3,meal,transport1", shogu_class: "\u2161\u30ED" };
  const days = 10, meals = 6, trips = 4;
  const sum = 682 * days + 6 * days + 30 * meals + 21 * trips, shogu = Math.round(sum * 0.107), total = sum + shogu;
  const f = buildBillingFiles(2026, 9, { office: office(b), users: [user], agg: [mkAgg("202609", days, meals, 2, 2)] }, new Date(2026, 9, 15));
  ok(f.summary.totalUnits === total, `R8 \u7DCF\u5358\u4F4D\u6570 ${f.summary.totalUnits} == \u624B\u8A08\u7B97 ${total}`);
  ok(f.issues.length === 0, "R8 specCheck \u6307\u64580\u4EF6 " + JSON.stringify(f.issues));
  const t = L(f.j111.bytes);
  for (const c of ["463406", "466036", "465070", "466590", "465175"]) ok(t.includes(c), `J111\u306B ${c} \u3092\u542B\u3080`);
  ok(t.includes('"46"') && t.includes('"461000"'), "\u30B5\u30FC\u30D3\u30B9\u7A2E\u985E46\u30FB\u6C7A\u5B9A\u30B5\u30FC\u30D3\u30B9\u30B3\u30FC\u30C9461000");
  ok(L(f.j611.bytes).includes('"1701"'), "J611 \u69D8\u5F0F\u7A2E\u52251701");
}
{
  const b = { fee_class: "\u2160", capacity: "20", avg_wage: "32000", shogu_class: "\u2161" };
  const sum = 758 * 8, total = sum + Math.round(sum * 0.091);
  const f = buildBillingFiles(2025, 9, { office: office(b), users: [user], agg: [mkAgg("202509", 8, 0, 0, 0)] }, new Date(2025, 9, 15));
  ok(f.summary.totalUnits === total, `R6 \u7DCF\u5358\u4F4D\u6570 ${f.summary.totalUnits} == \u624B\u8A08\u7B97 ${total}`);
  ok(f.issues.length === 0, "R6 specCheck \u6307\u64580\u4EF6");
}
{
  const f = buildBillingFiles(2026, 9, { office: office({ fee_class: "\u2163", capacity: "20" }), users: [user], agg: [mkAgg("202609", 5, 0, 0, 0)] }, new Date(2026, 9, 15));
  ok(f.summary.totalUnits === 584 * 5, `\u2163 \u7DCF\u5358\u4F4D\u6570 ${f.summary.totalUnits}`);
}
const blocks = (b, ym = "202609") => resolveB(office(b), ym).blocking;
ok(blocks({ fee_class: "\u2160", capacity: "20", avg_wage: "15000" }).some((m) => m.includes("\u6539\u5B9A\u5BFE\u8C61")), "R8\u3067\u6539\u5B9A\u5BFE\u8C61/\u5BFE\u8C61\u5916\u304C\u672A\u8A2D\u5B9A \u2192 \u30D6\u30ED\u30C3\u30AF");
ok(blocks({ fee_class: "\u2160", capacity: "20" }).some((m) => m.includes("\u5E73\u5747\u5DE5\u8CC3")), "\u5E73\u5747\u5DE5\u8CC3\u672A\u8A2D\u5B9A \u2192 \u30D6\u30ED\u30C3\u30AF");
ok(blocks({ fee_class: "\u2160", capacity: "20", avg_wage: "15000", r8_scope: "\u5BFE\u8C61", addons: "absent" }).length > 0, "\u6B20\u5E2D\u6642\u5BFE\u5FDC\u52A0\u7B97(\u5B9F\u7E3E\u672A\u5BFE\u5FDC) \u2192 \u30D6\u30ED\u30C3\u30AF");
ok(blocks({ fee_class: "\u2160", capacity: "20", avg_wage: "15000", r8_scope: "\u5BFE\u8C61", other_reduction: "\u3042\u308A" }).length > 0, "\u305D\u306E\u4ED6\u6E1B\u7B97\u3042\u308A \u2192 \u30D6\u30ED\u30C3\u30AF");
ok(blocks({ fee_class: "\u2160", capacity: "20", avg_wage: "15000", r8_scope: "\u5BFE\u8C61", short_time: "\u3042\u308A" }).length > 0, "\u77ED\u6642\u9593(\u2160) \u2192 \u30D6\u30ED\u30C3\u30AF");
ok(blocks({ fee_class: "\u2163", capacity: "20", short_time: "\u3042\u308A" }).length === 0, "\u77ED\u6642\u9593(\u2163) \u2192 \u30B3\u30FC\u30C9\u3042\u308A");
ok(blocks({ fee_class: "\u2163", capacity: "20", shogu_class: "\u2160\u30A4" }, "202509").length > 0, "R6\u6708\u306BR8\u306E\u51E6\u9047\u6539\u5584\u533A\u5206 \u2192 \u30D6\u30ED\u30C3\u30AF");
ok(blocks({ fee_class: "\u2163", capacity: "20" }, "202403").length > 0, "\u4EE4\u548C6\u5E743\u6708\u4EE5\u524D \u2192 \u30D6\u30ED\u30C3\u30AF");
ok(bVersion("202605") === "R6" && bVersion("202606") === "R8", "\u8868\u306E\u5207\u66FF\u6708 R6\u2192R8 = 2026-06");
let threw = false;
try {
  buildBillingFiles(2026, 9, { office: office({ fee_class: "\u2160", capacity: "20" }), users: [user], agg: [mkAgg("202609", 1, 0, 0, 0)] });
} catch {
  threw = true;
}
ok(threw, "\u8981\u78BA\u8A8D\u3042\u308A\u306E\u307E\u307E\u751F\u6210\u3057\u3088\u3046\u3068\u3059\u308B\u3068\u4F8B\u5916(\u51FA\u529B\u3057\u306A\u3044)");
process.exit(ng ? 1 : 0);
