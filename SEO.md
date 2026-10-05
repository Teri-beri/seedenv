# SeedEnv Search and Sharing

Root metadata and structured data live in `lib/seo.ts`. Public pages override the
canonical URL, title, and description. `app/opengraph-image.tsx` generates a
1200 x 630 PNG on the Edge runtime; `app/twitter-image.tsx` reuses that artwork.
Next.js automatically adds image URLs, dimensions, content types, and alt text.

## App Icons

The current brand source is `assets/branding/seedenv-source.jpg`. Run
`node scripts/generate-brand-assets.mjs` to regenerate the transparent UI mark,
dark-backed browser/PWA icons, and the embedded social-card mark. Legacy image
URLs contain the same new artwork; UI uses the versioned v3 URL to avoid stale
browser/email caches. `/favicon.ico` is served by `app/favicon.ico`, not a
conflicting public file. Apple artwork is 180 x 180; the main site icon is
576 x 576; ICO frames cover 16, 32, 48, 64, 128, and 256 pixels.

Place approved square brand assets in the App Router directory:

| Asset | Dimensions | Purpose |
| --- | --- | --- |
| `app/favicon.ico` | Include 16 x 16, 32 x 32, and 48 x 48 frames | Browser tabs and search-result favicon |
| `app/icon.png` | 512 x 512 | High-resolution site icon (use 576 x 576 if used as Google's favicon) |
| `app/apple-icon.png` | 180 x 180 | Apple home-screen touch icon |

Next.js discovers these files automatically. Use the existing SeedEnv artwork,
not a framework placeholder. Keep the public manifest's 192 x 192 and 512 x 512
icons for installed web apps. Avoid competing manual icon entries in metadata
once the App Router image files are installed.

## Discovery

`/sitemap.xml` lists `/`, `/explore`, `/pricing`, `/about`, `/terms`, and `/privacy`.
The public footer links these pages so crawlers can discover them naturally.
The mission browser reads active, unexpired campaigns without requiring sign-in.
Robots rules disallow internal account, auth, dashboard, settings, API, and
community routes. Those routes also receive `X-Robots-Tag: noindex, nofollow`.
Neither mechanism is access control; existing authentication remains required.
A blocked crawler cannot read a noindex header. For already-indexed internal
URLs, use Search Console removal or temporarily allow crawling of the noindex
response before blocking it again.

The structured-data free offer describes public browsing only. Paid campaigns
use a fixed 5% platform fee on the tester reward pool; no review scores or unsupported endorsements
are claimed. Existing Terms and Privacy content is preserved with page-specific
metadata. The owner/legal reviewer remains responsible for keeping policies
aligned with the operator, contact channel, retention, rights, refund/dispute
rules, and jurisdiction.

## Release Checks

1. Run ESLint on the changed files and `npm run build:local`.
2. Check canonical, title, description, Open Graph, Twitter, and parsed JSON-LD
   in rendered HTML. Fetch both generated image URLs and confirm 1200 x 630 PNGs.
3. Confirm all sitemap URLs return successful public pages in production and
   the robots file points to `https://seedenv.com/sitemap.xml`.
4. Validate structured data with Schema.org Validator and Google's Rich Results
   Test. Software rich results are not guaranteed; do not invent ratings.
5. Submit the sitemap in Google Search Console and request reindexing of the
   homepage. Google may rewrite titles/snippets and updates only after recrawling.
6. Check a production share in Discord and messaging apps. Previously shared
   URLs may retain cached previews. Deployment does not immediately clear those
   caches or change Google's AI Overview.