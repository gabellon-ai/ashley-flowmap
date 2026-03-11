/**
 * generateFlowData.cjs
 * Parses the Excel source and outputs src/flowData.js with:
 *   STATIONS, MACHINE_GROUPS, DEPARTMENTS, OPERATIONS, FLOW_DATA
 *
 * FLOW_DATA includes department / group / station / operation level
 * nodes and edges per product class (+ ALL PRODUCTS aggregate).
 *
 * Usage:  node scripts/generateFlowData.cjs
 */

const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

// ── Paths ──────────────────────────────────────────────────
const EXCEL_PATH = path.resolve(
  "C:/Users/Bello/OneDrive/Documents/Ashley/Casegoods Fab Datav_2.xlsx"
);
const OUT_PATH = path.join(__dirname, "..", "src", "flowData.js");

// ── Read Excel ─────────────────────────────────────────────
console.log("Reading Excel…");
const wb = XLSX.readFile(EXCEL_PATH);
const ws = wb.Sheets["Fab data"];
const rows = XLSX.utils.sheet_to_json(ws);
console.log(`  ${rows.length} rows`);

// ── Station → department / group mapping ───────────────────
// Build from existing knowledge embedded in the original flowData.js
// We'll derive groups from the data plus a manual prefix→dept mapping.
const prefixToDept = {
  CS: "SAW", CE: "EDGE / FOIL", CB: "DRILL", CR: "ROUTER",
  CD: "DOVETAIL", CF: "FINISH", CA: "ASSEMBLY", CP: "PRESS / MISC",
  CT: "CUT / PROFILE", CV: "HARDWARE",
};

function guessDept(wkctr) {
  if (!wkctr) return "OTHER";
  const upper = String(wkctr).toUpperCase();
  // Staging codes end with RIS
  if (upper.endsWith("RIS")) return "STAGING";
  const prefix = upper.substring(0, 2);
  return prefixToDept[prefix] || "OTHER";
}

// ── Build station metadata from rows ───────────────────────
const stationMap = {}; // id → { id, department, group, description }
const stationOpdscSet = {}; // wkctr → Set of OPDSC

rows.forEach((r) => {
  const wkctr = r.WKCTR ? String(r.WKCTR).trim() : null;
  if (!wkctr) return;
  if (!stationMap[wkctr]) {
    stationMap[wkctr] = {
      id: wkctr,
      department: guessDept(wkctr),
      group: "",       // filled below
      description: "", // filled below
    };
    stationOpdscSet[wkctr] = new Set();
  }
  if (r.OPDSC) stationOpdscSet[wkctr].add(String(r.OPDSC).trim());
});

// ── Try to load existing station metadata for descriptions/groups ─
// Read the current flowData.js to pull descriptions & groups
try {
  const existing = fs.readFileSync(
    path.join(__dirname, "..", "src", "flowData.js"),
    "utf8"
  );
  // Quick parse: extract STATIONS object
  const stMatch = existing.match(
    /export const STATIONS\s*=\s*(\{[\s\S]*?\n\};)/
  );
  if (stMatch) {
    // eslint-disable-next-line no-eval
    const parsed = new Function("return " + stMatch[1].replace(/;\s*$/, ""))();
    for (const [id, obj] of Object.entries(parsed)) {
      if (stationMap[id]) {
        stationMap[id].department = obj.department || stationMap[id].department;
        stationMap[id].group = obj.group || "";
        stationMap[id].description = obj.description || "";
      }
    }
  }
  // Extract MACHINE_GROUPS for group assignments
  const mgMatch = existing.match(
    /export const MACHINE_GROUPS\s*=\s*(\{[\s\S]*?\n\};)/
  );
  if (mgMatch) {
    const parsed = new Function("return " + mgMatch[1].replace(/;\s*$/, ""))();
    for (const [gName, gObj] of Object.entries(parsed)) {
      if (gObj.stations) {
        gObj.stations.forEach((sid) => {
          if (stationMap[sid]) {
            stationMap[sid].group = gName;
          }
        });
      }
    }
  }
} catch (e) {
  console.warn("Could not read existing flowData.js for station metadata:", e.message);
}

// Fill missing descriptions from most common OPDSC for that station
for (const [id, meta] of Object.entries(stationMap)) {
  if (!meta.description) meta.description = id;
  if (!meta.group) meta.group = meta.department;
}

// ── Build MACHINE_GROUPS ───────────────────────────────────
const groupMap = {}; // groupName → { id, department, stations: [] }
for (const [id, meta] of Object.entries(stationMap)) {
  const gName = meta.group || meta.department;
  if (!groupMap[gName]) {
    groupMap[gName] = { id: gName, department: meta.department, stations: [] };
  }
  if (!groupMap[gName].stations.includes(id)) {
    groupMap[gName].stations.push(id);
  }
}

// ── Build DEPARTMENTS ──────────────────────────────────────
const deptSet = new Set(Object.values(stationMap).map((s) => s.department));
const departments = {};
for (const d of [...deptSet].sort()) {
  const count = Object.values(stationMap).filter((s) => s.department === d).length;
  departments[d] = `${count} station${count !== 1 ? "s" : ""}`;
}

// ── Build OPERATIONS ───────────────────────────────────────
// Key: "STATION::OPDSC"
const operationsMap = {}; // compositeId → { station, opdsc, department, group, runLaborSum, setupHoursSum, count }

rows.forEach((r) => {
  const wkctr = r.WKCTR ? String(r.WKCTR).trim() : null;
  const opdsc = r.OPDSC ? String(r.OPDSC).trim() : null;
  if (!wkctr || !opdsc) return;

  const key = `${wkctr}::${opdsc}`;
  if (!operationsMap[key]) {
    const st = stationMap[wkctr] || {};
    operationsMap[key] = {
      station: wkctr,
      opdsc: opdsc,
      department: st.department || "OTHER",
      group: st.group || "",
      runLaborSum: 0,
      setupHoursSum: 0,
      count: 0,
    };
  }
  operationsMap[key].count++;
  operationsMap[key].runLaborSum += Number(r.RUNLB) || 0;
  operationsMap[key].setupHoursSum += Number(r.SULHR) || 0;
});

// Build final OPERATIONS export
const OPERATIONS = {};
for (const [key, op] of Object.entries(operationsMap)) {
  OPERATIONS[key] = {
    station: op.station,
    opdsc: op.opdsc,
    department: op.department,
    group: op.group,
    avgRunLabor: op.count > 0 ? +(op.runLaborSum / op.count).toFixed(4) : 0,
    avgSetupHours: op.count > 0 ? +(op.setupHoursSum / op.count).toFixed(4) : 0,
    routingCount: op.count,
  };
}
console.log(`  ${Object.keys(OPERATIONS).length} unique operations`);

// ── Build FLOW_DATA ────────────────────────────────────────
// Group rows by RTID to form routing sequences
const rtidRows = {}; // RTID → [rows sorted by OPSEQ]
const rtidClass = {}; // RTID → product class name
const rtidDesc = {}; // RTID → ITDSC (item description)
rows.forEach((r) => {
  const rtid = r.RTID ? String(r.RTID).trim() : null;
  if (!rtid) return;
  if (!rtidRows[rtid]) rtidRows[rtid] = [];
  rtidRows[rtid].push(r);
  if (!rtidClass[rtid]) rtidClass[rtid] = getClass(r);
  if (!rtidDesc[rtid] && r.ITDSC) rtidDesc[rtid] = String(r.ITDSC).trim();
});
// Sort each RTID's rows by OPSEQ
for (const rtid of Object.keys(rtidRows)) {
  rtidRows[rtid].sort((a, b) => (Number(a.OPSEQ) || 0) - (Number(b.OPSEQ) || 0));
}

// Get product class for a row
function getClass(r) {
  const cls = r.ITCLS ? String(r.ITCLS).trim() : null;
  // Use Class Description if available
  const desc = r["Class Description"] ? String(r["Class Description"]).trim() : null;
  return desc || cls || "UNKNOWN";
}

// Build per-class data
const classSet = new Set();
rows.forEach((r) => classSet.add(getClass(r)));
const classes = [...classSet].filter((c) => c !== "UNKNOWN").sort();

function buildFlowForClass(filterFn) {
  // Collect RTIDs matching the filter
  const matchRtids = {};
  for (const [rtid, rws] of Object.entries(rtidRows)) {
    if (rws.some(filterFn)) {
      matchRtids[rtid] = rws;
    }
  }

  const totalParts = Object.keys(matchRtids).length;

  // Department-level nodes & edges
  const deptNodes = {};
  const deptEdges = {};
  // Group-level
  const grpNodes = {};
  const grpEdges = {};
  // Station-level
  const stNodes = {};
  const stEdges = {};
  // Operation-level
  const opNodes = {};
  const opEdges = {};

  for (const [rtid, rws] of Object.entries(matchRtids)) {
    const sequence = rws
      .map((r) => ({
        wkctr: r.WKCTR ? String(r.WKCTR).trim() : null,
        opdsc: r.OPDSC ? String(r.OPDSC).trim() : null,
        dept: null,
        group: null,
      }))
      .filter((s) => s.wkctr);

    // Fill dept/group
    sequence.forEach((s) => {
      const meta = stationMap[s.wkctr] || {};
      s.dept = meta.department || guessDept(s.wkctr);
      s.group = meta.group || s.dept;
    });

    // Count nodes
    const seenDept = new Set(), seenGrp = new Set(), seenSt = new Set(), seenOp = new Set();
    sequence.forEach((s) => {
      if (!seenDept.has(s.dept)) { deptNodes[s.dept] = (deptNodes[s.dept] || 0) + 1; seenDept.add(s.dept); }
      if (!seenGrp.has(s.group)) { grpNodes[s.group] = (grpNodes[s.group] || 0) + 1; seenGrp.add(s.group); }
      if (!seenSt.has(s.wkctr)) { stNodes[s.wkctr] = (stNodes[s.wkctr] || 0) + 1; seenSt.add(s.wkctr); }
      if (s.opdsc) {
        const opKey = `${s.wkctr}::${s.opdsc}`;
        if (!seenOp.has(opKey)) { opNodes[opKey] = (opNodes[opKey] || 0) + 1; seenOp.add(opKey); }
      }
    });

    // Count edges (consecutive pairs)
    for (let i = 0; i < sequence.length - 1; i++) {
      const a = sequence[i], b = sequence[i + 1];

      // Dept edges
      if (a.dept !== b.dept) {
        const dk = `${a.dept}|||${b.dept}`;
        deptEdges[dk] = (deptEdges[dk] || 0) + 1;
      }
      // Group edges
      if (a.group !== b.group) {
        const gk = `${a.group}|||${b.group}`;
        grpEdges[gk] = (grpEdges[gk] || 0) + 1;
      }
      // Station edges
      if (a.wkctr !== b.wkctr) {
        const sk = `${a.wkctr}|||${b.wkctr}`;
        stEdges[sk] = (stEdges[sk] || 0) + 1;
      }
      // Operation edges
      if (a.opdsc && b.opdsc) {
        const opA = `${a.wkctr}::${a.opdsc}`;
        const opB = `${b.wkctr}::${b.opdsc}`;
        if (opA !== opB) {
          const ok = `${opA}|||${opB}`;
          opEdges[ok] = (opEdges[ok] || 0) + 1;
        }
      }
    }
  }

  function toNodesEdges(nodeMap, edgeMap) {
    const nodes = Object.entries(nodeMap)
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count);
    const edges = Object.entries(edgeMap)
      .map(([k, count]) => {
        const [from, to] = k.split("|||");
        return { from, to, count };
      })
      .sort((a, b) => b.count - a.count);
    return { nodes, edges };
  }

  return {
    totalParts,
    department: toNodesEdges(deptNodes, deptEdges),
    group: toNodesEdges(grpNodes, grpEdges),
    station: toNodesEdges(stNodes, stEdges),
    operation: toNodesEdges(opNodes, opEdges),
  };
}

console.log("Building FLOW_DATA…");
const FLOW_DATA = {};

// Per-class
for (const cls of classes) {
  FLOW_DATA[cls] = buildFlowForClass((r) => getClass(r) === cls);
}

// ALL PRODUCTS
FLOW_DATA["ALL PRODUCTS"] = buildFlowForClass(() => true);
console.log(`  ${Object.keys(FLOW_DATA).length} product classes`);

// ── Build PARTS_BY_CLASS ──────────────────────────────────
// { className: [ { id: rtid, desc: itdsc }, ... ] } sorted by RTID
console.log("Building PARTS_BY_CLASS…");
const PARTS_BY_CLASS = {};
for (const rtid of Object.keys(rtidRows)) {
  const cls = rtidClass[rtid] || "UNKNOWN";
  if (cls === "UNKNOWN") continue;
  if (!PARTS_BY_CLASS[cls]) PARTS_BY_CLASS[cls] = [];
  PARTS_BY_CLASS[cls].push({ id: rtid, desc: rtidDesc[rtid] || "" });
}
// Sort each class's parts by RTID
for (const cls of Object.keys(PARTS_BY_CLASS)) {
  PARTS_BY_CLASS[cls].sort((a, b) => a.id.localeCompare(b.id));
}
console.log(`  ${Object.keys(PARTS_BY_CLASS).length} classes with parts`);

// ── Build PART_ROUTES ─────────────────────────────────────
// { rtid: [ [wkctr, opdsc], ... ] } — ordered routing sequence per part
console.log("Building PART_ROUTES…");
const PART_ROUTES = {};
for (const [rtid, rws] of Object.entries(rtidRows)) {
  PART_ROUTES[rtid] = rws
    .map((r) => {
      const wkctr = r.WKCTR ? String(r.WKCTR).trim() : null;
      const opdsc = r.OPDSC ? String(r.OPDSC).trim() : "";
      return wkctr ? [wkctr, opdsc] : null;
    })
    .filter(Boolean);
}
console.log(`  ${Object.keys(PART_ROUTES).length} part routes`);

// ── Write output ───────────────────────────────────────────
console.log("Writing src/flowData.js…");

let out = "";
out += "export const STATIONS = " + JSON.stringify(stationMap, null, 2) + ";\n\n";
out += "export const MACHINE_GROUPS = " + JSON.stringify(groupMap, null, 2) + ";\n\n";
out += "export const DEPARTMENTS = " + JSON.stringify(departments, null, 2) + ";\n\n";
out += "export const OPERATIONS = " + JSON.stringify(OPERATIONS, null, 2) + ";\n\n";
out += "export const FLOW_DATA = " + JSON.stringify(FLOW_DATA, null, 2) + ";\n\n";
out += "export const PARTS_BY_CLASS = " + JSON.stringify(PARTS_BY_CLASS) + ";\n\n";
out += "export const PART_ROUTES = " + JSON.stringify(PART_ROUTES) + ";\n";

fs.writeFileSync(OUT_PATH, out, "utf8");
console.log(`Done. ${(out.length / 1024).toFixed(0)} KB written to ${OUT_PATH}`);
