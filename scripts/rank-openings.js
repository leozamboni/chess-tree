/* Ordena os ramos com o Stockfish e grava 🥇🥈🥉 nas três continuações mais fortes de quem joga. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const ORDER = ["SICILIAN", "SPANISH", "SCANDINAVIAN", "SLAV", "ORTHODOX"];
const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : ORDER;

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "chess.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(root, "openings.js"), "utf8"), ctx);

function sanToUci(pos, san) {
  for (const mv of ctx.Chess.legalMoves(pos)) {
    let uci = ctx.Chess.squareName(mv.from.f, mv.from.r) + ctx.Chess.squareName(mv.to.f, mv.to.r);
    if (mv.promo) uci += mv.promo.toLowerCase();
    try {
      if (ctx.Chess.uciToSan(pos, uci) === san) return uci;
    } catch (err) {
      /* outro lance */
    }
  }
  return null;
}

const MEDALS = ["🥇 ", "🥈 ", "🥉 "];

function sideValue(pv) {
  if (pv.mate != null) return pv.mate > 0 ? 1000000 - pv.mate : -1000000 - pv.mate;
  return pv.cp == null ? -999999 : pv.cp;
}

function stripMedal(name) {
  return name.replace(/^(?:(?:🥇|🥈|🥉|⭐) )+/u, "");
}

function search(engine, fen, ucis) {
  const count = ucis.length;
  return new Promise((resolve, reject) => {
    const pvs = {};
    const timer = setTimeout(() => reject(new Error("tempo esgotado")), 60000);
    engine.listener = (line) => {
      const text = String(line);
      if (text.indexOf(" pv ") !== -1) {
        const mp = /multipv (\d+)/.exec(text);
        const pv = / pv ([a-h][1-8][a-h][1-8][qrbn]?)/.exec(text);
        const cp = /score cp (-?\d+)/.exec(text);
        const mate = /score mate (-?\d+)/.exec(text);
        if (mp && pv) pvs[mp[1]] = { uci: pv[1], cp: cp ? Number(cp[1]) : null, mate: mate ? Number(mate[1]) : null };
      }
      if (text.indexOf("bestmove") === 0) {
        clearTimeout(timer);
        resolve(Object.keys(pvs).sort((a, b) => Number(a) - Number(b)).map((key) => pvs[key]));
      }
    };
    engine.processCommand("setoption name MultiPV value " + count);
    engine.processCommand("position fen " + fen);
    engine.processCommand("go depth 12 searchmoves " + ucis.join(" "));
  });
}

function clearMedals(node) {
  node.name = stripMedal(node.name);
  node.children.forEach(clearMedals);
}

async function rankNode(engine, node, line) {
  const full = line.concat(node.moves);
  let pos = null;
  try {
    pos = ctx.Chess.play(full);
  } catch (err) {
    console.error("lance inválido", node.name, err.message);
  }
  if (pos && node.children.length > 1) {
    const pairs = node.children.map((child) => ({ child, uci: sanToUci(pos, child.moves[0]) }));
    const ucis = [];
    pairs.forEach((pair) => {
      if (pair.uci && ucis.indexOf(pair.uci) === -1) ucis.push(pair.uci);
    });
    if (ucis.length > 1) {
      const ranked = await search(engine, ctx.Chess.fullFen(pos, full.length), ucis);
      const byUci = new Map(ranked.map((pv) => [pv.uci, pv]));
      const scored = [];
      const rest = [];
      pairs.forEach((pair) => {
        const pv = pair.uci ? byUci.get(pair.uci) : null;
        if (!pv) rest.push(pair.child);
        else scored.push({ child: pair.child, value: sideValue(pv) });
      });
      if (scored.length) {
        scored.sort((a, b) => b.value - a.value);
        scored.forEach((item, index) => {
          item.child.name = (MEDALS[index] || "") + stripMedal(item.child.name);
        });
        rest.forEach((child) => {
          child.name = stripMedal(child.name);
        });
        node.children = scored.map((item) => item.child).concat(rest);
        console.log(full.join(" ") || "(início)", "->", node.children.slice(0, 3).map((child) => child.name).join(" | "));
      }
    }
  }
  for (const child of node.children) await rankNode(engine, child, full);
}

async function main() {
  const init = require(path.join(root, "vendor/stockfish-19-lite-single.js"));
  const engine = init();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Stockfish não iniciou")), 30000);
    engine.listener = (line) => {
      if (String(line).indexOf("uciok") !== -1) {
        clearTimeout(timer);
        resolve();
      }
    };
    engine.processCommand("uci");
  });
  for (const name of names) {
    if (!ctx[name]) throw new Error("Árvore ausente: " + name);
    console.log("avaliando", name);
    clearMedals(ctx[name]);
    await rankNode(engine, ctx[name], []);
  }
  const out = ORDER.map(
    (name) =>
      "(function (global) {\n  global." +
      name +
      " = " +
      JSON.stringify(ctx[name]) +
      ";\n})(typeof window !== \"undefined\" ? window : globalThis);\n"
  ).join("");
  const dest = path.join(root, "openings.js");
  const tmp = dest + ".tmp";
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, dest);
  console.log("gravado", dest);
  engine.processCommand("quit");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
