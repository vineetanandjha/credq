$ErrorActionPreference = 'Stop'

$root = "c:\Users\vanand\OneDrive - Interactive\Documents\Personal\CredQ\credq\public"
$suburbDir = Join-Path $root "suburbs"
New-Item -ItemType Directory -Path $suburbDir -Force | Out-Null

function Convert-ToSlug {
    param([string]$Text)

    $slug = $Text.ToLowerInvariant()
    $slug = $slug -replace '\(.*?\)', ''
    $slug = $slug -replace '[^a-z0-9]+', '-'
    $slug = $slug.Trim('-')
    return $slug
}

function New-SuburbPage {
    param(
        [string]$Suburb,
        [string]$CouncilName,
        [string]$CouncilSlug,
        [string]$SharedNote
    )

    $suburbSlug = Convert-ToSlug $Suburb
    $fileName = "{0}-mortgage-broker-{1}.html" -f $suburbSlug, $CouncilSlug
    $filePath = Join-Path $suburbDir $fileName
    $pagePath = "/suburbs/$fileName"
    $canonical = "https://credq.com.au$pagePath" -replace '\.html$', ''

    $sharedLine = ""
    if ($SharedNote) {
        $sharedLine = '<p class="scheme-note"><strong>Area note:</strong> {0}</p>' -f $SharedNote
    }

    $hubPath = if ($CouncilSlug -eq 'blacktown-city') { '/blacktown-city-council-mortgage-broker' } else { '/hills-shire-council-mortgage-broker' }

    $content = @"
<!DOCTYPE html>
<html lang="en-AU">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mortgage Broker $Suburb | Home Loans & Refinancing | CredQ</title>
    <meta name="description" content="Mortgage broker support in $Suburb for home loans, refinancing, investment loans and low deposit options. Get your free assessment from CredQ.">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="$canonical">
    <meta property="og:type" content="website">
    <meta property="og:title" content="Mortgage Broker $Suburb | CredQ">
    <meta property="og:description" content="Local mortgage broker support in $Suburb for buyers, refinancers and investors.">
    <meta property="og:url" content="$canonical">
    <meta property="og:image" content="https://credq.com.au/logo.png">
    <meta property="og:site_name" content="CredQ">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Mortgage Broker $Suburb | CredQ">
    <meta name="twitter:description" content="Local mortgage broker support in $Suburb for buyers, refinancers and investors.">
    <meta name="twitter:image" content="https://credq.com.au/logo.png">
    <link rel="stylesheet" href="/styles.css">
    <link rel="icon" type="image/png" href="/logo.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
    <nav class="navbar">
        <div class="container">
            <div class="nav-wrapper">
                <div class="logo"><a href="/"><img src="/logo.png" alt="CredQ Logo"></a></div>
                <ul class="nav-menu">
                    <li><a href="/">Home</a></li>
                    <li><a href="/first-home-buyers">First Home Buyers</a></li>
                    <li><a href="/refinancing">Refinancing</a></li>
                    <li><a href="/investment-loans">Investment Loans</a></li>
                    <li><a href="/low-deposit-loans">Low Deposit Loans</a></li>
                    <li><a href="/seo-resource-links">SEO Resources</a></li>
                    <li><a href="#assessment" class="btn-primary">Get My Free Assessment</a></li>
                </ul>
                <div class="hamburger"><span></span><span></span><span></span></div>
            </div>
        </div>
    </nav>

    <section class="hero scheme-hero">
        <div class="container">
            <div class="hero-content">
                <p class="scheme-eyebrow">Mortgage Broker $Suburb</p>
                <h1 class="hero-title">Mortgage support for buyers, refinancers and investors in $Suburb</h1>
                <p class="hero-subtitle">CredQ helps people in $Suburb compare lenders, understand borrowing power and choose a loan path with clear next steps.</p>
                <div class="hero-buttons">
                    <a href="#assessment" class="btn-primary btn-large">Get My Free Assessment</a>
                    <a href="$hubPath" class="btn-secondary btn-large">View all $CouncilName suburbs</a>
                </div>
                <div class="scheme-stats" aria-label="Local mortgage highlights">
                    <div class="stat-card"><strong>Borrowing power</strong><span>Estimate your budget before making offers.</span></div>
                    <div class="stat-card"><strong>Refinance review</strong><span>Check if a lender switch can reduce repayments.</span></div>
                    <div class="stat-card"><strong>Investor support</strong><span>Compare lender policy for investment scenarios.</span></div>
                    <div class="stat-card"><strong>Fast follow-up</strong><span>Same-day response where possible on business days.</span></div>
                </div>
            </div>
        </div>
    </section>

    <section class="scheme-section">
        <div class="container">
            <div class="section-header">
                <h2>Why locals in $Suburb contact CredQ</h2>
                <p>Simple guidance, lender comparison and one clear next step.</p>
            </div>
            $sharedLine
            <div class="services-grid">
                <div class="service-card"><div class="service-icon">🏡</div><h3>Home purchase</h3><p>Work out your borrowing position and lender options before making a move.</p><a href="/borrowing-power-calculator" class="text-link">Check borrowing power</a></div>
                <div class="service-card"><div class="service-icon">🔁</div><h3>Refinancing</h3><p>Review rates, fees and structure to check whether a refinance is worth it.</p><a href="/refinancing" class="text-link">Explore refinance guides</a></div>
                <div class="service-card"><div class="service-icon">🏢</div><h3>Investment loans</h3><p>Compare serviceability and policy differences for investor lending.</p><a href="/investment-loans" class="text-link">Compare investment loan options</a></div>
                <div class="service-card"><div class="service-icon">📍</div><h3>Local guidance</h3><p>Speak with a broker who supports borrowers in $Suburb and surrounding areas.</p><a href="/seo-resource-links" class="text-link">See more mortgage guides</a></div>
            </div>
        </div>
    </section>

    <section class="scheme-section alt">
        <div class="container">
            <div class="section-header">
                <h2>Related pages you may find helpful</h2>
                <p>Helpful links for buyers, refinancers and investors doing local research.</p>
            </div>
            <div class="topic-grid">
                <a class="topic-card" href="/borrowing-power-calculator"><span>Calculator</span><h3>Borrowing power calculator</h3><p>Estimate how much you may be able to borrow before making an offer.</p><strong>Open</strong></a>
                <a class="topic-card" href="/first-home-buyers"><span>Home buyer</span><h3>First home buyers</h3><p>Compare grants, deposit options and lender guidance for new buyers.</p><strong>Open</strong></a>
                <a class="topic-card" href="/refinancing"><span>Refinancing</span><h3>Refinance</h3><p>See if you could reduce repayments or release equity with a smarter loan.</p><strong>Open</strong></a>
                <a class="topic-card" href="/seo-resource-links"><span>Resource hub</span><h3>All mortgage guides</h3><p>Jump to the broader CredQ guide library and local loan pages.</p><strong>Open</strong></a>
            </div>
        </div>
    </section>

    <section id="assessment" class="contact">
        <div class="container">
            <div class="section-header">
                <h2>Get My Free Assessment</h2>
                <p>Tell us what you need and we will follow up with practical next steps.</p>
            </div>
            <div class="contact-wrapper">
                <div class="contact-info">
                    <div class="info-item"><h3>📞 Phone</h3><p><a href="tel:0470388310">0470 388 310</a></p></div>
                    <div class="info-item"><h3>📧 Email</h3><p><a href="mailto:mortgage@credq.com.au">mortgage@credq.com.au</a></p></div>
                    <div class="info-item"><h3>📍 Service area</h3><p>$Suburb, $CouncilName and surrounding suburbs.</p></div>
                </div>
                <div class="contact-form">
                    <form id="leadForm">
                        <div class="mini-form">
                            <div class="form-group full-width"><input type="text" name="name" placeholder="Your name" required></div>
                            <div class="form-group"><input type="email" name="email" placeholder="Email address" required></div>
                            <div class="form-group"><input type="tel" name="phone" placeholder="Mobile number" required></div>
                            <div class="form-group"><select name="service" required><option value="">What do you need help with?</option><option value="borrowing-power">Borrowing power estimate</option><option value="first-home">First home purchase</option><option value="refinance">Refinancing</option><option value="investor">Investment loan</option><option value="low-deposit">Low deposit loan</option></select></div>
                            <div class="form-group"><input type="text" name="postcode" placeholder="Postcode or suburb"></div>
                            <div class="form-group consent full-width"><label class="consent-label"><input type="checkbox" name="consent" required> I consent to being contacted about my free assessment.</label></div>
                            <div class="form-group full-width"><button type="submit" class="btn-primary btn-large">Get My Free Assessment</button></div>
                        </div>
                    </form>
                    <div id="leadSuccessMessage" class="success-message" style="display: none;"><h3>Thank You!</h3><p>Your request has been received. We’ll contact you shortly with the next steps.</p></div>
                </div>
            </div>
        </div>
    </section>

    <section class="cta-section">
        <div class="container">
            <div class="cta-content">
                <h2>Need mortgage help in ${Suburb}?</h2>
                <p>Book a quick call and we will help you map the right next step.</p>
                <a href="https://calendly.com/mortgage-credq/30min" target="_blank" rel="noopener" class="btn-primary btn-large">Get My Free Assessment</a>
            </div>
        </div>
    </section>

    <footer class="footer"><div class="container"><div class="footer-content"><div class="footer-section"><img src="/logo.png" alt="CredQ Logo" class="footer-logo"><p>Your trusted partner in mortgage solutions.</p></div><div class="footer-section"><h4>Quick Links</h4><ul><li><a href="/">Home</a></li><li><a href="/sydney-mortgage-broker">Mortgage Broker Sydney</a></li><li><a href="/blacktown-city-council-mortgage-broker">Blacktown Council Suburbs</a></li><li><a href="/hills-shire-council-mortgage-broker">Hills Shire Suburbs</a></li></ul></div><div class="footer-section"><h4>Contact</h4><p><a href="mailto:mortgage@credq.com.au">mortgage@credq.com.au</a></p><p><a href="tel:0470388310">0470 388 310</a></p><p>Lilburn St. Tallawong<br>NSW 2762</p><p><em>(By appointment only)</em></p></div><div class="footer-section"><h4>Legal</h4><p><strong>CREDQ PTY LTD</strong></p><p class="legal-text">ABN: 97 695 584 500</p><p class="legal-text">CredQ Pty Ltd. is an authorised Credit Representative (CR Number 576932) operating under Australian Credit Licence 563763 held by Broker ACL Pty Ltd.</p></div></div><div class="footer-bottom"><ul class="footer-legal-links footer-bottom-links"><li><a href="/privacy-policy">Privacy Policy</a></li><li><a href="/feedback-and-complaints">Feedback &amp; Complaints</a></li><li><a href="/terms-and-conditions">Terms &amp; Conditions</a></li></ul><p>&copy; 2026 Credq Pty Ltd. ABN: 97 695 584 500 All Rights Reserved.</p></div></div></footer>

    <a class="whatsapp-float" href="https://wa.me/message/WJ4AEAB5ZMPPP1" target="_blank" rel="noopener" aria-label="Chat with us on WhatsApp"><span class="whatsapp-text">Talk to us</span><span class="whatsapp-icon" aria-hidden="true"><svg viewBox="0 0 32 32" role="img" focusable="false"><path d="M16 3C9.373 3 4 8.149 4 14.5c0 2.366.792 4.553 2.146 6.357L4.5 29l8.371-1.587C14.505 28.438 15.242 28.5 16 28.5c6.627 0 12-5.149 12-11.5S22.627 3 16 3zm0 22.5c-1.057 0-2.093-.171-3.077-.509l-.549-.187-4.96.939.948-4.681-.36-.531C6.873 18.83 6 16.702 6 14.5 6 9.262 10.486 5 16 5s10 4.262 10 9.5S21.514 25.5 16 25.5zm5.232-6.705c-.285-.143-1.684-.828-1.943-.923-.259-.096-.449-.143-.638.143-.19.285-.732.923-.898 1.113-.166.19-.331.214-.616.071-.285-.143-1.205-.442-2.296-1.41-.849-.756-1.421-1.689-1.588-1.974-.166-.285-.018-.44.125-.582.128-.127.285-.331.427-.497.143-.166.19-.285.285-.474.095-.19.048-.357-.024-.5-.071-.143-.638-1.543-.874-2.116-.23-.556-.464-.48-.638-.489-.166-.008-.357-.01-.548-.01-.19 0-.5.071-.761.357-.261.285-.997.975-.997 2.38 0 1.405 1.021 2.763 1.163 2.954.143.19 2.01 3.07 4.87 4.303.681.293 1.212.468 1.626.599.683.217 1.305.186 1.796.113.548-.081 1.684-.689 1.922-1.355.238-.666.238-1.237.166-1.355-.071-.119-.261-.19-.547-.333z" /></svg></span></a>
    <a class="mobile-call-bar" href="tel:0470388310">Call Now: 0470 388 310</a>
    <script src="/script.js"></script>
</body>
</html>
"@

    Set-Content -Path $filePath -Value $content -Encoding UTF8

    [PSCustomObject]@{
        Suburb = $Suburb
        Council = $CouncilName
        RelativeFile = "suburbs/$fileName"
        UrlPath = "/suburbs/$fileName" -replace '\.html$', ''
    }
}

$blacktownSuburbs = @(
    'Acacia Gardens','Angus','Arndell Park','Bidwill','Blackett','Blacktown','Bungarribee','Colebee','Dean Park','Dharruk',
    'Doonside','Eastern Creek','Emerton','Glendenning','Glenwood','Grantham Farm','Hassall Grove','Hebersham','Huntingwood',
    'Kellyville Ridge','Kings Langley','Kings Park','Lalor Park','Lethbridge Park','Marayong','Marsden Park','Melonba',
    'Minchinbury','Mount Druitt','Nirimba Fields','Oakhurst','Parklea','Plumpton','Prospect','Quakers Hill','Richards',
    'Riverstone','Ropes Crossing','Rooty Hill','Rouse Hill','Schofields','Seven Hills','Shalvey','Shanes Park','Stanhope Gardens',
    'St Marys','Tallawong','The Ponds','Toongabbie','Vineyard','Whalan','Willmot','Woodcroft'
)

$hillsSuburbs = @(
    @{ Name='Annangrove'; Note='' },
    @{ Name='Baulkham Hills'; Note='Shared with City of Parramatta.' },
    @{ Name='Beaumont Hills'; Note='' },
    @{ Name='Bella Vista'; Note='' },
    @{ Name='Box Hill'; Note='' },
    @{ Name='Canoelands'; Note='Shared with Hornsby Shire.' },
    @{ Name='Castle Hill'; Note='Shared with Hornsby Shire.' },
    @{ Name='Cattai'; Note='Shared with City of Hawkesbury.' },
    @{ Name='Dural'; Note='Shared with Hornsby Shire.' },
    @{ Name='Gables'; Note='' },
    @{ Name='Glenhaven'; Note='Shared with Hornsby Shire.' },
    @{ Name='Glenorie'; Note='Shared with Hornsby Shire.' },
    @{ Name='Kellyville'; Note='' },
    @{ Name='Kenthurst'; Note='' },
    @{ Name='Leets Vale'; Note='Shared with City of Hawkesbury.' },
    @{ Name='Lower Portland'; Note='Shared with City of Hawkesbury.' },
    @{ Name='Maraylya'; Note='Shared with City of Hawkesbury.' },
    @{ Name='Maroota'; Note='Shared with Hornsby Shire.' },
    @{ Name='Middle Dural'; Note='Shared with Hornsby Shire.' },
    @{ Name='Nelson'; Note='' },
    @{ Name='North Kellyville'; Note='' },
    @{ Name='North Rocks'; Note='Shared with City of Parramatta.' },
    @{ Name='Norwest'; Note='Council seat.' },
    @{ Name='Rouse Hill'; Note='Shared with City of Blacktown.' },
    @{ Name='Sackville North'; Note='' },
    @{ Name='South Maroota'; Note='' },
    @{ Name='West Pennant Hills'; Note='Shared with Hornsby Shire.' },
    @{ Name='Winston Hills'; Note='Shared with City of Parramatta.' },
    @{ Name='Wisemans Ferry'; Note='' }
)

$generatedPages = @()

foreach ($suburb in $blacktownSuburbs) {
    $generatedPages += New-SuburbPage -Suburb $suburb -CouncilName 'Blacktown City Council' -CouncilSlug 'blacktown-city' -SharedNote ''
}

foreach ($entry in $hillsSuburbs) {
    $generatedPages += New-SuburbPage -Suburb $entry.Name -CouncilName 'The Hills Shire' -CouncilSlug 'hills-shire' -SharedNote $entry.Note
}

function New-CouncilHubPage {
    param(
        [string]$Title,
        [string]$MetaDescription,
        [string]$CanonicalPath,
        [string]$Eyebrow,
        [string]$Heading,
        [string]$Intro,
        [string]$CouncilName,
        [object[]]$PageRows,
        [string]$OutFile
    )

    $links = $PageRows | Sort-Object Suburb | ForEach-Object {
           "<li><a href='{0}'>{1} mortgage broker</a></li>" -f $_.UrlPath, $_.Suburb
    }

    $listHtml = [string]::Join("`n                        ", $links)

    $content = @"
<!DOCTYPE html>
<html lang="en-AU">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>$Title</title>
    <meta name="description" content="$MetaDescription">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="https://credq.com.au/$CanonicalPath">
    <meta property="og:type" content="website">
    <meta property="og:title" content="$Title">
    <meta property="og:description" content="$MetaDescription">
    <meta property="og:url" content="https://credq.com.au/$CanonicalPath">
    <meta property="og:image" content="https://credq.com.au/logo.png">
    <meta property="og:site_name" content="CredQ">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="$Title">
    <meta name="twitter:description" content="$MetaDescription">
    <meta name="twitter:image" content="https://credq.com.au/logo.png">
    <link rel="stylesheet" href="styles.css">
    <link rel="icon" type="image/png" href="logo.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
    <nav class="navbar"><div class="container"><div class="nav-wrapper"><div class="logo"><a href="/"><img src="logo.png" alt="CredQ Logo"></a></div><ul class="nav-menu"><li><a href="/">Home</a></li><li><a href="/first-home-buyers">First Home Buyers</a></li><li><a href="/refinancing">Refinancing</a></li><li><a href="/investment-loans">Investment Loans</a></li><li><a href="/low-deposit-loans">Low Deposit Loans</a></li><li><a href="#council-suburbs" class="btn-primary">Browse Suburbs</a></li></ul><div class="hamburger"><span></span><span></span><span></span></div></div></div></nav>

    <section class="hero scheme-hero"><div class="container"><div class="hero-content"><p class="scheme-eyebrow">$Eyebrow</p><h1 class="hero-title">$Heading</h1><p class="hero-subtitle">$Intro</p><div class="hero-buttons"><a href="#council-suburbs" class="btn-primary btn-large">Browse suburb pages</a><a href="/#contact" class="btn-secondary btn-large">Get My Free Assessment</a></div><div class="scheme-stats"><div class="stat-card"><strong>$($PageRows.Count)</strong><span>suburb-focused SEO pages</span></div><div class="stat-card"><strong>Home loans</strong><span>first home buyer, upgrader and investor paths</span></div><div class="stat-card"><strong>Refinancing</strong><span>check if your current loan can be improved</span></div><div class="stat-card"><strong>Fast support</strong><span>same-day response where possible</span></div></div></div></div></section>

    <section id="council-suburbs" class="scheme-section">
        <div class="container">
            <div class="section-header">
                <h2>Suburbs in $CouncilName</h2>
                <p>Select your suburb page to view local mortgage guidance and request your free assessment.</p>
            </div>
            <div class="policy-content">
                <ul class="about-list">
                        $listHtml
                </ul>
            </div>
        </div>
    </section>

    <section class="cta-section"><div class="container"><div class="cta-content"><h2>Need help choosing the right loan?</h2><p>Use your suburb page above or request a free assessment now.</p><a href="/#contact" class="btn-primary btn-large">Get My Free Assessment</a></div></div></section>

    <footer class="footer"><div class="container"><div class="footer-content"><div class="footer-section"><img src="logo.png" alt="CredQ Logo" class="footer-logo"><p>Your trusted partner in mortgage solutions.</p></div><div class="footer-section"><h4>Quick Links</h4><ul><li><a href="/">Home</a></li><li><a href="/sydney-mortgage-broker">Mortgage Broker Sydney</a></li><li><a href="/blacktown-city-council-mortgage-broker">Blacktown Council Suburbs</a></li><li><a href="/hills-shire-council-mortgage-broker">Hills Shire Suburbs</a></li></ul></div><div class="footer-section"><h4>Contact</h4><p><a href="mailto:mortgage@credq.com.au">mortgage@credq.com.au</a></p><p><a href="tel:0470388310">0470 388 310</a></p><p>Lilburn St. Tallawong<br>NSW 2762</p><p><em>(By appointment only)</em></p></div><div class="footer-section"><h4>Legal</h4><p><strong>CREDQ PTY LTD</strong></p><p class="legal-text">ABN: 97 695 584 500</p><p class="legal-text">CredQ Pty Ltd. is an authorised Credit Representative (CR Number 576932) operating under Australian Credit Licence 563763 held by Broker ACL Pty Ltd.</p></div></div><div class="footer-bottom"><ul class="footer-legal-links footer-bottom-links"><li><a href="/privacy-policy">Privacy Policy</a></li><li><a href="/feedback-and-complaints">Feedback &amp; Complaints</a></li><li><a href="/terms-and-conditions">Terms &amp; Conditions</a></li></ul><p>&copy; 2026 Credq Pty Ltd. ABN: 97 695 584 500 All Rights Reserved.</p></div></div></footer>

    <a class="whatsapp-float" href="https://wa.me/message/WJ4AEAB5ZMPPP1" target="_blank" rel="noopener" aria-label="Chat with us on WhatsApp"><span class="whatsapp-text">Talk to us</span><span class="whatsapp-icon" aria-hidden="true"><svg viewBox="0 0 32 32" role="img" focusable="false"><path d="M16 3C9.373 3 4 8.149 4 14.5c0 2.366.792 4.553 2.146 6.357L4.5 29l8.371-1.587C14.505 28.438 15.242 28.5 16 28.5c6.627 0 12-5.149 12-11.5S22.627 3 16 3zm0 22.5c-1.057 0-2.093-.171-3.077-.509l-.549-.187-4.96.939.948-4.681-.36-.531C6.873 18.83 6 16.702 6 14.5 6 9.262 10.486 5 16 5s10 4.262 10 9.5S21.514 25.5 16 25.5zm5.232-6.705c-.285-.143-1.684-.828-1.943-.923-.259-.096-.449-.143-.638.143-.19.285-.732.923-.898 1.113-.166.19-.331.214-.616.071-.285-.143-1.205-.442-2.296-1.41-.849-.756-1.421-1.689-1.588-1.974-.166-.285-.018-.44.125-.582.128-.127.285-.331.427-.497.143-.166.19-.285.285-.474.095-.19.048-.357-.024-.5-.071-.143-.638-1.543-.874-2.116-.23-.556-.464-.48-.638-.489-.166-.008-.357-.01-.548-.01-.19 0-.5.071-.761.357-.261.285-.997.975-.997 2.38 0 1.405 1.021 2.763 1.163 2.954.143.19 2.01 3.07 4.87 4.303.681.293 1.212.468 1.626.599.683.217 1.305.186 1.796.113.548-.081 1.684-.689 1.922-1.355.238-.666.238-1.237.166-1.355-.071-.119-.261-.19-.547-.333z" /></svg></span></a>
    <a class="mobile-call-bar" href="tel:0470388310">Call Now: 0470 388 310</a>
    <script src="script.js"></script>
</body>
</html>
"@

    Set-Content -Path (Join-Path $root $OutFile) -Value $content -Encoding UTF8
}

$blacktownRows = $generatedPages | Where-Object { $_.Council -eq 'Blacktown City Council' }
$hillsRows = $generatedPages | Where-Object { $_.Council -eq 'The Hills Shire' }

New-CouncilHubPage -Title 'Mortgage Broker Blacktown City Council | Suburb Pages | CredQ' `
    -MetaDescription 'Mortgage broker support across Blacktown City Council suburbs for home loans, refinancing and investment lending.' `
    -CanonicalPath 'blacktown-city-council-mortgage-broker' `
    -Eyebrow 'Blacktown City Council' `
    -Heading 'Mortgage broker support across Blacktown City Council suburbs' `
    -Intro 'Browse suburb-specific pages for Blacktown City Council and request your free mortgage assessment.' `
    -CouncilName 'Blacktown City Council' `
    -PageRows $blacktownRows `
    -OutFile 'blacktown-city-council-mortgage-broker.html'

New-CouncilHubPage -Title 'Mortgage Broker Hills Shire | Suburb Pages | CredQ' `
    -MetaDescription 'Mortgage broker support across The Hills Shire suburbs for home loans, refinancing and investment lending.' `
    -CanonicalPath 'hills-shire-council-mortgage-broker' `
    -Eyebrow 'The Hills Shire' `
    -Heading 'Mortgage broker support across The Hills Shire suburbs' `
    -Intro 'Browse suburb-specific pages for The Hills Shire and request your free mortgage assessment.' `
    -CouncilName 'The Hills Shire' `
    -PageRows $hillsRows `
    -OutFile 'hills-shire-council-mortgage-broker.html'

$htmlFiles = Get-ChildItem -Path $root -Filter *.html -Recurse | Sort-Object FullName

function Get-UrlPathFromFile {
    param([System.IO.FileInfo]$File)

    $relative = $File.FullName.Substring($root.Length).TrimStart('\\') -replace '\\', '/'

    if ($relative -eq 'index.html') {
        return '/'
    }

    if ($relative.EndsWith('/index.html')) {
        return '/' + $relative.Substring(0, $relative.Length - '/index.html'.Length) + '/'
    }

    return '/' + ($relative -replace '\.html$', '')
}

$today = Get-Date -Format 'yyyy-MM-dd'

$urls = foreach ($file in $htmlFiles) {
    $path = Get-UrlPathFromFile -File $file
    $loc = 'https://credq.com.au' + $path

    $priority = '0.7'
    $changefreq = 'monthly'

    if ($path -eq '/') {
        $priority = '1.0'
        $changefreq = 'weekly'
    } elseif ($path -match 'cashback-offers') {
        $priority = '0.9'
        $changefreq = 'weekly'
    } elseif ($path -match 'privacy-policy|terms-and-conditions|feedback-and-complaints') {
        $priority = '0.2'
        $changefreq = 'yearly'
    } elseif ($path -match 'first-home-buyers|refinancing|investment-loans|low-deposit-loans') {
        $priority = '0.9'
    } elseif ($path -match 'suburbs/') {
        $priority = '0.6'
    }

    [PSCustomObject]@{
        loc = $loc
        lastmod = $today
        changefreq = $changefreq
        priority = $priority
    }
}

$xmlLines = @()
$xmlLines += '<?xml version="1.0" encoding="UTF-8"?>'
$xmlLines += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'

foreach ($url in $urls) {
    $xmlLines += '  <url>'
    $xmlLines += "    <loc>$($url.loc)</loc>"
    $xmlLines += "    <lastmod>$($url.lastmod)</lastmod>"
    $xmlLines += "    <changefreq>$($url.changefreq)</changefreq>"
    $xmlLines += "    <priority>$($url.priority)</priority>"
    $xmlLines += '  </url>'
}

$xmlLines += '</urlset>'

Set-Content -Path (Join-Path $root 'sitemap.xml') -Value ($xmlLines -join "`n") -Encoding UTF8

"Generated suburb pages: $($generatedPages.Count)"
"Generated Blacktown rows: $($blacktownRows.Count)"
"Generated Hills rows: $($hillsRows.Count)"
"Sitemap URLs: $($urls.Count)"
