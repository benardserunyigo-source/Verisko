// Active purchase costs live in a function-scoped Netlify secret, not public Git.
import '../../../pricing.js';
import '../../../price-catalogue.js';
export const VERSION = '2026-10-18-cfo4300';
let budget;
try { budget = JSON.parse(process.env.VERISKO_PRICING_BUDGET || 'null'); } catch { budget = null; }
export const policy = budget?.policy || {};
export const packages = Object.fromEntries(Object.entries(budget?.basis || {}).map(([n,p]) => [n,{...p,direct:p.importedUsd*policy.fx+p.local+p.crew+p.pickup}]));
export const storage = Object.fromEntries(Object.entries(budget?.storageUsd || {}).map(([k,v]) => [k,v*policy.fx]));
export const inputs = budget?.version === VERSION ? {version:VERSION,policy,packages,storage} : null;
export const pricing = globalThis.createVeriskoPricing(inputs || globalThis.VeriskoPriceCatalogue);
