import { wilsonInterval } from "../src/server/services/graph/gate/wilson.js";
const cases = [
  ["Strategy", 2, 12],
  ["Template Method", 5, 14],
  ["Facade", 3, 19],
  ["GLOBAL", 10, 45],
];
for (const [name, v, n] of cases as [string, number, number][]) {
  const w = wilsonInterval(v, n);
  console.log(`${name}: ${v}/${n} = ${Math.round((100*v)/n)}%  Wilson95=[${Math.round(w.lower*100)}%, ${Math.round(w.upper*100)}%]`);
}
