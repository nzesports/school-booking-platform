// Rebuilds lib/data/nz-school-directory.json from the Ministry of Education's
// Schools Directory CSV (catalogue.data.govt.nz, "Directory of educational
// institutions"). Only names, addresses and regions are kept: the CSV also
// lists staff contacts, which don't belong in the repo.
//
// Usage: node scripts/build-school-directory.mjs <path-to-schools.csv>
import { readFileSync, writeFileSync } from "node:fs";

const REGION_NAMES = {
  "auckland-central": "Auckland Central",
  "south-auckland": "South Auckland",
  "west-auckland": "West Auckland",
  "east-auckland": "East Auckland",
  "north-shore": "North Shore",
  northland: "Northland",
  hamilton: "Hamilton",
  waikato: "Waikato",
  tauranga: "Tauranga",
  "bay-of-plenty": "Bay of Plenty",
  gisborne: "Gisborne",
  "hawkes-bay": "Hawke's Bay",
  taranaki: "Taranaki",
  "palmerston-north": "Palmerston North",
  "manawatu-whanganui": "Manawatū-Whanganui",
  wellington: "Wellington",
  nelson: "Nelson",
  tasman: "Tasman",
  marlborough: "Marlborough",
  "west-coast": "West Coast",
  christchurch: "Christchurch",
  canterbury: "Canterbury",
  dunedin: "Dunedin",
  queenstown: "Queenstown",
  otago: "Otago",
  southland: "Southland"
};

const AUCKLAND_WARDS = {
  "North Shore Ward": "north-shore",
  "Albany Ward": "north-shore",
  "Rodney Ward": "north-shore",
  "Waitematā and Gulf Ward": "auckland-central",
  "Albert-Eden-Puketāpapa Ward": "auckland-central",
  "Ōrākei Ward": "auckland-central",
  "Maungakiekie-Tāmaki Ward": "auckland-central",
  "Howick Ward": "east-auckland",
  "Waitākere Ward": "west-auckland",
  "Whau Ward": "west-auckland",
  "Manukau Ward": "south-auckland",
  "Manurewa-Papakura Ward": "south-auckland",
  "Franklin Ward": "south-auckland"
};

// Cities with their own region; the rest of each council area uses the next map.
const CITY_REGIONS = {
  "Hamilton City": "hamilton",
  "Tauranga City": "tauranga",
  "Palmerston North City": "palmerston-north",
  "Nelson City": "nelson",
  "Christchurch City": "christchurch",
  "Dunedin City": "dunedin",
  "Queenstown-Lakes District": "queenstown"
};

const COUNCIL_REGIONS = {
  "Northland Region": "northland",
  "Waikato Region": "waikato",
  "Bay of Plenty Region": "bay-of-plenty",
  "Gisborne Region": "gisborne",
  "Hawke's Bay Region": "hawkes-bay",
  "Taranaki Region": "taranaki",
  "Manawatū-Whanganui Region": "manawatu-whanganui",
  "Wellington Region": "wellington",
  "Tasman Region": "tasman",
  "Nelson Region": "nelson",
  "Marlborough Region": "marlborough",
  "West Coast Region": "west-coast",
  "Canterbury Region": "canterbury",
  "Otago Region": "otago",
  "Southland Region": "southland"
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  const headers = rows.shift();
  return rows
    .filter((values) => values.length === headers.length)
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]])));
}

function regionSlugFor(school) {
  if (school.Regional_Council === "Auckland Region") {
    return AUCKLAND_WARDS[school.Ward] ?? null;
  }

  return CITY_REGIONS[school.Territorial_Authority] ?? COUNCIL_REGIONS[school.Regional_Council] ?? null;
}

const csvPath = process.argv[2];

if (!csvPath) {
  throw new Error("Pass the path to the Schools Directory CSV.");
}

const directory = parseCsv(readFileSync(csvPath, "utf8").replace(/^﻿/, ""));
const schools = directory
  .filter((school) => school.Status === "Open")
  .map((school) => [
    school.Org_Name.trim(),
    school.Add1_Line1.trim(),
    school.Add1_Suburb.trim(),
    school.Add1_City.trim(),
    school.Add2_Postal_Code.trim(),
    regionSlugFor(school)
  ])
  .sort((left, right) => left[0].localeCompare(right[0]));

writeFileSync(
  new URL("../lib/data/nz-school-directory.json", import.meta.url),
  `${JSON.stringify({ regions: REGION_NAMES, schools })}\n`
);

const unplaced = schools.filter((school) => !school[5]);
console.log(`${schools.length} schools written, ${unplaced.length} without a region.`);
for (const school of unplaced) console.log(`  ${school[0]} (${school[3]})`);
