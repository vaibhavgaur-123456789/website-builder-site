/* Website examples: data + renderer.
   To add a project: add an object to PROJECTS, create its page in /demos/,
   and (optionally) add a ".t-<theme>" preview theme in main.css. */
(function () {
  "use strict";

  var PROJECTS = [
    {
      slug: "restaurant",
      theme: "restaurant",
      name: "Saffron Table",
      category: "Local business",
      industry: "Restaurant",
      url: "saffrontable.in",
      description: "A warm, appetite-first site for a family veg restaurant, with a menu that loads fast on mobile data and a simple table booking form.",
      features: ["Digital menu", "Table booking form", "Opening hours", "Story section"],
      mini: { title: "Pure veg thalis, served warm.", sub: "Family restaurant · open 11am–11pm", cta: "View menu", ghost: "Book a table" }
    },
    {
      slug: "salon",
      theme: "salon",
      name: "Kesh Studio",
      category: "Local business",
      industry: "Salon",
      url: "keshstudio.in",
      description: "A calm, elegant booking-led site for a salon. Services with clear prices, bridal packages and an appointment request form.",
      features: ["Price list", "Appointment request", "Bridal packages", "Service cards"],
      mini: { title: "Hair, skin & bridal, by appointment.", sub: "Unisex salon & studio", cta: "Book now", ghost: "Prices" }
    },
    {
      slug: "construction",
      theme: "construction",
      name: "Sthir Constructions",
      category: "Service business",
      industry: "Construction",
      url: "sthirconstructions.in",
      description: "A bold, trust-first site for a builder, with services, a clear process and a quote request form that captures plot size and project type.",
      features: ["Quote form", "Service cards", "Process steps", "Trust highlights"],
      mini: { title: "We build homes that last.", accent: "last.", sub: "Residential & commercial construction", cta: "Get a quote", ghost: "Our work" }
    },
    {
      slug: "real-estate",
      theme: "realestate",
      name: "Sarayu Homes",
      category: "Service business",
      industry: "Real estate",
      url: "sarayuhomes.in",
      description: "A refined listing site for a property consultant with clear property cards, trust points and a site-visit request.",
      features: ["Property listings", "Site-visit request", "Trust section", "Listing cards"],
      mini: { title: "Find a home by the river.", sub: "Plots, flats & villas", cta: "View properties", ghost: "Talk to us" }
    },
    {
      slug: "coaching",
      theme: "coaching",
      name: "Pathshala Academy",
      category: "Service business",
      industry: "Education",
      url: "pathshala.academy",
      description: "A bright, parent-friendly coaching institute site: courses, batch timings, faculty and a demo-class sign-up that works well on phones.",
      features: ["Course cards", "Batch timings", "Demo class form", "Parent-friendly layout"],
      mini: { title: "Prepare with clarity, not pressure.", accent: "clarity,", sub: "Classes 9–12 · JEE · NEET", cta: "Book a demo class", ghost: "Courses" }
    },
    {
      slug: "store",
      theme: "store",
      name: "Kaatha Handloom",
      category: "E-commerce",
      industry: "Online store",
      url: "kaatha.store",
      description: "A small online store for handwoven sarees and stoles, with a product grid, categories and clear payment and return info that builds trust.",
      features: ["Product grid", "Categories", "Add-to-cart buttons", "Returns & payment info"],
      mini: { title: "Handwoven, straight from the loom.", sub: "Sarees · stoles · dupattas", cta: "Shop now", ghost: "Our weavers" }
    },
    {
      slug: "portfolio",
      theme: "portfolio",
      name: "Aarav Mehta",
      category: "Portfolio",
      industry: "Photographer",
      url: "aaravmehta.photo",
      description: "A minimal, image-first portfolio for a wedding and portrait photographer, with galleries, packages and an enquiry form.",
      features: ["Gallery grid", "Packages", "Enquiry form", "Image-first layout"],
      mini: { title: "Stories, told in light.", sub: "Wedding & portrait photographer", cta: "See work", ghost: "Enquire" }
    }
  ];

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function buildTitle(p) {
    var h = el("div", "mini-title");
    var t = p.mini.title;
    if (p.mini.accent && t.indexOf(p.mini.accent) > -1) {
      var i = t.indexOf(p.mini.accent);
      h.appendChild(document.createTextNode(t.slice(0, i)));
      h.appendChild(el("em", null, p.mini.accent));
      h.appendChild(document.createTextNode(t.slice(i + p.mini.accent.length)));
    } else {
      h.textContent = t;
    }
    return h;
  }

  /* Builds the miniature website preview. `phone` switches to the stacked mobile layout. */
  function buildMini(p, phone) {
    var mini = el("div", "mini t-" + p.theme);
    var inner = el("div", "mini-inner");
    var nav = el("div", "mini-nav");
    nav.appendChild(el("span", "mini-logo", p.name));
    if (phone) {
      nav.appendChild(el("span", "mini-menu"));
    } else {
      var links = el("span", "mini-links");
      for (var i = 0; i < 4; i++) links.appendChild(el("span"));
      nav.appendChild(links);
    }
    var hero = el("div", "mini-hero");
    var copy = el("div");
    copy.appendChild(buildTitle(p));
    copy.appendChild(el("div", "mini-sub", p.mini.sub));
    var btns = el("div", "mini-btns");
    btns.appendChild(el("span", "mini-btn", p.mini.cta));
    if (!phone) btns.appendChild(el("span", "mini-btn ghost", p.mini.ghost));
    copy.appendChild(btns);
    hero.appendChild(copy);
    hero.appendChild(el("div", "mini-art"));
    var cards = el("div", "mini-cards");
    for (var j = 0; j < (phone ? 2 : 3); j++) cards.appendChild(el("span"));
    inner.appendChild(nav);
    inner.appendChild(hero);
    inner.appendChild(cards);
    mini.appendChild(inner);
    return mini;
  }

  function buildMock(p) {
    var mock = el("div", "mock");
    var bar = el("div", "mock-bar");
    bar.appendChild(el("i")); bar.appendChild(el("i")); bar.appendChild(el("i"));
    bar.appendChild(el("span", "mock-url", p.url));
    mock.appendChild(bar);
    mock.appendChild(buildMini(p, false));
    return mock;
  }

  function buildCard(p) {
    var href = "/demos/" + p.slug;
    var card = el("article", "project reveal is-visible");
    card.dataset.category = p.category;

    var link = el("a");
    link.href = href;
    link.setAttribute("aria-label", "Preview the " + p.name + " concept website");
    var mock = buildMock(p);
    mock.setAttribute("aria-hidden", "true");
    link.appendChild(mock);
    card.appendChild(link);

    var top = el("div", "project-top");
    top.appendChild(el("span", "tag", p.industry));
    top.appendChild(el("span", "tag tag-concept", "Concept design"));
    card.appendChild(top);

    card.appendChild(el("h3", null, p.name));
    card.appendChild(el("p", null, p.description));

    var pills = el("ul", "feature-pills");
    pills.setAttribute("aria-label", "Key features");
    p.features.forEach(function (f) { pills.appendChild(el("li", null, f)); });
    card.appendChild(pills);

    var actions = el("div", "project-actions");
    var btn = el("a", "btn btn-ghost btn-sm");
    btn.href = href;
    btn.textContent = "Preview website ";
    var arrow = el("span", "arrow", "→");
    arrow.setAttribute("aria-hidden", "true");
    btn.appendChild(arrow);
    actions.appendChild(btn);
    card.appendChild(actions);
    return card;
  }

  function renderShowcase(root) {
    var limit = parseInt(root.getAttribute("data-limit") || "0", 10);
    var only = root.getAttribute("data-slugs");
    var list = PROJECTS.slice();
    if (only) {
      var wanted = only.split(",");
      list = wanted.map(function (s) { return PROJECTS.filter(function (p) { return p.slug === s.trim(); })[0]; }).filter(Boolean);
    }
    if (limit) list = list.slice(0, limit);

    var grid = root.querySelector("[data-grid]");
    var status = root.querySelector("[data-status]");
    grid.textContent = "";
    if (!list.length) {
      grid.appendChild(el("p", "empty-state", "New examples are on their way. Check back soon."));
      return;
    }
    list.forEach(function (p) { grid.appendChild(buildCard(p)); });

    var filterBar = root.querySelector("[data-filters]");
    if (!filterBar) return;
    var cats = ["All"];
    list.forEach(function (p) { if (cats.indexOf(p.category) === -1) cats.push(p.category); });
    cats.forEach(function (c, idx) {
      var b = el("button", "filter-btn", c);
      b.type = "button";
      b.setAttribute("aria-pressed", idx === 0 ? "true" : "false");
      b.addEventListener("click", function () {
        filterBar.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
        var shown = 0;
        grid.querySelectorAll(".project").forEach(function (card) {
          var match = c === "All" || card.dataset.category === c;
          card.hidden = !match;
          if (match) shown++;
        });
        if (status) status.textContent = "Showing " + shown + " " + (shown === 1 ? "example" : "examples") + (c === "All" ? "" : " in " + c);
      });
      filterBar.appendChild(b);
    });
  }

  document.querySelectorAll("[data-showcase]").forEach(renderShowcase);
})();
