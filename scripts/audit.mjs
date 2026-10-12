import {auditCards} from "../src/card-audit.js";
const report=auditCards();
console.log("ROGUE CARDS / PHASE 5 EDITORIAL AUDIT");
console.log(JSON.stringify(report,null,2));
if(report.malformedRolls.length||report.duplicateCardIDs.length||report.brokenReferences.length){
 console.error("Found broken cards; see report.");
 process.exitCode=1;
}
