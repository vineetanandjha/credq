const FORM_ENDPOINT = 'https://formspree.io/f/mlgwzgva';

function formatCurrency(value) {
    return new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: 'AUD',
        maximumFractionDigits: 0
    }).format(Math.max(0, Math.round(value)));
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function sendFormPayload(payload) {
    return fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
    });
}

function setupShortLeadForm(form) {
    const successMessage = form.parentElement ? form.parentElement.querySelector('.success-message') : null;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const name = form.querySelector('[name="name"]')?.value.trim();
        const email = form.querySelector('[name="email"]')?.value.trim();
        const phone = form.querySelector('[name="phone"]')?.value.trim();
        const service = form.querySelector('[name="service"]')?.value.trim();
        const postcode = form.querySelector('[name="postcode"]')?.value.trim();
        const consent = form.querySelector('[name="consent"]')?.checked;

        if (!name || !email || !phone || !service || !consent) {
            alert('Please complete the required fields.');
            return;
        }

        try {
            const response = await sendFormPayload({
                name,
                email,
                phone,
                service,
                postcode,
                consent: 'yes',
                source: document.title
            });

            if (!response.ok) {
                throw new Error('Lead submission failed');
            }

            form.style.display = 'none';
            if (successMessage) {
                successMessage.style.display = 'block';
                successMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            form.reset();
        } catch (error) {
            console.error('Lead form submission error:', error);
            alert('There was an error submitting your request. Please try again.');
        }
    });
}

function setupBorrowingCalculator(form) {
    const stepOne = form.querySelector('[data-calculator-step="1"]');
    const stepTwo = form.querySelector('[data-calculator-step="2"]');
    const resultValue = document.getElementById('calculatorResultValue');
    const resultCopy = document.getElementById('calculatorResultCopy');
    const successMessage = document.getElementById('calculatorSuccessMessage');
    const submitButton = form.querySelector('[data-calculator-submit]');

    const state = {
        estimateMin: 0,
        estimateMax: 0,
        budgetMin: 0,
        budgetMax: 0,
        unlocked: false
    };

    function calculateEstimate() {
        const annualIncome = Number(form.querySelector('[name="annualIncome"]')?.value || 0);
        const monthlyDebts = Number(form.querySelector('[name="monthlyDebts"]')?.value || 0);
        const deposit = Number(form.querySelector('[name="deposit"]')?.value || 0);
        const loanType = form.querySelector('[name="loanType"]')?.value || 'owner-occupier';

        const multiplierByLoanType = {
            'owner-occupier': 5.4,
            refinance: 5.1,
            investor: 4.7,
            'low-deposit': 4.8
        };

        const multiplier = multiplierByLoanType[loanType] || 5.0;
        const debtPenalty = monthlyDebts * 12 * 4.8;
        const baseBorrow = (annualIncome * multiplier) - debtPenalty;
        const adjustedBorrow = clamp(baseBorrow, 180000, 2500000);
        const lowEstimate = adjustedBorrow * 0.92;
        const highEstimate = adjustedBorrow * 1.08;

        state.estimateMin = lowEstimate;
        state.estimateMax = highEstimate;
        state.budgetMin = lowEstimate + deposit;
        state.budgetMax = highEstimate + deposit;
    }

    function updatePreview(locked = true) {
        if (!resultValue || !resultCopy) {
            return;
        }

        if (locked) {
            resultValue.textContent = 'Estimate ready to unlock';
            resultCopy.textContent = 'Enter your email and mobile number to see the full borrowing range and get the same-day assessment.';
            return;
        }

        resultValue.textContent = `Estimated borrowing power: ${formatCurrency(state.estimateMin)} to ${formatCurrency(state.estimateMax)}`;
        resultCopy.textContent = `Estimated purchase budget including your deposit: ${formatCurrency(state.budgetMin)} to ${formatCurrency(state.budgetMax)}.`;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const isStepTwoVisible = !stepTwo.classList.contains('is-hidden');

        if (!isStepTwoVisible) {
            const annualIncome = Number(form.querySelector('[name="annualIncome"]')?.value || 0);
            const monthlyDebts = Number(form.querySelector('[name="monthlyDebts"]')?.value || 0);
            const deposit = Number(form.querySelector('[name="deposit"]')?.value || 0);
            const loanType = form.querySelector('[name="loanType"]')?.value;
            const postcode = form.querySelector('[name="postcode"]')?.value.trim();

            if (!annualIncome || !loanType || !postcode) {
                alert('Please complete the calculator fields to continue.');
                return;
            }

            calculateEstimate();
            state.unlocked = true;
            updatePreview(true);

            stepTwo.classList.remove('is-hidden');
            stepTwo.hidden = false;
            submitButton.textContent = 'Unlock full estimate';
            submitButton.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }

        const name = form.querySelector('[name="name"]')?.value.trim();
        const email = form.querySelector('[name="email"]')?.value.trim();
        const phone = form.querySelector('[name="phone"]')?.value.trim();
        const consent = form.querySelector('[name="consent"]')?.checked;
        const postcode = form.querySelector('[name="postcode"]')?.value.trim();
        const loanType = form.querySelector('[name="loanType"]')?.value;

        if (!name || !email || !phone || !consent) {
            alert('Please complete the contact details to unlock your full estimate.');
            return;
        }

        try {
            const response = await sendFormPayload({
                name,
                email,
                phone,
                consent: 'yes',
                postcode,
                loanType,
                annualIncome: form.querySelector('[name="annualIncome"]')?.value,
                monthlyDebts: form.querySelector('[name="monthlyDebts"]')?.value,
                deposit: form.querySelector('[name="deposit"]')?.value,
                estimateMin: formatCurrency(state.estimateMin),
                estimateMax: formatCurrency(state.estimateMax),
                budgetMin: formatCurrency(state.budgetMin),
                budgetMax: formatCurrency(state.budgetMax),
                source: 'Borrowing power calculator'
            });

            if (!response.ok) {
                throw new Error('Calculator submission failed');
            }

            updatePreview(false);
            form.style.display = 'none';
            if (successMessage) {
                successMessage.style.display = 'block';
                successMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } catch (error) {
            console.error('Calculator submission error:', error);
            alert('There was an error sending your estimate. Please try again.');
        }
    });
}

// Mobile Navigation Toggle
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');

if (hamburger && navMenu) {
    hamburger.addEventListener('click', () => {
        navMenu.classList.toggle('active');
        hamburger.classList.toggle('active');
    });

    document.querySelectorAll('.nav-menu a').forEach(link => {
        link.addEventListener('click', () => {
            navMenu.classList.remove('active');
            hamburger.classList.remove('active');
        });
    });
}

// Smooth Scrolling
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const targetSelector = this.getAttribute('href');
        const target = targetSelector ? document.querySelector(targetSelector) : null;

        if (!target) {
            return;
        }

        e.preventDefault();
        target.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    });
});

const borrowCalculatorForm = document.getElementById('borrowCalculatorForm');
if (borrowCalculatorForm) {
    setupBorrowingCalculator(borrowCalculatorForm);
}

const leadForm = document.getElementById('leadForm');
if (leadForm) {
    setupShortLeadForm(leadForm);
}

// Navbar scroll effect
const navbar = document.querySelector('.navbar');

window.addEventListener('scroll', () => {
    if (!navbar) {
        return;
    }

    const currentScroll = window.pageYOffset;

    if (currentScroll > 100) {
        navbar.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
    } else {
        navbar.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
    }
});

// Add animation on scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

document.querySelectorAll('.service-card, .feature, .intent-card, .magnet-card').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
});

// Mobile menu styles for active state
const style = document.createElement('style');
style.textContent = `
    @media (max-width: 768px) {
        .nav-menu.active {
            display: flex;
            flex-direction: column;
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: white;
            padding: 2rem;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            gap: 1rem;
        }

        .hamburger.active span:nth-child(1) {
            transform: rotate(45deg) translate(5px, 5px);
        }

        .hamburger.active span:nth-child(2) {
            opacity: 0;
        }

        .hamburger.active span:nth-child(3) {
            transform: rotate(-45deg) translate(7px, -6px);
        }
    }
`;
document.head.appendChild(style);
