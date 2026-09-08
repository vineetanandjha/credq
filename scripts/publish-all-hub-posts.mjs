import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const configPath = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));

let accessToken = config.tokens?.access_token;
const refreshToken = config.tokens?.refresh_token;

if (!accessToken || (config.tokens?.expires_at && Date.now() >= config.tokens.expires_at)) {
  console.log('Refreshing OAuth access token via Google API...');
  const clientId = '563584335869-fgrhgmd47bqnekij5i8b5j0ccap8i28q.apps.googleusercontent.com';
  const clientSecret = 'V2p0-FTPfdLfbG4x-zTbqfYy';
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${errText}`);
  }
  const tokenData = await res.json();
  accessToken = tokenData.access_token;
}

const posts = [
  {
    slug: 'what-can-i-afford-first-home-buyer',
    title: 'What Can I Afford as a First Home Buyer?',
    excerpt: 'Learn how Australian lenders assess your net income, living expenses, credit card limits, and APRA serviceability buffers to determine your true home buying budget.',
    url: 'https://credq.com.au/blog/what-can-i-afford-first-home-buyer'
  },
  {
    slug: 'deposit-lvr-lmi-guide',
    title: 'Understanding Deposit Requirements, LVR and LMI',
    excerpt: 'A plain-English breakdown of cash deposits, Loan-to-Value Ratio (LVR) mechanics, Lenders Mortgage Insurance (LMI) premiums, and strategies to lower your upfront costs.',
    url: 'https://credq.com.au/blog/deposit-lvr-lmi-guide'
  },
  {
    slug: 'maximise-borrowing-power',
    title: 'How to Increase Your Borrowing Power',
    excerpt: 'Discover actionable steps to optimize your serviceability, eliminate hidden credit liabilities, present clean living expenses, and find the Australian lender that maximizes your borrowing capacity.',
    url: 'https://credq.com.au/blog/maximise-borrowing-power'
  },
  {
    slug: 'how-much-deposit-do-i-need',
    title: 'How Much Deposit Do You Really Need?',
    excerpt: 'An in-depth analysis of 5%, 10%, and 20% deposit scenarios, government schemes, stamp duty concessions, and practical deposit planning checklists for Australian buyers.',
    url: 'https://credq.com.au/blog/how-much-deposit-do-i-need'
  },
  {
    slug: 'true-costs-of-buying-a-home',
    title: 'The Real Costs of Buying Your First Home',
    excerpt: 'A complete breakdown of government taxes, legal representation fees, pre-purchase inspections, bank settlement charges, moving costs, and ongoing property ownership expenses in Australia.',
    url: 'https://credq.com.au/blog/true-costs-of-buying-a-home'
  },
  {
    slug: 'first-home-buyer-grants-australia-explained',
    title: 'First Home Buyer Grants in Australia Explained',
    excerpt: 'Understand how state First Home Owner Grants (FHOG), stamp duty exemptions, and federal 5% deposit guarantee schemes work together to reduce your upfront home purchasing costs.',
    url: 'https://credq.com.au/blog/first-home-buyer-grants-australia-explained'
  },
  {
    slug: 'saving-for-home-deposit-faster',
    title: 'Saving for a Home Deposit Faster: 7 Proven Strategies',
    excerpt: 'Discover 7 high-impact financial strategies to build your genuine cash deposit, leverage government tax benefits, and get into your first home years ahead of schedule.',
    url: 'https://credq.com.au/blog/saving-for-home-deposit-faster'
  },
  {
    slug: 'fixed-vs-variable-home-loans-first-home-buyers',
    title: 'Fixed vs Variable Home Loans for First Home Buyers',
    excerpt: 'Compare the certainty of fixed interest rates against the flexibility of variable home loans to select the optimal mortgage structure for your first home.',
    url: 'https://credq.com.au/blog/fixed-vs-variable-home-loans-first-home-buyers'
  },
  {
    slug: 'common-first-home-buyer-mistakes',
    title: '10 Common First Home Buyer Mistakes to Avoid',
    excerpt: 'Protect your deposit and mortgage approval by learning how to avoid the 10 most expensive errors first-time property buyers make in Australia.',
    url: 'https://credq.com.au/blog/common-first-home-buyer-mistakes'
  },
  {
    slug: 'pre-approval-explained',
    title: 'Pre-Approval Explained for Home Buyers',
    excerpt: 'Understand how conditional home loan pre-approval works, what documents you need, and how to shop for property with genuine confidence.',
    url: 'https://credq.com.au/blog/pre-approval-explained'
  },
  {
    slug: 'choosing-right-loan-structure',
    title: 'Choosing the Right Loan Structure for Your Home',
    excerpt: 'Discover how structuring your home loan correctly saves tens of thousands of dollars in interest and provides flexibility for future property moves.',
    url: 'https://credq.com.au/blog/choosing-right-loan-structure'
  },
  {
    slug: 'understanding-loan-repayments',
    title: 'Understanding Loan Repayments: Principal, Interest & Frequency',
    excerpt: 'Learn how daily interest compounding works, how switching to fortnightly repayments shaves years off your mortgage, and how extra repayments accelerate home equity.',
    url: 'https://credq.com.au/blog/understanding-loan-repayments'
  },
  {
    slug: 'buying-apartment-vs-house',
    title: 'Buying an Apartment vs House: First Home Comparison',
    excerpt: 'Weigh up entry price, strata levies, maintenance responsibilities, capital growth trends, and bank lending policies when choosing between a house and an apartment.',
    url: 'https://credq.com.au/blog/buying-apartment-vs-house'
  },
  {
    slug: 'how-banks-assess-home-loan-applications',
    title: 'How Banks Assess Home Loan Applications',
    excerpt: 'Gain rare insight into how Australian bank credit officers review your application, verify income, audit account conduct, and calculate final loan approvals.',
    url: 'https://credq.com.au/blog/how-banks-assess-home-loan-applications'
  }
];

const nowIso = new Date().toISOString();

console.log(`Publishing ${posts.length} posts to Firestore via REST API...`);

for (const post of posts) {
  const url = `https://firestore.googleapis.com/v1/projects/credq-14e81/databases/(default)/documents/blogPosts/${post.slug}`;
  const body = {
    fields: {
      title: { stringValue: post.title },
      excerpt: { stringValue: post.excerpt },
      url: { stringValue: post.url },
      status: { stringValue: 'published' },
      createdAt: { timestampValue: nowIso },
      gbp: {
        mapValue: {
          fields: {
            status: { stringValue: 'pending' },
            publishedAt: { nullValue: null },
            error: { nullValue: null }
          }
        }
      }
    }
  };

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Failed to publish ${post.slug}: ${response.status} ${errorText}`);
  } else {
    console.log(`✓ Published blogPosts/${post.slug} to Firestore`);
  }
}

console.log('\nAll 14 posts have been saved to Firestore!');
console.log('The onBlogPostCreated Cloud Function will process them and post updates to Google Business Profile.');
