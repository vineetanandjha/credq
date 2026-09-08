import { useEffect, useMemo, useRef, useState } from 'react';
import { hasFirebaseConfig, loadFirebase } from './firebaseClient';

const metaPixelId = import.meta.env.VITE_META_PIXEL_ID || '1824219618568834';
const metaAccessToken = import.meta.env.VITE_META_CAPI_ACCESS_TOKEN || '';
const otpFeatureEnabled = false;
const OTP_RESEND_COOLDOWN_SECONDS = 45;
const OTP_RATE_LIMIT_LOCKOUT_SECONDS = 300;
const OTP_MAX_SEND_ATTEMPTS = 3;
const OTP_VERIFY_TIMEOUT_MS = 20000;
const OTP_ATTEMPTS_SESSION_KEY = 'leadOtpSendAttempts';
const OTP_COOLDOWN_UNTIL_SESSION_KEY = 'leadOtpCooldownUntil';

function loadMetaPixel() {
  if (typeof window === 'undefined' || !metaPixelId) return;
  // Inline snippet in the HTML head already fires init + PageView before this mounts.
  if (window.__cqPixelInit) return;

  if (!window.fbq) {
    window.fbq = function () {
      const fbqInstance = window.fbq;
      if (fbqInstance && fbqInstance.queue) {
        fbqInstance.queue.push(arguments);
      }
    };
    window.fbq.queue = [];
    window.fbq.push = window.fbq;
  }

  if (!document.getElementById('facebook-pixel')) {
    const script = document.createElement('script');
    script.id = 'facebook-pixel';
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    script.async = true;
    document.head.appendChild(script);
  }

  window.fbq('init', metaPixelId);
  window.fbq('track', 'PageView');
}

function sendCapiEvent(eventName, data = {}) {
  if (!metaAccessToken) return;

  fetch(`https://graph.facebook.com/v19.0/${metaPixelId}/events?access_token=${metaAccessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: [{
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: window.location.href,
        user_data: {
          em: [data.email || ''],
          ph: [data.phone || '']
        },
        custom_data: data
      }]
    })
  }).catch(() => {});
}

function formatAuMobileToE164(rawMobile) {
  const raw = typeof rawMobile === 'string' ? rawMobile.trim() : '';
  if (!raw) return '';

  if (raw.startsWith('+')) {
    const cleaned = raw.replace(/[^\d+]/g, '');
    return cleaned.length >= 10 ? cleaned : '';
  }

  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('61')) return `+${digits}`;
  if (digits.startsWith('0')) return `+61${digits.slice(1)}`;
  return '';
}

function isAuLocalMobile(rawMobile) {
  const digits = typeof rawMobile === 'string' ? rawMobile.replace(/\D/g, '') : '';
  return /^04\d{8}$/.test(digits);
}

function getSessionNumber(key) {
  if (typeof window === 'undefined') return 0;
  const value = Number(window.sessionStorage.getItem(key) || '0');
  return Number.isFinite(value) ? value : 0;
}

function isOtpRateLimitedError(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  return code.includes('auth/too-many-requests');
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error('otp_verify_timeout')), timeoutMs);
    })
  ]);
}

function getOtpVerifyErrorMessage(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = typeof error?.message === 'string' ? error.message : '';

  if (message.includes('otp_verify_timeout')) {
    return 'Verification took too long. Please try entering the code again.';
  }
  if (code.includes('auth/invalid-verification-code')) {
    return 'That code looks incorrect. Please check the SMS and try again.';
  }
  if (code.includes('auth/code-expired')) {
    return 'That code has expired. Please request a new code.';
  }
  if (code.includes('auth/session-expired')) {
    return 'Your verification session expired. Please request a new code.';
  }
  if (code.includes('auth/network-request-failed')) {
    return 'Network issue during verification. Please try again.';
  }

  return 'OTP verification failed. Please check the code and try again.';
}

function getOtpErrorMessage(error) {
  const code = typeof error?.code === 'string' ? error.code : '';

  if (code.includes('auth/too-many-requests')) {
    return 'Too many attempts right now. Please wait a few minutes and try again.';
  }
  if (code.includes('auth/invalid-phone-number')) {
    return 'That mobile format was rejected. Please enter a valid Australian mobile number.';
  }
  if (code.includes('auth/captcha-check-failed')) {
    return 'Verification check failed. Please try sending the code again.';
  }
  if (code.includes('auth/invalid-app-credential')) {
    return 'Verification setup failed on this attempt. Please try sending the code again.';
  }
  if (code.includes('auth/network-request-failed')) {
    return 'Network issue while sending code. Please check your connection and try again.';
  }

  return 'Could not send OTP right now. Please try again to continue.';
}

function buildCalendlyUrl(leadForm) {
  const url = new URL('https://calendly.com/mortgage-credq/30min');
  url.searchParams.set('hide_gdpr_banner', '1');
  url.searchParams.set('hide_cookie_banner', '1');

  const firstName = leadForm.firstName?.trim();
  const email = leadForm.email?.trim();
  const mobile = leadForm.mobile?.trim();
  const mobileE164 = formatAuMobileToE164(mobile);

  if (firstName) url.searchParams.set('name', firstName);
  if (email) url.searchParams.set('email', email);
  if (mobile) {
    // Calendly prefills the "phone call" location field from `location`, and custom question 1 from `a1`.
    const prefillMobile = mobileE164 || mobile;
    url.searchParams.set('a1', prefillMobile);
    url.searchParams.set('location', prefillMobile);
  }

  return url.toString();
}

function App() {
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/';
  const normalizedPath = currentPath.replace(/^\/ads\/?/, '/').replace(/\/+$/, '') || '/';
  const usesEmbeddedCalendly = ['/first-home', '/investment', '/refinance'].some((path) => normalizedPath.includes(path));
  const pageMetadata = useMemo(() => {
    if (normalizedPath.includes('/first-home')) {
      return {
        title: 'First Home Buyer Loans & Mortgage Guide | CredQ',
        description: 'Get clear guidance on first home buyer loans, borrowing power, deposit options and Australian home buyer pathways with CredQ.',
        canonical: 'https://credq.com.au/first-home'
      };
    }

    if (normalizedPath.includes('/investment')) {
      return {
        title: 'Investment Property Loans & Finance Options | CredQ',
        description: 'Explore investment property loan options, borrowing capacity and lending structures before your next purchase with CredQ.',
        canonical: 'https://credq.com.au/investment'
      };
    }

    if (normalizedPath.includes('/refinance')) {
      return {
        title: 'Home Loan Refinancing & Rate Review | CredQ',
        description: 'Review your home loan, compare refinancing options and see whether switching could improve your repayments with CredQ.',
        canonical: 'https://credq.com.au/refinance'
      };
    }

    return {
      title: 'CredQ | Mortgage Discovery Call',
      description: 'Book a fast mortgage discovery call and get clear answers on borrowing power, next steps and your options.',
      canonical: 'https://credq.com.au/ads'
    };
  }, [normalizedPath]);
  const [leadForm, setLeadForm] = useState({ firstName: '', mobile: '', email: '', consent: false });
  const [leadCaptureError, setLeadCaptureError] = useState('');
  const [formFailedAttempts, setFormFailedAttempts] = useState(0);
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);
  const [leadCaptured, setLeadCaptured] = useState(false);
  const [leadDocId, setLeadDocId] = useState('');
  const [isCalendlyLoading, setIsCalendlyLoading] = useState(true);
  const [isBookingSectionVisible, setIsBookingSectionVisible] = useState(false);
  const [otpState, setOtpState] = useState({
    sending: false,
    sent: false,
    verifying: false,
    verified: false,
    code: '',
    message: '',
    confirmationResult: null
  });
  const [otpSendAttempts, setOtpSendAttempts] = useState(() => getSessionNumber(OTP_ATTEMPTS_SESSION_KEY));
  const [otpCooldownUntil, setOtpCooldownUntil] = useState(() => getSessionNumber(OTP_COOLDOWN_UNTIL_SESSION_KEY));
  const otpInputRef = useRef(null);
  const otpCooldownSeconds = Math.max(0, Math.ceil((otpCooldownUntil - Date.now()) / 1000));
  const otpAttemptsRemaining = Math.max(0, OTP_MAX_SEND_ATTEMPTS - otpSendAttempts);
  const hasEmail = leadForm.email.trim().length > 0;
  // When otpFeatureEnabled is false, skip the verification requirement entirely (flip the flag to re-enable OTP later).
  const canContinueAfterOtp = (!otpFeatureEnabled || otpState.verified) && hasEmail && leadForm.consent;
  const showMobileStickyCta = usesEmbeddedCalendly && !isBookingSectionVisible;
  const calendlyUrl = useMemo(() => {
    if (!usesEmbeddedCalendly) return buildCalendlyUrl({});
    return canContinueAfterOtp ? buildCalendlyUrl(leadForm) : buildCalendlyUrl({});
  }, [canContinueAfterOtp, leadForm.email, leadForm.firstName, leadForm.mobile, usesEmbeddedCalendly]);

  const offer = useMemo(() => {
    if (normalizedPath.includes('/first-home')) {
      return {
        title: 'Buy your first home with a clear step-by-step plan',
        subtitle: 'Understand your borrowing power, deposit options and first-home buyer pathways before you make an offer.',
        cta: 'Book My Free 15-Min Strategy Session',
        eyebrow: 'First home buyer strategy call',
        intro: 'A practical, no-pressure session to help you move from "where do I start?" to a confident next step.',
        benefits: ['Borrowing power clarity', 'Deposit pathway', 'Grant and scheme guidance'],
        outcomes: [
          'A realistic borrowing range based on your current position',
          'A clear plan for deposit, costs and timing',
          'Simple guidance on first-home buyer grants and support schemes'
        ],
        stats: [
          { value: '15 min', label: 'strategy call' },
          { value: '1:1', label: 'guidance' },
          { value: '0', label: 'sales pressure' }
        ],
        reviews: [
          { name: 'Aman', quote: 'As first home buyers, we finally understood what we could afford and what to do next.' },
          { name: 'Keira', quote: 'Clear advice on deposit and grants. It made the process feel much less stressful.' },
          { name: 'Rohit', quote: 'We left with a simple action plan and confidence to start looking seriously.' }
        ]
      };
    }

    if (normalizedPath.includes('/investment')) {
      return {
        title: 'Review your next investment move before you commit',
        subtitle: 'Get a clear view of borrowing capacity, repayment pressure and the loan structure that may suit your next purchase.',
        cta: 'Book My Free 15-Min Strategy Session',
        eyebrow: 'Investment loan strategy call',
        intro: 'A sharp, pressure-free conversation to help you decide whether now is the right time to move.',
        benefits: ['Borrowing capacity', 'Repayment pressure', 'Loan structure'],
        outcomes: [
          'A clear picture of what you may be able to borrow',
          'A practical look at how repayments could affect cash flow',
          'A simple strategy for your next move before you commit'
        ],
        stats: [
          { value: '15 min', label: 'discovery call' },
          { value: '1:1', label: 'guidance' },
          { value: '0', label: 'sales pressure' }
        ],
        reviews: [
          { name: 'Chris', quote: 'I left the call with a much clearer idea of what I could realistically do.' },
          { name: 'Alicia', quote: 'The advice helped me compare options before I made a decision.' },
          { name: 'Ben', quote: 'Very practical and easy to understand.' }
        ]
      };
    }

    if (normalizedPath.includes('/refinance')) {
      return {
        title: 'See whether refinancing could lower your monthly cost',
        subtitle: 'Review your current loan, compare rate options and understand whether switching could improve your repayments.',
        cta: 'Book My Free 15-Min Strategy Session',
        eyebrow: 'Refinance review call',
        intro: 'A calm, strategic review to help you decide whether refinancing is worth exploring.',
        benefits: ['Current loan review', 'Rate comparison', 'Switching strategy'],
        outcomes: [
          'A clear comparison of your current loan versus better options',
          'A practical view of what savings could look like',
          'A straightforward recommendation on whether switching is worth it'
        ],
        stats: [
          { value: '15 min', label: 'review call' },
          { value: '2–3', label: 'rate options' },
          { value: '100%', label: 'clarity' }
        ],
        reviews: [
          { name: 'Priya S.', role: 'Homeowner', quote: 'Vineet made refinancing easy. He explained everything clearly and got us a much better rate.' },
          { name: 'Michael R.', role: 'Property Investor', quote: 'Great communication and excellent service. Highly recommend CredQ for refinance guidance.' },
          { name: 'Simran K.', role: 'First Home Buyer', quote: 'Professional and knowledgeable, and genuinely focused on getting the best outcome for us.' }
        ]
      };
    }

    return {
      title: 'Book a 15-minute mortgage discovery call',
      subtitle: 'Get clear answers on borrowing power, your next move, and the best option for your situation.',
      cta: 'Book My Free 15-Min Strategy Session',
      eyebrow: 'Free 15-minute discovery call',
      intro: 'A premium, no-pressure call designed to help you move forward with confidence.',
      benefits: ['Borrowing power', 'Next step', 'Best-fit strategy'],
      outcomes: [
        'A clear explanation of what you may be able to borrow',
        'A simple breakdown of the most suitable next step',
        'A calm recommendation based on your actual situation'
      ],
      stats: [
        { value: '15 min', label: 'discovery call' },
        { value: '1:1', label: 'guidance' },
        { value: '0', label: 'pressure' }
      ],
      reviews: [
        { name: 'Nadia', quote: 'The call made the whole process feel much less overwhelming.' },
        { name: 'David', quote: 'I left with a clear plan and a better understanding of my options.' },
        { name: 'Mina', quote: 'Simple, calm guidance and very practical advice.' }
      ]
    };
  }, [normalizedPath]);

  useEffect(() => {
    document.title = pageMetadata.title;

    const setMetaContent = (selector, content) => {
      const element = document.querySelector(selector);
      if (element) element.setAttribute('content', content);
    };

    setMetaContent('meta[name="description"]', pageMetadata.description);
    setMetaContent('meta[property="og:title"]', pageMetadata.title);
    setMetaContent('meta[property="og:description"]', pageMetadata.description);
    setMetaContent('meta[name="twitter:title"]', pageMetadata.title);
    setMetaContent('meta[name="twitter:description"]', pageMetadata.description);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', pageMetadata.canonical);
  }, [pageMetadata]);

  useEffect(() => {
    loadMetaPixel();
    sendCapiEvent('PageView', { content_name: offer.title });
  }, [offer.title]);

  useEffect(() => {
    setLeadForm({ firstName: '', mobile: '', email: '', consent: false });
    setLeadCaptureError('');
    setIsSubmittingLead(false);
    setLeadCaptured(false);
    setLeadDocId('');
    setIsCalendlyLoading(true);
    setOtpState({ sending: false, sent: false, verifying: false, verified: false, code: '', message: '', confirmationResult: null });
  }, [normalizedPath]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(OTP_ATTEMPTS_SESSION_KEY, String(otpSendAttempts));
  }, [otpSendAttempts]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(OTP_COOLDOWN_UNTIL_SESSION_KEY, String(otpCooldownUntil));
  }, [otpCooldownUntil]);

  useEffect(() => {
    if (otpCooldownSeconds <= 0) return;

    const timer = window.setInterval(() => {
      if (Date.now() >= otpCooldownUntil) {
        setOtpCooldownUntil(0);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [otpCooldownSeconds, otpCooldownUntil]);

  useEffect(() => {
    if (otpState.sent && !otpState.verified) {
      otpInputRef.current?.focus?.();
    }
  }, [otpState.sent, otpState.verified]);

  useEffect(() => {
    if (!usesEmbeddedCalendly || typeof window === 'undefined') return;

    const calendlyPreconnect = document.createElement('link');
    calendlyPreconnect.rel = 'preconnect';
    calendlyPreconnect.href = 'https://calendly.com';

    const calendlyAssetsPreconnect = document.createElement('link');
    calendlyAssetsPreconnect.rel = 'preconnect';
    calendlyAssetsPreconnect.href = 'https://assets.calendly.com';

    document.head.appendChild(calendlyPreconnect);
    document.head.appendChild(calendlyAssetsPreconnect);

    const handleCalendlyEvent = (event) => {
      const calendlyEvent = event?.data?.event;
      if (typeof calendlyEvent !== 'string' || !calendlyEvent.startsWith('calendly.')) return;

      if (calendlyEvent === 'calendly.profile_page_viewed') {
        setIsCalendlyLoading(false);
        window.fbq?.('trackCustom', 'CalendlyViewed', { content_name: offer.title });
        sendCapiEvent('CalendlyViewed', { content_name: offer.title, calendly_event: calendlyEvent });
      }

      if (calendlyEvent === 'calendly.event_scheduled') {
        window.fbq?.('track', 'Lead', { content_name: offer.title, source: 'calendly_embed' });
        sendCapiEvent('Lead', { content_name: offer.title, source: 'calendly_embed', calendly_event: calendlyEvent });

        if (leadDocId) {
          loadFirebase().then((fb) => {
            if (!fb?.db) return;
            fb.updateDoc(fb.doc(fb.db, 'landingLeads', leadDocId), {
              followUpStatus: 'booked',
              bookedAt: fb.serverTimestamp()
            }).catch(() => {});
          });
        }
      }
    };

    window.addEventListener('message', handleCalendlyEvent);
    return () => {
      window.removeEventListener('message', handleCalendlyEvent);
      calendlyPreconnect.remove();
      calendlyAssetsPreconnect.remove();
    };
  }, [leadDocId, offer.title, usesEmbeddedCalendly]);

  useEffect(() => {
    if (!usesEmbeddedCalendly || !otpFeatureEnabled || typeof window === 'undefined') return;

    const googleApisPreconnect = document.createElement('link');
    googleApisPreconnect.rel = 'preconnect';
    googleApisPreconnect.href = 'https://www.googleapis.com';

    const gstaticPreconnect = document.createElement('link');
    gstaticPreconnect.rel = 'preconnect';
    gstaticPreconnect.href = 'https://www.gstatic.com';

    document.head.appendChild(googleApisPreconnect);
    document.head.appendChild(gstaticPreconnect);

    let cancelled = false;

    const warmRecaptcha = async () => {
      try {
        await getRecaptchaVerifier();
      } catch {
        // Ignore warm-up failures; the explicit send flow will surface any real issue.
      }
    };

    window.requestIdleCallback?.(warmRecaptcha) ?? window.setTimeout(warmRecaptcha, 1200);

    return () => {
      cancelled = true;
      googleApisPreconnect.remove();
      gstaticPreconnect.remove();
      if (cancelled && window.leadOtpRecaptchaVerifier) {
        try {
          window.leadOtpRecaptchaVerifier.clear();
        } catch {
          // no-op
        }
      }
    };
  }, [usesEmbeddedCalendly]);

  useEffect(() => {
    if (!usesEmbeddedCalendly || typeof window === 'undefined') return;

    const bookingSection = document.getElementById('book-session');
    if (!bookingSection || typeof window.IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsBookingSectionVisible(Boolean(entry?.isIntersecting));
      },
      {
        root: null,
        threshold: 0.2,
        rootMargin: '0px 0px -84px 0px'
      }
    );

    observer.observe(bookingSection);
    return () => observer.disconnect();
  }, [usesEmbeddedCalendly]);

  const handleCta = () => {
    if (usesEmbeddedCalendly) {
      if (!leadCaptured) {
        window.fbq?.('trackCustom', 'LeadCaptureStarted', { content_name: offer.title });
        sendCapiEvent('LeadCaptureStarted', { content_name: offer.title });
        document.getElementById('lead-capture')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      window.fbq?.('trackCustom', 'CalendlyEmbedIntent', { content_name: offer.title });
      sendCapiEvent('CalendlyEmbedIntent', { content_name: offer.title });
      document.getElementById('book-session')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    window.fbq?.('track', 'Lead', { content_name: offer.title, source: 'calendly_redirect' });
    sendCapiEvent('Lead', { content_name: offer.title, source: 'calendly_redirect' });
    window.location.href = buildCalendlyUrl({});
  };

  const primaryCta = 'Book My Free 15-Min Strategy Session';

  const handleLeadField = (field, value) => {
    if (field === 'mobile') {
      const digits = value.replace(/\D/g, '').slice(0, 10);
      setLeadForm((prev) => ({ ...prev, [field]: digits }));
    } else {
      setLeadForm((prev) => ({ ...prev, [field]: value }));
    }

    if (field === 'mobile') {
      setOtpState((prev) => ({
        ...prev,
        sent: false,
        verified: false,
        code: '',
        message: '',
        confirmationResult: null
      }));
    }
  };

  const getRecaptchaVerifier = async (forceNew = false) => {
    const fb = await loadFirebase();
    if (typeof window === 'undefined' || !fb?.auth) {
      throw new Error('otp_unavailable');
    }

    if (forceNew && window.leadOtpRecaptchaVerifier) {
      try {
        window.leadOtpRecaptchaVerifier.clear();
      } catch {
        // no-op
      }
      window.leadOtpRecaptchaVerifier = null;
    }

    const container = document.getElementById('lead-otp-recaptcha');
    if (!container) {
      throw new Error('otp_widget_missing');
    }

    if (!window.leadOtpRecaptchaVerifier) {
      window.leadOtpRecaptchaVerifier = new fb.RecaptchaVerifier(fb.auth, 'lead-otp-recaptcha', {
        size: 'invisible'
      });
      await window.leadOtpRecaptchaVerifier.render();
    }

    return window.leadOtpRecaptchaVerifier;
  };

  const handleOtpSend = async () => {
    const mobile = leadForm.mobile.trim();

    setLeadCaptureError('');

    if (otpSendAttempts >= OTP_MAX_SEND_ATTEMPTS) {
      setOtpState((prev) => ({ ...prev, message: 'OTP send limit reached for this session. Please continue later or restart your session.' }));
      return;
    }

    if (otpCooldownSeconds > 0) {
      setOtpState((prev) => ({ ...prev, message: `Please wait ${otpCooldownSeconds}s before requesting another OTP.` }));
      return;
    }

    if (!mobile) {
      setOtpState((prev) => ({ ...prev, message: 'Enter your mobile number first.' }));
      return;
    }

    if (!isAuLocalMobile(mobile)) {
      setOtpState((prev) => ({ ...prev, message: 'Enter an Australian mobile in local format: 04xxxxxxxx.' }));
      return;
    }

    const formattedMobile = formatAuMobileToE164(mobile);
    if (!formattedMobile) {
      setOtpState((prev) => ({ ...prev, message: 'Use a valid Australian mobile format (for example 04xx xxx xxx).' }));
      return;
    }

    setOtpState((prev) => ({
      ...prev,
      sending: true,
      sent: true,
      verified: false,
      message: 'Code on the way. Enter the 6-digit code as soon as it arrives.',
      confirmationResult: null
    }));

    try {
      const fb = await loadFirebase();
      const verifier = await getRecaptchaVerifier();
      let confirmationResult;

      try {
        confirmationResult = await fb.signInWithPhoneNumber(fb.auth, formattedMobile, verifier);
      } catch (firstError) {
        const firstCode = typeof firstError?.code === 'string' ? firstError.code : '';

        // Retry once with a fresh reCAPTCHA instance for transient app-credential/captcha issues.
        if (firstCode.includes('auth/invalid-app-credential') || firstCode.includes('auth/captcha-check-failed')) {
          const retryVerifier = await getRecaptchaVerifier(true);
          confirmationResult = await fb.signInWithPhoneNumber(fb.auth, formattedMobile, retryVerifier);
        } else {
          throw firstError;
        }
      }

      setOtpState((prev) => ({
        ...prev,
        sending: false,
        message: 'Code sent. Enter the 6-digit code to verify your mobile.',
        confirmationResult
      }));
      setOtpSendAttempts((prev) => prev + 1);
      setOtpCooldownUntil(Date.now() + (OTP_RESEND_COOLDOWN_SECONDS * 1000));
    } catch (error) {
      if (isOtpRateLimitedError(error)) {
        setOtpCooldownUntil((prev) => Math.max(prev, Date.now() + (OTP_RATE_LIMIT_LOCKOUT_SECONDS * 1000)));
      }
      console.warn('OTP send failed', error);
      setFormFailedAttempts((prev) => prev + 1);
      setOtpState((prev) => ({
        ...prev,
        sending: false,
        sent: false,
        confirmationResult: null,
        message: getOtpErrorMessage(error)
      }));
    }
  };

  const handleOtpVerify = async () => {
    const mobile = leadForm.mobile.trim();
    const code = otpState.code.trim();

    if (!mobile || !code) {
      setOtpState((prev) => ({ ...prev, message: 'Enter both mobile number and OTP code.' }));
      return;
    }
    if (!otpState.confirmationResult) {
      setOtpState((prev) => ({ ...prev, message: 'Please send OTP first.' }));
      return;
    }
    if (otpState.verifying) {
      return;
    }

    setOtpState((prev) => ({ ...prev, verifying: true, message: 'Checking code...' }));
    try {
      await withTimeout(otpState.confirmationResult.confirm(code), OTP_VERIFY_TIMEOUT_MS);
      // Mark verified immediately so follow-up auth cleanup cannot trap the UI in loading state.
      setOtpState((prev) => ({
        ...prev,
        verifying: false,
        verified: true,
        confirmationResult: null,
        message: 'Mobile verified. Next: enter your email and tick consent to continue.'
      }));

      const fb = await loadFirebase();
      if (fb?.auth?.currentUser) {
        void fb.signOut(fb.auth).catch(() => {});
      }
    } catch (error) {
      console.warn('OTP verify failed', error);
      setFormFailedAttempts((prev) => prev + 1);
      setOtpState((prev) => ({ ...prev, verifying: false, verified: false, message: getOtpVerifyErrorMessage(error) }));
    }
  };

  useEffect(() => {
    const normalizedCode = otpState.code.replace(/\D/g, '');
    if (!otpState.sent || otpState.verified || otpState.verifying) return;
    if (!otpState.confirmationResult) return;
    if (normalizedCode.length !== 6) return;

    void handleOtpVerify();
  }, [otpState.code, otpState.sent, otpState.verified, otpState.verifying, otpState.confirmationResult]);

  useEffect(() => {
    // Only the OTP flow needs this auto-continue effect (verification finishing is an async
    // event, not a click). The non-OTP flow already saves explicitly from handleLeadSubmit.
    if (!usesEmbeddedCalendly || !otpFeatureEnabled || !canContinueAfterOtp || leadCaptured) return;
    void saveLeadRecordAndContinue();
  }, [canContinueAfterOtp, leadCaptured, usesEmbeddedCalendly]);

  const saveLeadRecordAndContinue = async () => {
    if (leadCaptured) {
      document.getElementById('book-session')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return true;
    }

    setIsSubmittingLead(true);
    setLeadCaptured(true);
    setTimeout(() => {
      document.getElementById('book-session')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);

    const payload = {
      firstName: leadForm.firstName.trim() || 'Prospect',
      mobile: leadForm.mobile.trim(),
      email: leadForm.email.trim(),
      mobileVerified: true,
      consent: leadForm.consent,
      pagePath: normalizedPath,
      pageTitle: offer.title,
      source: 'landing_two_step',
      capturedAt: new Date().toISOString(),
      otpVerificationStatus: 'verified'
    };

    try {
      if (!hasFirebaseConfig) {
        throw new Error('Firebase config missing');
      }

      const fb = await loadFirebase();
      if (!fb?.db) {
        throw new Error('Firebase config missing');
      }

      const followUpAt = new Date(Date.now() + (60 * 60 * 1000)).toISOString();
      const leadRef = await fb.addDoc(fb.collection(fb.db, 'landingLeads'), {
        ...payload,
        followUpStatus: 'pending',
        followUpDueAt: followUpAt,
        createdAt: fb.serverTimestamp()
      });
      setLeadDocId(leadRef.id);

      window.fbq?.('trackCustom', 'LeadCaptured', { content_name: offer.title, source: 'two_step_form' });
      sendCapiEvent('LeadCaptured', { content_name: offer.title, source: 'two_step_form' });
      return true;
    } catch {
      console.warn('Lead save failed after OTP verification; booking flow continues.');
      return false;
    } finally {
      setIsSubmittingLead(false);
    }
  };

  const handleLeadSubmit = async (event) => {
    event.preventDefault();
    setLeadCaptureError('');

    if (!leadForm.firstName.trim()) {
      setLeadCaptureError('Please enter your first name.');
      setFormFailedAttempts((prev) => prev + 1);
      return;
    }

    if (!leadForm.mobile.trim()) {
      setLeadCaptureError('Please enter your mobile number.');
      setFormFailedAttempts((prev) => prev + 1);
      return;
    }

    if (!isAuLocalMobile(leadForm.mobile)) {
      setLeadCaptureError('Please enter a valid Australian mobile in local format (04xxxxxxxx).');
      setFormFailedAttempts((prev) => prev + 1);
      return;
    }

    if (!leadForm.email.trim()) {
      setLeadCaptureError('Please enter your email so we can send your meeting confirmation.');
      setFormFailedAttempts((prev) => prev + 1);
      return;
    }

    if (!leadForm.consent) {
      setLeadCaptureError('Please provide consent so we can contact you about your enquiry.');
      setFormFailedAttempts((prev) => prev + 1);
      return;
    }

    if (otpFeatureEnabled && !otpState.verified) {
      setLeadCaptureError('Please verify your mobile number with OTP before continuing.');
      setFormFailedAttempts((prev) => prev + 1);
      return;
    }

    await saveLeadRecordAndContinue();
  };

  const faqItems = useMemo(() => {
    if (normalizedPath.includes('/first-home')) {
      return [
        {
          question: 'How much deposit do I need as a first home buyer?',
          answer: 'It depends on your goals and lender policy, but many buyers can move forward with less than a 20% deposit when the structure is right.'
        },
        {
          question: 'Can CredQ help with grants and first-home schemes?',
          answer: 'Yes. We explain common first-home buyer grants and support options in plain language and how they may apply to your scenario.'
        },
        {
          question: 'What do I get from a 15-minute strategy session?',
          answer: 'You get a realistic borrowing range, deposit pathway options, and a clear next step so you can move forward confidently.'
        }
      ];
    }

    if (normalizedPath.includes('/investment')) {
      return [
        {
          question: 'How do I know if an investment loan structure is right for me?',
          answer: 'We compare borrowing capacity, repayment pressure and loan structure options so you can make a smarter decision before you commit.'
        },
        {
          question: 'Can CredQ help compare lenders for investors?',
          answer: 'Yes. We review lender policy differences that matter for investors, including servicing approach and scenario fit.'
        },
        {
          question: 'What outcome should I expect from the strategy call?',
          answer: 'You leave with a clearer borrowing picture and an action plan for your next investment move.'
        }
      ];
    }

    if (normalizedPath.includes('/refinance')) {
      return [
        {
          question: 'How do I know if refinancing is worth it?',
          answer: 'We compare your current loan against market options and estimate whether switching could improve repayments or flexibility.'
        },
        {
          question: 'Can refinancing help access equity?',
          answer: 'In many cases, yes. We review your scenario and explain whether equity release could support your next goal.'
        },
        {
          question: 'What happens after the 15-minute session?',
          answer: 'You receive a clear recommendation on whether to stay, switch, or gather more info before making a decision.'
        }
      ];
    }

    return [
      {
        question: 'Why do people choose CredQ over generic loan comparison sites?',
        answer: 'You get one-to-one strategy guidance tailored to your situation, not generic rates without context.'
      },
      {
        question: 'What does the free strategy session cover?',
        answer: 'We cover borrowing power, loan-fit options and your best next step based on your goals and numbers.'
      },
      {
        question: 'Is this a pressure-free call?',
        answer: 'Yes. The session is focused on clarity and decision support, not sales pressure.'
      }
    ];
  }, [normalizedPath]);

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <main className={usesEmbeddedCalendly ? 'mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8 lg:pb-8' : 'mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8'}>
        <header className="flex items-center justify-between gap-3 rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-6">
          <img src="/logo.png" alt="CredQ" className="h-10 w-auto" />
          <div className="flex items-center gap-3">
            <a href="tel:0470388310" className="hidden text-sm font-semibold text-slate-700 sm:inline">0470 388 310</a>
            <button
              onClick={handleCta}
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              {primaryCta}
            </button>
          </div>
        </header>

        <section className="landing-hero relative overflow-hidden rounded-[36px] border border-slate-200/80 bg-white shadow-[0_30px_80px_-24px_rgba(15,23,42,0.25)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.16),_transparent_36%),radial-gradient(circle_at_bottom_right,_rgba(15,23,42,0.08),_transparent_34%)]" />
          <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.08fr_0.92fr] lg:p-10 xl:p-12">
            <div className="flex flex-col justify-center">
              <p className="mb-3 inline-flex w-fit rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">{offer.eyebrow}</p>
              <h1 className="max-w-2xl text-3xl font-black leading-tight text-slate-900 sm:text-4xl lg:text-5xl">
                {offer.title}
              </h1>
              <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold text-slate-700">
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-800">★★★★★ Rated 5.0 on Google</span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800">500+ strategy sessions delivered</span>
                <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-800">We usually respond within 1 business hour</span>
              </div>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">{offer.subtitle}</p>
              <p className="mt-3 max-w-xl text-base text-slate-500">{offer.intro}</p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleCta}
                  className="rounded-full bg-slate-900 px-6 py-3 text-center text-base font-semibold text-white transition hover:bg-slate-700"
                >
                  {primaryCta}
                </button>
                <a href="#reviews" className="rounded-full border border-slate-300 px-6 py-3 text-center text-base font-semibold text-slate-700 transition hover:bg-slate-50">
                  See What Clients Say
                </a>
              </div>

              <div className="mt-6 flex flex-wrap gap-2 text-sm text-slate-600">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">Trusted local guidance</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">No pressure advice</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">Clear next steps</span>
              </div>

              {usesEmbeddedCalendly ? (
                <div className="mt-6 grid gap-2 lg:hidden">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">What you’ll leave with</p>
                  {offer.outcomes.map((item) => (
                    <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700">
                      {item}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className={usesEmbeddedCalendly ? 'hidden rounded-[28px] border border-slate-200 bg-slate-950 p-6 text-white sm:p-8 lg:block' : 'rounded-[28px] border border-slate-200 bg-slate-950 p-6 text-white sm:p-8'}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">What you’ll leave with</p>
                  <h2 className="mt-2 text-2xl font-semibold">Clarity, not confusion</h2>
                </div>
                <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-sm font-medium text-slate-200">
                  Premium consult
                </div>
              </div>

              <div className="mt-6 grid gap-3">
                {offer.outcomes.map((item) => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-slate-200">
                    {item}
                  </div>
                ))}
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {offer.stats.map((stat) => (
                  <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-4 text-center">
                    <p className="text-lg font-semibold text-white">{stat.value}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-400">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {usesEmbeddedCalendly ? (
          <section id="lead-capture" className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/70 sm:p-8">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Step 1 of 2</p>
              <h2 className="text-2xl font-bold text-slate-900">Save your details before booking</h2>
              <p className="text-sm text-slate-600">Enter your details so we can follow up if you get interrupted before selecting a time slot.</p>
            </div>

            <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={handleLeadSubmit}>
              <input
                type="text"
                value={leadForm.firstName}
                onChange={(event) => handleLeadField('firstName', event.target.value)}
                placeholder="First name *"
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                required
              />
              <input
                type="tel"
                value={leadForm.mobile}
                onChange={(event) => handleLeadField('mobile', event.target.value)}
                placeholder="Mobile number * (e.g. 0412345678)"
                inputMode="numeric"
                pattern="04[0-9]{8}"
                maxLength={10}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                required
              />
              <p className="text-xs text-slate-600 sm:col-span-2">
                We send a one-time code to instantly verify your identity and protect your financial privacy.
              </p>
              {usesEmbeddedCalendly && otpFeatureEnabled && !otpState.verified ? (
                <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={handleOtpSend}
                      disabled={otpState.sending || otpState.verified || otpCooldownSeconds > 0 || otpSendAttempts >= OTP_MAX_SEND_ATTEMPTS || !leadForm.mobile.trim()}
                      className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {otpState.verified
                        ? 'Mobile verified'
                        : otpSendAttempts >= OTP_MAX_SEND_ATTEMPTS
                            ? 'Code limit reached'
                            : otpCooldownSeconds > 0
                              ? `Resend code in ${otpCooldownSeconds}s`
                              : 'Text me a code'}
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      name="one-time-code"
                      pattern="[0-9]*"
                      value={otpState.code}
                      onChange={(event) => {
                        const digitsOnly = event.target.value.replace(/\D/g, '').slice(0, 6);
                        setOtpState((prev) => ({ ...prev, code: digitsOnly }));
                      }}
                      placeholder="Enter 6-digit code"
                      ref={otpInputRef}
                      maxLength={6}
                      className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 sm:max-w-[180px]"
                      disabled={!otpState.sent || otpState.verified}
                    />
                    {otpState.verifying ? <p className="text-xs font-semibold text-slate-600">Checking code...</p> : null}
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    {otpState.message || `OTP verification is required before you can continue. ${otpAttemptsRemaining} send attempts remaining this session.`}
                  </p>
                  <div id="lead-otp-recaptcha" />
                </div>
              ) : null}
              <input
                type="email"
                value={leadForm.email}
                onChange={(event) => handleLeadField('email', event.target.value)}
                placeholder="Email *"
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 sm:col-span-2"
                required
              />
              <p className="text-xs text-slate-600 sm:col-span-2">
                We use your email to send booking confirmation and any change/update notices.
              </p>

              <label className="flex items-start gap-2 text-xs text-slate-600 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={leadForm.consent}
                  onChange={(event) => handleLeadField('consent', event.target.checked)}
                  className="mt-0.5"
                  required
                />
                <span>I consent to CredQ contacting me about my mortgage enquiry, agree to the Privacy Policy.</span>
              </label>

              {leadCaptureError ? <p className="text-sm text-rose-600 sm:col-span-2">{leadCaptureError}</p> : null}
              {formFailedAttempts > 0 ? (
                <p className="text-sm font-medium text-slate-700 sm:col-span-2">
                  Having trouble? <a href="tel:0470388310" className="underline">Call us instead on 0470 388 310</a>
                </p>
              ) : null}
              {otpFeatureEnabled ? (
                leadCaptured ? <p className="text-sm font-medium text-slate-700 sm:col-span-2">Details saved. Opening booking below...</p> : null
              ) : (
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={isSubmittingLead || leadCaptured}
                    className="w-full rounded-full bg-slate-900 px-6 py-3 text-center text-base font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-500"
                  >
                    {leadCaptured ? 'Details saved - Continue to booking below' : isSubmittingLead ? 'Saving your details...' : 'Continue to Step 2 - Book Time'}
                  </button>
                </div>
              )}
            </form>
          </section>
        ) : null}

        {usesEmbeddedCalendly ? (
          <section id="book-session" className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/70 sm:p-8">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Step 2 of 2</p>
              <h2 className="text-2xl font-bold text-slate-900">Book My Free 15-Min Strategy Session</h2>
              <p className="text-sm text-slate-600">Book a discovery call and leave with a sharper view of your options, your numbers, and the best path forward.</p>
            </div>

            <div className="relative mt-5 overflow-hidden rounded-2xl border border-slate-200">
              <div className={canContinueAfterOtp ? '' : 'pointer-events-none opacity-40'}>
                <iframe
                  src={calendlyUrl}
                  title="Book My Free 15-Min Strategy Session"
                  className="h-[860px] w-full sm:h-[760px]"
                  loading="eager"
                  onLoad={() => setIsCalendlyLoading(false)}
                />
              </div>
              {canContinueAfterOtp && isCalendlyLoading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 p-5 text-center text-sm font-medium text-slate-700">
                  Loading booking times...
                </div>
              ) : null}
              {!canContinueAfterOtp ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/85 p-5 text-center text-sm font-medium text-slate-700">
                Add your name, mobile and email above, then tick consent to continue to booking.
              </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className={usesEmbeddedCalendly ? 'grid gap-4' : 'grid gap-4 lg:grid-cols-[0.9fr_1.1fr]'}>
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/70 sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Why clients choose CredQ</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">A strategy-first broker experience built around your next move</h2>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Get clear, practical guidance focused on your goals, your numbers, and your strongest next step.
            </p>
            <div className="mt-5 grid gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700">
                Independent lender comparison matched to your goals, not one-size-fits-all recommendations.
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700">
                A clear action plan in 15 minutes so you know your best next step immediately.
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700">
                No-pressure advice from a broker focused on long-term fit, not short-term volume.
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {offer.benefits.map((benefit) => (
                <div key={benefit} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700">
                  {benefit}
                </div>
              ))}
            </div>
          </div>

          {!usesEmbeddedCalendly ? (
          <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-lg shadow-slate-200/70 sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Your next step</p>
            <h2 className="mt-2 text-2xl font-bold">A clear, high-conviction next step</h2>
            <p className="mt-3 text-base leading-7 text-slate-300">
              Book a discovery call and leave with a sharper view of your options, your numbers, and the best path forward.
            </p>
            <button
              onClick={handleCta}
              className="mt-6 rounded-full bg-white px-6 py-3 text-base font-semibold text-slate-900 transition hover:bg-slate-100"
            >
              {primaryCta}
            </button>
          </div>
          ) : null}
        </section>

        <section id="reviews" className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/70 sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Client feedback</p>
              <h2 className="text-2xl font-bold text-slate-900">Why people choose CredQ</h2>
            </div>
            <p className="text-sm text-slate-600">Real feedback from people who wanted clarity before acting.</p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {offer.reviews.map((review) => (
              <div key={review.name} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-base text-amber-500">★★★★★</p>
                <p className="text-sm text-slate-600">“{review.quote}”</p>
                <p className="mt-3 font-semibold text-slate-900">— {review.name}</p>
                {review.role ? <p className="text-xs text-slate-500">{review.role}</p> : null}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/70 sm:p-8">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Frequently asked questions</p>
            <h2 className="text-2xl font-bold text-slate-900">Common questions before booking</h2>
          </div>
          <div className="mt-5 grid gap-3">
            {faqItems.map((faq) => (
              <details key={faq.question} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">{faq.question}</summary>
                <p className="mt-2 text-sm leading-6 text-slate-600">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      {showMobileStickyCta ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-10px_24px_-12px_rgba(15,23,42,0.35)] backdrop-blur lg:hidden">
          <button
            onClick={handleCta}
            className="w-full rounded-full bg-slate-900 px-6 py-3 text-center text-base font-semibold text-white transition hover:bg-slate-700"
          >
            {primaryCta}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default App;