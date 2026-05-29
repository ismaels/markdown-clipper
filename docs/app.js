// Client-side Interactivity for Markdown Clipper Landing Page

document.addEventListener("DOMContentLoaded", () => {
  // 1. Interactive Tab Switching Showcase
  const controlButtons = document.querySelectorAll(".interactive-control-btn");
  const showcasePanels = document.querySelectorAll(".showcase-panel");

  controlButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      // Deactivate all buttons
      controlButtons.forEach(b => b.classList.remove("active"));
      // Hide all panels
      showcasePanels.forEach(p => p.classList.remove("active"));

      // Activate current button
      btn.classList.add("active");
      
      // Show matching panel
      const targetPanelId = `panel-${btn.dataset.showcase}`;
      const targetPanel = document.getElementById(targetPanelId);
      if (targetPanel) {
        targetPanel.classList.add("active");
      }
    });
  });

  // 2. FAQ Accordion Collapses
  const faqItems = document.querySelectorAll(".faq-item");

  faqItems.forEach(item => {
    const trigger = item.querySelector(".faq-trigger");
    const panel = item.querySelector(".faq-panel");

    // Click handler
    const toggleFaq = () => {
      const isActive = item.classList.contains("active");

      // Close all other items for a clean accordion effect
      faqItems.forEach(otherItem => {
        if (otherItem !== item) {
          otherItem.classList.remove("active");
          const otherPanel = otherItem.querySelector(".faq-panel");
          if (otherPanel) {
            otherPanel.style.maxHeight = null;
          }
        }
      });

      // Toggle active state
      if (isActive) {
        item.classList.remove("active");
        panel.style.maxHeight = null;
      } else {
        item.classList.add("active");
        // Dynamically compute height including padding
        panel.style.maxHeight = panel.scrollHeight + "px";
      }
    };

    if (trigger) {
      trigger.addEventListener("click", toggleFaq);
    } else {
      // Supports clicking button wrapper directly
      item.addEventListener("click", toggleFaq);
    }
  });

  // 3. Intersection Observer for Scroll Reveals
  const revealElements = document.querySelectorAll(".reveal-on-scroll");

  const revealCallback = (entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        // Once visible, stop observing
        observer.unobserve(entry.target);
      }
    });
  };

  const revealObserver = new IntersectionObserver(revealCallback, {
    root: null, // Viewport
    threshold: 0.15, // Trigger when 15% is visible
    rootMargin: "0px 0px -50px 0px" // Trigger slightly before entering fully
  });

  revealElements.forEach(el => {
    revealObserver.observe(el);
  });

  // 4. Smooth Anchor Scrolling
  const anchorLinks = document.querySelectorAll('a[href^="#"]');

  anchorLinks.forEach(link => {
    link.addEventListener("click", (e) => {
      const targetId = link.getAttribute("href");
      if (targetId === "#") return;
      
      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        e.preventDefault();
        
        // Compute offset for fixed header
        const headerHeight = document.querySelector(".navbar").offsetHeight;
        const targetPosition = targetElement.getBoundingClientRect().top + window.scrollY;
        
        window.scrollTo({
          top: targetPosition - headerHeight - 16,
          behavior: "smooth"
        });
      }
    });
  });
});
