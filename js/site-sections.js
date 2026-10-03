import { supabase } from './supabase-client.js';

const pageSlug = window.location.pathname.split('/').pop()?.replace(/\.html$/, '') || 'index';
const backgroundImages = new Map();

function applyBackgroundImage(target, image, section) {
  const bounds = target.getBoundingClientRect();
  if (!bounds.width || !bounds.height || !image.naturalWidth || !image.naturalHeight) return;

  const fit = section.image_fit === 'contain' ? 'contain' : 'cover';
  const fitScale = fit === 'cover'
    ? Math.max(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight)
    : Math.min(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight);
  const width = Math.round(image.naturalWidth * fitScale * (section.image_zoom_x ?? 100) / 100);
  const height = Math.round(image.naturalHeight * fitScale * (section.image_zoom_y ?? 100) / 100);
  const imageUrl = JSON.stringify(image.src);

  target.style.backgroundImage = `linear-gradient(90deg, rgba(10,31,52,.64), rgba(10,31,52,.24)), url(${imageUrl})`;
  target.style.backgroundSize = `100% 100%, ${width}px ${height}px`;
  target.style.backgroundPosition = `center, ${section.image_position_x ?? 50}% ${section.image_position_y ?? 50}%`;
  target.style.backgroundRepeat = 'no-repeat';
}

function setSectionImage(target, section, imageUrl) {
  if (target instanceof HTMLImageElement) {
    target.src = imageUrl;
    target.style.objectFit = section.image_fit === 'contain' ? 'contain' : 'cover';
    target.style.objectPosition = `${section.image_position_x ?? 50}% ${section.image_position_y ?? 50}%`;
    target.style.transform = `scale(${(section.image_zoom_x ?? 100) / 100}, ${(section.image_zoom_y ?? 100) / 100})`;
    return;
  }

  const image = new Image();
  image.onload = () => applyBackgroundImage(target, image, section);
  image.onerror = () => console.warn('A page section image URL could not be loaded.');
  image.src = imageUrl;
  backgroundImages.set(target, { image, section });
}

function setSectionText(element, value) {
  const lines = Array.from(element.querySelectorAll('.line > span'));
  if (!lines.length) {
    element.textContent = value;
    return;
  }

  const words = value.trim().split(/\s+/).filter(Boolean);
  const wordsPerLine = Math.ceil(words.length / lines.length) || 1;
  lines.forEach((line, index) => {
    const text = words.slice(index * wordsPerLine, (index + 1) * wordsPerLine).join(' ');
    line.textContent = text;
    line.parentElement.hidden = !text;
  });
}

function applySection(section) {
  const target = Array.from(document.querySelectorAll('[data-cms-section]'))
    .find((element) => element.dataset.cmsSection === section.section_key);
  if (!target) return;

  const fields = [
    ['[data-cms-title]', section.title],
    ['[data-cms-subtitle]', section.subtitle],
    ['[data-cms-body]', section.body]
  ];

  fields.forEach(([selector, value]) => {
    if (value === null || value === undefined) return;
    const element = target.querySelector(selector);
    if (element) setSectionText(element, value);
  });

  if (section.image_url) {
    const imageTarget = target.querySelector('[data-cms-image]');
    if (imageTarget) {
      try {
        const imageUrl = new URL(section.image_url, window.location.href);
        if (imageUrl.protocol === 'https:' || imageUrl.protocol === 'http:') {
          setSectionImage(imageTarget, section, imageUrl.href);
        }
      } catch {
        console.warn('A page section image URL could not be loaded.');
      }
    }
  }
}

async function loadPageSections() {
  const { data, error } = await supabase
    .from('site_sections')
    .select('section_key, title, subtitle, body, image_url, image_fit, image_zoom_x, image_zoom_y, image_position_x, image_position_y')
    .eq('page_slug', pageSlug)
    .eq('is_published', true);

  if (error && (error.code === 'PGRST204' || error.code === '42703')) {
    const legacyResult = await supabase
      .from('site_sections')
      .select('section_key, title, subtitle, body, image_url')
      .eq('page_slug', pageSlug)
      .eq('is_published', true);
    if (legacyResult.error) {
      console.warn('Page sections could not be loaded:', legacyResult.error.message);
      return;
    }
    (legacyResult.data || []).forEach(applySection);
    return;
  }

  if (error) {
    console.warn('Page sections could not be loaded:', error.message);
    return;
  }

  (data || []).forEach(applySection);
}

loadPageSections().catch((error) => {
  console.warn('Page sections could not be loaded:', error.message);
});

window.addEventListener('resize', () => {
  backgroundImages.forEach(({ image, section }, target) => applyBackgroundImage(target, image, section));
});
