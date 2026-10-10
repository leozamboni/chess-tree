/* Aplica lances em notação algébrica e devolve a posição. */
(function (global) {
  const START_FEN_BOARD = [
    "rnbqkbnr",
    "pppppppp",
    "........",
    "........",
    "........",
    "........",
    "PPPPPPPP",
    "RNBQKBNR",
  ];

  function cloneBoard(board) {
    return board.map((row) => row.slice());
  }

  function startPosition() {
    return {
      board: START_FEN_BOARD.map((row) => row.split("")),
      white: true,
      castle: { K: true, Q: true, k: true, q: true },
      ep: null,
    };
  }

  function fileOf(ch) {
    return ch.charCodeAt(0) - 97;
  }

  function isWhite(p) {
    return p !== "." && p === p.toUpperCase();
  }

  function isBlack(p) {
    return p !== "." && p === p.toLowerCase();
  }

  function sameSide(piece, white) {
    return white ? isWhite(piece) : isBlack(piece);
  }

  function enemy(piece, white) {
    return piece !== "." && !sameSide(piece, white);
  }

  function inBounds(f, r) {
    return f >= 0 && f < 8 && r >= 0 && r < 8;
  }

  function findKing(pos, white) {
    const target = white ? "K" : "k";
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        if (pos.board[r][f] === target) return { f, r };
      }
    }
    return null;
  }

  function attacked(pos, f, r, byWhite) {
    const b = pos.board;
    const pawnDir = byWhite ? 1 : -1;
    for (const df of [-1, 1]) {
      const pf = f + df;
      const pr = r + pawnDir;
      if (inBounds(pf, pr)) {
        const p = b[pr][pf];
        if (p === (byWhite ? "P" : "p")) return true;
      }
    }
    const knight = [
      [1, 2],
      [2, 1],
      [-1, 2],
      [-2, 1],
      [1, -2],
      [2, -1],
      [-1, -2],
      [-2, -1],
    ];
    for (const [df, dr] of knight) {
      const nf = f + df;
      const nr = r + dr;
      if (inBounds(nf, nr) && b[nr][nf] === (byWhite ? "N" : "n")) return true;
    }
    const king = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    for (const [df, dr] of king) {
      const kf = f + df;
      const kr = r + dr;
      if (inBounds(kf, kr) && b[kr][kf] === (byWhite ? "K" : "k")) return true;
    }
    const rays = [
      [1, 0, "RQ"],
      [-1, 0, "RQ"],
      [0, 1, "RQ"],
      [0, -1, "RQ"],
      [1, 1, "BQ"],
      [1, -1, "BQ"],
      [-1, 1, "BQ"],
      [-1, -1, "BQ"],
    ];
    for (const [df, dr, kinds] of rays) {
      let nf = f + df;
      let nr = r + dr;
      while (inBounds(nf, nr)) {
        const p = b[nr][nf];
        if (p !== ".") {
          if (sameSide(p, byWhite) && kinds.includes(p.toUpperCase())) return true;
          break;
        }
        nf += df;
        nr += dr;
      }
    }
    return false;
  }

  function inCheck(pos, white) {
    const k = findKing(pos, white);
    if (!k) return false;
    return attacked(pos, k.f, k.r, !white);
  }

  function pushMove(list, pos, from, to, promo) {
    const b = pos.board;
    const piece = b[from.r][from.f];
    const captured = b[to.r][to.f];
    const next = {
      board: cloneBoard(b),
      white: !pos.white,
      castle: { ...pos.castle },
      ep: null,
    };
    next.board[to.r][to.f] = promo || piece;
    next.board[from.r][from.f] = ".";

    const upper = piece.toUpperCase();
    if (upper === "K") {
      if (pos.white) {
        next.castle.K = false;
        next.castle.Q = false;
      } else {
        next.castle.k = false;
        next.castle.q = false;
      }
      if (Math.abs(to.f - from.f) === 2) {
        const rookFrom = to.f === 6 ? 7 : 0;
        const rookTo = to.f === 6 ? 5 : 3;
        const rook = pos.white ? "R" : "r";
        next.board[from.r][rookFrom] = ".";
        next.board[from.r][rookTo] = rook;
      }
    }
    if (upper === "R") {
      if (from.r === 7 && from.f === 7) next.castle.K = false;
      if (from.r === 7 && from.f === 0) next.castle.Q = false;
      if (from.r === 0 && from.f === 7) next.castle.k = false;
      if (from.r === 0 && from.f === 0) next.castle.q = false;
    }
    if (captured === "R" && to.r === 7 && to.f === 7) next.castle.K = false;
    if (captured === "R" && to.r === 7 && to.f === 0) next.castle.Q = false;
    if (captured === "r" && to.r === 0 && to.f === 7) next.castle.k = false;
    if (captured === "r" && to.r === 0 && to.f === 0) next.castle.q = false;

    if (upper === "P" && Math.abs(to.r - from.r) === 2) {
      next.ep = { f: from.f, r: (from.r + to.r) / 2 };
    }
    if (upper === "P" && captured === "." && from.f !== to.f && pos.ep && to.f === pos.ep.f && to.r === pos.ep.r) {
      const capR = pos.white ? to.r + 1 : to.r - 1;
      next.board[capR][to.f] = ".";
    }

    if (!inCheck(next, pos.white)) list.push({ from, to, promo: promo || null, pos: next });
  }

  function addSlider(list, pos, from, dirs) {
    const b = pos.board;
    for (const [df, dr] of dirs) {
      let f = from.f + df;
      let r = from.r + dr;
      while (inBounds(f, r)) {
        const occ = b[r][f];
        if (occ === ".") pushMove(list, pos, from, { f, r });
        else {
          if (enemy(occ, pos.white)) pushMove(list, pos, from, { f, r });
          break;
        }
        f += df;
        r += dr;
      }
    }
  }

  function legalMoves(pos) {
    const list = [];
    const b = pos.board;
    const dir = pos.white ? -1 : 1;
    const startRank = pos.white ? 6 : 1;
    const promoRank = pos.white ? 0 : 7;
    const promos = pos.white ? ["Q", "R", "B", "N"] : ["q", "r", "b", "n"];

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = b[r][f];
        if (!sameSide(p, pos.white)) continue;
        const from = { f, r };
        const kind = p.toUpperCase();
        if (kind === "P") {
          const r1 = r + dir;
          if (inBounds(f, r1) && b[r1][f] === ".") {
            if (r1 === promoRank) {
              for (const promo of promos) pushMove(list, pos, from, { f, r: r1 }, promo);
            } else {
              pushMove(list, pos, from, { f, r: r1 });
              const r2 = r + 2 * dir;
              if (r === startRank && b[r2][f] === ".") pushMove(list, pos, from, { f, r: r2 });
            }
          }
          for (const df of [-1, 1]) {
            const cf = f + df;
            const cr = r + dir;
            if (!inBounds(cf, cr)) continue;
            if (enemy(b[cr][cf], pos.white)) {
              if (cr === promoRank) {
                for (const promo of promos) pushMove(list, pos, from, { f: cf, r: cr }, promo);
              } else pushMove(list, pos, from, { f: cf, r: cr });
            } else if (pos.ep && pos.ep.f === cf && pos.ep.r === cr && b[cr][cf] === ".") {
              pushMove(list, pos, from, { f: cf, r: cr });
            }
          }
        } else if (kind === "N") {
          for (const [df, dr] of [
            [1, 2],
            [2, 1],
            [-1, 2],
            [-2, 1],
            [1, -2],
            [2, -1],
            [-1, -2],
            [-2, -1],
          ]) {
            const nf = f + df;
            const nr = r + dr;
            if (inBounds(nf, nr) && (b[nr][nf] === "." || enemy(b[nr][nf], pos.white))) {
              pushMove(list, pos, from, { f: nf, r: nr });
            }
          }
        } else if (kind === "B") {
          addSlider(list, pos, from, [
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
          ]);
        } else if (kind === "R") {
          addSlider(list, pos, from, [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]);
        } else if (kind === "Q") {
          addSlider(list, pos, from, [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
          ]);
        } else if (kind === "K") {
          for (const [df, dr] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
          ]) {
            const nf = f + df;
            const nr = r + dr;
            if (inBounds(nf, nr) && (b[nr][nf] === "." || enemy(b[nr][nf], pos.white))) {
              pushMove(list, pos, from, { f: nf, r: nr });
            }
          }
          const home = pos.white ? 7 : 0;
          const side = pos.white;
          if (r === home && f === 4 && !inCheck(pos, side)) {
            const kingside = side ? pos.castle.K : pos.castle.k;
            const queenside = side ? pos.castle.Q : pos.castle.q;
            if (kingside && b[home][5] === "." && b[home][6] === "." && !attacked(pos, 5, home, !side) && !attacked(pos, 6, home, !side)) {
              pushMove(list, pos, from, { f: 6, r: home });
            }
            if (
              queenside &&
              b[home][3] === "." &&
              b[home][2] === "." &&
              b[home][1] === "." &&
              !attacked(pos, 3, home, !side) &&
              !attacked(pos, 2, home, !side)
            ) {
              pushMove(list, pos, from, { f: 2, r: home });
            }
          }
        }
      }
    }
    return list;
  }

  function parseSan(san) {
    let s = san.replace(/[!?+#]/g, "").trim();
    if (s === "O-O" || s === "0-0") return { castle: "K" };
    if (s === "O-O-O" || s === "0-0-0") return { castle: "Q" };
    const m = s.match(/^([NBRQK])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=([NBRQ]))?$/);
    if (!m) throw new Error("Lance inválido: " + san);
    return {
      piece: m[1] || "P",
      disFile: m[2] ? fileOf(m[2]) : null,
      disRank: m[3] ? 8 - Number(m[3]) : null,
      capture: Boolean(m[4]),
      toFile: fileOf(m[5][0]),
      toRank: 8 - Number(m[5][1]),
      promo: m[6] || null,
    };
  }

  function applySan(pos, san) {
    const spec = parseSan(san);
    const moves = legalMoves(pos);
    let found;
    if (spec.castle) {
      const home = pos.white ? 7 : 0;
      const toF = spec.castle === "K" ? 6 : 2;
      found = moves.find((mv) => mv.from.r === home && mv.from.f === 4 && mv.to.f === toF && mv.to.r === home);
    } else {
      found = moves.find((mv) => {
        if (mv.to.f !== spec.toFile || mv.to.r !== spec.toRank) return false;
        const piece = pos.board[mv.from.r][mv.from.f];
        if (piece.toUpperCase() !== spec.piece) return false;
        if (spec.disFile !== null && mv.from.f !== spec.disFile) return false;
        if (spec.disRank !== null && mv.from.r !== spec.disRank) return false;
        if (spec.promo) {
          const want = pos.white ? spec.promo : spec.promo.toLowerCase();
          if (mv.promo !== want) return false;
        }
        return true;
      });
    }
    if (!found) throw new Error("Lance ilegal: " + san);
    return found.pos;
  }

  function play(moves) {
    let pos = startPosition();
    for (const san of moves) pos = applySan(pos, san);
    return pos;
  }

  function squareName(f, r) {
    return String.fromCharCode(97 + f) + (8 - r);
  }

  function placementFen(pos) {
    return pos.board
      .map((row) => {
        let out = "";
        let empty = 0;
        for (let f = 0; f < 8; f++) {
          if (row[f] === ".") empty++;
          else {
            if (empty) out += empty;
            empty = 0;
            out += row[f];
          }
        }
        if (empty) out += empty;
        return out;
      })
      .join("/");
  }

  function epSquare(pos) {
    if (!pos.ep) return "-";
    const pawnRank = pos.white ? pos.ep.r + 1 : pos.ep.r - 1;
    const pawn = pos.white ? "P" : "p";
    if (pawnRank < 0 || pawnRank > 7) return "-";
    for (const df of [-1, 1]) {
      const f = pos.ep.f + df;
      if (f >= 0 && f < 8 && pos.board[pawnRank][f] === pawn) return squareName(pos.ep.f, pos.ep.r);
    }
    return "-";
  }

  function fullFen(pos, ply) {
    let castle = "";
    if (pos.castle.K) castle += "K";
    if (pos.castle.Q) castle += "Q";
    if (pos.castle.k) castle += "k";
    if (pos.castle.q) castle += "q";
    if (!castle) castle = "-";
    const ep = epSquare(pos);
    const fullmove = Math.floor((ply || 0) / 2) + 1;
    return placementFen(pos) + " " + (pos.white ? "w" : "b") + " " + castle + " " + ep + " 0 " + fullmove;
  }

  function moveToSan(pos, mv) {
    const piece = pos.board[mv.from.r][mv.from.f];
    const kind = piece.toUpperCase();
    const dest = squareName(mv.to.f, mv.to.r);
    const capture = pos.board[mv.to.r][mv.to.f] !== "." || (kind === "P" && mv.from.f !== mv.to.f);
    let san;
    if (kind === "K" && Math.abs(mv.to.f - mv.from.f) === 2) {
      san = mv.to.f === 6 ? "O-O" : "O-O-O";
    } else if (kind === "P") {
      san = (capture ? squareName(mv.from.f, mv.from.r)[0] + "x" : "") + dest;
      if (mv.promo) san += "=" + mv.promo.toUpperCase();
    } else {
      san = kind;
      const rivals = legalMoves(pos).filter(
        (m) =>
          pos.board[m.from.r][m.from.f].toUpperCase() === kind &&
          m.to.f === mv.to.f &&
          m.to.r === mv.to.r &&
          (m.from.f !== mv.from.f || m.from.r !== mv.from.r)
      );
      if (rivals.length) {
        const sameFile = rivals.some((m) => m.from.f === mv.from.f);
        const sameRank = rivals.some((m) => m.from.r === mv.from.r);
        if (!sameFile) san += squareName(mv.from.f, mv.from.r)[0];
        else if (!sameRank) san += squareName(mv.from.f, mv.from.r)[1];
        else san += squareName(mv.from.f, mv.from.r);
      }
      if (capture) san += "x";
      san += dest;
    }
    if (inCheck(mv.pos, mv.pos.white)) {
      san += legalMoves(mv.pos).length ? "+" : "#";
    }
    return san;
  }

  function uciToSan(pos, uci) {
    const fromF = uci.charCodeAt(0) - 97;
    const fromR = 8 - Number(uci[1]);
    const toF = uci.charCodeAt(2) - 97;
    const toR = 8 - Number(uci[3]);
    const promo = uci[4] ? uci[4].toLowerCase() : null;
    const moves = legalMoves(pos).filter((m) => m.from.f === fromF && m.from.r === fromR && m.to.f === toF && m.to.r === toR);
    const mv = promo
      ? moves.find((m) => m.promo && m.promo.toLowerCase() === promo)
      : moves.find((m) => !m.promo) || moves[0];
    if (!mv) throw new Error("Lance inválido: " + uci);
    return moveToSan(pos, mv);
  }

  global.Chess = { startPosition, play, applySan, legalMoves, squareName, fullFen, uciToSan };
})(typeof window !== "undefined" ? window : globalThis);
