/* Website Planner: guided, conditional project questionnaire.
   Steps are data; `when` decides if a step applies to the current answers. */
(function () {
  "use strict";
  var F = window.VWS_FORMS;
  var root = document.querySelector("[data-planner]");
  if (!root || !F) return;

  var DRAFT_KEY = "vws:planner:v1";
  var MIN_FILL_MS = 20000;

  /* ---------- Icons (static, trusted markup) ---------- */
  var ICON_PATHS = {
    business: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 10h.01M15 10h.01",
    portfolio: "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01",
    ecommerce: "M6 7h12l-1 12H7L6 7zM9 7a3 3 0 0 1 6 0",
    landing: "M4 4h16v6H4zM4 14h7v6H4zM15 14h5v6h-5z",
    blog: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
    personal: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
    service: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5z",
    other: "M12 5v14M5 12h14"
  };
  function icon(name) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(ns, "path");
    p.setAttribute("d", ICON_PATHS[name] || ICON_PATHS.other);
    svg.appendChild(p);
    return svg;
  }

  /* ---------- Reference data ---------- */
  var TYPES = [
    { value: "Business website", key: "business", desc: "Show who you are, what you offer and how to reach you" },
    { value: "Portfolio", key: "portfolio", desc: "Show your work: photos, projects, designs" },
    { value: "E-commerce / online store", key: "ecommerce", desc: "Sell products online with a cart and checkout" },
    { value: "Landing page", key: "landing", desc: "One focused page for an offer, event or campaign" },
    { value: "Blog", key: "blog", desc: "Articles, news or guides you publish regularly" },
    { value: "Personal brand", key: "personal", desc: "For creators, coaches and professionals" },
    { value: "Service website", key: "service", desc: "Clinics, salons, builders, consultants and more" },
    { value: "Something else", key: "other", desc: "Tell me about it on the next steps" }
  ];
  var TYPE_KEYS = TYPES.map(function (t) { return t.key; });
  function typeKey(a) {
    var t = TYPES.filter(function (x) { return x.value === a.type; })[0];
    return t ? t.key : "";
  }

  var SUGGESTED_PAGES = {
    business: ["Home", "About", "Services", "Contact", "FAQ"],
    portfolio: ["Home", "About", "Portfolio", "Contact"],
    ecommerce: ["Home", "Products", "About", "Contact", "FAQ"],
    landing: ["Home"],
    blog: ["Home", "Blog", "About", "Contact"],
    personal: ["Home", "About", "Services", "Blog", "Contact"],
    service: ["Home", "About", "Services", "Pricing", "Contact"],
    other: ["Home", "About", "Contact"]
  };

  var TYPICAL_BUDGET = {
    business: "Business websites usually cost ₹9,999 – ₹19,999.",
    portfolio: "Portfolio websites usually cost ₹5,999 – ₹12,999.",
    ecommerce: "Online stores usually start at ₹24,999, depending on products and payments.",
    landing: "Landing pages usually cost ₹4,999 – ₹9,999.",
    blog: "Blogs usually cost ₹7,999 – ₹14,999.",
    personal: "Personal brand websites usually cost ₹5,999 – ₹12,999.",
    service: "Service websites usually cost ₹9,999 – ₹19,999.",
    other: "Custom projects are quoted after a short conversation."
  };

  function has(list, v) { return Array.isArray(list) && list.indexOf(v) > -1; }

  /* ---------- Steps ---------- */
  var STEPS = [
    {
      id: "type", short: "Website type", section: "Your website",
      title: "What type of website do you need?",
      help: "Pick the closest match. You can explain the details later.",
      fields: [
        { name: "type", kind: "cards", options: TYPES, required: "Please choose the type of website you need." },
        { name: "typeOther", kind: "text", label: "Briefly, what kind of website?", showIf: function (a) { return typeKey(a) === "other"; }, max: 120 },
        { name: "projectKind", kind: "chipsRadio", label: "Is this a new website or a redesign?", options: ["Brand new website", "Redesign of my current website"] },
        { name: "existingUrl", kind: "text", inputType: "url", inputmode: "url", label: "Your current website", placeholder: "e.g. sharmasweets.in", showIf: function (a) { return a.projectKind === "Redesign of my current website"; }, optional: true, url: true, max: 200 }
      ]
    },
    {
      id: "brand", short: "Business name", section: "Your business",
      title: "What is your business or brand name?",
      help: "If you haven't decided on a name yet, just write a working name.",
      fields: [
        { name: "brandName", kind: "text", label: "Business / brand name", placeholder: "e.g. Sharma Sweets", required: "Please enter a name, even a working one.", max: 100, autocomplete: "organization" },
        { name: "hasLogo", kind: "chipsRadio", label: "Do you have a logo or brand colours?", options: ["Yes, logo and colours", "Logo only", "No, I need one", "Not sure"] }
      ]
    },
    {
      id: "about", short: "About the business", section: "Your business",
      title: "What does your business do?",
      help: "A few simple lines are enough. Imagine explaining it to a new customer.",
      fields: [
        { name: "businessDesc", kind: "textarea", label: "About your business", placeholder: "e.g. We make fresh sweets and namkeen and take bulk orders for weddings and events.", required: "Please add a line or two about what you do.", min: 10, max: 1500 }
      ]
    },
    {
      id: "audience", short: "Customers", section: "Your business",
      title: "Who are your customers?",
      help: "This helps decide the tone, layout and which details matter most on the website.",
      fields: [
        { name: "customers", kind: "textarea", label: "Your customers", placeholder: "e.g. Families in Ayodhya and Faizabad, and people ordering for weddings and festivals.", required: "Please describe your customers in a few words.", min: 5, max: 1000, rows: 4 },
        { name: "reach", kind: "chipsRadio", label: "Where are they?", options: ["In my city / nearby", "Across India", "International"] }
      ]
    },
    {
      id: "goal", short: "Main goal", section: "Your business",
      title: "What is the main goal of your website?",
      help: "Pick the one that matters most. Everything on the site will be designed around it.",
      fields: [
        { name: "goal", kind: "cards", compact: true, required: "Please choose the main goal.",
          options: [
            { value: "Get more calls & enquiries", desc: "Leads by phone, WhatsApp or form" },
            { value: "Sell products online", desc: "Orders and payments" },
            { value: "Take bookings", desc: "Appointments, tables, classes" },
            { value: "Show my work", desc: "Portfolio, projects, gallery" },
            { value: "Build trust & credibility", desc: "Look established and professional" },
            { value: "Share information", desc: "Content, news, updates" }
          ]
        },
        { name: "goalOther", kind: "text", label: "Anything specific you want it to achieve?", optional: true, placeholder: "e.g. More enquiries from nearby customers", max: 200 }
      ]
    },
    {
      id: "pages", short: "Pages", section: "Pages & features",
      title: "What pages do you need?",
      help: "I've suggested common pages for your type of website. Add or remove any.",
      suggest: true,
      fields: [
        { name: "pages", kind: "chips", options: ["Home", "About", "Services", "Products", "Portfolio", "Blog", "Contact", "FAQ", "Testimonials", "Pricing", "Gallery", "Careers"], required: "Please choose at least one page." },
        { name: "pagesOther", kind: "text", label: "Any other pages?", optional: true, placeholder: "e.g. Menu, Our team, Franchise", max: 200 }
      ]
    },
    {
      id: "features", short: "Features", section: "Pages & features",
      title: "What features do you need?",
      help: "Choose what your visitors should be able to do. Not sure? Skip it and we'll discuss.",
      fields: [
        { name: "features", kind: "chips", options: ["Contact form", "WhatsApp button", "Booking / appointments", "Online payments", "Login / signup", "User dashboard", "Search", "Product catalog", "Newsletter", "Reviews", "Google Maps", "Social media links", "Multi-language"] },
        { name: "featuresOther", kind: "textarea", label: "Any custom functionality?", optional: true, placeholder: "e.g. A price calculator, a downloadable brochure, a members-only area", max: 1000, rows: 3 }
      ]
    },
    {
      id: "business", short: "Business details", section: "Business details",
      title: "How should customers reach you?",
      help: "For business and service websites, this is where your enquiries come from.",
      when: function (a) { var k = typeKey(a); return k === "business" || k === "service" || k === "landing" || k === "other"; },
      fields: [
        { name: "services", kind: "textarea", label: "Your main services or offers", placeholder: "e.g. Home construction, renovation, interior work", required: "Please list your main services, even briefly.", min: 3, max: 1000, rows: 3 },
        { name: "leadForms", kind: "chips", label: "Enquiry options", options: ["Contact form", "Quote request form", "Call-back request", "Click-to-call button"] },
        { name: "whatsapp", kind: "chipsRadio", label: "WhatsApp on the website?", options: ["Yes, a WhatsApp button", "Yes, with a pre-filled message", "No WhatsApp"] },
        { name: "bookingNeed", kind: "chipsRadio", label: "Do customers need to book appointments?", options: ["Yes", "No", "Maybe later"] },
        { name: "location", kind: "chipsRadio", label: "Location on the website", options: ["Address + Google Map", "Multiple locations", "Online only, no address"] }
      ]
    },
    {
      id: "shop", short: "Store details", section: "Store details",
      title: "Tell me about your online store",
      help: "Rough answers are fine. These decide which platform and checkout suit you best.",
      when: function (a) { return typeKey(a) === "ecommerce" || has(a.features, "Product catalog") || has(a.features, "Online payments") && has(a.pages, "Products"); },
      fields: [
        { name: "productCount", kind: "chipsRadio", label: "How many products?", options: ["1 – 20", "21 – 100", "101 – 500", "500+", "Not sure"], required: "Please choose a rough number of products." },
        { name: "productTypes", kind: "chips", label: "What do you sell?", options: ["Physical products", "Digital products / downloads", "Services / packages"] },
        { name: "productCategories", kind: "text", label: "Main product categories", optional: true, placeholder: "e.g. Sarees, stoles, dupattas", max: 200 },
        { name: "checkout", kind: "chipsRadio", label: "How should ordering work?", options: ["Full cart & online checkout", "Order on WhatsApp", "Enquiry only, no checkout", "Not sure"] },
        { name: "payments", kind: "chips", label: "How should customers pay?", options: ["UPI / cards (Razorpay, PhonePe etc.)", "Cash on delivery", "International cards", "Not sure"] },
        { name: "shipping", kind: "chipsRadio", label: "Where will you deliver?", options: ["Local delivery only", "Across India (courier)", "International", "Digital products, no shipping", "Not sure"] },
        { name: "customerAccounts", kind: "chipsRadio", label: "Should customers have accounts?", options: ["Yes, with order history", "No, guest checkout is fine", "Not sure"] },
        { name: "orders", kind: "chipsRadio", label: "How do you want to manage orders?", options: ["An admin panel", "Email / WhatsApp is enough", "Not sure"] },
        { name: "productManagement", kind: "chipsRadio", label: "Who will add and edit products?", options: ["I will, myself", "I'd like you to manage them", "Not sure"] }
      ]
    },
    {
      id: "portfolio", short: "Portfolio details", section: "Portfolio details",
      title: "What should your portfolio show?",
      help: "Pick the sections that tell your story best.",
      when: function (a) { var k = typeKey(a); return k === "portfolio" || k === "personal" || has(a.pages, "Portfolio"); },
      fields: [
        { name: "portfolioSections", kind: "chips", label: "Sections", options: ["Projects", "Case studies", "Photo or video gallery", "About / bio", "Resume / CV", "Testimonials", "Services & packages"], required: "Please choose at least one section." },
        { name: "projectCount", kind: "chipsRadio", label: "How many projects or items to start with?", options: ["1 – 5", "6 – 15", "16+", "Not sure"] }
      ]
    },
    {
      id: "booking", short: "Booking details", section: "Booking details",
      title: "How should bookings work?",
      help: "This decides whether a simple request form is enough or you need a live calendar.",
      when: function (a) { return has(a.features, "Booking / appointments") || a.bookingNeed === "Yes"; },
      fields: [
        { name: "bookingType", kind: "chipsRadio", label: "What do people book?", options: ["Appointments", "Table reservations", "Classes / sessions", "Rooms / stays", "Events / tickets", "Other"], required: "Please choose what people will book." },
        { name: "calendar", kind: "chipsRadio", label: "How do you track bookings now?", options: ["Google Calendar", "Notebook / WhatsApp", "Booking software", "Not sure"] },
        { name: "availability", kind: "text", label: "Your usual availability", optional: true, placeholder: "e.g. Mon – Sat, 10am – 7pm", max: 120 },
        { name: "bookingPayment", kind: "chipsRadio", label: "Payment at booking?", options: ["Pay online when booking", "Pay at the venue", "Both", "Not sure"] },
        { name: "bookingAlerts", kind: "chips", label: "Send booking alerts by", options: ["Email", "WhatsApp", "SMS"] }
      ]
    },
    {
      id: "accounts", short: "Login & accounts", section: "Login & accounts",
      title: "Who will log in to your website?",
      help: "Logins add security work and cost, so it helps to know exactly what people need to do.",
      when: function (a) { return has(a.features, "Login / signup") || has(a.features, "User dashboard"); },
      fields: [
        { name: "loginUsers", kind: "chips", label: "Who logs in?", options: ["Customers", "Members / students", "My staff", "Only me (admin)"], required: "Please choose who will log in." },
        { name: "loginActions", kind: "chips", label: "What can they do after logging in?", options: ["View orders", "Manage bookings", "Access courses or content", "Download files", "Edit their profile"] },
        { name: "userCount", kind: "chipsRadio", label: "Roughly how many users?", options: ["Under 100", "100 – 1,000", "1,000+", "Not sure"] }
      ]
    },
    {
      id: "blog", short: "Blog details", section: "Blog details",
      title: "A couple of questions about your blog",
      help: "Helps me set up the right editor and layout for your posts.",
      when: function (a) { return typeKey(a) === "blog" || has(a.pages, "Blog"); },
      fields: [
        { name: "blogWriter", kind: "chipsRadio", label: "Who will write the posts?", options: ["I will", "My team", "I need help with content", "Not sure"] },
        { name: "blogFrequency", kind: "chipsRadio", label: "How often will you post?", options: ["Weekly", "A few times a month", "Occasionally", "Not sure"] }
      ]
    },
    {
      id: "setup", short: "Domain & hosting", section: "Domain & hosting",
      title: "Domain and hosting",
      help: "<strong>Domain</strong> = your web address (like yourname.com). <strong>Hosting</strong> = where the website lives online. No problem if you have neither. I'll guide you.",
      helpHtml: true,
      fields: [
        { name: "domain", kind: "chipsRadio", label: "Do you already have a domain?", options: ["Yes", "No", "Not sure"], required: "Please choose an option for the domain." },
        { name: "domainName", kind: "text", label: "Your domain", placeholder: "e.g. sharmasweets.in", showIf: function (a) { return a.domain === "Yes"; }, optional: true, max: 120 },
        { name: "hosting", kind: "chipsRadio", label: "Do you already have hosting?", options: ["Yes", "No", "Not sure"], required: "Please choose an option for hosting." },
        { name: "setupHelp", kind: "chips", label: "Do you need help with any of these?", options: ["Buying a domain", "Setting up hosting", "Business email (you@yourname.com)", "Google Business Profile", "No help needed"] },
        { name: "content", kind: "chipsRadio", label: "Do you have the text and photos ready?", options: ["Yes, mostly ready", "Some of it", "No, I'll need help"] }
      ]
    },
    {
      id: "style", short: "Design style", section: "Design style",
      title: "Do you have a preferred design style?",
      help: "Go with your gut. We'll refine it together before any design is final.",
      fields: [
        {
          name: "style", kind: "cards", compact: true, cols: 3, required: "Please choose a style, or pick “Not sure”.",
          options: [
            { value: "Minimal", desc: "Clean, lots of white space" },
            { value: "Modern", desc: "Fresh, current, confident" },
            { value: "Luxury", desc: "Elegant, premium, refined" },
            { value: "Professional", desc: "Trustworthy and formal" },
            { value: "Bold", desc: "Big type, strong colours" },
            { value: "Creative", desc: "Playful and unique" },
            { value: "Simple", desc: "Straightforward, no frills" },
            { value: "Not sure", desc: "Suggest something for me" }
          ]
        },
        { name: "colors", kind: "text", label: "Colours you like or brand colours", optional: true, placeholder: "e.g. Maroon and gold, or match my logo", max: 120 }
      ]
    },
    {
      id: "references", short: "Reference websites", section: "Design style",
      title: "Are there websites you like?",
      help: "Any website works, even from a different industry. This is optional but very helpful.",
      fields: [
        { name: "refs", kind: "urls", label: "Website links", max: 3 },
        { name: "refNotes", kind: "textarea", label: "What do you like about them?", optional: true, placeholder: "e.g. The clean layout, the big photos, how easy it is to book.", max: 1000, rows: 3 }
      ]
    },
    {
      id: "budget", short: "Budget", section: "Budget & timeline",
      title: "What is your approximate budget?",
      help: "A rough range helps me suggest the right plan. It isn't a commitment.",
      budgetHint: true,
      fields: [
        { name: "budget", kind: "cards", compact: true, required: "Please choose a range, or “Not sure yet”.",
          options: [
            { value: "Under ₹5,000", desc: "Simple one-page website" },
            { value: "₹5,000 – ₹10,000", desc: "Small site, a few pages" },
            { value: "₹10,000 – ₹20,000", desc: "Complete business website" },
            { value: "₹20,000 – ₹40,000", desc: "Advanced features or small store" },
            { value: "₹40,000+", desc: "Larger store or custom features" },
            { value: "Not sure yet", desc: "Help me decide" }
          ]
        }
      ]
    },
    {
      id: "timeline", short: "Timeline", section: "Budget & timeline",
      title: "When do you want the website?",
      help: "Most small websites take 1–3 weeks once content is ready.",
      fields: [
        { name: "timeline", kind: "cards", compact: true, required: "Please choose a timeline.",
          options: [
            { value: "As soon as possible", desc: "Within 1–2 weeks" },
            { value: "Within a month", desc: "" },
            { value: "In 1–3 months", desc: "" },
            { value: "No fixed deadline", desc: "Quality over speed" }
          ]
        },
        { name: "urgency", kind: "chipsRadio", label: "How urgent is it?", options: ["Flexible", "Fairly urgent", "Very urgent: fixed launch date"] },
        { name: "deadline", kind: "text", label: "Your launch date and why", placeholder: "e.g. 15 November, shop opening", showIf: function (a) { return a.urgency === "Very urgent: fixed launch date"; }, optional: true, max: 120 }
      ]
    },
    {
      id: "notes", short: "Additional notes", section: "Budget & timeline",
      title: "Anything else you want me to know?",
      help: "Ideas, worries, must-haves, things you disliked about a previous website. Anything helps.",
      fields: [
        { name: "notes", kind: "textarea", label: "Additional notes", optional: true, placeholder: "Write as much or as little as you like.", max: 3000, rows: 7 }
      ]
    },
    {
      id: "contact", short: "Your details", section: "Your details",
      title: "Where should I send your project plan?",
      help: "I'll personally review your answers and reply, usually within 24 hours. No spam, ever.",
      fields: [
        { name: "name", kind: "text", label: "Your name", autocomplete: "name", validate: "name", max: 80 },
        { name: "email", kind: "text", inputType: "email", label: "Email", autocomplete: "email", validate: "email", inputmode: "email", max: 254 },
        { name: "phone", kind: "text", inputType: "tel", label: "Phone / WhatsApp", autocomplete: "tel", validate: "phone", inputmode: "tel", placeholder: "+91 98765 43210", max: 20 },
        { name: "company", kind: "text", label: "Company / business name", optional: true, autocomplete: "organization", max: 100 },
        { name: "contactPref", kind: "chipsRadio", label: "Best way to reach you", options: ["WhatsApp", "Phone call", "Email"] }
      ]
    },
    { id: "review", section: "Review", title: "Review your project", review: true },
    { id: "done", section: "Review", title: "Thank you", done: true }
  ];

  /* ---------- State ---------- */
  var state = {
    answers: {},
    stepId: "type",
    fromReview: false,
    startedAt: Date.now(),
    submitting: false,
    sendMode: "account",
    authMode: "signup",
    outcome: null
  };
  var Auth = window.VWS_AUTH;
  var PENDING_KEY = "vws:pendingProject";
  var session = null;

  function visibleSteps() {
    return STEPS.filter(function (s) { return !s.when || s.when(state.answers); });
  }
  function questionSteps() {
    return visibleSteps().filter(function (s) { return !s.review && !s.done; });
  }
  function stepById(id) { return STEPS.filter(function (s) { return s.id === id; })[0]; }

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ answers: state.answers, stepId: state.stepId, savedAt: Date.now() }));
    } catch (e) { /* storage may be unavailable (private mode); planner still works */ }
  }
  function loadDraft() {
    try {
      var d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (d && d.answers && typeof d.answers === "object" && stepById(d.stepId)) return d;
    } catch (e) { /* ignore corrupt draft */ }
    return null;
  }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
  }

  /* ---------- DOM helpers ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  var uid = 0;
  function nextId(prefix) { uid += 1; return prefix + "-" + uid; }

  var body = root.querySelector("[data-planner-body]");
  var navBar = root.querySelector("[data-planner-nav]");
  var backBtn = root.querySelector("[data-back]");
  var nextBtn = root.querySelector("[data-next]");
  var progressText = root.querySelector("[data-progress-text]");
  var progressSection = root.querySelector("[data-progress-section]");
  var progressFill = root.querySelector("[data-progress-fill]");
  var progressWrap = root.querySelector("[data-progress]");
  var live = root.querySelector("[data-live]");
  var outline = document.querySelector("[data-outline]");
  var form = root.querySelector("form");

  /* ---------- Field renderers ---------- */
  function fieldLabel(f, forId) {
    var l = el(forId ? "label" : "span", forId ? null : "label");
    if (forId) l.htmlFor = forId;
    l.textContent = f.label;
    if (f.optional) {
      l.appendChild(document.createTextNode(" "));
      l.appendChild(el("span", "optional", "(optional)"));
    }
    return l;
  }

  function renderCards(f) {
    var fs = el("fieldset", "step-group");
    fs.dataset.field = f.name;
    var lg = el("legend", "sr-only", f.label || "Choose one");
    fs.appendChild(lg);
    var wrap = el("div", "options" + (f.cols === 3 ? " cols-3" : ""));
    f.options.forEach(function (o) {
      var opt = el("div", "option" + (f.compact ? " option-compact" : ""));
      var id = nextId("opt");
      var input = el("input");
      input.type = "radio"; input.name = f.name; input.value = o.value; input.id = id;
      if (state.answers[f.name] === o.value) input.checked = true;
      var card = el("label", "option-card");
      card.htmlFor = id;
      if (o.key) { var ic = el("span", "o-icon"); ic.appendChild(icon(o.key)); card.appendChild(ic); }
      var txt = el("span", "o-text");
      txt.appendChild(el("span", "o-label", o.value));
      if (o.desc) txt.appendChild(el("span", "o-desc", o.desc));
      card.appendChild(txt);
      card.appendChild(el("span", "o-check"));
      opt.appendChild(input); opt.appendChild(card);
      wrap.appendChild(opt);
    });
    fs.appendChild(wrap);
    fs.appendChild(errorSlot(f));
    return fs;
  }

  function renderChips(f, multi) {
    var fs = el("fieldset", "step-group");
    fs.dataset.field = f.name;
    if (f.label) {
      var lg = el("legend", null, f.label);
      if (f.optional) { lg.appendChild(document.createTextNode(" ")); lg.appendChild(el("span", "optional", "(optional)")); }
      if (multi) { lg.appendChild(document.createTextNode(" ")); lg.appendChild(el("span", "optional", "choose any")); }
      fs.appendChild(lg);
    } else {
      fs.appendChild(el("legend", "sr-only", multi ? "Choose all that apply" : "Choose one"));
    }
    var wrap = el("div", "chips");
    var current = state.answers[f.name];
    f.options.forEach(function (o) {
      var chip = el("label", "chip");
      var input = el("input");
      input.type = multi ? "checkbox" : "radio";
      input.name = f.name; input.value = o;
      input.checked = multi ? has(current, o) : current === o;
      chip.appendChild(input);
      chip.appendChild(el("span", null, o));
      wrap.appendChild(chip);
    });
    fs.appendChild(wrap);
    fs.appendChild(errorSlot(f));
    return fs;
  }

  function renderText(f) {
    var wrap = el("div", "field step-group");
    wrap.dataset.field = f.name;
    var id = nextId("f");
    wrap.appendChild(fieldLabel(f, id));
    var input;
    if (f.kind === "textarea") {
      input = el("textarea", "textarea");
      input.rows = f.rows || 5;
    } else {
      input = el("input", "input");
      input.type = f.inputType || "text";
    }
    input.id = id; input.name = f.name;
    if (f.placeholder) input.placeholder = f.placeholder;
    if (f.autocomplete) input.autocomplete = f.autocomplete;
    if (f.inputmode) input.inputMode = f.inputmode;
    if (f.max) input.maxLength = f.max;
    if (!f.optional && (f.required || f.validate)) input.required = true;
    input.value = state.answers[f.name] || "";
    var err = errorSlot(f);
    input.setAttribute("aria-describedby", err.id);
    wrap.appendChild(input);
    wrap.appendChild(err);
    return wrap;
  }

  function renderUrls(f) {
    var fs = el("fieldset", "step-group");
    fs.dataset.field = f.name;
    var lg = el("legend", null, f.label);
    lg.appendChild(document.createTextNode(" "));
    lg.appendChild(el("span", "optional", "(optional, up to " + f.max + ")"));
    fs.appendChild(lg);
    var list = el("div", "url-list");
    var values = (state.answers[f.name] || []).slice();
    if (!values.length) values.push("");

    function addRow(value) {
      var row = el("div", "url-row");
      var input = el("input", "input");
      input.type = "url"; input.name = f.name; input.inputMode = "url";
      input.placeholder = "e.g. apple.com";
      input.maxLength = 300;
      input.autocomplete = "off";
      input.value = value;
      input.setAttribute("aria-label", "Website link " + (list.children.length + 1));
      var rm = el("button", "icon-btn");
      rm.type = "button";
      rm.setAttribute("aria-label", "Remove this link");
      rm.appendChild(icon("other"));
      rm.firstChild.style.transform = "rotate(45deg)";
      rm.addEventListener("click", function () {
        if (list.children.length === 1) { input.value = ""; input.focus(); }
        else { row.remove(); var first = list.querySelector("input"); if (first) first.focus(); }
        collect(); updateAdd();
      });
      row.appendChild(input); row.appendChild(rm);
      list.appendChild(row);
      return input;
    }
    values.forEach(addRow);
    fs.appendChild(list);

    var add = el("button", "add-btn", "+ Add another link");
    add.type = "button";
    function updateAdd() { add.hidden = list.children.length >= f.max; }
    add.addEventListener("click", function () { addRow("").focus(); updateAdd(); });
    updateAdd();
    fs.appendChild(add);
    fs.appendChild(errorSlot(f));
    return fs;
  }

  function errorSlot(f) {
    var s = el("p", "field-error");
    s.id = nextId("err-" + f.name);
    s.setAttribute("data-error-for", f.name);
    return s;
  }

  function renderField(f) {
    var node;
    if (f.kind === "cards") node = renderCards(f);
    else if (f.kind === "chips") node = renderChips(f, true);
    else if (f.kind === "chipsRadio") node = renderChips(f, false);
    else if (f.kind === "urls") node = renderUrls(f);
    else node = renderText(f);
    if (f.showIf && !f.showIf(state.answers)) node.hidden = true;
    return node;
  }

  /* ---------- Collect & validate ---------- */
  function currentStep() { return stepById(state.stepId); }

  function collect() {
    var step = currentStep();
    if (!step.fields) return;
    step.fields.forEach(function (f) {
      var inputs = body.querySelectorAll('[name="' + f.name + '"]');
      if (f.kind === "chips") {
        state.answers[f.name] = Array.prototype.filter.call(inputs, function (i) { return i.checked; }).map(function (i) { return i.value; });
      } else if (f.kind === "cards" || f.kind === "chipsRadio") {
        var sel = Array.prototype.filter.call(inputs, function (i) { return i.checked; })[0];
        state.answers[f.name] = sel ? sel.value : "";
      } else if (f.kind === "urls") {
        state.answers[f.name] = Array.prototype.map.call(inputs, function (i) { return i.value.trim(); }).filter(Boolean);
      } else if (inputs[0]) {
        state.answers[f.name] = inputs[0].value;
      }
    });
    // Conditional sub-fields inside the step
    step.fields.forEach(function (f) {
      if (!f.showIf) return;
      var node = body.querySelector('[data-field="' + f.name + '"]');
      if (node) node.hidden = !f.showIf(state.answers);
    });
    saveDraft();
    updateProgress();
  }

  function normalizeUrl(v) {
    v = v.trim();
    if (!v) return "";
    if (!/^https?:\/\//i.test(v)) v = "https://" + v;
    try {
      var u = new URL(v);
      if ((u.protocol !== "http:" && u.protocol !== "https:") || u.hostname.indexOf(".") === -1) return null;
      return u.href;
    } catch (e) { return null; }
  }

  function validateStep(step) {
    var errors = {};
    var a = state.answers;
    step.fields.forEach(function (f) {
      if (f.showIf && !f.showIf(a)) return;
      var v = a[f.name];
      if (f.validate) {
        var msg = F.validators[f.validate](String(v || ""), f.validate === "phone");
        if (msg) errors[f.name] = msg;
        return;
      }
      if (f.kind === "urls") {
        var bad = (v || []).some(function (u) { return normalizeUrl(u) === null; });
        if (bad) errors[f.name] = "One of the links doesn't look right. Please check it (e.g. example.com).";
        return;
      }
      var empty = Array.isArray(v) ? v.length === 0 : !String(v || "").trim();
      if (f.required && empty) { errors[f.name] = f.required; return; }
      if (!empty && f.url && normalizeUrl(String(v)) === null) { errors[f.name] = "That link doesn't look right. Please check it (e.g. example.com)."; return; }
      if (!empty && f.min && String(v).trim().length < f.min) errors[f.name] = "Could you add a little more detail?";
    });
    return errors;
  }

  function showErrors(errors) {
    body.querySelectorAll("[data-error-for]").forEach(function (slot) {
      var name = slot.getAttribute("data-error-for");
      slot.textContent = errors[name] || "";
      var group = body.querySelector('[data-field="' + name + '"]');
      if (group) group.classList.toggle("has-error", !!errors[name]);
      var inputs = body.querySelectorAll('[name="' + name + '"]');
      inputs.forEach(function (i) { i.setAttribute("aria-invalid", errors[name] ? "true" : "false"); });
    });
    var first = Object.keys(errors)[0];
    if (first) {
      var target = body.querySelector('[name="' + first + '"]');
      if (target) target.focus();
    }
  }

  /* ---------- Progress & outline ---------- */
  function updateProgress() {
    var qs = questionSteps();
    var step = currentStep();
    var idx = qs.indexOf(step);
    var total = qs.length;
    var shown = step.review || step.done ? total : idx + 1;
    var pct = step.done ? 100 : step.review ? 96 : Math.round((idx / total) * 100);
    progressFill.style.width = pct + "%";
    progressText.textContent = step.review ? "Final check" : step.done ? "Sent" : "Question " + shown + " of " + total;
    progressSection.textContent = step.section;

    if (outline) {
      outline.textContent = "";
      var sections = [];
      visibleSteps().forEach(function (s) { if (sections.indexOf(s.section) === -1 && !s.done) sections.push(s.section); });
      var currentIdx = sections.indexOf(step.section);
      sections.forEach(function (name, i) {
        var li = el("li", i < currentIdx || step.done ? "is-done" : i === currentIdx ? "is-current" : "", name);
        if (i === currentIdx && !step.done) li.setAttribute("aria-current", "step");
        outline.appendChild(li);
      });
    }
  }

  /* ---------- Review & payload ---------- */
  function display(v) {
    if (Array.isArray(v)) return v.join(", ");
    return String(v || "").trim();
  }

  function fieldTitle(f, step) {
    if (f.label) return f.label;
    return step.title.replace(/\?$/, "");
  }

  var REVIEW_LABELS = {
    type: "Website type", pages: "Pages", features: "Features", budget: "Budget",
    timeline: "Timeline", style: "Design style", refs: "Websites you like"
  };

  function reviewData() {
    return questionSteps().map(function (step) {
      var rows = step.fields.filter(function (f) { return !f.showIf || f.showIf(state.answers); }).map(function (f) {
        var v = state.answers[f.name];
        if (f.kind === "urls") v = (v || []).map(normalizeUrl).filter(Boolean);
        if (f.url && v) v = normalizeUrl(String(v)) || "";
        return { key: f.name, label: REVIEW_LABELS[f.name] || fieldTitle(f, step), value: display(v) };
      });
      return { step: step, rows: rows };
    });
  }

  function buildPayload(out) {
    out = out || {};
    var a = state.answers;
    var payload = {
      _subject: "New website project: " + (a.brandName || "").trim() + " (" + (a.type || "") + ")",
      _template: "table",
      _captcha: "false",
      _honey: "",
      _autoresponse: "Thanks for sharing your website plan with Vaibhav Web Studio. I've received your answers and will reply personally, usually within 24 hours. — Vaibhav Gaur"
    };
    reviewData().forEach(function (group) {
      group.rows.forEach(function (r) {
        var key = r.key === "email" ? "email" : group.rows.length === 1 ? group.step.short : group.step.short + ": " + r.label;
        payload[key] = r.value || "—";
      });
    });
    payload["Submitted from"] = "Website Planner";
    payload["Client account"] = session && session.user ? session.user.email
      : out.pendingConfirm ? out.email + " (signed up, email not confirmed yet)" : "Guest (no account)";
    payload["Dashboard reference"] = out.saved ? out.saved.id.slice(0, 8).toUpperCase() + " (full id " + out.saved.id + ")" : "Not saved to dashboard";
    return payload;
  }

  function summaryText() {
    var a = state.answers;
    var lines = ["Hi Vaibhav, here's my website plan:"];
    lines.push("• Type: " + display(a.type));
    lines.push("• Business: " + display(a.brandName));
    if (a.pages && a.pages.length) lines.push("• Pages: " + display(a.pages));
    if (a.features && a.features.length) lines.push("• Features: " + display(a.features));
    if (a.budget) lines.push("• Budget: " + a.budget);
    if (a.timeline) lines.push("• Timeline: " + a.timeline);
    lines.push("• Name: " + display(a.name));
    var text = lines.join("\n");
    return text.length > 1200 ? text.slice(0, 1200) + "…" : text;
  }

  function renderReview(stepNode) {
    var wrap = el("div", "review");
    reviewData().forEach(function (group) {
      var block = el("section", "review-block");
      var head = el("div", "review-head");
      head.appendChild(el("h3", null, group.step.short));
      var edit = el("button", "review-edit", "Edit");
      edit.type = "button";
      edit.setAttribute("aria-label", "Edit: " + group.step.title);
      edit.addEventListener("click", function () { go(group.step.id, { fromReview: true }); });
      head.appendChild(edit);
      block.appendChild(head);
      var dl = el("dl");
      group.rows.forEach(function (r) {
        var row = el("div", "review-row");
        row.appendChild(el("dt", null, r.label));
        var dd = el("dd", r.value ? null : "empty", r.value || "Not answered");
        row.appendChild(dd);
        dl.appendChild(row);
      });
      block.appendChild(dl);
      wrap.appendChild(block);
    });
    stepNode.appendChild(wrap);

    // Honeypot: real users never see or fill this
    var hp = el("div", "hp-field");
    hp.setAttribute("aria-hidden", "true");
    var hpLabel = el("label", null, "Leave this field empty");
    var hpInput = el("input");
    hpInput.type = "text"; hpInput.name = "_honey"; hpInput.tabIndex = -1; hpInput.autocomplete = "off";
    hpLabel.appendChild(hpInput);
    hp.appendChild(hpLabel);
    stepNode.appendChild(hp);

    var consent = el("label", "consent");
    var cb = el("input");
    cb.type = "checkbox"; cb.name = "consent"; cb.id = "consent";
    consent.appendChild(cb);
    var ctext = el("span", null, "I agree that Vaibhav Web Studio can use these details to reply about my project. ");
    var pl = el("a", null, "Privacy Policy");
    pl.href = "/privacy"; pl.target = "_blank"; pl.rel = "noopener";
    ctext.appendChild(pl);
    consent.appendChild(ctext);
    stepNode.appendChild(consent);
    var cerr = el("p", "field-error");
    cerr.setAttribute("data-consent-error", "");
    stepNode.appendChild(cerr);

    var sendBox = el("div", "send-options");
    sendBox.setAttribute("data-send-options", "");
    stepNode.appendChild(sendBox);
    fillSendOptions(sendBox);

    var status = el("div", "alert alert-error");
    status.hidden = true;
    status.setAttribute("role", "alert");
    status.tabIndex = -1;
    status.setAttribute("data-submit-status", "");
    stepNode.appendChild(status);
  }

  /* ---------- Sending: account or guest ---------- */
  function accountsOn() { return !!(Auth && Auth.enabled); }

  function sendLabel() {
    if (!accountsOn() || session || state.sendMode === "guest") return "Send My Project Request";
    return state.authMode === "login" ? "Log in & send" : "Create account & send";
  }
  function refreshSendLabel() {
    var label = root.querySelector("[data-next-label]");
    if (label && currentStep().review) label.textContent = sendLabel();
  }

  function radioCards(name, current, options, onChange) {
    var wrap = el("div", "options");
    options.forEach(function (o) {
      var opt = el("div", "option option-compact");
      var id = nextId("opt");
      var input = el("input");
      input.type = "radio"; input.name = name; input.value = o[0]; input.id = id;
      input.checked = current === o[0];
      input.addEventListener("change", function () { onChange(o[0]); });
      var card = el("label", "option-card");
      card.htmlFor = id;
      var txt = el("span", "o-text");
      txt.appendChild(el("span", "o-label", o[1]));
      txt.appendChild(el("span", "o-desc", o[2]));
      card.appendChild(txt);
      card.appendChild(el("span", "o-check"));
      opt.appendChild(input); opt.appendChild(card);
      wrap.appendChild(opt);
    });
    return wrap;
  }

  function authField(name, label, type, value, autocomplete) {
    var wrap = el("div", "field");
    var id = nextId("auth");
    var l = el("label", null, label);
    l.htmlFor = id;
    var input = el("input", "input");
    input.type = type; input.id = id; input.name = name; input.value = value || "";
    input.autocomplete = autocomplete;
    input.maxLength = name === "authPassword" ? 72 : 254;
    var err = el("p", "field-error");
    err.id = id + "-err";
    input.setAttribute("aria-describedby", err.id);
    wrap.appendChild(l); wrap.appendChild(input); wrap.appendChild(err);
    return wrap;
  }

  function fillSendOptions(box) {
    box.textContent = "";
    if (!accountsOn()) return;
    if (session) {
      box.appendChild(el("p", "signed-note", "✅ Signed in as " + (session.user && session.user.email || "") + ". This project will be saved to your dashboard."));
      return;
    }
    var fs = el("fieldset", "step-group");
    fs.appendChild(el("legend", null, "How would you like to send it?"));
    fs.appendChild(radioCards("sendMode", state.sendMode, [
      ["account", "📊 Save to a free account", "Track status and updates in your dashboard"],
      ["guest", "✉️ Send without an account", "I'll reply by email or WhatsApp"]
    ], function (v) { state.sendMode = v; fillSendOptions(box); refreshSendLabel(); }));
    box.appendChild(fs);

    if (state.sendMode !== "account") return;
    var auth = el("div", "inline-auth");
    var modes = el("div", "chips");
    modes.setAttribute("role", "radiogroup");
    modes.setAttribute("aria-label", "Account");
    [["signup", "I'm new here"], ["login", "I already have an account"]].forEach(function (m) {
      var chip = el("label", "chip");
      var input = el("input");
      input.type = "radio"; input.name = "authMode"; input.value = m[0];
      input.checked = state.authMode === m[0];
      input.addEventListener("change", function () { state.authMode = m[0]; fillSendOptions(box); refreshSendLabel(); });
      chip.appendChild(input);
      chip.appendChild(el("span", null, m[1]));
      modes.appendChild(chip);
    });
    auth.appendChild(modes);
    if (state.authMode === "signup") auth.appendChild(authField("authName", "Your name", "text", state.answers.name, "name"));
    auth.appendChild(authField("authEmail", "Email", "email", state.answers.email, "email"));
    auth.appendChild(authField("authPassword", state.authMode === "signup" ? "Choose a password (8+ characters, letters and numbers)" : "Password", "password", "", state.authMode === "signup" ? "new-password" : "current-password"));
    if (state.authMode === "login") {
      var forgot = el("a", "small-link", "Forgot password?");
      forgot.href = "/forgot-password"; forgot.target = "_blank"; forgot.rel = "noopener";
      auth.appendChild(forgot);
    }
    box.appendChild(auth);
  }

  function authFieldError(name, message) {
    var input = body.querySelector('[name="' + name + '"]');
    if (input) F.setFieldError(input, message);
    return message;
  }

  function validateAuthFields() {
    var name = body.querySelector('[name="authName"]');
    var email = body.querySelector('[name="authEmail"]');
    var pw = body.querySelector('[name="authPassword"]');
    var errs = [];
    if (name) errs.push(authFieldError("authName", F.validators.name(name.value)));
    errs.push(authFieldError("authEmail", F.validators.email(email.value)));
    var pwErr = !pw.value ? "Please enter a password."
      : state.authMode === "signup" && (pw.value.length < 8 || !/[a-z]/i.test(pw.value) || !/\d/.test(pw.value)) ? "Use at least 8 characters with letters and numbers." : "";
    errs.push(authFieldError("authPassword", pwErr));
    var first = body.querySelector(".inline-auth [aria-invalid=true]");
    if (first) first.focus();
    return errs.some(Boolean) ? null : {
      name: name ? name.value.trim() : "",
      email: email.value.trim().toLowerCase(),
      password: pw.value
    };
  }

  function projectRow() {
    var a = state.answers;
    return {
      name: String(a.brandName || "Website project").trim().slice(0, 100),
      website_type: String(a.type || "Website").slice(0, 80),
      budget: String(a.budget || "").slice(0, 60),
      timeline: String(a.timeline || "").slice(0, 60),
      requirements: {
        version: 1,
        groups: reviewData().map(function (g) {
          return { title: g.step.short, rows: g.rows.map(function (r) { return { label: r.label, value: r.value }; }) };
        })
      }
    };
  }

  function savePending(email) {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify({ email: email, row: projectRow(), savedAt: Date.now() })); }
    catch (e) { /* storage unavailable */ }
  }

  function showSubmitError(message, title) {
    var status = body.querySelector("[data-submit-status]");
    status.textContent = "";
    var wrap = el("div");
    wrap.appendChild(el("h3", null, title || "Your project wasn't sent"));
    wrap.appendChild(el("p", null, message));
    var p = el("p");
    var wa = el("a", null, "Send it on WhatsApp instead");
    wa.href = F.whatsappLink(summaryText());
    wa.target = "_blank"; wa.rel = "noopener noreferrer";
    p.appendChild(wa);
    wrap.appendChild(p);
    status.appendChild(wrap);
    status.hidden = false;
    status.focus();
  }

  function renderDone(stepNode) {
    stepNode.textContent = "";
    var d = el("div", "done");
    var ic = el("div", "done-icon");
    ic.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>';
    d.appendChild(ic);
    var out = state.outcome || {};
    var h = el("h2", "step-title", out.saved ? "Your project has been sent and saved 🎉" : "Your project request has been sent 🎉");
    h.tabIndex = -1;
    h.setAttribute("data-step-heading", "");
    d.appendChild(h);
    var first = (state.answers.name || "").trim().split(" ")[0];
    d.appendChild(el("p", null, "Thank you" + (first ? ", " + first : "") + ". I'll read through your answers and get back to you personally, usually within 24 hours."));
    if (out.pendingConfirm) {
      d.appendChild(el("p", "suggest-note", "📩 One more step: confirm your email using the link I've just sent to " + out.email + ". After that, this project will appear in your dashboard."));
    }
    if (out.saveError) {
      d.appendChild(el("p", "suggest-note", "Your request reached me, but it couldn't be saved to your dashboard just now (" + out.saveError + "). I'll add it for you."));
    }
    var steps = el("ol", "next-list");
    ["I review your requirements and note any questions.", "We have a short call or WhatsApp chat to agree scope, price and timeline.", "Once you're happy, work begins, with updates at every stage."].forEach(function (t) {
      steps.appendChild(el("li", null, t));
    });
    d.appendChild(steps);
    var row = el("div", "btn-row");
    var wa = el("a", "btn btn-ghost", "Also message me on WhatsApp");
    wa.href = F.whatsappLink(summaryText());
    wa.target = "_blank"; wa.rel = "noopener noreferrer";
    var home = el("a", "btn btn-primary", out.saved ? "View my dashboard" : "Back to home");
    home.href = out.saved ? "/dashboard?sent=1" : "/";
    row.appendChild(home); row.appendChild(wa);
    d.appendChild(row);
    stepNode.appendChild(d);
  }

  /* ---------- Render step ---------- */
  function render(direction) {
    var step = currentStep();
    body.textContent = "";
    var node = el("div", "planner-step" + (direction === "back" ? " is-back" : ""));

    if (step.done) {
      renderDone(node);
    } else {
      var kicker = el("p", "step-kicker", step.review ? "Almost done" : step.section);
      var h = el("h2", "step-title", step.title);
      h.tabIndex = -1;
      h.setAttribute("data-step-heading", "");
      node.appendChild(kicker);
      node.appendChild(h);
      if (step.help) {
        var help = el("p", "step-help");
        // helpHtml is authored in this file only (never user input)
        if (step.helpHtml) help.innerHTML = step.help; else help.textContent = step.help;
        node.appendChild(help);
      }
      if (step.review) {
        node.appendChild(el("p", "step-help", "Check everything below. Use “Edit” to change any answer, then send it to me."));
        renderReview(node);
      } else {
        if (step.suggest) {
          var k = typeKey(state.answers);
          if (k && SUGGESTED_PAGES[k] && !state.answers.pages) state.answers.pages = SUGGESTED_PAGES[k].slice();
          if (k) node.appendChild(el("p", "suggest-note", "Suggested for a " + state.answers.type.toLowerCase() + ": " + SUGGESTED_PAGES[k].join(", ") + "."));
        }
        if (step.budgetHint) {
          var bk = typeKey(state.answers);
          if (bk) node.appendChild(el("p", "suggest-note", "For reference: " + TYPICAL_BUDGET[bk] + " Domain and paid tools are extra. See the full pricing on the Services page."));
        }
        if (step.id === "contact") {
          if (!state.answers.company && state.answers.brandName) state.answers.company = state.answers.brandName;
          if (session && session.user) {
            if (!state.answers.email) state.answers.email = session.user.email || "";
            if (!state.answers.name) state.answers.name = session.user.name || "";
          }
        }
        step.fields.forEach(function (f) { node.appendChild(renderField(f)); });
      }
    }
    body.appendChild(node);

    // Footer navigation
    var qs = questionSteps();
    navBar.hidden = !!step.done;
    backBtn.hidden = step.id === qs[0].id;
    // Re-query: the loading state rebuilds the button's contents
    var nextLabel = root.querySelector("[data-next-label]");
    if (step.review) nextLabel.textContent = sendLabel();
    else if (state.fromReview) nextLabel.textContent = "Save & back to review";
    else nextLabel.textContent = "Continue";
    nextBtn.classList.toggle("btn-accent", !!step.review);
    nextBtn.classList.toggle("btn-primary", !step.review);
    progressWrap.hidden = false;
    updateProgress();
    live.textContent = step.done ? "Project sent." : progressText.textContent + ": " + step.title;
  }

  function focusHeading() {
    var h = body.querySelector("[data-step-heading]");
    if (!h) return;
    h.focus({ preventScroll: true });
    var top = root.getBoundingClientRect().top + window.scrollY - 90;
    if (window.scrollY > top) window.scrollTo({ top: top, behavior: "smooth" });
  }

  function go(id, opts) {
    opts = opts || {};
    var qs = visibleSteps();
    var from = qs.indexOf(currentStep());
    var to = qs.indexOf(stepById(id));
    state.stepId = id;
    if (opts.fromReview !== undefined) state.fromReview = opts.fromReview;
    saveDraft();
    render(to < from ? "back" : "forward");
    focusHeading();
  }

  function next() {
    var step = currentStep();
    if (step.review) return submit();
    collect();
    var errors = validateStep(step);
    showErrors(errors);
    if (Object.keys(errors).length) return;

    if (state.fromReview) {
      // If an edit revealed a new conditional step that is still unanswered, visit it first.
      var pending = questionSteps().filter(function (s) {
        return Object.keys(validateStep(s)).length > 0;
      })[0];
      if (pending && pending.id !== step.id) return go(pending.id, { fromReview: true });
      return go("review", { fromReview: false });
    }
    var list = visibleSteps();
    var nextStep = list[list.indexOf(step) + 1];
    if (nextStep) go(nextStep.id);
  }

  function back() {
    collect();
    var list = visibleSteps();
    var i = list.indexOf(currentStep());
    if (state.fromReview) return go("review", { fromReview: false });
    if (i > 0) go(list[i - 1].id);
  }

  function submit() {
    if (state.submitting) return;
    var consent = body.querySelector("#consent");
    var cerr = body.querySelector("[data-consent-error]");
    if (!consent.checked) {
      cerr.textContent = "Please tick the box so I can reply to you.";
      consent.focus();
      return;
    }
    cerr.textContent = "";

    // Make sure every applicable step is still valid
    var invalid = questionSteps().filter(function (s) { return Object.keys(validateStep(s)).length > 0; })[0];
    if (invalid) return go(invalid.id, { fromReview: true });

    var spam = F.spamCheck({
      honey: body.querySelector('[name="_honey"]').value,
      startedAt: state.startedAt,
      minMs: MIN_FILL_MS,
      text: display(state.answers.notes) + " " + display(state.answers.businessDesc)
    });
    if (spam === "blocked") { state.stepId = "done"; render(); return; }
    if (spam) { showSubmitError(spam); return; }

    var mode = accountsOn() ? (session ? "account" : state.sendMode) : "guest";
    var creds = null;
    if (mode === "account" && !session) {
      creds = validateAuthFields();
      if (!creds) return;
    }

    var out = { saved: null, pendingConfirm: false, saveError: "", email: "" };
    state.submitting = true;
    F.setButtonLoading(nextBtn, true, creds ? "Setting up your account…" : "Sending your project…");
    backBtn.disabled = true;
    function finish() {
      state.submitting = false;
      F.setButtonLoading(nextBtn, false);
      backBtn.disabled = false;
    }

    // 1) Sign up / log in when the visitor chose an account
    var step1 = Promise.resolve();
    if (creds) {
      step1 = (state.authMode === "signup"
        ? Auth.signUp(creds.email, creds.password, creds.name, "/dashboard")
        : Auth.signIn(creds.email, creds.password).then(function (s) { return { session: s }; })
      ).then(function (r) {
        if (r.session) { session = r.session; return; }
        out.pendingConfirm = true;
        out.email = creds.email;
        savePending(creds.email);
      }, function (err) {
        err.isAuth = true;
        throw err;
      });
    }

    step1
      // 2) Save to the database when signed in
      .then(function () {
        if (!session) return;
        return Auth.insert("projects", projectRow()).then(function (rows) {
          out.saved = rows && rows[0] ? rows[0] : null;
        }, function (err) { out.saveError = err.message; });
      })
      // 3) Always notify the owner by email (FormSubmit)
      .then(function () { return F.deliver(buildPayload(out)); })
      .then(function (result) {
        finish();
        if (!result.ok && !out.saved && !out.pendingConfirm) { showSubmitError(result.error); return; }
        clearDraft();
        state.outcome = out;
        state.stepId = "done";
        render();
        focusHeading();
      })
      .catch(function (err) {
        finish();
        if (err.isAuth) {
          showSubmitError(err.message, state.authMode === "signup" ? "Couldn't create your account" : "Couldn't log you in");
        } else {
          showSubmitError(err.message || F.messages.failed);
        }
      });
  }

  /* ---------- Wire up ---------- */
  form.addEventListener("submit", function (e) { e.preventDefault(); next(); });
  backBtn.addEventListener("click", back);
  body.addEventListener("change", collect);
  body.addEventListener("input", function (e) {
    if (e.target.closest(".inline-auth")) { F.setFieldError(e.target, ""); return; }
    if (e.target.matches("input[type=text], input[type=email], input[type=tel], input[type=url], textarea")) {
      collect();
      if (e.target.getAttribute("aria-invalid") === "true") {
        var slot = body.querySelector('[data-error-for="' + e.target.name + '"]');
        if (slot) slot.textContent = "";
        e.target.setAttribute("aria-invalid", "false");
        var g = e.target.closest("[data-field]");
        if (g) g.classList.remove("has-error");
      }
    }
  });

  // Pre-select a type from ?type=ecommerce links (whitelisted keys only)
  function typeFromUrl() {
    var m = /[?&]type=([a-z]+)/.exec(window.location.search);
    if (!m || TYPE_KEYS.indexOf(m[1]) === -1) return "";
    return TYPES[TYPE_KEYS.indexOf(m[1])].value;
  }

  function start(fromDraft) {
    var draft = fromDraft ? loadDraft() : null;
    if (draft) {
      state.answers = draft.answers;
      state.stepId = draft.stepId === "done" ? "review" : draft.stepId;
      if (!visibleSteps().some(function (s) { return s.id === state.stepId; })) state.stepId = "type";
    } else {
      state.answers = {};
      state.stepId = "type";
      var preset = typeFromUrl();
      if (preset) state.answers.type = preset;
    }
    state.fromReview = false;
    // A restored draft means the visitor already spent time on it
    state.startedAt = draft ? Date.now() - MIN_FILL_MS : Date.now();
    render();
  }

  // If the visitor is already signed in, the review step saves straight to their dashboard.
  if (accountsOn() && Auth.hasSession()) {
    Auth.currentUser().then(function (s) {
      session = s;
      var box = body.querySelector("[data-send-options]");
      if (box) fillSendOptions(box);
      refreshSendLabel();
    }).catch(function () { /* treated as signed out */ });
  }

  var draftBar = document.querySelector("[data-draft-bar]");
  var existing = loadDraft();
  if (existing && Object.keys(existing.answers).length > 1 && draftBar) {
    draftBar.hidden = false;
    start(true);
    draftBar.querySelector("[data-draft-restart]").addEventListener("click", function () {
      clearDraft();
      draftBar.hidden = true;
      start(false);
      focusHeading();
    });
    draftBar.querySelector("[data-draft-dismiss]").addEventListener("click", function () {
      draftBar.hidden = true;
      focusHeading();
    });
  } else {
    start(false);
  }
  root.hidden = false;
  var ns = document.querySelector("[data-planner-noscript]");
  if (ns) ns.hidden = true;
})();
