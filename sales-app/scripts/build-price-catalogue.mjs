// Run after any approved private cost update. Public output is an allow-list.
import {pricing,VERSION,inputs} from '../netlify/functions/lib/pricing-policy.mjs';
import fs from 'node:fs';
if(!inputs) throw new Error('Set the private VERISKO_PRICING_BUDGET before generating prices.');
fs.writeFileSync(new URL('../price-catalogue.js',import.meta.url),'globalThis.VeriskoPriceCatalogue = '+JSON.stringify({version:VERSION,catalogue:pricing.publicPackages()},null,2)+';\n');
