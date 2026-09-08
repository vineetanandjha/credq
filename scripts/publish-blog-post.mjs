// Writes a blog post document to Firestore, which triggers the onBlogPostCreated
// Cloud Function to publish a matching update to Google Business Profile.
//
// Usage:
//   node scripts/publish-blog-post.mjs path/to/post.json
//
// post.json shape:
//   {
//     "slug": "how-much-deposit-for-home-loan",   // used as the Firestore doc id
//     "title": "How Much Deposit Do You Need for a Home Loan?",
//     "excerpt": "Short summary (<=1500 chars) used as the GBP post text.",
//     "url": "https://credq.com.au/blog/how-much-deposit-for-home-loan"
//   }
//
// Requires GOOGLE_APPLICATION_CREDENTIALS to point at a Firebase service account
// key JSON (Project Settings > Service accounts > Generate new private key).

import { readFileSync } from 'node:fs';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const postFile = process.argv[2];
if (!postFile) {
  console.error('Usage: node scripts/publish-blog-post.mjs path/to/post.json');
  process.exit(1);
}

const post = JSON.parse(readFileSync(postFile, 'utf8'));

for (const field of ['slug', 'title', 'excerpt', 'url']) {
  if (!post[field] || typeof post[field] !== 'string') {
    console.error(`post.json is missing required string field: ${field}`);
    process.exit(1);
  }
}

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const docRef = db.collection('blogPosts').doc(post.slug);
await docRef.set({
  title: post.title,
  excerpt: post.excerpt,
  url: post.url,
  status: 'published',
  createdAt: FieldValue.serverTimestamp(),
  gbp: { status: 'pending', publishedAt: null, error: null }
});

console.log(`Saved blogPosts/${post.slug}. The onBlogPostCreated function will publish it to GBP shortly.`);
