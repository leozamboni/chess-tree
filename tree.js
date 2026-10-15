(function () {
  const BOARD = 168;
  const GAP_X = 28;
  const GAP_Y = 36;
  const LABEL = 68;

  let scale = 1;
  let layout = { w: 0, h: 0 };
  let boardSeq = 0;
  let orientation = "white";
  const MIN_SCALE = 0.3;
  const MAX_SCALE = 2.5;

  function clone(node) {
    return {
      name: node.name,
      moves: node.moves.slice(),
      children: (node.children || []).map(clone),
      open: true,
    };
  }

  function lineMoves(node, prefix, depth) {
    node.open = depth < 1;
    node.line = prefix.concat(node.moves);
    try {
      node.pos = Chess.play(node.line);
      node.error = null;
    } catch (err) {
      node.pos = null;
      node.error = err.message + " em " + node.line.join(" ");
      console.error(node.name, node.error);
    }
    node.children.forEach((child) => lineMoves(child, node.line, depth + 1));
  }

  function visibleChildren(node) {
    return node.open ? node.children : [];
  }

  function measure(node) {
    const kids = visibleChildren(node);
    kids.forEach(measure);
    if (!kids.length) {
      node.subtreeW = BOARD;
      return;
    }
    const sum = kids.reduce((s, c) => s + c.subtreeW, 0) + GAP_X * (kids.length - 1);
    node.subtreeW = Math.max(BOARD, sum);
  }

  function place(node, left, top) {
    node.x = left + (node.subtreeW - BOARD) / 2;
    node.y = top;
    const kids = visibleChildren(node);
    if (!kids.length) return;
    const sum = kids.reduce((s, c) => s + c.subtreeW, 0) + GAP_X * (kids.length - 1);
    let x = left + (node.subtreeW - sum) / 2;
    const y = top + BOARD + LABEL + GAP_Y;
    kids.forEach((child) => {
      place(child, x, y);
      x += child.subtreeW + GAP_X;
    });
  }

  function toFen(pos) {
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

  function boardEl(pos) {
    const wrap = document.createElement("div");
    wrap.className = "board-wrap";
    const board = document.createElement("div");
    board.className = "cb";
    board.id = "cb" + ++boardSeq;
    if (pos) board.dataset.fen = toFen(pos);
    wrap.appendChild(board);
    return wrap;
  }

  function mountBoards(rootEl) {
    rootEl.querySelectorAll(".cb").forEach((board) => {
      if (!board.dataset.fen) return;
      Chessboard(board.id, {
        position: board.dataset.fen,
        orientation: orientation,
        pieceTheme: "vendor/pieces/{piece}.png",
        showNotation: false,
        draggable: false,
      });
    });
  }

  function applyScale() {
    const host = document.getElementById("tree");
    const scaler = document.getElementById("scaler");
    host.style.width = layout.w + "px";
    host.style.height = layout.h + "px";
    host.style.transform = "scale(" + scale + ")";
    scaler.style.width = layout.w * scale + "px";
    scaler.style.height = layout.h * scale + "px";
    document.getElementById("zoom-label").textContent = Math.round(scale * 100) + "%";
  }

  function zoomAt(next, clientX, clientY) {
    const view = document.getElementById("view");
    const rect = view.getBoundingClientRect();
    const prev = scale;
    const target = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    if (target === prev) return;
    const px = clientX - rect.left + view.scrollLeft;
    const py = clientY - rect.top + view.scrollTop;
    scale = target;
    applyScale();
    const ratio = scale / prev;
    view.scrollLeft = px * ratio - (clientX - rect.left);
    view.scrollTop = py * ratio - (clientY - rect.top);
  }

  function renderNode(node, layer, lines) {
    const el = document.createElement("div");
    el.className = "node";
    el.style.left = node.x + "px";
    el.style.top = node.y + "px";

    const board = boardEl(node.pos);
    const hit = document.createElement("div");
    hit.className = "board-hit";
    hit.title = node.children.length ? (node.open ? "Fechar ramos" : "Abrir ramos") : "Calcular continuação";
    hit.addEventListener("click", () => {
      if (node.loading) return;
      if (node.children.length) {
        node.open = !node.open;
        draw();
        return;
      }
      expandWithEngine(node);
    });
    board.appendChild(hit);
    el.appendChild(board);

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = node.name + (node.children.length && !node.open ? " (+)" : "");
    el.appendChild(name);

    const moves = document.createElement("div");
    moves.className = "moves";
    moves.textContent = node.status || node.error || node.line.join(" ");
    el.appendChild(moves);

    layer.appendChild(el);

    if (node.open) {
      const x1 = node.x + BOARD / 2;
      const y1 = node.y + BOARD + LABEL;
      node.children.forEach((child) => {
        lines.push({ x1, y1, x2: child.x + BOARD / 2, y2: child.y });
        renderNode(child, layer, lines);
      });
    }
  }

  const OPENINGS = {
    sicilian: { title: "Defesa Siciliana", tree: SICILIAN },
    scandinavian: { title: "Defesa Escandinava", tree: SCANDINAVIAN },
    spanish: { title: "Abertura Espanhola", tree: SPANISH },
  };

  let root;
  let generation = 0;
  const host = document.getElementById("tree");

  function draw() {
    const view = document.getElementById("view");
    const scrollLeft = view.scrollLeft;
    const scrollTop = view.scrollTop;
    measure(root);
    place(root, 0, 0);
    let maxX = 0;
    let maxY = 0;
    (function walk(n) {
      maxX = Math.max(maxX, n.x + BOARD);
      maxY = Math.max(maxY, n.y + BOARD + LABEL);
      if (n.open) n.children.forEach(walk);
    })(root);

    layout = { w: maxX + 24, h: maxY + 24 };
    host.innerHTML = "";
    applyScale();

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = "links";
    svg.setAttribute("width", layout.w);
    svg.setAttribute("height", layout.h);
    const lines = [];
    const layer = document.createElement("div");
    renderNode(root, layer, lines);
    lines.forEach((ln) => {
      const mid = ln.y1 + (ln.y2 - ln.y1) / 2;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      path.setAttribute("points", ln.x1 + "," + ln.y1 + " " + ln.x1 + "," + mid + " " + ln.x2 + "," + mid + " " + ln.x2 + "," + ln.y2);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "#111");
      path.setAttribute("stroke-width", "1");
      svg.appendChild(path);
    });
    host.appendChild(svg);
    host.appendChild(layer);
    mountBoards(host);
    view.scrollLeft = scrollLeft;
    view.scrollTop = scrollTop;
  }

  const view = document.getElementById("view");

  function updateFlipButton() {
    const flip = document.getElementById("flip");
    const blackAtBottom = orientation === "black";
    flip.textContent = blackAtBottom ? "Brancas embaixo" : "Pretas embaixo";
    flip.title = blackAtBottom ? "Colocar as brancas embaixo" : "Colocar as pretas embaixo";
  }

  function showOpening(id) {
    const opening = OPENINGS[id];
    orientation = /^defesa\b/i.test(opening.title) ? "black" : "white";
    updateFlipButton();
    generation++;
    root = clone(opening.tree);
    lineMoves(root, [], 0);
    document.title = opening.title;
    draw();
    view.scrollLeft = Math.max(0, (root.x + BOARD / 2) * scale - view.clientWidth / 2);
    view.scrollTop = 0;
  }

  document.getElementById("opening").addEventListener("change", (event) => {
    showOpening(event.target.value);
  });
  showOpening(document.getElementById("opening").value);

  document.getElementById("flip").addEventListener("click", () => {
    orientation = orientation === "black" ? "white" : "black";
    updateFlipButton();
    draw();
  });

  document.getElementById("zoom-in").addEventListener("click", () => zoomAt(scale * 1.2, viewCenter().x, viewCenter().y));
  document.getElementById("zoom-out").addEventListener("click", () => zoomAt(scale / 1.2, viewCenter().x, viewCenter().y));
  view.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAt(scale * factor, event.clientX, event.clientY);
    },
    { passive: false }
  );

  const pointers = new Map();
  let drag = null;
  let pinch = null;
  let ignoreClick = false;

  function pinchPoints() {
    return [...pointers.values()];
  }

  view.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      drag = null;
      view.classList.remove("dragging");
      const [a, b] = pinchPoints();
      pinch = {
        dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        scale: scale,
      };
      ignoreClick = true;
      return;
    }
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: view.scrollLeft,
      top: view.scrollTop,
      moved: false,
    };
  });
  view.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      const [a, b] = pinchPoints();
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (!pinch) {
        pinch = { dist: Math.max(1, dist), scale: scale };
      }
      zoomAt(pinch.scale * (dist / pinch.dist), (a.x + b.x) / 2, (a.y + b.y) / 2);
      ignoreClick = true;
      return;
    }
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    view.classList.add("dragging");
    const selection = window.getSelection();
    if (selection) selection.removeAllRanges();
    view.scrollLeft = drag.left - dx;
    view.scrollTop = drag.top - dy;
  });
  function endDrag(event) {
    const wasPinch = pointers.size >= 2;
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && event.pointerId === drag.id) {
      ignoreClick = drag.moved || wasPinch;
      drag = null;
      view.classList.remove("dragging");
    }
    if (wasPinch) ignoreClick = true;
    if (pointers.size === 1) {
      const [id, point] = [...pointers.entries()][0];
      drag = {
        id: id,
        x: point.x,
        y: point.y,
        left: view.scrollLeft,
        top: view.scrollTop,
        moved: true,
      };
    }
  }
  view.addEventListener("pointerup", endDrag);
  view.addEventListener("pointercancel", endDrag);
  view.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches.length >= 2) event.preventDefault();
    },
    { passive: false }
  );
  ["gesturestart", "gesturechange", "gestureend"].forEach((type) => {
    view.addEventListener(type, (event) => event.preventDefault());
  });
  view.addEventListener(
    "click",
    (event) => {
      if (!ignoreClick) return;
      ignoreClick = false;
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );

  function moveLabel(ply, san) {
    const n = Math.floor(ply / 2) + 1;
    return (ply % 2 === 0 ? n + ". " : n + "...") + san;
  }

  function scoreText(cp, mate) {
    if (mate != null && mate !== undefined) return mate > 0 ? "+M" + mate : "-M" + Math.abs(mate);
    if (cp == null || cp === undefined) return "";
    return (cp >= 0 ? "+" : "") + (cp / 100).toFixed(2);
  }

  function bindNode(node, prefix) {
    node.line = prefix.concat(node.moves);
    node.open = false;
    node.children = node.children || [];
    try {
      node.pos = Chess.play(node.line);
      node.error = null;
    } catch (err) {
      node.pos = null;
      node.error = err.message;
    }
  }

  let stockfish = null;
  let stockfishReady = null;
  let engineChain = Promise.resolve();

  function stockfishWorker() {
    if (!stockfishReady) {
      stockfish = new Worker("vendor/stockfish-19-lite-single.js");
      stockfishReady = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("A IA local não iniciou")), 20000);
        const onMessage = (event) => {
          if (String(event.data).indexOf("uciok") !== -1) {
            stockfish.removeEventListener("message", onMessage);
            clearTimeout(timer);
            resolve(stockfish);
          }
        };
        stockfish.addEventListener("message", onMessage);
        stockfish.addEventListener("error", () => {
          clearTimeout(timer);
          reject(new Error("A IA local não carregou"));
        });
        stockfish.postMessage("uci");
      });
    }
    return stockfishReady;
  }

  function stockfishMoves(fen, whiteToMove) {
    const run = () =>
      stockfishWorker().then(
        (worker) =>
          new Promise((resolve, reject) => {
            const pvs = {};
            const timer = setTimeout(() => {
              worker.removeEventListener("message", onMessage);
              reject(new Error("A IA demorou demais"));
            }, 20000);
            const onMessage = (event) => {
              const text = String(event.data || "");
              if (text.indexOf(" pv ") !== -1) {
                const mp = /multipv (\d+)/.exec(text);
                const pv = / pv ([a-h][1-8][a-h][1-8][qrbn]?)/.exec(text);
                const cp = /score cp (-?\d+)/.exec(text);
                const mate = /score mate (-?\d+)/.exec(text);
                if (mp && pv) {
                  let centi = cp ? Number(cp[1]) : null;
                  let mateN = mate ? Number(mate[1]) : null;
                  if (!whiteToMove) {
                    if (centi != null) centi = -centi;
                    if (mateN != null) mateN = -mateN;
                  }
                  pvs[mp[1]] = { uci: pv[1], cp: centi, mate: mateN };
                }
              }
              if (text.indexOf("bestmove") === 0) {
                clearTimeout(timer);
                worker.removeEventListener("message", onMessage);
                resolve(Object.keys(pvs).sort((a, b) => Number(a) - Number(b)).map((key) => pvs[key]));
              }
            };
            worker.addEventListener("message", onMessage);
            worker.postMessage("setoption name MultiPV value 4");
            worker.postMessage("position fen " + fen);
            worker.postMessage("go depth 12");
          })
      );
    const job = engineChain.then(run, run);
    engineChain = job.then(
      () => {},
      () => {}
    );
    return job;
  }

  async function suggestMoves(node) {
    const fen = Chess.fullFen(node.pos, node.line.length);
    try {
      const response = await fetch("https://lichess.org/api/cloud-eval?multiPv=4&fen=" + encodeURIComponent(fen));
      if (response.ok) {
        const data = await response.json();
        if (data.pvs && data.pvs.length) {
          return data.pvs
            .map((pv) => ({
              uci: (pv.moves || "").split(" ")[0],
              cp: pv.cp,
              mate: pv.mate,
            }))
            .filter((pv) => pv.uci);
        }
      }
    } catch (err) {
      /* a IA local calcula se a nuvem não tiver a posição */
    }
    return stockfishMoves(fen, node.pos.white);
  }

  function expandWithEngine(node) {
    if (!node.pos) return;
    const gen = generation;
    node.loading = true;
    node.status = "Calculando continuação…";
    draw();
    suggestMoves(node)
      .then((pvs) => {
        if (gen !== generation) return;
        node.loading = false;
        node.status = null;
        pvs.forEach((pv) => {
          let san;
          try {
            san = Chess.uciToSan(node.pos, pv.uci);
          } catch (err) {
            return;
          }
          if (node.children.some((child) => child.moves[0] === san)) return;
          const score = scoreText(pv.cp, pv.mate);
          const child = {
            name: "🐟 · " + moveLabel(node.line.length, san) + (score ? "  " + score : ""),
            moves: [san],
            children: [],
            engine: true,
          };
          bindNode(child, node.line);
          node.children.push(child);
        });
        if (!node.children.length) node.status = "A IA não encontrou continuação.";
        else node.open = true;
        draw();
      })
      .catch((err) => {
        if (gen !== generation) return;
        node.loading = false;
        node.status = err.message || "Não foi possível calcular a continuação.";
        draw();
      });
  }

  function viewCenter() {
    const rect = view.getBoundingClientRect();
    return { x: rect.left + view.clientWidth / 2, y: rect.top + view.clientHeight / 2 };
  }
})();
