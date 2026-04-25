/**
 * Official production is Vercel (git push / dashboard deploy). Port 3000 is only `npm run dev`.
 * Image upload is POST /api/r2-upload — same code on Vercel; R2 secrets must exist in Vercel env.
 */
console.log(
  "\n[deploy] Production: Vercel (set R2_* + Firebase in Project → Environment Variables → Redeploy).\n" +
    "Local dev: npm run dev uses port 3000 only on your PC — it does not replace Vercel env.\n" +
    "Checklist: npm run vercel:env\n",
);
